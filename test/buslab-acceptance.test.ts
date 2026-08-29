import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { createFramer, type BusFrame } from "../tools/buslab/framer.ts";
import { around, loadRecords } from "../tools/buslab/analyze.ts";

// The framer's only external standard. `capture-1788009200284.ndjson` was taken by the add-on,
// not by this tool, so reproducing its numbers is not self-confirmation — which is the whole
// reason the framer exists. The file is the operator's own household traffic and is not
// committed; point at it to run this:
//
//     BUSLAB_CAPTURE=~/Downloads/capture-1788009200284.ndjson npm test
//
// Without the variable these checks are skipped rather than quietly passing.

const CAPTURE = process.env.BUSLAB_CAPTURE;
const SKIP = { skip: CAPTURE ? false : "set BUSLAB_CAPTURE to a capture file to run this" };

async function frameCapture(): Promise<{ frames: BusFrame[]; reads: number; bytes: number; stats: ReturnType<ReturnType<typeof createFramer>["stats"]> }> {
  const run = loadRecords(await readFile(CAPTURE!, "utf8"));
  const framer = createFramer();
  const frames: BusFrame[] = [];
  for (const read of run.reads) {
    frames.push(...framer.push(Uint8Array.from(Buffer.from(read.hex, "hex")), read).frames);
  }
  framer.flush();
  return {
    frames,
    reads: run.reads.length,
    bytes: run.reads.reduce((sum, read) => sum + read.byteLength, 0),
    stats: framer.stats(),
  };
}

test("E2 acceptance: the framer explains every byte of a real 54.6-minute capture", SKIP, async () => {
  const { frames, reads, bytes, stats } = await frameCapture();
  assert.equal(reads, 17_561);
  assert.equal(bytes, 350_203);
  assert.equal(frames.length, 21_095, "every frame is found");
  assert.equal(stats.unparsedBytes, 0, "and no byte is left over");
  // One frame really does straddle two reads, at seq 4046/4047. A framer without carry reports
  // those fourteen bytes as garbage, which is how the earlier count arrived at 21,094 and 14.
  assert.equal(stats.spanning, 1);
});

test("E2 acceptance: a read carries several frames one time in five, as the 50 ms flush implies", SKIP, async () => {
  const { frames, reads } = await frameCapture();
  const perRead = new Map<number, number>();
  for (const frame of frames) perRead.set(frame.endSeq, (perRead.get(frame.endSeq) ?? 0) + 1);
  let several = 0;
  for (const count of perRead.values()) if (count > 1) several += 1;
  assert.equal(several, 3_524);
  assert.equal(Math.round((1000 * several) / reads) / 10, 20.1);
});

test("E2 acceptance: the change finder recovers the all-lights-off frame from the capture alone", SKIP, async () => {
  // The discovery this tool exists for, run against real traffic without being told what to
  // look for. The operator pressed all-lights-off twice. The first press is followed within a
  // second by three individual on-commands, so a window around it shows their effect rather
  // than the group's; the second press is the clean one, with every light on beforehand.
  const { frames } = await frameCapture();
  const press = frames.findLast((frame) => frame.hex === "f70b01190240100200b4ee");
  assert.ok(press, "the group-off command is in the capture");

  const found = around({ frames, atMonoNs: press!.monoNs, windowMs: 1_500, baselineMs: 10_000 });
  const lights = found.changed.find((entry) => entry.key === "19/04/40/10");
  assert.ok(lights, `the light group did not show as changed: ${JSON.stringify(found.changed.map((c) => c.key))}`);
  assert.match(lights!.before, /^f70d011904401000/);
  assert.match(lights!.after, /^f70d011904401000/);
  assert.equal(lights!.after.slice(16, 22), "020202", "all three lights read off afterwards");
  assert.ok(
    !found.changed.some((entry) => entry.key === "1b/01/43/11"),
    "a poll that never moved is not a finding",
  );
});
