import assert from "node:assert/strict";
import test from "node:test";

import { createTxCoordinator, parseM2Settings } from "../bestium-eco-foret/src/m2.ts";

// Kept out of `m2.test.ts`: see M4-E104. Every timing figure below was measured on the
// operator's own captures; `.agent/spec-device-protocol.md` carries the derivation.

type AnyRecord = Record<string, unknown>;

function createBus(overrides: AnyRecord = {}) {
  let now = 1_000_000;
  const writes: string[] = [];
  const timers = new Map<number, { at: number; fn: () => void }>();
  let nextTimer = 1;
  // The capture shows the EW11 delivering a read about every 121 ms, and the capture
  // store pauses the socket while it appends, resuming after the write lands.
  let lastRxByteAtMs = now - 500;
  let lastResumeAtMs = now - 500;
  const transport = {
    on() {}, off() {}, removeAllListeners() {}, destroy() {},
    write(chunk: Uint8Array, cb?: (e?: Error | null) => void) {
      writes.push(Array.from(chunk, (b) => b.toString(16).padStart(2, "0")).join(""));
      cb?.(null);
      return true;
    },
  };
  const settings = parseM2Settings({
    ew11_host: "gateway-1", ew11_port: 8899,
    transmit_enabled: true, speculative_transmit_enabled: true,
    transmit_user_id: "operator-7", ...overrides,
  } as AnyRecord);
  const coordinator = createTxCoordinator({
    settings,
    nowMs: () => now,
    setTimeout: (fn: () => void, ms: number) => { const id = nextTimer++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (id: number) => { timers.delete(id); },
    randomBytes: (size: number) => Uint8Array.from({ length: size }, (_v, i) => i),
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => 1,
    getRxState: () => ({
      connected: true, pendingAppend: false,
      rxByteEpoch: 1, validFrameEpoch: 1, validFrameGeneration: 1, readEpoch: 1, txByteEpoch: 0,
      lastRxByteAtMs, lastValidFrameAtMs: now - 100, lastResumeAtMs,
    }),
  } as AnyRecord);
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      let due: { id: number; at: number; fn: () => void } | undefined;
      for (const [id, t] of timers) if (t.at <= target && (!due || t.at < due.at)) due = { id, ...t };
      if (!due) break;
      now = due.at; timers.delete(due.id); due.fn();
    }
    now = target;
  };
  return {
    coordinator, writes, advance, settings,
    setNow: (v: number) => { now = v; },
    nowMs: () => now,
    rxAt: (v: number) => { lastRxByteAtMs = v; },
    resumeAt: (v: number) => { lastResumeAtMs = v; },
  };
}

const request = { userId: "operator-7", confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE", schedule: "immediate" };

test("0.2.8 RED: our own capture pause is not bus activity", async () => {
  // quietAt took max(lastRxByteAtMs, lastResumeAtMs). lastResumeAtMs is when the capture
  // store finished writing a record to disk and resumed the socket — our own bookkeeping,
  // not a byte on the RS485 line. Counting it made every disk write look like a busy bus.
  const bus = createBus();
  bus.rxAt(bus.nowMs() - 5_000);      // the bus has been silent for five seconds
  bus.resumeAt(bus.nowMs());          // but we just finished writing a capture record
  assert.equal((bus.coordinator.getTxStatus() as AnyRecord).quiet, true, "a silent line reads as quiet");

  // And the send must go out immediately, without waiting for a window that is already open.
  const pending = bus.coordinator.send({ kind: "light", target: 1, state: "on" }, { ...request, mode: "live" }) as Promise<AnyRecord>;
  await Promise.resolve();
  assert.equal(bus.writes.length, 1, "our own disk pause must not hold the frame back");
  assert.equal((await pending).outcome, "socket_written_unconfirmed");
});

test("0.2.8 RED: a busy line makes the send wait, it does not refuse", async () => {
  // Measured on three captures: reads land every ~121 ms, so at a random instant the 20 ms
  // window is open 89% of the time and a send that checks it four times succeeds 64% of the
  // time. Refusing turned that into the operator pressing a button until it happened to
  // land. The window opens within 20 ms, so waiting for it costs almost nothing.
  const bus = createBus();
  bus.rxAt(bus.nowMs());                      // a byte just arrived: the line is busy now
  const action = { kind: "light", target: 1, state: "on" };
  const preview = await bus.coordinator.send(action, { ...request, mode: "preview" }) as AnyRecord;
  assert.equal(preview.ready, true, "a line that is momentarily busy must not block the preview");

  const pending = bus.coordinator.send(action, { ...request, mode: "live" }) as Promise<AnyRecord>;
  bus.advance(60);
  const result = await pending;
  assert.equal(result.outcome, "socket_written_unconfirmed", JSON.stringify(result));
  assert.equal(bus.writes.length, 1, "the frame must go out once the window opens");
});

test("0.2.8 RED: a line that never goes quiet still fails closed", async () => {
  // The wait is bounded. A line that keeps talking past the write timeout is refused, and
  // nothing goes onto it.
  const bus = createBus({ tx_write_timeout_ms: 200 });
  const action = { kind: "light", target: 1, state: "on" };
  bus.rxAt(bus.nowMs());                      // busy at the moment the send starts
  const pending = bus.coordinator.send(action, { ...request, mode: "live" }) as Promise<AnyRecord>;
  // Hold the line busy by restamping the last received byte on every step of the clock.
  for (let step = 0; step < 60; step += 1) {
    bus.rxAt(bus.nowMs());
    bus.advance(10);
    await Promise.resolve();
  }
  const result = await pending as AnyRecord;
  assert.match(String(result.reason ?? result.outcome), /line busy|quiet/i, JSON.stringify(result));
  assert.equal(bus.writes.length, 0, "nothing may go out onto a line that never cleared");
});

test("0.2.8 RED: a multi-frame send survives the bus talking between frames", async () => {
  // The inter-frame check required rxByteEpoch and readEpoch to be unchanged across a gap
  // of at least 200 ms, on a bus that delivers a read every ~121 ms. Frame 2 therefore
  // always failed, and the failure quarantined the generation and destroyed the transport.
  // Incoming traffic during our own macro is normal; another transmitter writing is not.
  let rxByteEpoch = 1;
  let readEpoch = 1;
  let now = 1_000_000;
  const writes: string[] = [];
  const timers = new Map<number, { at: number; fn: () => void }>();
  let nextTimer = 1;
  const transport = {
    on() {}, off() {}, removeAllListeners() {}, destroy() {},
    write(chunk: Uint8Array, cb?: (e?: Error | null) => void) {
      writes.push(Array.from(chunk, (b) => b.toString(16).padStart(2, "0")).join(""));
      cb?.(null);
      return true;
    },
  };
  const settings = parseM2Settings({
    ew11_host: "gateway-1", ew11_port: 8899, transmit_enabled: true,
    speculative_transmit_enabled: true, transmit_user_id: "operator-7",
  } as AnyRecord);
  const coordinator = createTxCoordinator({
    settings,
    nowMs: () => now,
    setTimeout: (fn: () => void, ms: number) => { const id = nextTimer++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (id: number) => { timers.delete(id); },
    randomBytes: (size: number) => Uint8Array.from({ length: size }, (_v, i) => i),
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => 1,
    getRxState: () => ({
      connected: true, pendingAppend: false,
      rxByteEpoch, validFrameEpoch: 1, validFrameGeneration: 1, readEpoch, txByteEpoch: 0,
      lastRxByteAtMs: now - 200, lastValidFrameAtMs: now - 100, lastResumeAtMs: now - 200,
    }),
  } as AnyRecord);
  // All-zones off is observed since the operator drove every zone live, so it commits in
  // one tap. The macro path it still takes here is what this test guards.
  const allOff = { kind: "heat", target: "all", state: "off" };
  const pending = coordinator.send(allOff, { ...request, mode: "live" }) as Promise<AnyRecord>;
  // Drive the clock the way the bus does: a read about every 121 ms.
  for (let step = 0; step < 40; step += 1) {
    const target = now + 30;
    for (;;) {
      let due: { id: number; at: number; fn: () => void } | undefined;
      for (const [id, t] of timers) if (t.at <= target && (!due || t.at < due.at)) due = { id, ...t };
      if (!due) break;
      now = due.at; timers.delete(due.id); due.fn();
    }
    now = target;
    if (step % 4 === 0) { rxByteEpoch += 1; readEpoch += 1; }
    await Promise.resolve();
  }
  const result = await pending;
  // One frame, not four. The group command exists at address 0x10 and the wallpad sends it;
  // the four-frame expansion this test used to guard came from believing it did not. The bus
  // talking in between still must not split or duplicate the write, which is what the clock
  // above is for.
  assert.equal(writes.length, 1, `the group is one frame, got ${writes.length}: ${JSON.stringify(result)}`);
  assert.equal(result.outcome, "socket_written_unconfirmed", JSON.stringify(result));
  assert.deepEqual(writes, ["f70b01180246100400b5ee"]);
});
