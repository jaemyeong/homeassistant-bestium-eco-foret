import assert from "node:assert/strict";
import test from "node:test";

import { createTxCoordinator } from "../bestium-eco-foret/src/m2.ts";
import { DEFAULTS } from "../bestium-eco-foret/src/settings.ts";

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
  // When a read last ended on a query nobody answers. That is the window the send gate takes.
  // Open by default because that is the line these tests describe: the wallpad asks four devices
  // that never answer, and across the 34 measured runs a window opens every 345 ms.
  let lastSilentQueryAtMs = now;
  const transport = {
    on() {}, off() {}, removeAllListeners() {}, destroy() {},
    write(chunk: Uint8Array, cb?: (e?: Error | null) => void) {
      writes.push(Array.from(chunk, (b) => b.toString(16).padStart(2, "0")).join(""));
      cb?.(null);
      return true;
    },
  };
  // Assembled here rather than through `parseM2Settings`: the parser now reads only the four
  // keys the 구성 panel offers and takes every timing from `DEFAULTS`, so a suite that needs a
  // shorter window has to build the settings object itself.
  const settings = {
    ...DEFAULTS,
    ew11_host: "gateway-1", ew11_port: 8899,
    transmit_enabled: true, speculative_transmit_enabled: true,
    transmit_user_id: "operator-7", ...overrides,
  } as AnyRecord;
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
      lastRxByteAtMs, lastValidFrameAtMs: now - 100, lastResumeAtMs, lastSilentQueryAtMs,
    }),
  } as AnyRecord);
  // Async because the send path now polls for its window in five-millisecond steps: a
  // synchronous sweep fires one timer and returns before the continuation has registered the
  // next, so the chain stops after a single tick.
  const advance = async (ms: number) => {
    const target = now + ms;
    for (;;) {
      let due: { id: number; at: number; fn: () => void } | undefined;
      for (const [id, t] of timers) if (t.at <= target && (!due || t.at < due.at)) due = { id, ...t };
      if (!due) break;
      now = due.at; timers.delete(due.id); due.fn();
      await Promise.resolve();
    }
    now = target;
  };
  return {
    coordinator, writes, advance, settings,
    setNow: (v: number) => { now = v; },
    nowMs: () => now,
    rxAt: (v: number) => { lastRxByteAtMs = v; },
    silentQueryAt: (v: number) => { lastSilentQueryAtMs = v; },
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
  await bus.advance(60);
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
  bus.silentQueryAt(0);                       // and no window to take instead
  const pending = bus.coordinator.send(action, { ...request, mode: "live" }) as Promise<AnyRecord>;
  // Hold the line busy by restamping the last received byte on every step of the clock.
  for (let step = 0; step < 60; step += 1) {
    bus.rxAt(bus.nowMs());
    await bus.advance(10);
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
  const settings = {
    ...DEFAULTS,
    ew11_host: "gateway-1", ew11_port: 8899, transmit_enabled: true,
    speculative_transmit_enabled: true, transmit_user_id: "operator-7",
  } as AnyRecord;
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
      // A window is open: the read 200 ms ago ended on a query nobody answers.
      lastSilentQueryAtMs: now,
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

test("M5 RED: a send takes the silent-query window rather than waiting for quiet", async () => {
  // The wallpad queries four devices that never answer and waits about 270 ms before moving on.
  // That wait is the only place on this line where an eleven-byte frame fits every time, and
  // writing there is what took buslab's light sends from 138 of 183 to 109 of 109 with no
  // damaged byte. Waiting for the line to look quiet cannot match it: the gateway holds bytes
  // until the serial line has been silent for its own 50 ms gap timer, so that judgement is
  // always 50 ms out of date, and the failures it produced were collisions.
  const bus = createBus();
  bus.rxAt(bus.nowMs());              // the line spoke this instant, so no quiet interval exists
  bus.silentQueryAt(bus.nowMs());     // but what it said was a query nobody answers

  const pending = bus.coordinator.send({ kind: "light", target: 1, state: "on" }, { ...request, mode: "live" }) as Promise<AnyRecord>;
  assert.equal((await pending).outcome, "socket_written_unconfirmed");
  assert.equal(bus.writes.length, 1, "the window is open, so the frame goes out into it");
});

test("M5 RED: with no window in a second the send falls back to the quiet interval", async () => {
  // 13,656 gaps between windows across the 34 runs: median 345 ms, 99.8% inside one second.
  // Past that the line is behaving unlike anything measured, and refusing to send would be
  // worse for the operator than the quiet interval that shipped before this.
  const bus = createBus();
  bus.rxAt(bus.nowMs() - 5_000);      // long silent
  bus.silentQueryAt(bus.nowMs() - 5_000);   // a window was seen once, but it closed long ago

  const pending = bus.coordinator.send({ kind: "light", target: 1, state: "on" }, { ...request, mode: "live" }) as Promise<AnyRecord>;
  await Promise.resolve();
  assert.equal(bus.writes.length, 0, "nothing goes out while the gate is still looking");

  await bus.advance(1_000);
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  assert.equal(bus.writes.length, 1, "and then the quiet interval carries it");
  assert.equal((await pending).outcome, "socket_written_unconfirmed");
});
