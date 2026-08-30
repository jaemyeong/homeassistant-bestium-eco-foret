import assert from "node:assert/strict";
import test from "node:test";

import { checkOutgoing, parseMask, matchesMask, PHASE1_ALLOWED, PHASE2_ALLOWED } from "../tools/buslab/guard.ts";

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

test("E4 RED: phase two adds the two light group frames and nothing else", () => {
  // The off frame was watched on the bus twice. The on frame has never been seen anywhere and is
  // an inferred candidate, allowed here only because a light is reversible and harmless.
  const added = PHASE2_ALLOWED.filter((hex) => !PHASE1_ALLOWED.includes(hex)).sort();
  assert.deepEqual(added, ["f70b01190240100100b7ee", "f70b01190240100200b4ee"].sort());
  assert.equal(PHASE2_ALLOWED.length, 8);
});

test("E4 RED: a phase is asked for explicitly; phase one still refuses the group frames", () => {
  for (const hex of ["f70b01190240100200b4ee", "f70b01190240100100b7ee"]) {
    assert.equal(checkOutgoing({ hex, armed: true }).ok, false, `phase one must refuse ${hex}`);
    assert.equal(checkOutgoing({ hex, armed: true, phase: 2 }).ok, true, `phase two permits ${hex}`);
  }
});

test("E4 RED: no phase opens the refusal list", () => {
  for (const hex of ["7f01020304", "f70e011e024311040004ffffb6ee", "f70b011b0243110400b2ee"]) {
    for (const phase of [1, 2] as const) {
      assert.equal(checkOutgoing({ hex, armed: true, phase }).ok, false, `${hex} at phase ${phase}`);
    }
  }
});

test("E4 RED: phase two does not become a blanket bypass", () => {
  // Heating, the elevator and an invented light value stay outside it.
  for (const hex of ["f70b01180246110100b1ee", "f70b013402411006009cee", "f70b01190240110300b4ee"]) {
    assert.equal(checkOutgoing({ hex, armed: true, phase: 2 }).ok, false, hex);
  }
});

// ---------------------------------------------------------------------------
// Phase three: heating.
//
// Heating arrives with better evidence than the lights ever had. Four zone-on frames sit in
// `capture-1788009200284` byte for byte, and `.agent/analysis-0.2.8-field-report.md` records
// zone 1's off frame and a zone 1 target frame from an earlier capture. What is inferred is
// zones 2 to 4 off, from the same rule that produced all four on frames correctly.
//
// Heating differs from a light in one way that matters here: the unsafe direction costs money
// and burns gas. Every allowed target value is below every room temperature measured on the
// bus, so nothing on this list can create heating demand.

const PHASE3_EXPECTED_ADDITIONS = [
  // zone 1..4 on: `02 46 1<zone> 01`, all four watched on the bus
  "f70b01180246110100b1ee", "f70b01180246120100b2ee",
  "f70b01180246130100b3ee", "f70b01180246140100b4ee",
  // zone 1..4 off: `02 46 1<zone> 04`, zone 1 watched, the rest from the same rule
  "f70b01180246110400b4ee", "f70b01180246120400b7ee",
  "f70b01180246130400b6ee", "f70b01180246140400b1ee",
  // zone 1 target 21 C and 23 C: `02 45 11 <celsius>`. 23 is what every zone already holds, so
  // the pair moves the target down and puts it back; neither value can call for heat.
  "f70b01180245111500a6ee", "f70b01180245111700a4ee",
];

test("E5 RED: phase three adds the heating frames and nothing else", async () => {
  const { PHASE3_ALLOWED } = await import("../tools/buslab/guard.ts");
  const added = PHASE3_ALLOWED.filter((hex) => !PHASE2_ALLOWED.includes(hex)).sort();
  assert.deepEqual(added, [...PHASE3_EXPECTED_ADDITIONS].sort());
  assert.equal(PHASE3_ALLOWED.length, 18, "eight light frames plus ten heating frames");
});

test("E5 RED: every frame on the heating list carries its own correct checksum", () => {
  // The list is hand-written hex. A transposed digit would produce a frame the wallpad ignores,
  // and a silence recorded as "no response" is a false finding on the very first send. Recompute
  // rather than trust the typing.
  for (const hex of PHASE3_EXPECTED_ADDITIONS) {
    const b = bytes(hex);
    let x = 0;
    for (let i = 0; i < b.length - 2; i += 1) x ^= b[i];
    assert.equal(x, b[b.length - 2], `${hex} has the wrong XOR`);
    assert.equal(b[b.length - 1], 0xee, `${hex} does not end in EE`);
    assert.equal(b[1], b.length, `${hex} declares the wrong length`);
  }
});

test("E5 RED: the earlier phases still refuse every heating frame", () => {
  for (const hex of PHASE3_EXPECTED_ADDITIONS) {
    for (const phase of [1, 2] as const) {
      assert.equal(checkOutgoing({ hex, armed: true, phase }).ok, false, `${hex} at phase ${phase}`);
    }
    assert.equal(checkOutgoing({ hex, armed: true, phase: 3 }).ok, true, `phase three permits ${hex}`);
  }
});

test("E5 RED: phase three is a list, not a bypass", () => {
  for (const hex of [
    "f70b01180246100400b5ee",  // heating group off: watched twice, but not asked for yet
    "f70b01180246100100b0ee",  // heating group on: never observed anywhere
    "f70b01180245121500a5ee",  // zone 2 target: the temperature frame is scoped to zone 1
    "f70b013402411006009cee",  // the elevator
    "f70b01190240110300b4ee",  // an invented light value
  ]) {
    assert.equal(checkOutgoing({ hex, armed: true, phase: 3 }).ok, false, hex);
  }
});

test("E5 RED: no phase opens the refusal list, phase three included", () => {
  for (const hex of ["7f01020304", "f70e011e024311040004ffffb6ee", "f70b011b0243110400b2ee"]) {
    for (const phase of [1, 2, 3] as const) {
      assert.equal(checkOutgoing({ hex, armed: true, phase }).ok, false, `${hex} at phase ${phase}`);
    }
  }
});

test("E5 RED: raising a heating target is refused outright, not merely left off a list", () => {
  // The allowlist already blocks these, but `allowAll` exists for trying a hypothetical later
  // phase and would otherwise let a frame through that makes a room hotter and burns gas for as
  // long as nobody notices. This is the gas precedent: refuse the unsafe direction by name.
  //
  // The ceiling was 23 C, the target every zone already held. The operator has since asked for
  // the wallpad's whole 5 to 40 range to be measured, so it is 40 now: the warmest the wallpad
  // itself offers. Above that nothing the household can ask for exists, and a frame carrying such
  // a value is a mistake whatever its intent. It is still a deliberate limit and not a fact about
  // the protocol — what the device does with 41 is untested, by choice.
  //
  // These carry correct checksums on purpose. The refusal list runs before the checksum check, so
  // a mistyped frame would still be refused here and the test would pass without testing anything.
  for (const hex of [
    "f70b011802451129009aee",  // zone 1 target 41 C, one degree above
    "f70b01180245113c008fee",  // zone 1 target 60 C
    "f70b0118024511ff004cee",  // zone 1 target 255 C
  ]) {
    for (const opts of [{ phase: 3 }, { allowAll: true }] as const) {
      const verdict = checkOutgoing({ hex, armed: true, ...opts });
      assert.equal(verdict.ok, false, `${hex} with ${JSON.stringify(opts)}`);
      assert.match(String(verdict.reason), /target|heat/i, hex);
    }
  }
});

test("E5 RED: a target at or below the ceiling is not refused by that rule", () => {
  // The refusal must not swallow the two frames the measurement actually needs.
  for (const hex of ["f70b01180245111500a6ee", "f70b01180245111700a4ee"]) {
    assert.equal(checkOutgoing({ hex, armed: true, allowAll: true }).ok, true, hex);
  }
});

// ---------------------------------------------------------------------------
// Phase four: the heating group.
//
// `0x18 02 46 10` addresses all four zones at once. The off frame was watched twice in
// `capture-1788009200284` and is documented in the spec; the **on** frame has never been observed
// anywhere, in either capture or the legacy source, and is derived from the address rule alone.
// That rule has now produced eight per-zone frames the wallpad answered and the poll confirmed,
// and group-off at the same address is observed, so group-on is one value byte away from a
// confirmed frame rather than an invention. It stays graded apart all the same.
//
// Neither can call for heat while every room is warmer than its 23 °C target, and the observed
// off frame undoes the inferred on frame, so the unsafe direction has a confirmed way back.

const PHASE4_EXPECTED_ADDITIONS = [
  "f70b01180246100400b5ee",  // all zones off, watched twice
  "f70b01180246100100b0ee",  // all zones on, inferred
];

test("E6 RED: phase four adds the two heating group frames and nothing else", async () => {
  const { PHASE3_ALLOWED, PHASE4_ALLOWED } = await import("../tools/buslab/guard.ts");
  const added = PHASE4_ALLOWED.filter((hex) => !PHASE3_ALLOWED.includes(hex)).sort();
  assert.deepEqual(added, [...PHASE4_EXPECTED_ADDITIONS].sort());
  assert.equal(PHASE4_ALLOWED.length, 20, "eighteen from phase three plus the two group frames");
});

test("E6 RED: both heating group frames carry their own correct checksum", () => {
  for (const hex of PHASE4_EXPECTED_ADDITIONS) {
    const b = bytes(hex);
    let x = 0;
    for (let i = 0; i < b.length - 2; i += 1) x ^= b[i];
    assert.equal(x, b[b.length - 2], `${hex} has the wrong XOR`);
    assert.equal(b[b.length - 1], 0xee, `${hex} does not end in EE`);
    assert.equal(b[1], b.length, `${hex} declares the wrong length`);
  }
});

test("E6 RED: phase three still refuses the heating group, and phase four carries the light group", async () => {
  const { PHASE4_ALLOWED } = await import("../tools/buslab/guard.ts");
  for (const hex of PHASE4_EXPECTED_ADDITIONS) {
    assert.equal(checkOutgoing({ hex, armed: true, phase: 3 }).ok, false, `phase three must refuse ${hex}`);
    assert.equal(checkOutgoing({ hex, armed: true, phase: 4 }).ok, true, `phase four permits ${hex}`);
  }
  // A phase is cumulative: the light group frames the group test also needs are still there.
  for (const hex of ["f70b01190240100200b4ee", "f70b01190240100100b7ee"]) {
    assert.ok(PHASE4_ALLOWED.includes(hex), `phase four still carries ${hex}`);
    assert.equal(checkOutgoing({ hex, armed: true, phase: 4 }).ok, true, hex);
  }
});

test("E6 RED: phase four is still a list, and the refusals are still shut", () => {
  for (const hex of [
    "f70b01180246100200b3ee",  // the light group's off value on the heating device: not a frame anyone has seen
    "f70b01180245101500a7ee",  // a target written to the group address, never observed and never asked for
    "f70b013402411006009cee",  // the elevator
  ]) {
    assert.equal(checkOutgoing({ hex, armed: true, phase: 4 }).ok, false, hex);
  }
  for (const hex of ["7f01020304", "f70e011e024311040004ffffb6ee", "f70b011b0243110400b2ee", "f70b011802451129009aee"]) {
    assert.equal(checkOutgoing({ hex, armed: true, phase: 4 }).ok, false, `${hex} at phase four`);
  }
});

// ---------------------------------------------------------------------------
// Phase five: the remaining zone targets, and the batch-off device.
//
// The targets extend `0x45` to zones 2, 3 and 4 at the same two values zone 1 used. 23 is what
// every zone already holds and 21 is below it, and every room on this bus reads 24 °C or warmer,
// so no frame here can call for heat. The ceiling refusal still stands above them.
//
// `0x2A` is different in kind: **nothing has ever been seen commanding it.** Two captures and
// every run, 34,686 records, carry no set frame addressed to it. That is absence and not proof,
// and this project has a counter-example against itself — the heating group-on frame was equally
// absent and worked when we sent it. These two candidates come from the device's own reply,
// `F7 0E 01 2A 04 40 10 00 19 <state> 1B 03 <XOR> EE`, whose sub-command and address are dropped
// into the same set-frame skeleton the lights use. Engaging turns the lights off and releasing
// turns light 1 on, which the operator has already done four times from the wall switch.

const PHASE5_EXPECTED_ADDITIONS = [
  "f70b01180245121500a5ee", "f70b01180245121700a7ee",  // zone 2 target 21 and 23
  "f70b01180245131500a4ee", "f70b01180245131700a6ee",  // zone 3
  "f70b01180245141500a3ee", "f70b01180245141700a1ee",  // zone 4
  "f70b012a024010010084ee",  // batch-off engage, candidate
  "f70b012a024010020087ee",  // batch-off release, candidate
];

test("E7 RED: phase five adds the three zone targets and the two batch-off candidates", async () => {
  const { PHASE4_ALLOWED, PHASE5_ALLOWED } = await import("../tools/buslab/guard.ts");
  const added = PHASE5_ALLOWED.filter((hex) => !PHASE4_ALLOWED.includes(hex)).sort();
  assert.deepEqual(added, [...PHASE5_EXPECTED_ADDITIONS].sort());
  assert.equal(PHASE5_ALLOWED.length, 28, "twenty from phase four plus eight");
});

test("E7 RED: every phase-five frame carries its own correct checksum", () => {
  for (const hex of PHASE5_EXPECTED_ADDITIONS) {
    const b = bytes(hex);
    let x = 0;
    for (let i = 0; i < b.length - 2; i += 1) x ^= b[i];
    assert.equal(x, b[b.length - 2], `${hex} has the wrong XOR`);
    assert.equal(b[b.length - 1], 0xee, `${hex} does not end in EE`);
    assert.equal(b[1], b.length, `${hex} declares the wrong length`);
  }
});

test("E7 RED: phase four still refuses them all, and phase five permits them", async () => {
  for (const hex of PHASE5_EXPECTED_ADDITIONS) {
    assert.equal(checkOutgoing({ hex, armed: true, phase: 4 }).ok, false, `phase four must refuse ${hex}`);
    assert.equal(checkOutgoing({ hex, armed: true, phase: 5 }).ok, true, `phase five permits ${hex}`);
  }
});

test("E7 RED: the target ceiling still governs the zones phase five opened", () => {
  // Widening `0x45` to three more zones must not let the ceiling be walked around by address.
  // Correct checksums again: the refusal runs first, so a mistyped frame proves nothing.
  for (const hex of [
    "f70b0118024512290099ee",  // zone 2 target 41 C
    "f70b01180245133c008dee",  // zone 3 target 60 C
    "f70b0118024514ff0049ee",  // zone 4 target 255 C
  ]) {
    for (const opts of [{ phase: 5 }, { allowAll: true }] as const) {
      const verdict = checkOutgoing({ hex, armed: true, ...opts });
      assert.equal(verdict.ok, false, `${hex} with ${JSON.stringify(opts)}`);
      assert.match(String(verdict.reason), /target|heat/i, hex);
    }
  }
});

test("E7 RED: phase five is still a list, and the refusals are still shut", () => {
  // These carry correct checksums on purpose. A mistyped one would be refused for its XOR and the
  // allowlist would never be reached, which is a test that passes without testing anything.
  for (const hex of [
    "f70b012a024010030086ee",  // a batch-off value nobody has seen in the reply
    "f70b012a024011010085ee",  // a batch-off address nobody has seen
    "f70b013402411006009cee",  // the elevator
  ]) {
    const verdict = checkOutgoing({ hex, armed: true, phase: 5 });
    assert.equal(verdict.ok, false, hex);
    assert.match(String(verdict.reason), /allowlist/i, `${hex} must be refused by the list, not by its checksum`);
  }
  for (const hex of ["7f01020304", "f70e011e024311040004ffffb6ee", "f70b011b0243110400b2ee"]) {
    assert.equal(checkOutgoing({ hex, armed: true, phase: 5 }).ok, false, `${hex} at phase five`);
  }
});

// ---------------------------------------------------------------------------
// Phase six: the batch-off set frames, from the legacy source rather than derived.
//
// Phase five's candidates were derived and ignored. The legacy implementation has the real ones,
// and they differ in three places: the length is `0x0C` not `0x0B`, the address is `0x11` not
// `0x10`, and a `19 00` payload follows the value. The derivation failed because a set frame does
// not have to use the query's address — for lights, `10` is the group and `11`..`13` the
// individual lamps, and `0x2A` follows that shape with `10` queried and `11` set.
//
// The source is corroborated rather than trusted: the query frame the same file builds,
// `f70e012a0140100019001b0382ee`, is byte-identical to the one this bus carries.
//
// This device is the only path to the other rooms' lights. The wallpad cannot reach them, so the
// `0x19` group frame is not a whole-house off and never was.

const PHASE6_EXPECTED_ADDITIONS = [
  "f70c012a0240110119009bee",  // engage: every light in the home off
  "f70c012a02401102190098ee",  // release
];

test("E8 RED: phase six adds the two batch-off set frames and nothing else", async () => {
  const { PHASE5_ALLOWED, PHASE6_ALLOWED } = await import("../tools/buslab/guard.ts");
  const added = PHASE6_ALLOWED.filter((hex) => !PHASE5_ALLOWED.includes(hex)).sort();
  assert.deepEqual(added, [...PHASE6_EXPECTED_ADDITIONS].sort());
  assert.equal(PHASE6_ALLOWED.length, 30, "twenty-eight from phase five plus two");
});

test("E8 RED: the batch-off set frames are twelve bytes and carry their own checksum", () => {
  // The length byte is the thing phase five got wrong, so assert it rather than only the XOR.
  for (const hex of PHASE6_EXPECTED_ADDITIONS) {
    const b = bytes(hex);
    assert.equal(b.length, 12, `${hex} must be twelve bytes`);
    assert.equal(b[1], 0x0c, `${hex} must declare 0x0C`);
    assert.equal(b[6], 0x11, `${hex} must address 0x11, not the query's 0x10`);
    assert.equal(b[8], 0x19, `${hex} must carry the 19 payload byte`);
    let x = 0;
    for (let i = 0; i < b.length - 2; i += 1) x ^= b[i];
    assert.equal(x, b[b.length - 2], `${hex} has the wrong XOR`);
    assert.equal(b[b.length - 1], 0xee, `${hex} does not end in EE`);
  }
});

test("E8 RED: phase five still refuses them, including the candidates it did allow", async () => {
  const { PHASE6_ALLOWED } = await import("../tools/buslab/guard.ts");
  for (const hex of PHASE6_EXPECTED_ADDITIONS) {
    assert.equal(checkOutgoing({ hex, armed: true, phase: 5 }).ok, false, `phase five must refuse ${hex}`);
    assert.equal(checkOutgoing({ hex, armed: true, phase: 6 }).ok, true, `phase six permits ${hex}`);
  }
  // The derived pair stays on the list: it was sent, ignored, and the negative is evidence.
  for (const hex of ["f70b012a024010010084ee", "f70b012a024010020087ee"]) {
    assert.ok(PHASE6_ALLOWED.includes(hex), `phase six still carries the derived ${hex}`);
  }
});

test("E8 RED: phase six is still a list, and the refusals are still shut", () => {
  for (const hex of [
    "f70c012a0240110319009aee",  // a value the legacy never builds
    "f70c012a02401201190098ee",  // an address nobody has seen set
    "f70b013402411006009cee",    // the elevator
  ]) {
    const verdict = checkOutgoing({ hex, armed: true, phase: 6 });
    assert.equal(verdict.ok, false, hex);
    assert.match(String(verdict.reason), /allowlist|checksum|xor/i, hex);
  }
  for (const hex of ["7f01020304", "f70e011e024311040004ffffb6ee", "f70b011b0243110400b2ee", "f70b011802451129009aee"]) {
    assert.equal(checkOutgoing({ hex, armed: true, phase: 6 }).ok, false, `${hex} at phase six`);
  }
});

// ---------------------------------------------------------------------------
// Phase seven: gas, closing only.
//
// This is the first frame on any of these lists that cannot be undone from the bus. Closing is
// available and opening is not — the legacy source says so in its own comment, `04 = ON
// (지원되지 않음)` — so once it is shut a person has to open the valve by hand. The operator has
// confirmed the valve feeds the kitchen only, not the boiler.
//
// The list gains exactly one frame. The refusal that keeps the opening direction shut is not part
// of any phase and these tests assert that no phase and no flag reaches it.

const GAS_CLOSE = "f70b011b0243110300b5ee";
const GAS_OPEN = "f70b011b0243110400b2ee";

test("E9 RED: phase seven adds the gas close frame and nothing else", async () => {
  const { PHASE6_ALLOWED, PHASE7_ALLOWED } = await import("../tools/buslab/guard.ts");
  const added = PHASE7_ALLOWED.filter((hex) => !PHASE6_ALLOWED.includes(hex));
  assert.deepEqual(added, [GAS_CLOSE]);
  assert.equal(PHASE7_ALLOWED.length, 31, "thirty from phase six plus one");
});

test("E9 RED: the close frame is the one the wallpad itself sent", () => {
  // Observed once in `capture-1788009200284`, and identical to what the legacy builds. Assert the
  // bytes that carry the meaning rather than only the checksum.
  const b = bytes(GAS_CLOSE);
  assert.equal(b[3], 0x1b, "device");
  assert.equal(b[4], 0x02, "a set frame");
  assert.equal(b[5], 0x43, "sub-command");
  assert.equal(b[7], 0x03, "03 is the closing value; 04 would be an opening");
  let x = 0;
  for (let i = 0; i < b.length - 2; i += 1) x ^= b[i];
  assert.equal(x, b[b.length - 2]);
  assert.equal(b[b.length - 1], 0xee);
});

test("E9 RED: phase six still refuses it, phase seven permits it", () => {
  assert.equal(checkOutgoing({ hex: GAS_CLOSE, armed: true, phase: 6 }).ok, false);
  assert.equal(checkOutgoing({ hex: GAS_CLOSE, armed: true, phase: 7 }).ok, true);
});

test("E9 RED: opening gas is refused at every phase and by every flag", () => {
  // The point of the refusal list. Widening gas to a phase must not make the unsafe direction
  // reachable, and `--allow-all` must not either.
  for (const phase of [1, 2, 3, 4, 5, 6, 7] as const) {
    const verdict = checkOutgoing({ hex: GAS_OPEN, armed: true, phase });
    assert.equal(verdict.ok, false, `open must be refused at phase ${phase}`);
    assert.match(String(verdict.reason), /gas may be closed and never opened/, `phase ${phase}`);
  }
  const bypass = checkOutgoing({ hex: GAS_OPEN, armed: true, allowAll: true });
  assert.equal(bypass.ok, false, "allow-all must not reach it either");
  assert.match(String(bypass.reason), /gas may be closed and never opened/);
});

test("E9 RED: any gas set value other than 03 is refused, not merely the one we know", () => {
  // The refusal is written on the value, so an undocumented value is refused as well as `04`.
  for (const value of [0x00, 0x01, 0x02, 0x04, 0x05, 0xff]) {
    const body = `f70b011b024311${value.toString(16).padStart(2, "0")}00`;
    let x = 0;
    for (const byte of Buffer.from(body, "hex")) x ^= byte;
    const hex = `${body}${x.toString(16).padStart(2, "0")}ee`;
    const verdict = checkOutgoing({ hex, armed: true, phase: 7, allowAll: true });
    assert.equal(verdict.ok, false, `gas value ${value} must be refused`);
    assert.match(String(verdict.reason), /gas may be closed and never opened/, hex);
  }
});

// ---------------------------------------------------------------------------
// Phase eight: the elevator call.
//
// The first frame here that acts on a shared building facility. A call brings a car to this floor
// and the neighbours see the result, so the list carries the **revoke** frame alongside the calls:
// it is the only way back, and it goes on the list for that reason rather than because anyone has
// watched it work.
//
// Nothing on this bus has ever been seen commanding `0x34`: 44,986 frames, `kind=01` only. That is
// because the wallpad calls by another path, not because the line refuses one — the operator
// reports the legacy add-on's call did work here. The legacy offers two skeletons and does not
// know which applies, selected by `packet_call_type`, whose default is 0; both go on the list so
// the run can tell them apart.

const ELEVATOR_PHASE8 = [
  "f70b013402411005009fee",  // variant 0, up
  "f70b013402411006009cee",  // variant 0, down
  "f70b013402411000009aee",  // variant 0, revoke
  "f70b0134044110000599ee",  // variant 1, up
  "f70b013404411000069aee",  // variant 1, down
  "f70b013404411000009cee",  // variant 1, revoke
];

test("E10 RED: phase eight adds the six elevator frames and nothing else", async () => {
  const { PHASE7_ALLOWED, PHASE8_ALLOWED } = await import("../tools/buslab/guard.ts");
  const added = PHASE8_ALLOWED.filter((hex) => !PHASE7_ALLOWED.includes(hex)).sort();
  assert.deepEqual(added, [...ELEVATOR_PHASE8].sort());
  assert.equal(PHASE8_ALLOWED.length, 37, "thirty-one from phase seven plus six");
});

test("E10 RED: both call skeletons are on the list, and each carries its own revoke", async () => {
  const { PHASE8_ALLOWED } = await import("../tools/buslab/guard.ts");
  // A call with no way back would be the one shape of this test worth refusing outright.
  for (const kind of ["02", "04"]) {
    const family = ELEVATOR_PHASE8.filter((hex) => hex.slice(8, 10) === kind);
    assert.equal(family.length, 3, `skeleton ${kind} must have up, down and revoke`);
    const values = family.map((hex) => (kind === "02" ? hex.slice(14, 16) : hex.slice(16, 18))).sort();
    assert.deepEqual(values, ["00", "05", "06"], `skeleton ${kind} values`);
    for (const hex of family) assert.ok(PHASE8_ALLOWED.includes(hex), hex);
  }
});

test("E10 RED: every elevator frame carries its own correct checksum", () => {
  for (const hex of ELEVATOR_PHASE8) {
    const b = bytes(hex);
    assert.equal(b[3], 0x34, `${hex} device`);
    assert.equal(b[5], 0x41, `${hex} sub-command`);
    assert.equal(b[6], 0x10, `${hex} address`);
    let x = 0;
    for (let i = 0; i < b.length - 2; i += 1) x ^= b[i];
    assert.equal(x, b[b.length - 2], `${hex} has the wrong XOR`);
    assert.equal(b[b.length - 1], 0xee, `${hex} does not end in EE`);
    assert.equal(b[1], b.length, `${hex} declares the wrong length`);
  }
});

test("E10 RED: phase seven still refuses them, phase eight permits them", () => {
  for (const hex of ELEVATOR_PHASE8) {
    assert.equal(checkOutgoing({ hex, armed: true, phase: 7 }).ok, false, `phase seven must refuse ${hex}`);
    assert.equal(checkOutgoing({ hex, armed: true, phase: 8 }).ok, true, `phase eight permits ${hex}`);
  }
});

test("E10 RED: phase eight is still a list, and the refusals are still shut", () => {
  for (const hex of [
    "f70b013402411007009dee",  // a call value the legacy never builds
    "f70b013402411106009dee",  // an address nobody has seen
  ]) {
    const verdict = checkOutgoing({ hex, armed: true, phase: 8 });
    assert.equal(verdict.ok, false, hex);
    assert.match(String(verdict.reason), /allowlist/i, `${hex} must be refused by the list`);
  }
  for (const hex of ["7f01020304", "f70e011e024311040004ffffb6ee", "f70b011b0243110400b2ee", "f70b011802451129009aee"]) {
    assert.equal(checkOutgoing({ hex, armed: true, phase: 8 }).ok, false, `${hex} at phase eight`);
  }
});

// ---------------------------------------------------------------------------
// Phase nine: the ends of the wallpad's own temperature range.
//
// The operator asked for 5 to 40 to be measured per zone, and raised the ceiling to allow it. The
// list carries the two ends and one probe below the bottom; the 34 values between the ends are
// the same frame with a different byte and would only add boiler time, so they are left out and
// said so rather than quietly skipped.
//
// **40 °C makes heat.** Every room on this bus reads 24 to 27, so a 40 target with the zone
// switched on — which writing a target does — is real demand on a summer morning. That is the
// operator's call, made explicitly, and the run keeps the window as short as the poll allows.

const PHASE9_EXPECTED_ADDITIONS = [
  "f70b01180245110500b6ee", "f70b01180245120500b5ee",  // 5 C, the bottom of the range
  "f70b01180245130500b4ee", "f70b01180245140500b3ee",
  "f70b011802451128009bee", "f70b0118024512280098ee",  // 40 C, the top
  "f70b0118024513280099ee", "f70b011802451428009eee",
  "f70b01180245110400b7ee",                             // 4 C on zone 1, one below the bottom
];

test("E11 RED: phase nine adds the range ends and the one probe below", async () => {
  const { PHASE8_ALLOWED, PHASE9_ALLOWED } = await import("../tools/buslab/guard.ts");
  const added = PHASE9_ALLOWED.filter((hex) => !PHASE8_ALLOWED.includes(hex)).sort();
  assert.deepEqual(added, [...PHASE9_EXPECTED_ADDITIONS].sort());
  assert.equal(PHASE9_ALLOWED.length, 46, "thirty-seven from phase eight plus nine");
});

test("E11 RED: the ceiling is 40 now, and it still refuses everything above", async () => {
  const { PHASE9_ALLOWED } = await import("../tools/buslab/guard.ts");
  // 40 must pass the ceiling, or the range cannot be measured at all.
  for (const hex of PHASE9_EXPECTED_ADDITIONS) {
    assert.equal(checkOutgoing({ hex, armed: true, phase: 9 }).ok, true, `phase nine permits ${hex}`);
    assert.ok(PHASE9_ALLOWED.includes(hex), hex);
  }
  // and one degree past the wallpad's own range is still named, not merely unlisted
  for (const hex of ["f70b011802451129009aee", "f70b0118024512290099ee", "f70b0118024514ff0049ee"]) {
    for (const opts of [{ phase: 9 }, { allowAll: true }] as const) {
      const verdict = checkOutgoing({ hex, armed: true, ...opts });
      assert.equal(verdict.ok, false, `${hex} with ${JSON.stringify(opts)}`);
      assert.match(String(verdict.reason), /target|heat/i, hex);
    }
  }
});

test("E11 RED: every phase-nine frame carries its own correct checksum", () => {
  for (const hex of PHASE9_EXPECTED_ADDITIONS) {
    const b = bytes(hex);
    assert.equal(b[5], 0x45, `${hex} must be the target sub-command`);
    let x = 0;
    for (let i = 0; i < b.length - 2; i += 1) x ^= b[i];
    assert.equal(x, b[b.length - 2], `${hex} has the wrong XOR`);
    assert.equal(b[b.length - 1], 0xee, `${hex} does not end in EE`);
  }
});

test("E11 RED: phase eight still refuses them", () => {
  for (const hex of PHASE9_EXPECTED_ADDITIONS) {
    assert.equal(checkOutgoing({ hex, armed: true, phase: 8 }).ok, false, `phase eight must refuse ${hex}`);
  }
});

test("E11 RED: the values between the ends are deliberately absent", async () => {
  // Not an oversight. 6 to 39 are the same frame with a different byte, and every one above the
  // room temperature costs gas, so measuring them would buy nothing the ends do not.
  const { PHASE9_ALLOWED } = await import("../tools/buslab/guard.ts");
  for (const celsius of [6, 10, 25, 30, 39]) {
    const body = `f70b01180245` + `11` + celsius.toString(16).padStart(2, "0") + `00`;
    let x = 0;
    for (const byte of Buffer.from(body, "hex")) x ^= byte;
    const hex = `${body}${x.toString(16).padStart(2, "0")}ee`;
    assert.equal(hex.length, 22, `${celsius} C frame must be eleven bytes`);
    assert.ok(!PHASE9_ALLOWED.includes(hex), `${celsius} C must not be on the list`);
    assert.equal(checkOutgoing({ hex, armed: true, phase: 9 }).ok, false, `${celsius} C`);
  }
});
