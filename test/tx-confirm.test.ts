import assert from "node:assert/strict";
import test from "node:test";

import { createTxCoordinator, parseM2Settings } from "../bestium-eco-foret/src/m2.ts";

// Kept out of `m2.test.ts`: that file is past the size where Node's TypeScript stripping
// segfaults intermittently, and this suite adds several kilobytes.

type AnyRecord = Record<string, any>;

type Fixture = ReturnType<typeof createFixture>;

function freshDevice(atMs: number, extra: AnyRecord = {}): AnyRecord {
  return { lastSeenAtMs: atMs, generation: 1, stale: false, ...extra };
}

function createFixture(options: { answers?: boolean; maxAttempts?: number } = {}) {
  const answers = options.answers !== false;
  let now = 1_700_000_000;
  const writes: string[] = [];
  const timers = new Map<number, { at: number; fn: () => void }>();
  let nextTimer = 1;

  const devices: AnyRecord = {
    lights: { 1: freshDevice(0, { state: "off" }), 2: freshDevice(0, { state: "off" }), 3: freshDevice(0, { state: "off" }) },
    heating: {
      1: freshDevice(0, { state: "off", currentC: 23, targetC: 23 }),
      2: freshDevice(0, { state: "off", currentC: 26, targetC: 23 }),
      3: freshDevice(0, { state: "off", currentC: 26, targetC: 23 }),
      4: freshDevice(0, { state: "off", currentC: 27, targetC: 23 }),
    },
    gas: freshDevice(0, { state: "open" }),
    elevator: freshDevice(0, { motion: "idle", call: "none" }),
    outlet: freshDevice(0),
    ventilation: freshDevice(0),
  };

  // The wallpad answers a command in the same read as the write, so a reply that lands
  // immediately is what the bus actually does. Turning it off is how a lost frame is
  // simulated.
  const applyReply = (hex: string): void => {
    if (!answers) return;
    const bytes = (hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16));
    if (bytes[3] === 0x19 && bytes[4] === 0x02) {
      const light = bytes[6] - 0x10;
      devices.lights[light] = freshDevice(now, { state: bytes[7] === 1 ? "on" : "off" });
    }
    if (bytes[3] === 0x18 && bytes[4] === 0x02 && bytes[5] === 0x46) {
      const zone = bytes[6] - 0x10;
      devices.heating[zone] = { ...devices.heating[zone], ...freshDevice(now, { state: bytes[7] === 1 ? "on" : "off" }) };
    }
    if (bytes[3] === 0x18 && bytes[4] === 0x02 && bytes[5] === 0x45) {
      const zone = bytes[6] - 0x10;
      devices.heating[zone] = { ...devices.heating[zone], ...freshDevice(now, { targetC: bytes[7] }) };
    }
    if (bytes[3] === 0x1b && bytes[4] === 0x02) devices.gas = freshDevice(now, { state: "closed" });
  };

  const transport = {
    on() {}, off() {}, removeAllListeners() {}, destroy() {},
    write(chunk: Uint8Array, callback?: (error?: Error | null) => void) {
      const hex = Array.from(chunk, (byte) => byte.toString(16).padStart(2, "0")).join("");
      writes.push(hex);
      applyReply(hex);
      callback?.(null);
      return true;
    },
  };

  const settings = parseM2Settings({
    ew11_host: "gateway-1",
    ew11_port: 8899,
    transmit_enabled: true,
    speculative_transmit_enabled: true,
    transmit_user_id: "operator-7",
    tx_max_attempts: options.maxAttempts ?? 3,
    // The floor the schema allows, so an exhausted retry budget costs three seconds of fake
    // clock rather than nine.
    tx_observation_timeout_ms: 1_000,
  } as AnyRecord);

  const coordinator = createTxCoordinator({
    settings,
    nowMs: () => now,
    setTimeout: (fn: () => void, delayMs: number) => {
      const id = nextTimer;
      nextTimer += 1;
      timers.set(id, { at: now + Math.max(0, delayMs), fn });
      return id;
    },
    clearTimeout: (id: unknown) => { timers.delete(id as number); },
    randomBytes: (size: number) => Uint8Array.from({ length: size }, (_value, index) => index),
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => 1,
    getDevices: () => ({ devices, generation: 1 }),
    getRxState: () => ({
      connected: true,
      pendingAppend: false,
      rxByteEpoch: 1,
      validFrameEpoch: 1,
      validFrameGeneration: 1,
      readEpoch: 1,
      txByteEpoch: 0,
      lastRxByteAtMs: now - 200,
      lastValidFrameAtMs: now - 100,
      lastResumeAtMs: now - 200,
    }),
  } as AnyRecord);

  // Advance the clock the way the bus does, firing whatever the coordinator scheduled, and
  // stop as soon as the work under test has settled.
  const settle = async <T>(work: Promise<T>, maxSteps = 2_000): Promise<T> => {
    let finished = false;
    const watched = work.then(
      (value) => { finished = true; return value; },
      (error) => { finished = true; throw error; },
    );
    for (let step = 0; step < maxSteps && !finished; step += 1) {
      const target = now + 20;
      for (;;) {
        let due: { id: number; at: number; fn: () => void } | undefined;
        for (const [id, timer] of timers) if (timer.at <= target && (!due || timer.at < due.at)) due = { id, ...timer };
        if (!due) break;
        now = due.at;
        timers.delete(due.id);
        due.fn();
      }
      now = target;
      await Promise.resolve();
    }
    return watched;
  };

  return { coordinator, writes, devices, settle, nowMs: () => now, settings };
}

const request = { userId: "operator-7", mode: "live", schedule: "immediate" };
const send = (fixture: Fixture, action: AnyRecord): Promise<AnyRecord> =>
  fixture.coordinator.send(action, request) as Promise<AnyRecord>;

test("0.3.0 RED: a command the wallpad answers is confirmed on the first attempt", async () => {
  const fixture = createFixture();
  const result = await fixture.settle(send(fixture, { kind: "light", target: 2, state: "on" }));
  assert.equal(result.outcome, "confirmed", JSON.stringify(result));
  assert.equal(result.deviceConfirmed, true);
  assert.equal(fixture.writes.length, 1, "a confirmed command must not be sent twice");
  assert.deepEqual(fixture.writes, ["f70b01190240120100b5ee"]);
});

test("0.3.0 RED: a lost frame is retried and reported unconfirmed, never as success", async () => {
  // 0.2.8 wrote once and reported `socket_written_unconfirmed`, which is what the operator
  // saw whenever a frame collided with the wallpad's own traffic.
  const fixture = createFixture({ answers: false, maxAttempts: 3 });
  const result = await fixture.settle(send(fixture, { kind: "light", target: 1, state: "on" }));
  assert.equal(result.outcome, "unconfirmed", JSON.stringify(result));
  assert.equal(result.attempts, 3);
  assert.equal(fixture.writes.length, 3, "every attempt must reach the bus");
});

test("0.3.0 RED: commanding the state a device already holds still confirms", async () => {
  // Both heating commands of ours that reached the bus in capture A were no-ops, and the
  // wallpad answered both. Requiring the state to change would retry them for ever.
  const fixture = createFixture();
  const result = await fixture.settle(send(fixture, { kind: "heat", zone: 2, state: "off" }));
  assert.equal(result.outcome, "confirmed", JSON.stringify(result));
  assert.equal(fixture.writes.length, 1);
});

test("0.3.0 RED: a mashed control collapses to the first send and the last state", async () => {
  // The operator's own example: on, off, on, off on one light. The first press is already on
  // the wire and cannot be recalled, so it runs; the two in the middle are replaced where
  // they wait; the last state is what actually gets sent after it. Two frames, not four,
  // and nothing is silently dropped.
  const fixture = createFixture();
  const presses = ["on", "off", "on", "off"].map((state) => send(fixture, { kind: "light", target: 1, state }));
  const results = await fixture.settle(Promise.all(presses));
  assert.deepEqual(
    results.map((entry) => entry.outcome),
    ["confirmed", "superseded", "superseded", "confirmed"],
    JSON.stringify(results),
  );
  assert.deepEqual(fixture.writes, ["f70b01190240110100b6ee", "f70b01190240110200b5ee"]);
  assert.equal(fixture.devices.lights[1].state, "off", "the light ends in the last requested state");
});

test("0.3.0 RED: a different control queues behind rather than being refused", async () => {
  const fixture = createFixture();
  const first = send(fixture, { kind: "light", target: 1, state: "on" });
  const second = send(fixture, { kind: "light", target: 2, state: "on" });
  const [a, b] = await fixture.settle(Promise.all([first, second]));
  assert.equal(a.outcome, "confirmed", JSON.stringify(a));
  assert.equal(b.outcome, "confirmed", JSON.stringify(b));
  assert.deepEqual(fixture.writes, ["f70b01190240110100b6ee", "f70b01190240120100b5ee"]);
});

test("0.3.0 RED: all-zones off is four independent commands, not one macro", async () => {
  const fixture = createFixture();
  const result = await fixture.settle(send(fixture, { kind: "heat", target: "all", state: "off" }));
  assert.equal(result.outcome, "confirmed", JSON.stringify(result));
  assert.deepEqual(fixture.writes, [
    "f70b01180246110400b4ee", "f70b01180246120400b7ee",
    "f70b01180246130400b6ee", "f70b01180246140400b1ee",
  ]);
});

test("0.3.0 RED: an entrance macro is never queued and never retried", async () => {
  // It has no reply on this line, so it can be neither confirmed nor safely repeated.
  const fixture = createFixture({ answers: false });
  const result = await fixture.settle(send(fixture, { kind: "entrance", target: "household", state: "ringing" }));
  assert.notEqual(result.outcome, "confirmed");
  assert.notEqual(result.outcome, "unconfirmed");
  assert.equal(fixture.writes.length, 0, "the 7F compatibility gate still refuses it");
});

test("0.3.0 RED: the target temperature confirms on its own field, not on the power reply", async () => {
  const fixture = createFixture();
  const result = await fixture.settle(send(fixture, { kind: "heat", zone: 1, temperatureC: 24 }));
  assert.equal(result.outcome, "confirmed", JSON.stringify(result));
  assert.equal(fixture.devices.heating[1].targetC, 24);
  assert.deepEqual(fixture.writes, ["f70b01180245111800abee"]);
});

test("0.3.0 RED: an all-zones batch is confirmed only when every zone is", async () => {
  // Zone 2 is replaced while it waits, so a newer request for that zone is still to run.
  // Reporting the batch as confirmed would tell the operator every zone is off when one is
  // on its way to being turned on.
  const fixture = createFixture();
  const batch = send(fixture, { kind: "heat", target: "all", state: "off" });
  const zoneTwo = send(fixture, { kind: "heat", zone: 2, state: "on" });
  const [batchResult, zoneResult] = await fixture.settle(Promise.all([batch, zoneTwo]));
  assert.equal(batchResult.outcome, "partial", JSON.stringify(batchResult));
  // The whole must never stand in for its parts: three zones did act on a frame, and saying
  // "not sent" about the batch would invite the operator to press it again.
  assert.equal(batchResult.confirmedParts, 3);
  assert.equal(batchResult.partCount, 4);
  assert.equal(batchResult.framesWritten, 3);
  assert.match(String(batchResult.reason), /heat:2:power=superseded/);
  assert.equal(zoneResult.outcome, "confirmed", JSON.stringify(zoneResult));
  assert.equal(fixture.devices.heating[2].state, "on", "the newer request for zone 2 is what runs");
  assert.equal(fixture.devices.heating[3].state, "off");
});
