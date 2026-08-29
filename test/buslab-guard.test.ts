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
  // The ceiling is 23 C because that is the target every zone already holds, so nothing this
  // tool sends can leave a room warmer than the household itself chose. Revisit the constant if
  // that ever needs to change; it is a deliberate limit, not a fact about the protocol.
  for (const hex of [
    "f70b01180245111800abee",  // zone 1 target 24 C, one degree above
    "f70b01180245111e00adee",  // zone 1 target 30 C
    "f70b01180245142800bcee",  // zone 4 target 40 C
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
  for (const hex of ["7f01020304", "f70e011e024311040004ffffb6ee", "f70b011b0243110400b2ee", "f70b01180245111800abee"]) {
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
  for (const hex of [
    "f70b01180245121800aaee",  // zone 2 target 24 C
    "f70b01180245131e00adee",  // zone 3 target 30 C
    "f70b01180245142800bcee",  // zone 4 target 40 C
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
