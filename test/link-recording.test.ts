import assert from "node:assert/strict";
import test from "node:test";

import { createBoundedCaptureCoordinator, createTxCoordinator } from "../bestium-eco-foret/src/m2.ts";
import { parseM2Settings } from "../bestium-eco-foret/src/settings.ts";

// Kept out of `m2.test.ts`: that file is past the size where Node's TypeScript stripping
// segfaults intermittently. See M4-E104 in `.agent/progress.md`.

type AnyRecord = Record<string, any>;
type Listener = (...args: unknown[]) => void;

const settings = (overrides: AnyRecord = {}): AnyRecord => parseM2Settings({
  ew11_host: "gateway-1",
  ew11_port: 8899,
  transmit_enabled: true,
  transmit_user_id: "operator-7",
  tx_cooldown_ms: 0,
  tx_quiet_ms: 5,
  ...overrides,
} as AnyRecord);

function createFakeTimer() {
  let now = 1_700_000_000;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let id = 0;
  return {
    nowMs: () => now,
    setTimeout: (fn: () => void, delayMs: number) => { id += 1; timers.set(id, { at: now + delayMs, fn }); return id; },
    clearTimeout: (token: unknown) => { timers.delete(token as number); },
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        let due: { id: number; at: number; fn: () => void } | undefined;
        for (const [key, entry] of timers) if (entry.at <= target && (!due || entry.at < due.at)) due = { id: key, ...entry };
        if (!due) break;
        now = due.at;
        timers.delete(due.id);
        due.fn();
      }
      now = target;
    },
  };
}

function createFakeTransport() {
  const listeners = new Map<string, Set<Listener>>();
  const writes: Uint8Array[] = [];
  let destroyed = false;
  const transport = {
    writes,
    destroyed: () => destroyed,
    write(chunk: Uint8Array, callback?: (error?: Error | null) => void) {
      writes.push(new Uint8Array(chunk));
      callback?.(null);
      return true;
    },
    on(event: string, listener: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
      return transport;
    },
    once(event: string, listener: Listener) { return transport.on(event, listener); },
    off(event: string, listener: Listener) { listeners.get(event)?.delete(listener); return transport; },
    removeAllListeners() { listeners.clear(); return transport; },
    setTimeout() { return transport; },
    destroy() { destroyed = true; return transport; },
    emit(event: string, ...args: unknown[]) { for (const listener of [...(listeners.get(event) ?? [])]) listener(...args); },
  };
  return transport;
}

const memoryStore = () => {
  const lines: string[] = [];
  let opens = 0;
  return {
    lines,
    opens: () => opens,
    async begin() { opens += 1; },
    async append(line: string) { lines.push(line); },
    async finalize() { return { name: "capture.ndjson", sizeBytes: lines.length, finalized: true }; },
  };
};

const LIGHT_REPLY = "f70d011904401000010202b7ee";
const bytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));

function fixture(overrides: AnyRecord = {}) {
  const timer = createFakeTimer();
  const transport = createFakeTransport();
  const store = memoryStore();
  const coordinator = createBoundedCaptureCoordinator({
    settings: settings(overrides),
    createTransport: () => transport,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    store,
  } as AnyRecord) as AnyRecord;
  return { timer, transport, store, coordinator };
}

// The requirement, in one test: the operator opens the page and presses a light. No capture
// has ever been started. Before this, `coordinator.start()` opened the recording file and the
// socket in the same call, so nothing decoded and nothing sent until somebody started a
// capture — the send gate carried "capture is not running" as a literal reason.
test("E2B RED: control works having never started a capture", async () => {
  const { timer, transport, store, coordinator } = fixture();
  await coordinator.openLink();
  transport.emit("connect");
  transport.emit("data", bytes(LIGHT_REPLY));
  timer.advance(10);

  assert.equal(store.opens(), 0, "no recording file was opened");
  assert.equal(coordinator.getTxState().connected, true, "the socket is up");
  assert.equal(coordinator.getTxState().link, "up");
  assert.equal(coordinator.getTxState().recording, "off");

  // The decoder ran: a light reply arrived and became state.
  const devices = coordinator.getDevices()?.devices as AnyRecord;
  assert.equal(devices.lights[1].state, "on", "frames decode with no capture running");

  const tx = createTxCoordinator({
    settings: settings(),
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    getCurrentUserId: () => "operator-7",
    getTransport: () => coordinator.getTransport(),
    getGeneration: () => coordinator.getState().generation ?? 0,
    getDevices: () => coordinator.getDevices(),
    getRxState: () => coordinator.getTxState(),
  } as AnyRecord) as AnyRecord;

  const preview = await tx.send({ kind: "light", target: 2, state: "on" }, { mode: "preview", userId: "operator-7" }) as AnyRecord;
  assert.equal(
    ((preview.reasons as string[] | undefined) ?? []).some((reason) => /capture/i.test(reason)),
    false,
    `no reason may mention a capture: ${JSON.stringify(preview.reasons)}`,
  );
  assert.equal(preview.ready, true, JSON.stringify(preview.reasons ?? []));
});

test("E2B RED: a recording opens and closes without disturbing the link", async () => {
  const { timer, transport, store, coordinator } = fixture();
  await coordinator.openLink();
  transport.emit("connect");
  const generation = coordinator.getState().generation;

  await coordinator.beginRecording();
  assert.equal(store.opens(), 1);
  assert.equal(coordinator.getTxState().recording, "open");
  assert.equal(coordinator.getTxState().link, "up", "opening a recording does not touch the socket");
  assert.equal(coordinator.getState().generation, generation, "nor does it invalidate confirmations");

  transport.emit("data", bytes(LIGHT_REPLY));
  timer.advance(10);
  assert.ok(store.lines.length > 0, "and what arrives is written to it");

  await coordinator.stopRecording();
  assert.equal(coordinator.getTxState().recording, "off");
  assert.equal(coordinator.getTxState().link, "up", "stopping a recording leaves the socket up");
  assert.equal(coordinator.getTxState().connected, true);

  // Frames still decode with the recording closed.
  transport.emit("data", bytes("f70d011904401000020202b4ee"));
  timer.advance(10);
  assert.equal((coordinator.getDevices()?.devices as AnyRecord).lights[1].state, "off");
});

test("E2B RED: nothing is appended while no recording is open", async () => {
  const { timer, transport, store, coordinator } = fixture();
  await coordinator.openLink();
  transport.emit("connect");
  transport.emit("data", bytes(LIGHT_REPLY));
  timer.advance(10);
  assert.deepEqual(store.lines, [], "a decoded frame with no store open must not try to append");
  assert.equal(coordinator.getTxState().pendingAppend, false);
});
