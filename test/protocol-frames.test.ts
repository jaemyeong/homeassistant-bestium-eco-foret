import assert from "node:assert/strict";
import test from "node:test";

import { createProtocolDebugMonitor, encodeSemanticAction } from "../bestium-eco-foret/src/protocol-debug.ts";

// Kept out of `m2.test.ts`: that file is past the size where Node's TypeScript
// stripping segfaults intermittently. See M4-E104 in `.agent/progress.md`.
//
// Every hex string below was read off the bus in capture-1787635354221.ndjson while the
// operator worked the wallpad by hand, so these are the wallpad's own frames, not ours.
// `.agent/spec-device-protocol.md` carries the derivation.

type AnyRecord = Record<string, unknown>;
const TX = { transmitEnabled: true, speculativeTransmitEnabled: true, unsafeTransmitEnabled: true, authorizedUser: true };
const encode = (action: AnyRecord): AnyRecord => encodeSemanticAction(action, TX) as AnyRecord;
const framesOf = (r: AnyRecord): string[] => (r.framesHex as string[]) ?? (r.frameHex ? [r.frameHex as string] : []);

test("0.2.7 RED: every emitted frame declares its own true length", () => {
  // makeF7 computed `payload.length + 3` while the frame is `payload.length + 4` bytes,
  // so every frame it built was one short. Real 0x18 commands declare 0x0B and are 11 bytes.
  const actions: AnyRecord[] = [
    { kind: "light", target: 1, state: "on" }, { kind: "gas", state: "close" },
    { kind: "heat", zone: 1, state: "on" }, { kind: "heat", zone: 4, state: "off" },
    { kind: "heat", zone: 2, temperatureC: 23 }, { kind: "heat", target: "all", state: "off" },
    { kind: "heat", target: "all", state: "on" },
    { kind: "light", target: "all", state: "on" }, { kind: "light", target: "all", state: "off" },
    { kind: "batchoff", state: "on" }, { kind: "batchoff", state: "off" },
    { kind: "elevator", direction: "up" }, { kind: "elevator", direction: "down" },
  ];
  for (const action of actions) {
    for (const hex of framesOf(encode(action))) {
      const bytes = Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
      if (bytes[0] !== 0xf7) continue;                       // 0x7F frames carry no length byte
      assert.equal(bytes[1], bytes.length, `${JSON.stringify(action)} → ${hex} declares ${bytes[1]} but is ${bytes.length} bytes`);
      let checksum = 0;
      for (let i = 0; i < bytes.length - 2; i += 1) checksum ^= bytes[i];
      assert.equal(checksum, bytes[bytes.length - 2], `${hex} checksum`);
      assert.equal(bytes[bytes.length - 1], 0xee, `${hex} terminator`);
    }
  }
});

test("0.2.7 RED: heating commands are the frames the wallpad itself sends", () => {
  const expected: Array<[AnyRecord, string]> = [
    [{ kind: "heat", zone: 1, state: "on" }, "f70b01180246110100b1ee"],
    [{ kind: "heat", zone: 2, state: "on" }, "f70b01180246120100b2ee"],
    [{ kind: "heat", zone: 3, state: "on" }, "f70b01180246130100b3ee"],
    [{ kind: "heat", zone: 4, state: "on" }, "f70b01180246140100b4ee"],
    [{ kind: "heat", zone: 1, state: "off" }, "f70b01180246110400b4ee"],
    [{ kind: "heat", zone: 2, state: "off" }, "f70b01180246120400b7ee"],
    [{ kind: "heat", zone: 3, state: "off" }, "f70b01180246130400b6ee"],
    [{ kind: "heat", zone: 4, state: "off" }, "f70b01180246140400b1ee"],
    // 0x15 = 21 °C and 0x17 = 23 °C, both captured on zone 1.
    [{ kind: "heat", zone: 1, temperatureC: 21 }, "f70b01180245111500a6ee"],
    [{ kind: "heat", zone: 1, temperatureC: 23 }, "f70b01180245111700a4ee"],
  ];
  for (const [action, hex] of expected) {
    assert.deepEqual(framesOf(encode(action)), [hex], JSON.stringify(action));
  }
});

test("0.3.0 RED: every heating zone is observed once the operator drove it live", () => {
  // 0.2.7 held all four zones as candidates because the frames were capture-verified but we
  // had never sent one and watched heating move. The operator has now driven every zone from
  // the page on the live bus, which is exactly the condition that release named.
  for (const zone of [1, 2, 3, 4]) {
    for (const action of [{ kind: "heat", zone, state: "on" }, { kind: "heat", zone, state: "off" }, { kind: "heat", zone, temperatureC: 23 }]) {
      assert.equal(encode(action).evidence, "observed", JSON.stringify(action));
    }
  }
  // Promotion is about the evidence class, never about the bytes.
  assert.deepEqual(framesOf(encode({ kind: "heat", zone: 1, state: "on" })), ["f70b01180246110100b1ee"]);
  assert.deepEqual(framesOf(encode({ kind: "heat", zone: 1, temperatureC: 24 })), ["f70b01180245111800abee"]);
  assert.equal(encode({ kind: "gas", state: "close" }).evidence, "observed");
  assert.equal(encode({ kind: "gas", state: "open" }).evidence, "rejected");
});

test("0.3.0 RED: the heating group is the one frame the wallpad sends, not four", () => {
  // 0.2.7 expanded this into four per-zone frames on the reasoning that the wallpad had no
  // group command. It has one: address 0x10, the same shape the lights use, and the wallpad
  // itself sends it. Measured 2026-08-30, both directions confirmed by polling — the group
  // command draws no direct reply of its own, which is M4-E139.
  assert.deepEqual(framesOf(encode({ kind: "heat", target: "all", state: "off" })), ["f70b01180246100400b5ee"]);
  assert.deepEqual(framesOf(encode({ kind: "heat", target: "all", state: "on" })), ["f70b01180246100100b0ee"]);
});

test("0.3.0 RED: the light group is one frame at address 0x10", () => {
  // The lights' own group address, the same 0x10 the heating group uses. Ten sends, all
  // confirmed. Individual lights stay at 0x11 through 0x13.
  assert.deepEqual(framesOf(encode({ kind: "light", target: "all", state: "on" })), ["f70b01190240100100b7ee"]);
  assert.deepEqual(framesOf(encode({ kind: "light", target: "all", state: "off" })), ["f70b01190240100200b4ee"]);
  for (const state of ["on", "off"]) {
    assert.equal(encode({ kind: "light", target: "all", state }).evidence, "observed", state);
  }
});

test("0.3.0 RED: batch-off is a control, not something we can only watch", () => {
  // 0x2A has no button on the wallpad — the switch is by the front door — so the frame was
  // never going to appear by working the panel. It came from the legacy source and then from
  // sending it: length 0x0C, address 0x11, and the `19 00` payload after the value, which is
  // the part a shape guessed from 0x19 would have missed.
  assert.deepEqual(framesOf(encode({ kind: "batchoff", state: "on" })), ["f70c012a0240110119009bee"]);
  assert.deepEqual(framesOf(encode({ kind: "batchoff", state: "off" })), ["f70c012a02401102190098ee"]);
  for (const state of ["on", "off"]) {
    assert.equal(encode({ kind: "batchoff", state }).evidence, "observed", state);
  }
  assert.equal(encode({ kind: "batchoff", state: "toggle" }).evidence, "rejected");
});

test("0.3.0 RED: the elevator call is the shape that actually registered", () => {
  // 0.2.7 sent `02 41 10 <dir> 00` and called it inferred. Two sends of that shape moved
  // nothing. The legacy add-on's other shape did: kind byte 0x04, and the direction in the
  // last payload position behind a `00`. Both bytes differ, which is why swapping one was
  // never going to work. The verdict comes off the status stream rather than a direct reply,
  // because the reply carries the call the building already had — see M4-E150.
  assert.deepEqual(framesOf(encode({ kind: "elevator", direction: "up" })), ["f70b0134044110000599ee"]);
  assert.deepEqual(framesOf(encode({ kind: "elevator", direction: "down" })), ["f70b013404411000069aee"]);
  for (const direction of ["up", "down"]) {
    const result = encode({ kind: "elevator", direction });
    assert.equal(result.evidence, "observed", direction);
    assert.equal(result.sendable, true, `${direction} must be sendable with TX on`);
    assert.ok(!framesOf(result)[0]!.startsWith("f70d013401"), "a query frame must never be sent as a call");
  }
});

test("0.3.0 RED: the kinds measurement removed are gone", () => {
  // Outlet and ventilation: polled on every sweep, answered on none — this wallpad has
  // neither. Raw: arbitrary sends belong to the local buslab, behind its allow-list, not to
  // a page anyone on the household network can open.
  for (const action of [{ kind: "outlet", action: "query" }, { kind: "ventilation", action: "query" }]) {
    const result = encode(action);
    assert.equal(result.evidence, "rejected", JSON.stringify(action));
    assert.equal(result.sendable, false, JSON.stringify(action));
    assert.deepEqual(framesOf(result), [], JSON.stringify(action));
  }
  assert.throws(() => encode({ kind: "raw", hex: "f70b011902401101000000ee" }), /unsupported/);
});

test("0.3.0 RED: the door macros stay in the contract and stay unsendable", () => {
  // Eleven sends opened nothing, so this is not a command on this line. It stays a candidate
  // rather than leaving, because the subphone line — where the bell, the intercom and the
  // video actually live — is not captured yet, and door control will belong there. The new
  // page offers none of it; what this asserts is that one tap can never send it.
  for (const target of ["household", "communal"]) {
    const result = encode({ kind: "entrance", target, state: "ringing" });
    assert.equal(result.evidence, "unsafe_candidate", target);
    assert.equal(result.sendable, false, `${target} must never be one tap`);
    assert.equal(result.requiresSpeculativeConfirmation, true, target);
    assert.equal(framesOf(result).length, 3, `${target} is a three-frame macro`);
  }
});

const push = (monitor: AnyRecord, hex: string, atMs: number): void => {
  (monitor.push as (b: Uint8Array, t: number) => void)(Uint8Array.from(hex.match(/../g) ?? [], (p) => Number.parseInt(p, 16)), atMs);
};
const fresh = (nowMs?: () => number): AnyRecord => {
  const m = createProtocolDebugMonitor(nowMs ? { nowMs } : {}) as AnyRecord;
  (m.start as () => void)?.();
  return m;
};
const devices = (m: AnyRecord): AnyRecord => ((m.snapshot as () => AnyRecord)().devices) as AnyRecord;

test("0.2.7 RED: a single-light reply updates only that light", () => {
  const m = fresh();
  push(m, "f70d011904401000020202b4ee", 1_000);          // all three off
  push(m, "f70b01190440130101b3ee", 2_000);              // light 3 on, direct reply
  const lights = devices(m).lights as AnyRecord;
  assert.equal((lights[3] as AnyRecord).state, "on", "the addressed light must change");
  assert.equal((lights[1] as AnyRecord).state, "off", "light 1 must not move");
  assert.equal((lights[2] as AnyRecord).state, "off", "light 2 must not move");
});

test("0.2.7 RED: the heating reply that answers a command is read, not discarded", () => {
  // This is what makes confirmation fast: it arrives in the same TCP read as our write,
  // while the polling reply is up to one 2.2 s cycle away.
  const m = fresh();
  push(m, "f712011804461401011b170000000000a6ee", 1_000);  // zone 4 on, current 27, target 23
  const zone4 = (devices(m).heating as AnyRecord)[4] as AnyRecord;
  assert.equal(zone4.state, "on");
  assert.equal(zone4.currentC, 0x1b);
  assert.equal(zone4.targetC, 0x17);
  const m2 = fresh();
  push(m2, "f7120118044511150118150000000000b5ee", 1_000); // zone 1 temperature reply, target 21
  const zone1 = (devices(m2).heating as AnyRecord)[1] as AnyRecord;
  assert.equal(zone1.state, "on");
  assert.equal(zone1.targetC, 0x15);
});

test("0.2.7 RED: a heating command frame is never a source of state", () => {
  // The decoder used to read 0x18 0x02 as state, in a layout that only fitted our own
  // invented frame. A command says what was asked for, not what happened.
  const m = fresh();
  push(m, "f70b01180246110100b1ee", 1_000);
  const zone1 = (devices(m).heating as AnyRecord)[1] as AnyRecord;
  assert.equal(zone1.state, undefined, "a command must leave the state unknown");
});

test("0.2.7 RED: the elevator reports the directions the bus actually carries", () => {
  const cases: Array<[string, string, number]> = [
    ["f70d013401411000a6010b33ee", "up", 1],      // 0xA6: moving up
    ["f70d013401411000b6040b26ee", "down", 4],    // 0xB6: moving down
    ["f70d01340141100001040b91ee", "arrival", 4], // 0x01: arrived
    ["f70d0134014110000000009fee", "idle", 0],    // 0x00: idle, seen 171 times
  ];
  for (const [hex, direction, floor] of cases) {
    const m = fresh();
    push(m, hex, 1_000);
    const elevator = devices(m).elevator as AnyRecord;
    assert.equal(elevator.direction, direction, hex);
    assert.equal(elevator.floor, floor, hex);
  }
});

test("0.3.0 RED: the 0x1E 02 frame is a door-open observation, never a call", () => {
  // This frame appears three times in a row at the instant the operator presses the
  // wallpad's door-open button, and nothing on this line moves when the bell is rung. It
  // was reported as `call: true`, which told the operator the opposite of what happened.
  // Whether it is the command or the notice that the call ended is still undecided.
  let now = 1_000;
  const m = fresh(() => now);
  push(m, "f70e011e024311040004ffffb6ee", now);
  const household = (): AnyRecord => (devices(m).entrances as AnyRecord).household as AnyRecord;
  assert.equal(household().call, undefined, "nothing may claim a call is in progress");
  assert.equal(household().doorOpenObserved, true, "the door-open operation is what was observed");
  now += 5_000;
  assert.equal(household().doorOpenObserved, true, "and it survives while the frame is fresh");
  now += 30_000;
  assert.notEqual(household().doorOpenObserved, true, "once the frame goes stale the observation stops");
});

test("0.2.7 RED: the entrance poll frame is kept rather than dropped", () => {
  // 181 of these in 306 s. We do not know what they carry yet, so they belong in the
  // debug surface where the next capture can be compared against them, not in the bin.
  const now = 1_000;
  const m = fresh(() => now);
  push(m, "f70b011e016211000091ee", now);
  const snapshot = (m.snapshot as () => AnyRecord)();
  const communal = (devices(m).entrances as AnyRecord).communal as AnyRecord;
  assert.equal(communal.lastSeenAtMs, 1_000, "the poll frame must stamp communal freshness");
  assert.equal(communal.stale, false);
  assert.ok(
    !((snapshot.unknown ?? []) as AnyRecord[]).some((e) => e.rawHex === "f70b011e016211000091ee"),
    "a frame we recognise must not be filed as unknown",
  );
});

test("M5 RED: the 0x2A reply is decoded, and it carries two devices at once", () => {
  // `F7 0E 01 2A 04 40 10 00 19 <batch> 1B <gas> <XOR> EE`. The frame names each device it
  // reports by address: 0x19 for the lights it switches off, 0x1B for the gas valve. 268
  // observations agreed with 0x1B's own replies every time, 1,470–1,758 ms behind them.
  //
  // Until now this went to `ambiguous`, which meant `batchoff` could be sent but never
  // confirmed: the queue would retry it to the end of its budget and the page would report
  // 미관측 for a write that worked. On a switch that kills lights the wallpad cannot reach,
  // repeating the frame is the wrong failure.
  const m = fresh();
  push(m, "f70e012a0440100019011b0386ee", 1_000);
  const batchOff = devices(m).batchOff as AnyRecord;
  assert.equal(batchOff.state, "on", "0x01 in the ninth byte is the batch held on");
  assert.equal(batchOff.stale, false);

  push(m, "f70e012a0440100019021b0385ee", 2_000);
  assert.equal((devices(m).batchOff as AnyRecord).state, "off", "0x02 is released");

  // The gas byte is cross-checked, never displayed: 0x1B is the source of truth for the
  // valve and answers about a second and a half sooner.
  const gas = devices(m).gas as AnyRecord;
  assert.equal(gas.state, undefined, "0x2A must not be a source of gas state");
  assert.equal((devices(m).batchOff as AnyRecord).gasAgrees, undefined, "and it says nothing until 0x1B has spoken");

  const withGas = fresh();
  push(withGas, "f70d011b04431100030000b5ee", 1_000);
  push(withGas, "f70e012a0440100019011b0386ee", 2_000);
  assert.equal((devices(withGas).gas as AnyRecord).state, "closed", "0x1B still owns the valve");
  assert.equal((devices(withGas).batchOff as AnyRecord).gasAgrees, true, "and the cross-check agrees");

  // A frame that is not the reply shape leaves the state alone.
  const other = fresh();
  push(other, "f70c012a0240110119009bee", 1_000);
  assert.equal((devices(other).batchOff as AnyRecord).state, undefined, "a command is not a source of state");
});
