import assert from "node:assert/strict";
import test from "node:test";

import { createLink } from "../tools/buslab/link.ts";

// The link is what turns "bytes arrived" into evidence. Two properties matter and neither is
// obvious: a TCP read boundary is not a frame boundary, so a chunk must be recorded exactly as
// it arrived; and every timestamp is taken here, in the one process that holds the socket,
// because `process.hrtime.bigint()` counts from an arbitrary origin per process.

type Listener = (...args: unknown[]) => unknown;

function fakeSocket() {
  const listeners = new Map<string, Listener[]>();
  const writes: { bytes: Uint8Array; settle(error?: Error | null): void }[] = [];
  let destroyed = false;
  let noDelay: boolean | undefined;
  const emit = (event: string, ...args: unknown[]): void => {
    for (const listener of [...(listeners.get(event) ?? [])]) listener(...args);
  };
  return {
    writes,
    emit,
    get destroyed() { return destroyed; },
    get noDelay() { return noDelay; },
    socket: {
      setNoDelay(value?: boolean) { noDelay = value !== false; },
      on(event: string, listener: Listener) { listeners.set(event, [...(listeners.get(event) ?? []), listener]); },
      off(event: string, listener: Listener) {
        listeners.set(event, (listeners.get(event) ?? []).filter((entry) => entry !== listener));
      },
      removeAllListeners() { listeners.clear(); },
      destroy() { destroyed = true; },
      write(bytes: Uint8Array, callback?: (error?: Error | null) => void) {
        writes.push({ bytes, settle: (error) => callback?.(error ?? null) });
        return true;
      },
    },
  };
}

function createFixture(options: { connectTimeoutMs?: number } = {}) {
  const peer = fakeSocket();
  const events: { kind: string; fields: Record<string, unknown> }[] = [];
  const chunks: { hex: string; wallMs: number; monoNs: bigint }[] = [];
  let wall = 1_700_000_000_000;
  let mono = 0n;
  const timers = new Map<number, { at: bigint; fn: () => void }>();
  let nextTimer = 1;
  const link = createLink({
    config: { host: "ew11-77e3a1.invalid", port: 8899 },
    connectTimeoutMs: options.connectTimeoutMs ?? 3_000,
    connect: () => peer.socket as never,
    deps: {
      nowMs: () => wall,
      monoNs: () => mono,
      setTimeout: (fn: () => void, delayMs: number) => {
        const id = nextTimer;
        nextTimer += 1;
        timers.set(id, { at: mono + BigInt(delayMs) * 1_000_000n, fn });
        return id;
      },
      clearTimeout: (id: unknown) => { timers.delete(id as number); },
    },
    onChunk: (bytes, wallMs, monoNs) => {
      chunks.push({ hex: Buffer.from(bytes).toString("hex"), wallMs, monoNs });
    },
    onEvent: (kind, fields) => { events.push({ kind, fields }); },
  });
  const advance = (ms: number): void => {
    wall += ms;
    mono += BigInt(ms) * 1_000_000n;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= mono) { timers.delete(id); timer.fn(); }
    }
  };
  return { link, peer, events, chunks, advance, mono: () => mono };
}

test("E1 RED: Nagle is turned off, because a delayed 11-byte write is a mistimed one", async () => {
  const fixture = createFixture();
  const opening = fixture.link.open();
  fixture.peer.emit("connect");
  await opening;
  assert.equal(fixture.peer.noDelay, true);
  assert.equal(fixture.events[0]?.kind, "open");
});

test("E1 RED: a chunk is recorded exactly as it arrived, split frames and all", async () => {
  const fixture = createFixture();
  const opening = fixture.link.open();
  fixture.peer.emit("connect");
  await opening;
  // One frame arriving in two reads, then two frames arriving in one read. Both shapes are
  // real: the gateway flushes on a 50 ms serial gap and TCP may split or merge what it sends.
  fixture.peer.emit("data", Buffer.from("f70b0119014010", "hex"));
  fixture.advance(3);
  fixture.peer.emit("data", Buffer.from("0000b5ee", "hex"));
  fixture.advance(120);
  fixture.peer.emit("data", Buffer.from("f70b011b0143110000b5eef70d011b04431100040000b2ee", "hex"));

  assert.deepEqual(fixture.chunks.map((c) => c.hex), [
    "f70b0119014010",
    "0000b5ee",
    "f70b011b0143110000b5eef70d011b04431100040000b2ee",
  ], "the link never reassembles or splits; that is the framer's job");
  assert.ok(fixture.chunks[1].monoNs > fixture.chunks[0].monoNs, "the clock moves between reads");
});

test("E1 RED: the last-receive mark is what an idle wait is measured against", async () => {
  const fixture = createFixture();
  const opening = fixture.link.open();
  fixture.peer.emit("connect");
  await opening;
  assert.equal(fixture.link.lastRxMonoNs(), null, "no read yet");
  fixture.peer.emit("data", Buffer.from("f70b01190140100000b5ee", "hex"));
  const first = fixture.link.lastRxMonoNs();
  assert.equal(first, fixture.mono());
  fixture.advance(80);
  assert.equal(fixture.link.lastRxMonoNs(), first, "it marks the read, not the passage of time");
});

test("E1 RED: a write reports three timestamps taken in this process", async () => {
  const fixture = createFixture();
  const opening = fixture.link.open();
  fixture.peer.emit("connect");
  await opening;
  const bytes = Buffer.from("f70b01190240110100b6ee", "hex");
  const pending = fixture.link.write(bytes);
  assert.equal(fixture.peer.writes.length, 1);
  assert.deepEqual([...fixture.peer.writes[0].bytes], [...bytes]);
  fixture.advance(4);
  fixture.peer.writes[0].settle(null);
  const stamps = await pending;
  assert.ok(stamps.requestedMonoNs <= stamps.returnedMonoNs);
  assert.ok(stamps.returnedMonoNs <= stamps.flushedMonoNs);
  assert.ok(stamps.flushedMonoNs - stamps.requestedMonoNs >= 4_000_000n, "the callback is later than the call");
});

test("E1 RED: a write that the socket rejects is reported, not swallowed", async () => {
  const fixture = createFixture();
  const opening = fixture.link.open();
  fixture.peer.emit("connect");
  await opening;
  const pending = fixture.link.write(Buffer.from("f70b01190240110100b6ee", "hex"));
  fixture.peer.writes[0].settle(new Error("EPIPE"));
  await assert.rejects(pending, /EPIPE/);
});

test("E1 RED: connecting is bounded, and the failure names no address", async () => {
  const fixture = createFixture({ connectTimeoutMs: 3_000 });
  const opening = fixture.link.open();
  fixture.advance(3_000);
  const error = await opening.then(() => null, (e: Error) => e);
  assert.ok(error, "an unanswered connect must not hang for ever");
  assert.ok(!String(error?.message).includes("ew11-77e3a1"), String(error?.message));
  assert.ok(!String(error?.message).includes("8899"), String(error?.message));
  assert.equal(fixture.peer.destroyed, true, "the socket is not left dangling");
});

test("E1 RED: closing detaches every listener so a late event cannot append to a closed run", async () => {
  const fixture = createFixture();
  const opening = fixture.link.open();
  fixture.peer.emit("connect");
  await opening;
  fixture.link.close();
  fixture.peer.emit("data", Buffer.from("f70b01190140100000b5ee", "hex"));
  assert.equal(fixture.chunks.length, 0, "a read after close is not recorded");
  assert.equal(fixture.peer.destroyed, true);
});

test("E1 RED: a read arriving after the peer hung up is not recorded as if the link were live", async () => {
  // `link.close()` detaches everything, so that path needs no guard. This one does: when the
  // gateway drops us the listeners stay attached, and a byte recorded after `closed` would
  // claim a live line that is not there.
  const fixture = createFixture();
  const opening = fixture.link.open();
  fixture.peer.emit("connect");
  await opening;
  fixture.peer.emit("data", Buffer.from("f70b01190140100000b5ee", "hex"));
  assert.equal(fixture.chunks.length, 1);

  fixture.peer.emit("close");
  assert.equal(fixture.events.at(-1)?.kind, "closed", "the drop is recorded");
  assert.equal(fixture.link.isOpen(), false);

  fixture.peer.emit("data", Buffer.from("f70b011b0143110000b5ee", "hex"));
  assert.equal(fixture.chunks.length, 1, "nothing is recorded after the peer hung up");
  assert.equal(fixture.link.lastRxMonoNs(), fixture.chunks[0].monoNs, "and the idle mark does not move");
});
