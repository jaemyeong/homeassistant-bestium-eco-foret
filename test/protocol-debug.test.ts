import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  createProtocolDebugMonitor,
  encodeSemanticAction,
} from "../bestium-eco-foret/src/protocol-debug.ts";

type AnyRecord = Record<string, any>;

function bytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) throw new Error("invalid hex: " + hex);
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function hex(value: Uint8Array | undefined): string {
  return value === undefined
    ? ""
    : [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Build the compact synthetic heating fixture; checksum is XOR over F7 through payload. */
function frame(payload: number[]): Uint8Array {
  // The length byte counts the whole frame. This builder and assertBuiltFrame below both
  // used to be one short, which is how an encoder that declared the wrong length passed.
  const out = Uint8Array.from([0xf7, payload.length + 4, ...payload, 0x00, 0xee]);
  for (let index = 0; index < out.length - 2; index += 1) out[out.length - 2] ^= out[index];
  assertBuiltFrame(out);
  return out;
}

function assertBuiltFrame(value: Uint8Array): void {
  assert.equal(value[0], 0xf7);
  assert.equal(value[1], value.length);
  assert.equal(value[value.length - 1], 0xee);
  let checksum = 0;
  for (let index = 0; index < value.length - 2; index += 1) checksum ^= value[index];
  assert.equal(value[value.length - 2], checksum);
}

function heatingGroupFrame(
  slots: Array<{ state: 0x01 | 0x04; currentC: number; targetC: number }>,
): Uint8Array {
  assert.equal(slots.length, 4);
  // Read off the bus: 0x46 with address 0x10 is the reply covering every zone.
  const payload = [0x01, 0x18, 0x04, 0x46, 0x10, 0x00];
  for (const slot of slots) {
    // 0x18 group responses carry four fixed eight-byte zone slots.
    payload.push(slot.state, slot.currentC, slot.targetC, 0, 0, 0, 0, 0);
  }
  const result = frame(payload);
  assertBuiltFrame(result);
  return result;
}

function heatingSingleFrame(
  zone: number,
  slot: { state: 0x01 | 0x04; currentC: number; targetC: number },
): Uint8Array {
  // The reply that answers one command, as captured: 0x04 0x46, the zone's own address,
  // the value that was commanded echoed back, then state, current and target.
  const result = frame([
    0x01, 0x18, 0x04, 0x46, 0x10 + zone, slot.state,
    slot.state, slot.currentC, slot.targetC, 0, 0, 0, 0, 0,
  ]);
  assertBuiltFrame(result);
  return result;
}

function assertDeviceFresh(
  device: { lastSeenAtMs: number; generation: number; stale: boolean },
  atMs: number,
  generation: number,
): void {
  assert.equal(device.lastSeenAtMs, atMs);
  assert.equal(device.generation, generation);
  assert.equal(device.stale, false);
}

test("RED: F7 stream monitor handles fragments, concatenation, validation, resync, and bounded journals", () => {
  let now = 1_700_000_000;
  const monitor = createProtocolDebugMonitor({
    journalLimit: 4,
    staleAfterMs: 1_000,
    nowMs: () => now,
  });
  const light = bytes("f70d011904401000020102b5ee");
  const gasClosed = bytes("f70d011b04431100030000b5ee");
  const gasOpen = bytes("f70d011b04431100040000b2ee");

  monitor.push(concat(bytes("0055"), light.slice(0, 5)));
  let snapshot = monitor.snapshot();
  assert.equal(snapshot.frames.length, 0);
  assert.equal(snapshot.parser.pendingHex, "f70d011904");
  assert.equal(snapshot.journal.some((entry: AnyRecord) => entry.kind === "noise"), true);
  assert.equal(snapshot.journal.some((entry: AnyRecord) => entry.kind === "partial"), true);

  monitor.push(concat(light.slice(5), gasClosed, gasOpen));
  snapshot = monitor.snapshot();
  assert.equal(snapshot.frames.length, 3);
  assert.deepStrictEqual(snapshot.frames.map((entry: AnyRecord) => entry.rawHex), [
    hex(light),
    hex(gasClosed),
    hex(gasOpen),
  ]);

  const badLength = [...light];
  badLength[1] -= 1;
  const badFooter = [...light];
  badFooter[badFooter.length - 1] = 0xed;
  const badXor = [...light];
  badXor[badXor.length - 2] ^= 0x01;
  monitor.push(concat(bytes("99"), Uint8Array.from(badLength), Uint8Array.from(badFooter), Uint8Array.from(badXor), light));
  snapshot = monitor.snapshot();
  assert.equal(snapshot.frames[snapshot.frames.length - 1]?.rawHex, hex(light));
  assert.equal(snapshot.journal.some((entry: AnyRecord) => entry.kind === "invalid"), true);
  assert.equal(snapshot.journal.length <= 4, true);

  now += 2_000;
  monitor.push(bytes("f7"));
  snapshot = monitor.snapshot();
  assert.equal(snapshot.parser.pendingHex, "f7");
  assert.equal(snapshot.journal.length <= 4, true);
  assert.equal(snapshot.journal.every((entry: AnyRecord) => entry.generation === snapshot.generation), true);
});

test("RED: decoded device state carries freshness metadata and preserves generation boundaries", () => {
  let now = 1_700_000_100;
  const monitor = createProtocolDebugMonitor({ staleAfterMs: 500, nowMs: () => now });

  monitor.push(bytes("f70d011904401000020102b5ee"));
  monitor.push(bytes("f70b01190240110200b5ee"));
  monitor.push(bytes("f70d011b04431100030000b5ee"));
  monitor.push(bytes("f70d011b04431100040000b2ee"));
  monitor.push(heatingGroupFrame([
    { state: 0x01, currentC: 20, targetC: 22 },
    { state: 0x04, currentC: 24, targetC: 25 },
    { state: 0x01, currentC: 30, targetC: 32 },
    { state: 0x04, currentC: 33, targetC: 34 },
  ]));
  monitor.push(heatingSingleFrame(1, { state: 0x01, currentC: 23, targetC: 25 }));
  monitor.push(heatingSingleFrame(2, { state: 0x04, currentC: 24, targetC: 26 }));
  monitor.push(bytes("f70d013401411000a6040b36ee"));
  assert.equal(monitor.snapshot().devices.elevator.floor, 4);
  assert.equal(monitor.snapshot().devices.elevator.floorLabel, "4");
  // 0xA6 is a car headed up with a down call standing. Folding both nibbles into one
  // `direction` reported "up" and lost the call for the whole journey. The high nibble is
  // also not motion — it is where the car is going or about to go — so there is no field
  // here that claims the car is moving (M4-E149).
  assert.equal(monitor.snapshot().devices.elevator.heading, "up");
  assert.equal(monitor.snapshot().devices.elevator.call, "down");
  assert.equal(monitor.snapshot().devices.elevator.motion, undefined);
  assert.equal(monitor.snapshot().devices.elevator.direction, undefined);
  monitor.push(bytes("f70d01340141100006040b96ee"));
  assert.equal(monitor.snapshot().devices.elevator.floor, 4);
  assert.equal(monitor.snapshot().devices.elevator.heading, "none");
  assert.equal(monitor.snapshot().devices.elevator.call, "down");
  monitor.push(bytes("f70d01340141100001040b91ee"));
  assert.equal(monitor.snapshot().devices.elevator.floor, 4);
  assert.equal(monitor.snapshot().devices.elevator.heading, "none");
  assert.equal(monitor.snapshot().devices.elevator.call, "arrival");
  // A car in the basement reports 0xB1, which used to render as 177.
  monitor.push(bytes("f70d013401411000a5b10b80ee"));
  assert.equal(monitor.snapshot().devices.elevator.floorLabel, "B1");
  assert.equal(monitor.snapshot().devices.elevator.heading, "up");
  assert.equal(monitor.snapshot().devices.elevator.call, "up");
  monitor.push(bytes("f70d01340141100001040b91ee"));
  monitor.push(bytes("f70e011e024311040004ffffb6ee"));
  monitor.push(bytes("f70b011f0140100000b3ee"));
  monitor.push(bytes("f70b012b014011000086ee"));
  monitor.push(frame([0x01, 0x2a, 0x01, 0x40, 0x10, 0x00]));
  monitor.push(frame([0x01, 0x7e, 0x01, 0x40, 0x10, 0x00]));

  const snapshot = monitor.snapshot();
  assert.equal(snapshot.devices.lights[1]?.state, "off");
  assert.equal(snapshot.devices.lights[2]?.state, "on");
  assert.equal(snapshot.devices.lights[3]?.state, "off");
  assertDeviceFresh(snapshot.devices.lights[1], now, 0);
  assert.equal(snapshot.devices.gas.state, "open");
  assertDeviceFresh(snapshot.devices.gas, now, 0);
  assert.deepStrictEqual(
    [1, 2, 3, 4].map((zone) => snapshot.devices.heating[zone]?.state),
    ["on", "off", "on", "off"],
  );
  assert.deepStrictEqual(
    [1, 2, 3, 4].map((zone) => [
      snapshot.devices.heating[zone]?.currentC,
      snapshot.devices.heating[zone]?.targetC,
    ]),
    [[23, 25], [24, 26], [30, 32], [33, 34]],
  );
  assertDeviceFresh(snapshot.devices.heating[1], now, 0);
  assert.equal(snapshot.devices.elevator.floor, 4);
  assert.equal(snapshot.devices.elevator.call, "arrival");
  assert.equal(typeof snapshot.devices.entrances.household.doorOpenAtMs, "number");
  assert.equal(snapshot.devices.entrances.household.call, undefined, "the 0x1E 02 frame is not a call");
  assert.equal(snapshot.devices.entrances.communal.evidence, "not_decoded");
  assert.equal(snapshot.devices.outlet.queryOnly, true);
  assert.equal(snapshot.devices.ventilation.queryOnly, true);
  assert.equal(snapshot.queries.outlet, 1);
  assert.equal(snapshot.queries.ventilation, 1);
  assert.equal(snapshot.ambiguous.some((entry: AnyRecord) => entry.cluster === "0x2a"), true);
  assert.equal(snapshot.unknown.some((entry: AnyRecord) => entry.cluster === "0x7e"), true);
  assert.equal(snapshot.devices.vehicle.evidence, "unidentified");

  now += 501;
  assert.equal(monitor.snapshot().devices.lights[1].stale, true);
  monitor.resetGeneration();
  const reset = monitor.snapshot();
  assert.equal(reset.generation, 1);
  assert.equal(reset.devices.lights[1].generation, 0);
  assert.equal(reset.devices.lights[1].stale, true);
  monitor.stop();
  assert.equal(monitor.snapshot().devices.gas.stale, true);
});

test("RED: 7F events, declared-plus-one splits, gas queries, and generation freshness are bounded", () => {
  let now = 1_700_000_200;
  const monitor = createProtocolDebugMonitor({ journalLimit: 8, staleAfterMs: 10_000, nowMs: () => now });
  const events = ["7fb70000ee", "7fb90000ee", "7fb40000ee", "7fba0000ee", "7f5f0000ee", "7f610000ee", "7f600000ee"];
  for (const value of events) monitor.push(bytes(value));
  const eventSnapshot = monitor.snapshot();
  assert.equal(eventSnapshot.frames.length, events.length);
  assert.equal(eventSnapshot.frames.every((entry: AnyRecord) => entry.rawHex.endsWith("ee")), true);
  assert.equal(eventSnapshot.unknown.some((entry: AnyRecord) => entry.cluster === "0xb7"), true);
  assert.equal(eventSnapshot.unknown.some((entry: AnyRecord) => entry.cluster === "0x5f"), true);

  const splitMonitor = createProtocolDebugMonitor({ nowMs: () => now });
  // A frame split across two reads must wait rather than resync. This used to exercise a
  // parser branch that accepted `declared + 1`, which only ever existed to read the frames
  // we invented ourselves; real 0x18 frames declare their true length.
  const split = heatingSingleFrame(2, { state: 0x04, currentC: 24, targetC: 26 });
  const cut = split.length - 3;
  splitMonitor.push(split.slice(0, cut));
  assert.equal(splitMonitor.snapshot().frames.length, 0);
  assert.equal(splitMonitor.snapshot().parser.pendingHex, hex(split.slice(0, cut)));
  splitMonitor.push(split.slice(cut));
  assert.equal(splitMonitor.snapshot().frames.length, 1);
  assert.equal(splitMonitor.snapshot().devices.heating[2].state, "off");

  const gasMonitor = createProtocolDebugMonitor({ nowMs: () => now });
  gasMonitor.push(bytes("f70d011b04431100040000b2ee"));
  assert.equal(gasMonitor.snapshot().devices.gas.state, "open");
  gasMonitor.push(frame([0x01, 0x1b, 0x01, 0x43, 0x11, 0x00]));
  assert.equal(gasMonitor.snapshot().devices.gas.state, "open");
  gasMonitor.push(bytes("f70d011b04431100030000b5ee"));
  assert.equal(gasMonitor.snapshot().devices.gas.state, "closed");

  monitor.push(bytes("f70d011904401000020102b5ee"));
  assert.equal(monitor.snapshot().devices.lights[1].stale, false);
  monitor.resetGeneration();
  assert.equal(monitor.snapshot().devices.lights[1].stale, true);
  monitor.push(bytes("00"));
  assert.equal(monitor.snapshot().devices.lights[1].stale, true);
  monitor.push(bytes("f70d011904401000020102b5ee"));
  assert.equal(monitor.snapshot().devices.lights[1].generation, monitor.snapshot().generation);
  assert.equal(monitor.snapshot().devices.lights[1].stale, false);
});

test("RED-exception: semantic action encoder keeps evidence, speculative confirmation, and device-success boundaries", () => {
  const live = { transmitEnabled: true, speculativeTransmitEnabled: true, authorizedUser: true };
  const action = (value: unknown, context = live) => encodeSemanticAction(value as never, context);
  const assertObserved = (value: unknown, expectedHex: string) => {
    const result = action(value);
    assert.equal(result.evidence, "observed");
    assert.equal(result.sendable, true);
    assert.equal(result.confirmed, false);
    assert.equal(hex(result.frame), expectedHex);
  };

  for (const [target, on, off] of [
    [1, "f70b01190240110100b6ee", "f70b01190240110200b5ee"],
    [2, "f70b01190240120100b5ee", "f70b01190240120200b6ee"],
    [3, "f70b01190240130100b4ee", "f70b01190240130200b7ee"],
  ] as const) {
    assertObserved({ kind: "light", target, state: "on" }, on);
    assertObserved({ kind: "light", target, state: "off" }, off);
  }
  const gasClose = action({ kind: "gas", state: "close" });
  assert.equal(gasClose.evidence, "observed");
  assert.equal(gasClose.sendable, true, "one tap is the point of the promotion");
  assert.equal(gasClose.requiresSpeculativeConfirmation, undefined);

  const gasOpen = action({ kind: "gas", state: "open" });
  assert.equal(gasOpen.sendable, false);
  assert.equal(gasOpen.evidence, "rejected");
  assert.throws(() => action({ kind: "door", target: "unlock" }));
  assert.throws(() => action({ kind: "door", target: "open" }));
  assert.throws(() => action({ kind: "door", signature: "b4" }));
  assert.throws(() => action({ kind: "door", signature: "61" }));
  assert.throws(() => action({ kind: "vehicle", state: "arrive" }));
  assert.throws(() => action({ kind: "cctv", state: "start" }));
  assert.throws(() => action({ kind: "batch", actions: [] }));

  // `raw` is gone; the door macros are not. Arbitrary sends belong to the local buslab,
  // behind its allow-list, and never to a page on the household network. The macros stay as
  // candidates that no single tap can send, which keeps the speculative path exercised and
  // gives the subphone work — where the bell and the video actually live — something to
  // attach to. The new page offers neither.
  const unsafeLive = { ...live, unsafeTransmitEnabled: true };
  const assertUnsafeMacro = (value: unknown, expected: string[]) => {
    const result = action(value, unsafeLive);
    assert.equal(result.evidence, "unsafe_candidate");
    assert.equal(result.transportEvidence, "unverified");
    assert.equal(result.sendable, false);
    assert.equal(result.requiresSpeculativeConfirmation, true);
    assert.deepStrictEqual((result.frames as Uint8Array[]).map((entry) => hex(entry)), expected);
  };
  assertUnsafeMacro({ kind: "entrance", target: "household", state: "inactive" }, ["7fb90000ee", "7fb40000ee", "7fba0000ee"]);
  assertUnsafeMacro({ kind: "entrance", target: "household", state: "ringing" }, ["7fb70000ee", "7fb40000ee", "7fb80000ee"]);
  assertUnsafeMacro({ kind: "entrance", target: "communal", state: "ringing" }, ["7f5f0000ee", "7f610000ee", "7f600000ee"]);
  for (const value of [{ kind: "outlet", action: "query" }, { kind: "ventilation", action: "query" }]) {
    const result = action(value, unsafeLive);
    assert.equal(result.evidence, "rejected", JSON.stringify(value));
    assert.equal(result.sendable, false, JSON.stringify(value));
  }
  for (const rawish of [
    { kind: "raw", hex: "aabb" },
    { kind: "raw", hex: "f70b01190240110100b6ee" },
    { kind: "raw", hex: "7fb70000ee" },
    { kind: "raw" },
  ]) {
    assert.throws(() => action(rawish, unsafeLive), /unsupported/, JSON.stringify(rawish));
  }

  // Zone 1 once claimed observed evidence on a frame that appeared in no capture. 0.2.7
  // replaced all four with the wallpad's own frames and held them as candidates until one
  // was seen to move real heating; the operator has now done that on the live bus.
  for (const zone of [1, 2, 3, 4]) {
    const heatingOn = action({ kind: "heat", zone, state: "on" });
    assert.equal(heatingOn.evidence, "observed");
    assert.equal(heatingOn.sendable, true, "one tap is the point of the promotion");
    assert.equal(heatingOn.confirmed, false);
    assert.equal(heatingOn.requiresSpeculativeConfirmation, undefined);
    assert.match(hex(heatingOn.frame), /^f7/);
  }
  for (const zone of [1, 2, 3, 4]) {
    for (const temperatureC of [5, 40]) {
      const temperature = action({ kind: "heat", zone, temperatureC });
      assert.equal(temperature.evidence, "observed");
      assert.equal(temperature.sendable, true);
      assert.equal(temperature.requiresSpeculativeConfirmation, undefined);
      assert.match(hex(temperature.frame), /^f7/);
    }
  }
  const allOff = action({ kind: "heat", target: "all", state: "off" });
  assert.equal(allOff.evidence, "observed");
  assert.equal(allOff.sendable, true);
  assert.equal(allOff.requiresSpeculativeConfirmation, undefined);
  for (const temperatureC of [4, 41]) {
    assert.equal(action({ kind: "heat", zone: 1, temperatureC }).evidence, "rejected");
  }

  // The elevator call was the last candidate. Its earlier shape had two bytes wrong and
  // registered nothing twice; the corrected one went out five times and took. The phrase
  // field is still accepted on any action and still changes nothing — it was never what
  // made a control safe.
  for (const direction of ["up", "down"] as const) {
    const elevator = action({ kind: "elevator", direction });
    assert.equal(elevator.evidence, "observed");
    assert.equal(elevator.sendable, true, "one tap is the point");
    assert.equal(elevator.requiresSpeculativeConfirmation, undefined);
    assert.equal(action({ kind: "elevator", direction, confirmation: "BESTIUM-SPECULATIVE-CONFIRM" }).sendable, true);
    assert.equal(action({ kind: "elevator", direction }, { transmitEnabled: false, authorizedUser: true }).sendable, false);
  }
  for (const value of [
    { kind: "heat", zone: 3, temperatureC: 20 },
    { kind: "heat", zone: 4, temperatureC: 20 },
    { kind: "batchoff", state: "on" },
    { kind: "light", target: "all", state: "off" },
    { kind: "heat", target: "all", state: "off" },
  ]) {
    assert.equal(action(value).sendable, true, JSON.stringify(value));
    assert.equal(action({ ...value, confirmation: "BESTIUM-SPECULATIVE-CONFIRM" }).sendable, true, JSON.stringify(value));
    assert.equal(action(value, { transmitEnabled: false, authorizedUser: true }).sendable, false, JSON.stringify(value));
  }

  // Both query actions are gone with their devices. 0x1F and 0x2B were polled on every
  // sweep of the bus and answered on none of them: this wallpad has neither an outlet
  // module nor a ventilation unit, so a control for either would be a button that does
  // nothing at all.
  assert.equal(action({ kind: "outlet", action: "query" }).evidence, "rejected");
  assert.equal(action({ kind: "ventilation", action: "query" }).evidence, "rejected");
});

test("RED-final: malformed short F7 and unclosed 7F input stay bounded and non-throwing", () => {
  const shortMonitor = createProtocolDebugMonitor({ journalLimit: 4 });
  assert.doesNotThrow(() => shortMonitor.push(bytes("f70501f3ee")));
  const shortSnapshot = shortMonitor.snapshot();
  assert.equal(shortSnapshot.frames.length, 0, "a checksum-valid short frame is not a device state");
  assert.equal(
    shortSnapshot.journal.some((entry: AnyRecord) => entry.kind === "invalid" || entry.kind === "unknown"),
    true,
    "short malformed input must remain bounded evidence",
  );

  const longMonitor = createProtocolDebugMonitor({ journalLimit: 4 });
  assert.doesNotThrow(() => longMonitor.push(new Uint8Array(4_096).fill(0x7f)));
  const longSnapshot = longMonitor.snapshot();
  assert.ok(longSnapshot.parser.pendingHex.length <= 512, "unclosed 7F carry must be bounded");
  assert.ok(longSnapshot.journal.length <= 4, "invalid evidence journal must be bounded");
  assert.ok(
    longSnapshot.journal.every((entry: AnyRecord) => !entry.rawHex || entry.rawHex.length <= 512),
    "invalid evidence must not retain an unbounded raw payload",
  );

  const arbitraryMonitor = createProtocolDebugMonitor({ journalLimit: 4 });
  assert.doesNotThrow(() => arbitraryMonitor.push(bytes("7f620000ee")));
  const arbitrarySnapshot = arbitraryMonitor.snapshot();
  assert.equal(
    arbitrarySnapshot.unknown.some((entry: AnyRecord) => entry.rawHex === "7f620000ee"),
    true,
    "an arbitrary five-byte 7F frame is unknown, not door proof",
  );
});

test("RED-final: protocol-debug has no Buffer or runtime crypto dependency", () => {
  const source = readFileSync(new URL("../bestium-eco-foret/src/protocol-debug.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["']node:crypto["']/);
  assert.doesNotMatch(source, /\bBuffer\b/);
});

test("RED: debug UI is bilingual, explicit about TX gates, and uses safe accessible rendering", () => {
  const ui = readFileSync(new URL("../bestium-eco-foret/src/ui.ts", import.meta.url), "utf8");
  const initialCctv = ui.match(/<p id=["']cctv-observation["']>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  assert.match(initialCctv, /^CCTV unknown · stale/i, "initial CCTV state must be unknown/stale");
  for (const marker of [
    "Protocol Debug", "프로토콜", "TX disabled", "authorized", "connected",
    "light-1-on", "light-2-on", "light-3-on", "gas-close", "heat-zone-1", "heat-zone-2", "heat-zone-3", "heat-zone-4",
    "elevator-up", "elevator-down", "current floor", "direction", "household entrance", "common entrance",
    "outlet", "ventilation", "batch/unknown", "vehicle unidentified", "CCTV not observed in the inspected current protocol frame/generation",
    "current F7 transport unverified", "inferred_candidate", "unsafe_candidate", "preview", "single-burst", "age", "stale",
    "/api/action", "/api/capture", "/api/stop", "/api/download", "csrfToken", "payload.debug.devices", "payload.debug.frames",
  ]) assert.equal(ui.includes(marker), true, "missing UI contract: " + marker);
  assert.match(ui, /kind\s*:\s*["']light["']/);
  assert.match(ui, /kind\s*:\s*["']gas["']/);
  assert.match(ui, /kind\s*:\s*["']heat["']/);
  assert.match(ui, /kind\s*:\s*["']elevator["']/);
  assert.match(ui, /kind\s*:\s*["']outlet["']/);
  assert.match(ui, /kind\s*:\s*["']ventilation["']/);
  assert.match(ui, /household:(?:inactive|ringing)|household.*ringing/);
  assert.match(ui, /communal:ringing|communal.*ringing/);
  assert.match(ui, /type=["']number["'][^>]*min=["']5["'][^>]*max=["']40["']/i);
  assert.match(ui, /temperatureC|value/);
  assert.match(ui, /raw-burst/);
  assert.match(ui, /mode\s*[=:]\s*["']preview["']/);
  assert.match(ui, /mode\s*[=:]\s*["'](?:challenge|issue_challenge)["']/);
  assert.match(ui, /mode\s*[=:]\s*["'](?:commit|live)["']/);
  assert.match(ui, /challengeId/);
  assert.match(ui, /confirmationPhrase/);
  assert.match(ui, /(?:cancel|clear)/i);
  assert.match(ui, /socket_written_unconfirmed/);
  assert.match(ui, /deviceConfirmed|device-not-confirmed/);
  assert.match(ui, /aria-invalid/);
  assert.match(ui, /raw-error/);
  assert.match(ui, /\.value/);
  assert.match(ui, /unsafe_candidate/);
  assert.match(ui, /fixed macro|door.*macro|macro.*door/i);
  assert.match(ui, /200\s*ms|200ms/);
  assert.match(ui, /role=["'](?:status|alert)["']/);
  // The CSRF token is an in-memory closure value; it must never be copied into
  // a meta tag or DOM attribute that a page script can read back.
  assert.doesNotMatch(ui, /<meta[^>]+name=["']csrf-token["'][^>]+content=/i);
  assert.doesNotMatch(ui, /setAttribute\(["']content["']/);
  assert.match(ui, /csrfToken/);
  assert.match(ui, /setTimeout\([^)]*poll|poll[^\n]*setTimeout/i);
  assert.doesNotMatch(ui, /setInterval/);
  assert.match(ui, /poll.*(?:failed|stale)|(?:failed|stale).*poll/i);
  assert.match(ui, /payload\.debug\.(?:devices|queries|frames|unknown)/);
  assert.match(ui, /idle-timeout/);
  assert.match(ui, /focus-visible/);
  assert.match(ui, /--(?:input|focus)[^:]*:/);
  assert.match(ui, /prefers-reduced-motion/);
  assert.doesNotMatch(ui, /gas-open|door-(?:open|unlock)|vehicle-(?:start|drive)|cctv-(?:start|stop)/i);
  assert.doesNotMatch(ui, /\{\s*control\s*:/);
  assert.doesNotMatch(ui, /\.innerHTML\s*=/);
  assert.doesNotMatch(ui, /class="sr-only"[^>]*>Idle timeout/);
});

test("RED-final: UI uses a two-activation review flow and renders current-generation monitor rows", () => {
  const ui = readFileSync(new URL("../bestium-eco-foret/src/ui.ts", import.meta.url), "utf8");
  const script = ui.match(/<script>([\s\S]*?)<\/script>/i)?.[1] ?? ui;
  for (const marker of [
    "light-state-1", "light-state-2", "light-state-3", "gas-state",
    "heat-state-1", "heat-state-2", "heat-state-3", "heat-state-4",
    "heating-current-1", "heating-target-1", "elevator-floor", "elevator-direction",
    "household-entrance", "common-entrance", "outlet-query", "ventilation-query",
    "vehicle-unidentified", "unknown-clusters", "CCTV not observed in the inspected current protocol frame/generation",
    "pendingAppend", "quiet", "currentGenerationRx", "fresh", "sevenFProof",
  ]) assert.match(ui, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing dynamic monitor/gate row: ${marker}`);
  assert.match(script, /aria-busy/);
  assert.match(script, /clearTimeout\([^)]*poll/);
  assert.match(script, /expiresAtMs|countdown/);
  assert.match(script, /reviewed|challenged|committing/);
  assert.match(script, /focus\(\)/);
  assert.doesNotMatch(script, /postAction\(reviewedAction,\s*["'](?:challenge|issue_challenge)["'][\s\S]{0,500}postAction\(reviewedAction,\s*["'](?:commit|live)["']/);
  assert.doesNotMatch(ui, /id=["']raw-error["'][^>]*role=["']alert["']/i);
  assert.match(ui, /id=["']heat-temp-[1-4]["'][^>]*aria-invalid/i);
});

test("RED-exception: 7F proof requires one complete ordered contiguous sequence in one generation", () => {
  const sequences = [
    {
      action: "household:inactive",
      frames: ["7fb90000ee", "7fb40000ee", "7fba0000ee"],
    },
    {
      action: "communal:ringing",
      frames: ["7f5f0000ee", "7f610000ee", "7f600000ee"],
    },
  ] as const;

  for (const sequence of sequences) {
    const partial = createProtocolDebugMonitor({ journalLimit: 16 });
    partial.push(bytes(sequence.frames[0]));
    assert.equal(partial.snapshot().sevenFProof, undefined, "one 7F frame is not proof");

    const wrongOrder = createProtocolDebugMonitor({ journalLimit: 16 });
    wrongOrder.push(concat(bytes(sequence.frames[1]), bytes(sequence.frames[0]), bytes(sequence.frames[2])));
    assert.equal(wrongOrder.snapshot().sevenFProof, undefined, "wrong order is not proof");

    const interleaved = createProtocolDebugMonitor({ journalLimit: 16 });
    const other = sequence.action === "household:inactive" ? "7f5f0000ee" : "7fb90000ee";
    interleaved.push(concat(bytes(sequence.frames[0]), bytes(other), bytes(sequence.frames[1]), bytes(sequence.frames[2])));
    assert.equal(interleaved.snapshot().sevenFProof, undefined, "interleaved frames are not proof");

    const reset = createProtocolDebugMonitor({ journalLimit: 16 });
    reset.push(bytes(sequence.frames[0]));
    reset.resetGeneration();
    reset.push(concat(bytes(sequence.frames[1]), bytes(sequence.frames[2])));
    assert.equal(reset.snapshot().sevenFProof, undefined, "a generation reset breaks proof continuity");

    const complete = createProtocolDebugMonitor({ journalLimit: 16 });
    complete.push(concat(...sequence.frames.map(bytes)));
    const proof = complete.snapshot().sevenFProof as AnyRecord | undefined;
    assert.equal(proof?.action, sequence.action);
    assert.deepStrictEqual(proof?.frames, [...sequence.frames]);
    assert.equal(proof?.generation, 0);
  }
});

test("RED-final: 7F proof rejects mid-sequence noise/invalid frames and timestamps only exact completion", () => {
  const sequences = [
    ["7fb90000ee", "7fb40000ee", "7fba0000ee"],
    ["7f5f0000ee", "7f610000ee", "7f600000ee"],
  ];
  let now = 1_700_010_000;

  for (const frames of sequences) {
    for (const middle of ["00", "7f620000ef"]) {
      const interrupted = createProtocolDebugMonitor({ nowMs: () => now, journalLimit: 16 });
      interrupted.push(bytes(frames[0]));
      interrupted.push(bytes(middle));
      interrupted.push(concat(bytes(frames[1]), bytes(frames[2])));
      assert.equal(
        interrupted.snapshot().sevenFProof,
        undefined,
        `mid-sequence ${middle} must invalidate ${frames.join(",")}`,
      );
    }

    const complete = createProtocolDebugMonitor({ nowMs: () => now, journalLimit: 16 });
    complete.push(bytes(frames[0]).slice(0, 2));
    complete.push(bytes(frames[0]).slice(2));
    complete.push(bytes(frames[1]).slice(0, 3));
    complete.push(bytes(frames[1]).slice(3));
    complete.push(bytes(frames[2]).slice(0, 1));
    complete.push(bytes(frames[2]).slice(1));
    const proof = complete.snapshot().sevenFProof as AnyRecord | undefined;
    assert.equal(proof?.completedAtMs, now, "proof completion must carry the exact completion timestamp");
    const completedAtMs = proof?.completedAtMs;
    now += 777;
    complete.push(bytes("7f620000ee"));
    assert.equal(
      (complete.snapshot().sevenFProof as AnyRecord | undefined)?.completedAtMs,
      completedAtMs,
      "unrelated valid 7F evidence must not rewrite proof completion time",
    );
  }
});

test("M5: every control the page offers is measured, and no candidates remain", () => {
  const context = {
    transmitEnabled: true,
    speculativeTransmitEnabled: true,
    unsafeTransmitEnabled: true,
    authorizedUser: true,
  };
  const observed = (value: AnyRecord): AnyRecord => encodeSemanticAction(value, context);

  for (const target of [1, 2, 3]) {
    assert.equal(observed({ kind: "light", target, state: "on" }).evidence, "observed");
    assert.equal(observed({ kind: "light", target, state: "off" }).evidence, "observed");
  }
  // Heating and gas were promoted after the operator drove them on the live bus.
  for (const state of ["on", "off"] as const) {
    assert.equal(observed({ kind: "heat", zone: 1, state }).evidence, "observed");
  }
  assert.equal(observed({ kind: "heat", zone: 1, temperatureC: 20 }).evidence, "observed");
  for (const value of [
    { kind: "gas", state: "close" },
    { kind: "heat", zone: 2, state: "on" },
    { kind: "heat", zone: 3, temperatureC: 20 },
    { kind: "heat", target: "all", state: "off" },
  ]) {
    assert.equal(observed(value).evidence, "observed", JSON.stringify(value));
  }

  // The elevator call was the last inferred candidate. Its shape had two bytes wrong, which
  // is why the earlier one registered nothing; the corrected frame was sent five times and
  // judged off the status stream. Nothing on this page is a candidate any more.
  for (const value of [
    { kind: "elevator", direction: "up" },
    { kind: "elevator", direction: "down" },
    { kind: "batchoff", state: "on" },
    { kind: "batchoff", state: "off" },
    { kind: "light", target: "all", state: "on" },
    { kind: "heat", target: "all", state: "on" },
  ]) {
    const result = observed(value);
    assert.equal(result.evidence, "observed", JSON.stringify(value));
    assert.equal(result.sendable, true, JSON.stringify(value));
    assert.equal(result.requiresSpeculativeConfirmation, undefined, JSON.stringify(value));
  }
  assert.equal(observed({ kind: "gas", state: "open" }).evidence, "rejected");

  const unknownMonitor = createProtocolDebugMonitor({ journalLimit: 8 });
  unknownMonitor.push(frame([0x01, 0x19, 0x04, 0x40, 0x10, 0x00, 0x09, 0x09, 0x09]));
  unknownMonitor.push(frame([0x01, 0x1b, 0x04, 0x43, 0x11, 0x00, 0x09]));
  unknownMonitor.push(frame([0x01, 0x34, 0x01, 0x41, 0x10, 0x00, 0x99, 0x09]));
  const unknown = unknownMonitor.snapshot();
  assert.notEqual(unknown.devices.lights[1].state, "off");
  assert.notEqual(unknown.devices.gas.state, "closed");
  assert.notEqual(unknown.devices.elevator.direction, "arrival");
});
