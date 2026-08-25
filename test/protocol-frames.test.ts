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
    { kind: "elevator", direction: "up" },
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

test("0.2.7 RED: heat-all-off is four verified frames, not one invented one", () => {
  const frames = framesOf(encode({ kind: "heat", target: "all", state: "off" }));
  assert.deepEqual(frames, [
    "f70b01180246110400b4ee", "f70b01180246120400b7ee",
    "f70b01180246130400b6ee", "f70b01180246140400b1ee",
  ]);
});

test("0.2.7 RED: the elevator call is a command, not a replayed status broadcast", () => {
  // 0x02 is the set sub-command; 0x01 is the wallpad's own query to the hallway pad, which
  // is what this used to replay. The legacy Bestium add-on for this building ships
  // elevator_packet_call_type 0 and elevator_packet_command_call_down_value 6.
  assert.deepEqual(framesOf(encode({ kind: "elevator", direction: "down" })), ["f70b013402411006009cee"]);
  assert.deepEqual(framesOf(encode({ kind: "elevator", direction: "up" })), ["f70b013402411005009fee"]);
  for (const direction of ["up", "down"]) {
    const result = encode({ kind: "elevator", direction });
    assert.equal(result.evidence, "inferred_candidate", direction);
    const hex = framesOf(result)[0];
    assert.ok(!hex.startsWith("f70d0134 01".replace(" ", "")), "a query frame must never be sent as a call");
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
