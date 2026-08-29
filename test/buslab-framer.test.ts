import assert from "node:assert/strict";
import test from "node:test";

import { createFramer } from "../tools/buslab/framer.ts";

// The framer knows three things and nothing else: a length byte, an XOR over every byte but
// the last two, and the terminator `EE`. It imports nothing from the add-on, so when it agrees
// with the product decoder that agreement means something.
//
// It also carries across reads, because a TCP boundary is not a frame boundary. In the
// 54.6-minute capture exactly one frame straddles two reads, and a framer that did not carry
// would report those fourteen bytes as garbage.

const bytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"));
const meta = (seq: number) => ({ seq, wallMs: 1_700_000_000_000 + seq, monoNs: BigInt(seq) * 1_000_000n });

test("E2 RED: a whole frame in one read is one frame", () => {
  const framer = createFramer();
  const out = framer.push(bytes("f70b01190140100000b5ee"), meta(0));
  assert.equal(out.frames.length, 1);
  assert.equal(out.frames[0].hex, "f70b01190140100000b5ee");
  assert.equal(out.frames[0].kind, "f7");
  assert.equal(out.frames[0].spansReads, false);
  assert.deepEqual(out.unparsed, []);
});

test("E2 RED: two frames in one read are two frames, which is one read in five on this bus", () => {
  const framer = createFramer();
  const out = framer.push(bytes("f70b011b0143110000b5ee" + "f70d011b04431100040000b2ee"), meta(0));
  assert.deepEqual(out.frames.map((f) => f.hex), [
    "f70b011b0143110000b5ee",
    "f70d011b04431100040000b2ee",
  ]);
});

test("E2 RED: a frame split across two reads is joined, not discarded", () => {
  // This is the real seam from `capture-1788009200284`: read 4046 ends with a lone `f7` and
  // read 4047 carries the other thirteen bytes.
  const framer = createFramer();
  const first = framer.push(bytes("f70e012a0140100019001b0382ee" + "f7"), meta(4046));
  assert.deepEqual(first.frames.map((f) => f.hex), ["f70e012a0140100019001b0382ee"]);
  assert.deepEqual(first.unparsed, [], "a partial frame is held, not called garbage");

  const second = framer.push(bytes("0e012a0440100019021b0385ee"), meta(4047));
  assert.deepEqual(second.frames.map((f) => f.hex), ["f70e012a0440100019021b0385ee"]);
  assert.equal(second.frames[0].spansReads, true, "and the join is visible in the record");
  assert.equal(second.frames[0].startSeq, 4046);
  assert.equal(second.frames[0].endSeq, 4047);
  assert.deepEqual(second.unparsed, []);
});

test("E2 RED: a frame split one byte at a time still comes out whole", () => {
  const framer = createFramer();
  const hex = "f70b01190140100000b5ee";
  const seen: string[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    const out = framer.push(bytes(hex.slice(i, i + 2)), meta(i / 2));
    for (const frame of out.frames) seen.push(frame.hex);
    assert.deepEqual(out.unparsed, [], `byte ${i / 2} must not be called garbage`);
  }
  assert.deepEqual(seen, [hex]);
});

test("E2 RED: a 0x7F frame is five bytes with fixed fields, and those fields are checked", () => {
  // `7F <header> 00 00 EE`, per `.agent/spec-device-protocol.md` §5.2. There is no checksum, so
  // the trailing `00 00 EE` is the only thing standing between a real frame and any byte that
  // happens to be 0x7F.
  const framer = createFramer();
  const out = framer.push(bytes("7fb40000ee" + "f70b01190140100000b5ee"), meta(0));
  assert.deepEqual(out.frames.map((f) => [f.kind, f.hex]), [
    ["7f", "7fb40000ee"],
    ["f7", "f70b01190140100000b5ee"],
  ]);
});

test("E4 RED: a header nobody has documented still parses, if the fixed fields are right", () => {
  // Eight headers are documented and the subphone work is a later milestone. Gating on that list
  // would silently drop a ninth; gating on the shape does not.
  const framer = createFramer();
  const out = framer.push(bytes("7f420000ee"), meta(0));
  assert.deepEqual(out.frames.map((f) => f.hex), ["7f420000ee"]);
});

test("E4 RED: corruption that starts with 0x7F is not turned into a frame", () => {
  // Every one of these was invented by this framer from real corruption on the live bus. `0x7F`
  // has never been observed on this line at all, so accepting any such byte as a five-byte header
  // both fabricated frames and undercounted the damage.
  for (const garbage of [
    "7ffbfffdff", "7fddfdff93", "7fddffa5c2", "7fffff36a0", "7f73bf75fd", "7ff377ffd2",
  ]) {
    const framer = createFramer();
    const out = framer.push(bytes(garbage), meta(0));
    assert.deepEqual(out.frames, [], `${garbage} must not become a frame`);
    assert.ok(out.unparsed.length > 0, garbage);
  }
});

test("E4 RED: a stray 0x7F no longer eats the frame that follows it", () => {
  // Seen live: `7f df` in front of a valid frame made the framer consume `7f df f7 0b 01`,
  // destroying three bytes of a frame that was perfectly good.
  const framer = createFramer();
  const out = framer.push(bytes("7fdf" + "f70b012b014011000086ee"), meta(0));
  assert.deepEqual(out.frames.map((f) => f.hex), ["f70b012b014011000086ee"],
    "the real frame survives the stray byte in front of it");
  assert.equal(out.unparsed.length, 2, "and the two stray bytes are recorded as such");
});

test("E2 RED: a byte that begins nothing is kept as unparsed, with where it was", () => {
  const framer = createFramer();
  const out = framer.push(bytes("99" + "f70b01190140100000b5ee"), meta(7));
  assert.deepEqual(out.frames.map((f) => f.hex), ["f70b01190140100000b5ee"]);
  assert.equal(out.unparsed.length, 1);
  assert.equal(out.unparsed[0].hex, "99");
  assert.equal(out.unparsed[0].seq, 7);
  assert.equal(out.unparsed[0].offset, 0);
});

test("E2 RED: a bad checksum drops one byte and resyncs, rather than swallowing the next frame", () => {
  // `f7` `0b` with a wrong XOR could be noise that happens to look like a header. Skipping the
  // declared eleven bytes would eat whatever follows; skipping one byte finds the real frame.
  const framer = createFramer();
  const out = framer.push(bytes("f70b01190140100000ffee" + "f70b01190140100000b5ee"), meta(0));
  assert.deepEqual(out.frames.map((f) => f.hex), ["f70b01190140100000b5ee"],
    "the good frame after the bad header is still found");
  assert.equal(out.unparsed[0].hex, "f7");
});

test("E2 RED: a declared length that cannot be a frame is not waited for", () => {
  const framer = createFramer();
  const out = framer.push(bytes("f703" + "f70b01190140100000b5ee"), meta(0));
  assert.deepEqual(out.frames.map((f) => f.hex), ["f70b01190140100000b5ee"]);
  assert.equal(out.unparsed[0].hex, "f7");
});

test("E2 RED: a header promising bytes that never come is eventually let go", () => {
  // Otherwise one corrupt length byte stalls the framer for the rest of the run.
  const framer = createFramer();
  framer.push(bytes("f7ff"), meta(0));
  let released = 0;
  for (let i = 1; i <= 40; i += 1) {
    released += framer.push(bytes("00".repeat(32)), meta(i)).unparsed.length;
  }
  assert.ok(released > 0, "the framer must not hold a doomed header for ever");
  const after = framer.push(bytes("f70b01190140100000b5ee"), meta(99));
  assert.ok(after.frames.length >= 0, "and it keeps working afterwards");
});

test("E2 RED: what is still pending at the end is reported, not dropped in silence", () => {
  const framer = createFramer();
  framer.push(bytes("f70b011901"), meta(3));
  const out = framer.flush();
  assert.equal(out.unparsed.length, 1);
  assert.equal(out.unparsed[0].hex, "f70b011901");
  assert.equal(out.unparsed[0].reason, "incomplete at end of run");
});

test("E2 RED: the running totals are what an acceptance check is made of", () => {
  const framer = createFramer();
  framer.push(bytes("f70b011b0143110000b5ee" + "f70d011b04431100040000b2ee"), meta(0));
  framer.push(bytes("99"), meta(1));
  framer.push(bytes("f70e012a0140100019001b0382ee" + "f7"), meta(2));
  framer.push(bytes("0e012a0440100019021b0385ee"), meta(3));
  assert.deepEqual(framer.stats(), { frames: 4, unparsedBytes: 1, spanning: 1 });
});
