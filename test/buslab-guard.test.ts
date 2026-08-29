import assert from "node:assert/strict";
import test from "node:test";

import { checkOutgoing, parseMask, matchesMask, PHASE1_ALLOWED } from "../tools/buslab/guard.ts";

// This is the only place in the tool where bytes can reach a real bus. Two lists govern it.
//
// The allowlist is what the current phase permits, and it is an exact byte match rather than a
// pattern: a mistyped XOR that matched a pattern would leave the wallpad ignoring the frame, and
// recording that as "no response" is a false finding on the very first send.
//
// The refusal list is not a phase. Nothing opens it, because those frames open a door, or their
// meaning is still undecided, or they move a shared building fixture.

const bytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"));

test("E3 RED: the phase-one allowlist is the six light frames and nothing else", () => {
  assert.deepEqual([...PHASE1_ALLOWED].sort(), [
    "f70b01190240110100b6ee", "f70b01190240110200b5ee",
    "f70b01190240120100b5ee", "f70b01190240120200b6ee",
    "f70b01190240130100b4ee", "f70b01190240130200b7ee",
  ].sort());
});

test("E3 RED: without --arm nothing is written, however allowed the frame is", () => {
  const verdict = checkOutgoing({ hex: "f70b01190240110100b6ee", armed: false });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.write, false, "a dry run reports the bytes and sends none of them");
  assert.deepEqual([...verdict.bytes!], [...bytes("f70b01190240110100b6ee")]);
});

test("E3 RED: an allowed frame with --arm is the only thing that writes", () => {
  for (const hex of PHASE1_ALLOWED) {
    const verdict = checkOutgoing({ hex, armed: true });
    assert.equal(verdict.ok, true, hex);
    assert.equal(verdict.write, true, hex);
  }
});

test("E3 RED: one wrong hex digit is refused, because a pattern would have let it through", () => {
  // `f70b01190240110100b7ee` differs from light 1 on only in its XOR, which a pattern with a
  // wildcard checksum would accept. The wallpad ignores such a frame, and the tool would record
  // a silence that means nothing. The frame's own checksum catches this one first, which is a
  // better reason than "not on the list"; either way it never reaches the bus.
  const verdict = checkOutgoing({ hex: "f70b01190240110100b7ee", armed: true });
  assert.equal(verdict.ok, false);
  assert.match(String(verdict.reason), /checksum|xor/i);
});

test("E3 RED: a well-formed light frame that is not one of the six is still refused", () => {
  // This is the allowlist doing the work on its own: the frame is valid in every mechanical
  // sense, and its value byte is simply one nobody has watched the wallpad send.
  for (const hex of ["f70b01190240110300b4ee", "f70b01190240140100b3ee"]) {
    const verdict = checkOutgoing({ hex, armed: true });
    assert.equal(verdict.ok, false, hex);
    assert.match(String(verdict.reason), /allowlist/i, hex);
  }
});

test("E3 RED: a frame whose own checksum is wrong is named as such", () => {
  const verdict = checkOutgoing({ hex: "f70b01190240110100ffee", armed: true });
  assert.equal(verdict.ok, false);
  assert.match(String(verdict.reason), /checksum|xor/i);
});

test("E3 RED: the subphone macros are refused by a list no flag opens", () => {
  for (const hex of ["7f01020304", "7faabbccdd", "7f0000000000"]) {
    const verdict = checkOutgoing({ hex, armed: true, allowAll: true });
    assert.equal(verdict.ok, false, hex);
    assert.match(String(verdict.reason), /door|0x7f/i, hex);
  }
});

test("E3 RED: the undecided entrance frame is refused even with every flag set", () => {
  // Three of these appear at the instant the operator presses door-open, and nothing answers
  // them. Until the two disambiguating captures exist, sending one may open a door.
  const verdict = checkOutgoing({ hex: "f70e011e024311040004ffffb6ee", armed: true, allowAll: true });
  assert.equal(verdict.ok, false);
  assert.match(String(verdict.reason), /undecided|door/i);
});

test("E3 RED: gas may be closed and never opened", () => {
  const close = checkOutgoing({ hex: "f70b011b0243110300b5ee", armed: true, allowAll: true });
  assert.equal(close.ok, true, "closing is the safe direction");
  const open = checkOutgoing({ hex: "f70b011b0243110400b2ee", armed: true, allowAll: true });
  assert.equal(open.ok, false);
  assert.match(String(open.reason), /gas/i);
});

test("E3 RED: the elevator is outside phase one but is not on the refusal list", () => {
  // It moves a fixture the neighbours share, so it waits for its own approval rather than
  // being forbidden for ever.
  const phaseOne = checkOutgoing({ hex: "f70b013402411006009cee", armed: true });
  assert.equal(phaseOne.ok, false);
  assert.match(String(phaseOne.reason), /allowlist/i);
  const widened = checkOutgoing({ hex: "f70b013402411006009cee", armed: true, allowAll: true });
  assert.equal(widened.ok, true, "a later phase can permit it; the refusal list cannot");
});

test("E3 RED: malformed input is refused before anything looks at its meaning", () => {
  for (const hex of ["", "f7", "zz", "f70b0119024011010b6ee"]) {
    const verdict = checkOutgoing({ hex, armed: true, allowAll: true });
    assert.equal(verdict.ok, false, JSON.stringify(hex));
  }
});

test("E3 RED: a mask is byte pairs, ?? is any byte, and it anchors at the start", () => {
  const mask = parseMask("f70b0119044011");
  assert.equal(mask.ok, true);
  assert.ok(matchesMask(bytes("f70b01190440110101b1ee"), mask.mask!), "the prefix decides");
  assert.ok(!matchesMask(bytes("f70b01190440120101b2ee"), mask.mask!), "a different address does not match");
  assert.ok(!matchesMask(bytes("f70b0119"), mask.mask!), "a frame shorter than the mask cannot match");

  const wild = parseMask("f7??0119");
  assert.ok(matchesMask(bytes("f70b01190440110101b1ee"), wild.mask!));
  assert.ok(matchesMask(bytes("f70d01190440100001b7ee"), wild.mask!), "?? spans both lengths");

  for (const bad of ["", "f", "f7 0b", "gg"]) {
    assert.equal(parseMask(bad).ok, false, JSON.stringify(bad));
  }
});
