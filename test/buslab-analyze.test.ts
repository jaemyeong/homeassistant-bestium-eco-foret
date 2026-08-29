import assert from "node:assert/strict";
import test from "node:test";

import { frameKey, inventory, gapSummary, around, loadRecords } from "../tools/buslab/analyze.ts";
import { createFramer, type BusFrame } from "../tools/buslab/framer.ts";

// Analysis reads a finished run. It groups frames by the tuple that identifies what the frame
// is about — device, kind, sub-command, address — and it never assigns meaning beyond that.
// Naming a tuple is a separate, declarative step; the discovery here has to work without one.

const framesOf = (reads: { seq: number; hex: string; ms: number }[]): BusFrame[] => {
  const framer = createFramer();
  const out: BusFrame[] = [];
  for (const read of reads) {
    const pushed = framer.push(Uint8Array.from(Buffer.from(read.hex, "hex")), {
      seq: read.seq, wallMs: read.ms, monoNs: BigInt(read.ms) * 1_000_000n,
    });
    out.push(...pushed.frames);
  }
  return out;
};

test("E2 RED: both record shapes load, because a run and an add-on capture are read the same way", () => {
  const run = loadRecords([
    '{"t":"rx","wallMs":1000,"monoNs":"1000000","seq":0,"byteLength":11,"hex":"f70b01190140100000b5ee"}',
    '{"t":"mark","wallMs":1200,"monoNs":"1200000","label":"hand-on"}',
  ].join("\n"));
  assert.equal(run.reads.length, 1);
  assert.equal(run.reads[0].hex, "f70b01190140100000b5ee");
  assert.equal(run.marks.length, 1);
  assert.equal(run.marks[0].label, "hand-on");

  const capture = loadRecords(
    '{"sequence":0,"receivedAtMs":1788009200394,"byteLength":11,"hex":"f70b012b014011000086ee"}',
  );
  assert.equal(capture.reads.length, 1);
  assert.equal(capture.reads[0].wallMs, 1788009200394);
  assert.equal(capture.marks.length, 0, "an add-on capture carries no marks");
});

test("E2 RED: the key is what the frame is about, not what we think it means", () => {
  const [light, heat, seven] = framesOf([
    { seq: 0, ms: 0, hex: "f70b01190140100000b5ee" },
    { seq: 1, ms: 100, hex: "f70b01180246110100b1ee" },
    { seq: 2, ms: 200, hex: "7f01020304" },
  ]);
  assert.equal(frameKey(light), "19/01/40/10");
  assert.equal(frameKey(heat), "18/02/46/11");
  assert.equal(frameKey(seven), "7f/01", "the subphone line has no length or address to key on");
});

test("E2 RED: the inventory counts each tuple and remembers which values its bytes took", () => {
  const frames = framesOf([
    { seq: 0, ms: 0, hex: "f70b01190440110101b1ee" },
    { seq: 1, ms: 2_000, hex: "f70b01190440110202b1ee" },
    { seq: 2, ms: 4_000, hex: "f70b01190440110101b1ee" },
    { seq: 3, ms: 6_000, hex: "f70b011b0143110000b5ee" },
  ]);
  const rows = inventory(frames);
  const light = rows.find((row) => row.key === "19/04/40/11")!;
  assert.equal(light.count, 3);
  assert.equal(light.periodMedianMs, 2_000, "how often the wallpad repeats it");
  assert.equal(light.byLength.length, 1, "every frame under this key is the same length");
  assert.deepEqual(light.byLength[0].byteValues[7], ["01", "02"], "byte 7 is what moved");
  assert.deepEqual(light.byLength[0].byteValues[3], ["19"], "byte 3 never moved, so it identifies rather than reports");
  assert.equal(rows.find((row) => row.key === "1b/01/43/11")!.count, 1);
  assert.deepEqual(rows.map((row) => row.key), ["19/04/40/11", "1b/01/43/11"], "busiest first");
});

test("E2 RED: the gap summary is what a write has to fit into", () => {
  const summary = gapSummary([0, 50, 100, 180, 300, 700].map((ms) => ({
    seq: 0, wallMs: ms, monoNs: BigInt(ms) * 1_000_000n, byteLength: 11, hex: "",
  })));
  assert.equal(summary.count, 5);
  assert.equal(summary.medianMs, 80);
  assert.equal(summary.minMs, 50);
  assert.equal(summary.maxMs, 400);
  assert.equal(summary.atLeast(50), 100, "every gap here is at least 50 ms");
  assert.equal(summary.atLeast(400), 20);
});

test("E2 RED: around a mark, only what changed is reported", () => {
  // Three lights are on; the operator turns light 1 off by hand at the mark. The gas frame
  // repeats unchanged throughout and must not be offered as a finding.
  const frames = framesOf([
    { seq: 0, ms: 0, hex: "f70d011904401000010101b7ee" + "f70b011b0143110000b5ee" },
    { seq: 1, ms: 2_000, hex: "f70d011904401000010101b7ee" + "f70b011b0143110000b5ee" },
    { seq: 2, ms: 4_100, hex: "f70d011904401000020101b4ee" + "f70b011b0143110000b5ee" },
    { seq: 3, ms: 6_000, hex: "f70d011904401000020101b4ee" },
  ]);
  const found = around({
    frames,
    atMonoNs: 4_000n * 1_000_000n,
    windowMs: 2_000,
    baselineMs: 4_000,
  });
  assert.deepEqual(found.changed.map((entry) => entry.key), ["19/04/40/10"]);
  const change = found.changed[0];
  assert.equal(change.before, "f70d011904401000010101b7ee");
  assert.equal(change.after, "f70d011904401000020101b4ee");
  // The checksum is a function of the payload, so it changes on every change. Listing it in
  // every finding buries the byte that actually carries the state.
  assert.deepEqual(change.changedByteIndexes, [8], "payload bytes only");
  assert.equal(change.checksumChanged, true, "reported once, on its own");
  assert.deepEqual(found.appeared, [], "nothing new showed up");
});

test("E2 RED: a tuple that only appears inside the window is called new, not changed", () => {
  const frames = framesOf([
    { seq: 0, ms: 0, hex: "f70b011b0143110000b5ee" },
    { seq: 1, ms: 4_100, hex: "f70b011b0143110000b5ee" + "f70e011e024311040004ffffb6ee" },
  ]);
  const found = around({ frames, atMonoNs: 4_000n * 1_000_000n, windowMs: 2_000, baselineMs: 4_000 });
  assert.deepEqual(found.changed, []);
  assert.deepEqual(found.appeared.map((entry) => [entry.key, entry.length]), [["1e/02/43/11", 14]]);
  assert.equal(found.appeared[0].hex, "f70e011e024311040004ffffb6ee");
});

test("E2 RED: a window with nothing in it says so instead of inventing a finding", () => {
  const frames = framesOf([{ seq: 0, ms: 0, hex: "f70b011b0143110000b5ee" }]);
  const found = around({ frames, atMonoNs: 60_000n * 1_000_000n, windowMs: 1_000, baselineMs: 5_000 });
  assert.deepEqual(found.changed, []);
  assert.deepEqual(found.appeared, []);
  assert.equal(found.framesInWindow, 0);
});

test("E2 RED: one tuple with two frame lengths is compared within each length, not across them", () => {
  // The gas tuple really does arrive as both an eleven-byte and a thirteen-byte frame. Lining
  // their bytes up by position compares a payload byte in one against a checksum byte in the
  // other, and reports a change that never happened.
  const frames = framesOf([
    { seq: 0, ms: 0, hex: "f70d011b04431100040000b2ee" },
    { seq: 1, ms: 2_000, hex: "f70d011b04431100030000b5ee" },
    { seq: 2, ms: 4_000, hex: "f70b011b0443110303b0ee" },
  ]);
  const row = inventory(frames).find((entry) => entry.key === "1b/04/43/11")!;
  assert.equal(row.count, 3);
  assert.deepEqual(row.byLength.map((group) => [group.length, group.count]), [[13, 2], [11, 1]],
    "grouped by length, the commonest first");
  const thirteen = row.byLength.find((group) => group.length === 13)!;
  assert.deepEqual(thirteen.byteValues[8], ["04", "03"], "within one length, byte 8 is what moved");
  const eleven = row.byLength.find((group) => group.length === 11)!;
  assert.equal(eleven.byteValues.length, 11, "and the shorter shape is measured on its own terms");
});

test("E2 RED: a tuple that arrives in two shapes is not reported as changing between them", () => {
  // The light group tuple is both an eleven-byte direct reply and a thirteen-byte status frame.
  // Comparing one against the other calls a change of shape a change of state, and its byte
  // indexes mean nothing.
  const frames = framesOf([
    { seq: 0, ms: 0, hex: "f70d011904401000010101b7ee" },
    { seq: 1, ms: 4_100, hex: "f70b01190440100202b0ee" },
  ]);
  const found = around({ frames, atMonoNs: 4_000n * 1_000_000n, windowMs: 2_000, baselineMs: 10_000 });
  assert.deepEqual(found.changed, [], "two shapes of one tuple are not a state change");
  assert.deepEqual(found.appeared.map((entry) => [entry.key, entry.length]), [["19/04/40/10", 11]],
    "the shorter shape is new in this window, which is a different kind of finding");
});

test("E2 RED: timing comes from the monotonic clock, not the one NTP can move", () => {
  // The wall clock can step. Every interval this tool reports is measured on `monoNs`, which
  // is the reason the daemon takes that stamp in the first place.
  const reads = [0, 80, 160].map((ms, i) => ({
    seq: i,
    wallMs: 1_000_000 - i * 5_000,      // a wall clock walking backwards
    monoNs: BigInt(ms) * 1_000_000n,
    byteLength: 11,
    hex: "",
  }));
  const summary = gapSummary(reads);
  assert.equal(summary.medianMs, 80, "the monotonic clock decides");
  assert.equal(summary.minMs, 80);
  assert.ok(summary.maxMs >= 0, "and no interval comes out negative");
});

test("E2 RED: a byte position that takes many values is summarised rather than listed in full", () => {
  const framer = createFramer();
  const frames: BusFrame[] = [];
  for (let value = 0; value < 40; value += 1) {
    const body = [0xf7, 0x0b, 0x01, 0x19, 0x04, 0x40, 0x11, value, value, 0, 0xee];
    let x = 0;
    for (let i = 0; i < body.length - 2; i += 1) x ^= body[i];
    body[body.length - 2] = x;
    frames.push(...framer.push(Uint8Array.from(body), { seq: value, wallMs: value * 100, monoNs: BigInt(value) * 100_000_000n }).frames);
  }
  const row = inventory(frames).find((entry) => entry.key === "19/04/40/11")!;
  const position = row.byLength[0].byteValues[7];
  assert.ok(position.length <= 16, `a value list must stay readable, got ${position.length}`);
  assert.equal(row.byLength[0].byteValueCounts[7], 40, "the true count is kept even when the list is trimmed");
});

test("E4 RED: a change that takes more than one poll to appear is still found", () => {
  // Measured on the real bus. The wallpad polls the light group about every 2.2 s, and the poll
  // that fires just after a write still carries the old state; the change shows up in the next
  // one. Comparing the baseline against only the first frame in the window misses it entirely,
  // which is exactly what happened on the first live send.
  const frames = framesOf([
    { seq: 0, ms: 0, hex: "f70d011904401000020202b4ee" },
    { seq: 1, ms: 4_085, hex: "f70d011904401000020202b4ee" },   // the poll that beat the change
    { seq: 2, ms: 6_289, hex: "f70d011904401000010202b7ee" },   // the change, one poll later
    { seq: 3, ms: 8_485, hex: "f70d011904401000010202b7ee" },
  ]);
  const found = around({ frames, atMonoNs: 4_000n * 1_000_000n, windowMs: 6_000, baselineMs: 10_000 });
  assert.equal(found.changed.length, 1, JSON.stringify(found));
  assert.equal(found.changed[0].before, "f70d011904401000020202b4ee");
  assert.equal(found.changed[0].after, "f70d011904401000010202b7ee");
  assert.equal(found.changed[0].atWallMs, 6_289, "the moment it changed, not the moment the window opened");
  assert.deepEqual(found.changed[0].changedByteIndexes, [8]);
});

test("E4 RED: a tuple that never differs across the window is still not a finding", () => {
  const frames = framesOf([
    { seq: 0, ms: 0, hex: "f70b011b0143110000b5ee" },
    { seq: 1, ms: 4_100, hex: "f70b011b0143110000b5ee" },
    { seq: 2, ms: 6_200, hex: "f70b011b0143110000b5ee" },
  ]);
  const found = around({ frames, atMonoNs: 4_000n * 1_000_000n, windowMs: 6_000, baselineMs: 10_000 });
  assert.deepEqual(found.changed, []);
});
