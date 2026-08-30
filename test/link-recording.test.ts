import assert from "node:assert/strict";
import test from "node:test";

import { createBoundedCaptureCoordinator, createTxCoordinator } from "../bestium-eco-foret/src/m2.ts";
import { DEFAULTS } from "../bestium-eco-foret/src/settings.ts";

// Kept out of `m2.test.ts`: that file is past the size where Node's TypeScript stripping
// segfaults intermittently. See M4-E104 in `.agent/progress.md`.

type AnyRecord = Record<string, any>;
type Listener = (...args: unknown[]) => void;

// Assembled here rather than through `parseM2Settings`: the parser now reads only the four
// keys the 구성 panel offers and takes every timing from `DEFAULTS`, so a suite that needs a
// shorter window has to build the settings object itself.
const settings = (overrides: AnyRecord = {}): AnyRecord => ({
  ...DEFAULTS,
  ew11_host: "gateway-1",
  ew11_port: 8899,
  transmit_enabled: true,
  transmit_user_id: "operator-7",
  tx_cooldown_ms: 0,
  tx_quiet_ms: 5,
  ...overrides,
});

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

// Reported from the live add-on, 2026-08-31: "앱을 시작하고 패킷 수집을 시작하지 않으면
// 제어불가 / 패킷 수집 시작후 중단하면 이후에는 패킷 수집이 꺼져있어도 제어가능".
//
// `onData` kept the capture's accounting running whether or not a recording was open. E2B
// guarded `queueRecord`, which is where the file is written, but left `byteCount`,
// `recordCount` and the two limits above it untouched — so a link with no recording still
// counted its way to `maximum_records` and then called `requestFinish`, which closes the
// link. Starting and stopping a capture reset the counters, which is why it looked fixed.
test("E2B RED: a link with no recording never counts its way to a limit", async () => {
  const { timer, transport, coordinator } = fixture({ maximum_records: 5, maximum_bytes: 40 });
  await coordinator.openLink();
  transport.emit("connect");

  for (let i = 0; i < 20; i += 1) {
    transport.emit("data", bytes(LIGHT_REPLY));
    timer.advance(10);
  }

  assert.equal(coordinator.getTxState().link, "up", "well past both limits, the link is still up");
  assert.equal(coordinator.getTxState().connected, true);
  assert.equal(coordinator.getState().recordCount, 0, "no recording, no records counted");
  assert.equal(coordinator.getState().byteCount, 0, "nor bytes");
  assert.deepEqual(coordinator.getState().preview, [], "nor a preview of a file that does not exist");
});

test("E2B RED: a recording that hits its limit closes the file and leaves the link up", async () => {
  const { timer, transport, store, coordinator } = fixture({ maximum_records: 3, maximum_bytes: 10_000 });
  await coordinator.openLink();
  transport.emit("connect");
  await coordinator.beginRecording();

  // Each append is a promise, and `onData` skips a frame while one is in flight, so the
  // microtask queue has to drain between frames for the count to move.
  for (let i = 0; i < 8; i += 1) {
    transport.emit("data", bytes(LIGHT_REPLY));
    timer.advance(10);
    await Promise.resolve();
    await Promise.resolve();
  }
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(coordinator.getTxState().recording, "off", "the file closed at its limit");
  assert.equal(coordinator.getTxState().link, "up", "and took nothing with it");
  assert.equal(coordinator.getTxState().connected, true);
  assert.ok(store.lines.length > 0, "what it did record was written");

  // And the link keeps decoding afterwards.
  transport.emit("data", bytes("f70d011904401000020202b4ee"));
  timer.advance(10);
  assert.equal((coordinator.getDevices()?.devices as AnyRecord).lights[1].state, "off");
});

// The operator's scenario, end to end through the runtime rather than the coordinator alone:
// start the add-on, never touch the capture, press a light.
test("E2B RED: the runtime controls without a capture, from the first frame", async () => {
  const { startM2Runtime } = await import("../bestium-eco-foret/src/m2.ts");
  const timer = createFakeTimer();
  const transport = createFakeTransport();
  let handler: ((req: AnyRecord, res: AnyRecord) => Promise<void>) | null = null;
  const app = await startM2Runtime({
    readOptions: async () => ({
      ew11_host: "gateway-1", ew11_port: 8899,
      transmit_enabled: true, transmit_user_id: "operator-7",
      tx_cooldown_ms: 0, tx_quiet_ms: 5,
    }),
    createTransport: () => transport,
    createServer: (fn: AnyRecord) => { handler = fn as never; return { listen() {}, close() {} }; },
  } as AnyRecord) as AnyRecord;

  try {
    assert.ok(handler, "the runtime must have handed the server a handler");
    transport.emit("connect");
    transport.emit("data", bytes(LIGHT_REPLY));
    timer.advance(10);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const status = await request(app, { url: "/api/status" });
    const payload = JSON.parse(status.body) as AnyRecord;
    assert.equal(payload.tx.link, "up", `the link must be up: ${JSON.stringify(payload.tx)}`);
    assert.equal(payload.tx.recording, "off", "and no capture was ever started");
    assert.equal(payload.state, "stopped");

    const preview = await request(app, {
      url: "/api/action", method: "POST",
      headers: {
        "x-remote-user-id": "operator-7",
        "x-csrf-token": payload.csrfToken as string,
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind: "light", target: 1, state: "on", mode: "preview" }),
    });
    const result = JSON.parse(preview.body) as AnyRecord;
    assert.equal(
      (result.reasons as string[] | undefined ?? []).some((reason) => /capture|link/i.test(reason)),
      false,
      `nothing may block on a capture or a down link: ${JSON.stringify(result.reasons)}`,
    );
    assert.equal(result.ready, true, JSON.stringify(result.reasons ?? []));
  } finally {
    await app.stop();
  }
});

async function request(app: AnyRecord, opts: AnyRecord): Promise<{ statusCode: number; body: string }> {
  let body = "";
  let statusCode = 0;
  const res = {
    statusCode: 0,
    headers: new Map<string, string>(),
    setHeader(name: string, value: string) { this.headers.set(name, value); },
    writeHead(code: number) { statusCode = code; },
    write(chunk: string) { body += chunk; return true; },
    end(chunk?: string) { if (chunk !== undefined) body += chunk; },
    writableEnded: false,
  };
  await app.requestHandler({
    method: opts.method ?? "GET",
    url: opts.url,
    socket: { remoteAddress: "172.30.32.2" },
    headers: opts.headers ?? {},
    body: opts.body,
  }, res);
  return { statusCode, body };
}

// The other half of the split, and the one that would have brought the same symptom back by
// another road. `onClose`, `onError` and `onConnectTimeout` all called `requestFinish`, which
// ends the link for good. That was right when the link belonged to a capture — a capture is a
// finite job and a dropped socket ends it. A link is not finite: it lives as long as the page
// does, so a gateway that reboots, a network that blinks, or an EW11 that is not up yet when
// Home Assistant starts the add-on must all be recovered from rather than surrendered to.
test("E2B RED: a socket that closes is reconnected, not surrendered", async () => {
  const { timer, transport, coordinator } = fixture();
  await coordinator.openLink();
  transport.emit("connect");
  assert.equal(coordinator.getTxState().link, "up");

  transport.emit("close");
  timer.advance(60_000);
  assert.notEqual(coordinator.getTxState().link, "down", "a closed socket must not end the link");
});

test("E2B RED: a connect that times out is retried", async () => {
  const { timer, coordinator } = fixture({ connect_timeout_ms: 1_000 });
  await coordinator.openLink();
  // Never emit connect: this is the EW11 that is not answering yet when the add-on starts.
  timer.advance(1_100);
  assert.notEqual(coordinator.getTxState().link, "down", "a slow gateway must not end the link");
  timer.advance(60_000);
  assert.notEqual(coordinator.getTxState().link, "down", "and it must keep trying");
});

test("E2B RED: a transport error ends the recording but not the link", async () => {
  const { timer, transport, coordinator } = fixture();
  await coordinator.openLink();
  transport.emit("connect");
  await coordinator.beginRecording();

  transport.emit("error", new Error("ECONNRESET"));
  await Promise.resolve();
  await Promise.resolve();
  timer.advance(60_000);

  assert.equal(coordinator.getTxState().recording, "off",
    "the file closes: frames were lost, and a capture with a hole in it must not be extended");
  assert.notEqual(coordinator.getTxState().link, "down", "the link recovers on its own");
});
