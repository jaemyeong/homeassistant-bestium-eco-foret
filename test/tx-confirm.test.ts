import assert from "node:assert/strict";
import test from "node:test";

import { createTxCoordinator } from "../bestium-eco-foret/src/m2.ts";
import { DEFAULTS } from "../bestium-eco-foret/src/settings.ts";

// Kept out of `m2.test.ts`: that file is past the size where Node's TypeScript stripping
// segfaults intermittently, and this suite adds several kilobytes.

type AnyRecord = Record<string, any>;

type Fixture = ReturnType<typeof createFixture>;

function freshDevice(atMs: number, extra: AnyRecord = {}): AnyRecord {
  return { lastSeenAtMs: atMs, generation: 1, stale: false, ...extra };
}

function createFixture(options: { answers?: boolean; maxAttempts?: number; disconnectAfterWrites?: number; appendPendingForMs?: number; gate?: "open" | "never" } = {}) {
  const answers = options.answers !== false;
  let now = 1_700_000_000;
  const openedAt = now;
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
    // Address 0x10 is the group in both families: the wallpad applies it to every member and
    // reports each one on its own next poll, which is why 0x11 upward are the individuals.
    if (bytes[3] === 0x19 && bytes[4] === 0x02) {
      const state = bytes[7] === 1 ? "on" : "off";
      const lights = bytes[6] === 0x10 ? [1, 2, 3] : [bytes[6] - 0x10];
      for (const light of lights) devices.lights[light] = freshDevice(now, { state });
    }
    if (bytes[3] === 0x18 && bytes[4] === 0x02 && bytes[5] === 0x46) {
      const state = bytes[7] === 1 ? "on" : "off";
      const zones = bytes[6] === 0x10 ? [1, 2, 3, 4] : [bytes[6] - 0x10];
      for (const zone of zones) {
        devices.heating[zone] = { ...devices.heating[zone], ...freshDevice(now, { state }) };
      }
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

  const settings = {
    ...DEFAULTS,
    ew11_host: "gateway-1",
    ew11_port: 8899,
    transmit_enabled: true,
    speculative_transmit_enabled: true,
    transmit_user_id: "operator-7",
    tx_max_attempts: options.maxAttempts ?? 3,
    // The floor the schema allows, so an exhausted retry budget costs three seconds of fake
    // clock rather than nine.
    tx_observation_timeout_ms: 1_000,
  } as AnyRecord;

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
      // Counting writes is how a refusal is placed *after* a frame has already gone out.
      connected: options.disconnectAfterWrites === undefined || writes.length < options.disconnectAfterWrites,
      // An append outstanding for the first stretch of the command and resolved by the time
      // the line is ready, which is the shape a capture actually produces.
      pendingAppend: options.appendPendingForMs !== undefined && now < openedAt + options.appendPendingForMs,
      // `open` is a silent-query window standing open, the way the bus leaves one about every
      // 330 ms. `never` is present but never fresh, so the send waits the whole gate window and
      // falls through to the quiet interval. Omitted, the gate does not wait at all.
      ...(options.gate === "open" ? { lastSilentQueryAtMs: now }
        : options.gate === "never" ? { lastSilentQueryAtMs: 0 }
        : {}),
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

test("M5 RED: all-zones off is one command, confirmed when every zone holds it", async () => {
  // 0.2.7 expanded this into four per-zone commands because the specification said no group
  // command existed. It does, at address 0x10, and the wallpad sends it. One frame goes out;
  // confirmation still requires all four zones, because the group draws no reply of its own
  // and the only evidence is each zone's next poll (M4-E139).
  const fixture = createFixture();
  const result = await fixture.settle(send(fixture, { kind: "heat", target: "all", state: "off" }));
  assert.equal(result.outcome, "confirmed", JSON.stringify(result));
  assert.deepEqual(fixture.writes, ["f70b01180246100400b5ee"]);
  for (const zone of [1, 2, 3, 4]) assert.equal(fixture.devices.heating[zone].state, "off");
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

test("M5 RED: a group and a single zone are different settables and both run", async () => {
  // Under the four-frame expansion, turning zone 2 back on while all-zones-off was queued
  // replaced one of the batch's own parts, and the batch came back `partial` with a count of
  // three. The group is one command at its own address now, so the two no longer collide:
  // the group runs and is confirmed against all four zones, then zone 2 runs and is confirmed
  // on its own. Pressing "all off" and then turning one zone back on does both, in order,
  // which is what the operator asked for.
  const fixture = createFixture();
  const batch = send(fixture, { kind: "heat", target: "all", state: "off" });
  const zoneTwo = send(fixture, { kind: "heat", zone: 2, state: "on" });
  const [batchResult, zoneResult] = await fixture.settle(Promise.all([batch, zoneTwo]));
  assert.equal(batchResult.outcome, "confirmed", JSON.stringify(batchResult));
  assert.equal(batchResult.framesWritten, 1, "one frame, not four");
  assert.equal(zoneResult.outcome, "confirmed", JSON.stringify(zoneResult));
  assert.equal(fixture.devices.heating[2].state, "on", "zone 2 ends where the later request put it");
  assert.equal(fixture.devices.heating[3].state, "off", "and the group reached the rest");
});

test("M6 RED: a refusal after a written frame is reported unconfirmed, never as rejected", async () => {
  // Measured on the operator's bus, right after a capture was started:
  //   `cmd/elevator DOWN -> rejected (1 frame(s), capture append pending)`
  // One frame had already reached the wallpad and the line said nothing was sent, so the
  // operator pressed again and called the car a second time. The tail below the retry loop
  // states the invariant — a frame that reached the bus is never reported as "not sent" —
  // and the early return for a non-retryable refusal walked around it.
  //
  // The vehicle is a socket that goes away, not the capture append that produced the report:
  // an append is no longer a terminal refusal at all, and a test that needed it to be one
  // would have taken this invariant's only guard with it. A write deadline quarantines the
  // generation and destroys the socket, so this is the reachable shape.
  const fixture = createFixture({ answers: false, maxAttempts: 3, disconnectAfterWrites: 1 });
  const result = await fixture.settle(send(fixture, { kind: "light", target: 1, state: "on" }));
  assert.equal(fixture.writes.length, 1, "the second attempt is refused before it writes");
  assert.equal(result.framesWritten, 1);
  assert.equal(result.outcome, "unconfirmed", JSON.stringify(result));
  assert.equal(result.reason, "transport not connected after 1 frame(s) reached the bus");
  // The budget is three; two were spent. Reporting the budget would misstate what happened
  // just as surely as reporting the outcome did.
  assert.equal(result.attempts, 2);
});

test("M6 RED: an append outstanding when a send begins costs a wait, not the command", async () => {
  // Measured across two of the operator's captures: with a capture running, five of six
  // elevator commands were refused for the append or for the write-time race that folds the
  // same condition in; with no capture running, neither of two commands was refused at all.
  // The refusals landed over a minute into a capture that was working normally, so this is
  // what a capture costs in steady state rather than a transient at its start.
  //
  // The check that produced them sampled `pendingAppend` before the wait for the line, and
  // that wait is up to a second long — so it ended commands on a reading that was stale
  // before the write it was protecting. The write-time check is the real gate, and it calls
  // the same condition a retryable race.
  // The append clears after 60 ms of the fake clock; the gate then spends its full second
  // waiting for a silent query that never comes, so the write is attempted long after.
  const fixture = createFixture({ appendPendingForMs: 60, gate: "never" });
  const result = await fixture.settle(send(fixture, { kind: "light", target: 2, state: "on" }));
  assert.equal(result.outcome, "confirmed", JSON.stringify(result));
  assert.equal(fixture.writes.length, 1, "the frame goes out once, after the append has cleared");
});

test("M6 RED: the send window opening onto an outstanding append is a wait, not a refusal", async () => {
  // The operator's log, with a capture running:
  //   `cmd/elevator DOWN -> rejected (0 frame(s), transport/RX race before write)`
  // Three attempts, nothing on the bus, and the reason names a race with a transmitter that
  // was not there.
  //
  // `onData` sets `lastSilentQueryAtMs` and then calls `queueRecord`, which starts the append
  // and pauses the transport, in one synchronous block. So while a recording is open, the read
  // that opens the send window is the same read that starts the append: the gate breaks out
  // with one outstanding and the write-time check a few lines later refuses it. Every attempt,
  // for as long as the capture runs.
  //
  // The window stays usable for 150 ms and the line is quiet a median 329 ms behind it, so the
  // few milliseconds an append takes are affordable. Wait them out.
  const fixture = createFixture({ appendPendingForMs: 40, gate: "open" });
  const result = await fixture.settle(send(fixture, { kind: "light", target: 2, state: "on" }));
  assert.equal(result.outcome, "confirmed", JSON.stringify(result));
  assert.equal(fixture.writes.length, 1, "one frame, once the append has cleared");
  assert.equal(result.attempts, 1, "and no attempt is spent on the wait");
});
