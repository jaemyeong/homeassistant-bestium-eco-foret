import assert from "node:assert/strict";
import test from "node:test";

import { createDaemon } from "../tools/buslab/daemon.ts";
import { createFramer } from "../tools/buslab/framer.ts";

// The send path. Everything it reports is measured, and the two things it must never do are
// write a frame nobody approved, and call a reply a response when it may be the wallpad's own
// polling arriving by coincidence.

/**
 * Build a reply frame with a real checksum. Hand-written XORs have been wrong three times in
 * this tool's fixtures already, and a frame the framer rightly drops looks exactly like a
 * wallpad that did not answer.
 */
function replyFrame(payloadHex: string): string {
  const payload = Buffer.from(payloadHex, "hex");
  const frame = Buffer.alloc(payload.length + 4);
  frame[0] = 0xf7;
  frame[1] = frame.length;
  payload.copy(frame, 2);
  let x = 0;
  for (let i = 0; i < frame.length - 2; i += 1) x ^= frame[i];
  frame[frame.length - 2] = x;
  frame[frame.length - 1] = 0xee;
  return frame.toString("hex");
}

function fakeSession() {
  const records: { kind: string; fields: Record<string, unknown> }[] = [];
  let closed = false;
  return {
    records,
    get closed() { return closed; },
    session: {
      async open() {},
      record(kind: string, fields: Record<string, unknown>) {
        if (closed) throw new Error("session is closed");
        records.push({ kind, fields });
      },
      stats() { return { records: records.length, rxBytes: 0 }; },
      async close(reason: string) { closed = true; return { reason, records: records.length, rxBytes: 0 }; },
    },
  };
}

function createFixture() {
  const session = fakeSession();
  const writes: Uint8Array[] = [];
  let wall = 1_700_000_000_000;
  let mono = 0n;
  let lastRx: bigint | null = null;
  const timers = new Map<number, { at: bigint; fn: () => void }>();
  let nextTimer = 1;
  let writeError: Error | null = null;

  const link = {
    async open() {},
    close() {},
    isOpen: () => true,
    lastRxMonoNs: () => lastRx,
    async write(bytes: Uint8Array) {
      if (writeError) throw writeError;
      writes.push(bytes);
      return { requestedMonoNs: mono, returnedMonoNs: mono, flushedMonoNs: mono + 2_000_000n, requestedWallMs: wall };
    },
  };

  const daemon = createDaemon({
    runName: "send-test",
    session: session.session as never,
    link: link as never,
    framer: createFramer(),
    deps: {
      nowMs: () => wall,
      monoNs: () => mono,
      setTimeout: (fn: () => void, delayMs: number) => {
        const id = nextTimer;
        nextTimer += 1;
        timers.set(id, { at: mono + BigInt(Math.max(0, delayMs)) * 1_000_000n, fn });
        return id;
      },
      clearTimeout: (id: unknown) => { timers.delete(id as number); },
    },
  });

  const advance = (ms: number): void => {
    const target = mono + BigInt(ms) * 1_000_000n;
    for (;;) {
      let due: { id: number; at: bigint; fn: () => void } | undefined;
      for (const [id, timer] of timers) if (timer.at <= target && (!due || timer.at < due.at)) due = { id, ...timer };
      if (!due) break;
      mono = due.at;
      wall = 1_700_000_000_000 + Number(mono / 1_000_000n);
      timers.delete(due.id);
      due.fn();
    }
    mono = target;
    wall = 1_700_000_000_000 + Number(mono / 1_000_000n);
  };

  const receive = (hex: string): void => {
    lastRx = mono;
    daemon.observe(Uint8Array.from(Buffer.from(hex, "hex")), wall, mono);
  };

  /** Let the send path's own awaits run without moving the clock. */
  const settle = async (steps = 8): Promise<void> => {
    for (let i = 0; i < steps; i += 1) await Promise.resolve();
  };

  return { daemon, session, link, writes, advance, receive, settle,
    setWriteError: (e: Error | null) => { writeError = e; },
    mono: () => mono };
}

const start = async (f: ReturnType<typeof createFixture>) => { await f.daemon.start(); };

test("E3 RED: a send without --arm writes nothing and says what it would have written", async () => {
  const f = createFixture();
  await start(f);
  const reply = await f.daemon.handle({ cmd: "send", hex: "f70b01190240110100b6ee" });
  assert.equal(reply.ok, true, JSON.stringify(reply));
  assert.equal(reply.outcome, "dry_run");
  assert.equal(reply.hex, "f70b01190240110100b6ee");
  assert.equal(f.writes.length, 0, "nothing reaches the bus without --arm");
});

test("E3 RED: a refused frame is refused before any waiting happens", async () => {
  const f = createFixture();
  await start(f);
  for (const hex of ["7f01020304", "f70e011e024311040004ffffb6ee", "f70b013402411006009cee"]) {
    const reply = await f.daemon.handle({ cmd: "send", hex, arm: true });
    assert.equal(reply.ok, false, hex);
    assert.equal(f.writes.length, 0, hex);
  }
  const records = f.session.records.filter((r) => r.kind === "tx_refused");
  assert.equal(records.length, 3, "a refusal is part of the record, not just a reply");
});

test("E3 RED: the write waits for the line to go quiet and records the gap it actually got", async () => {
  const f = createFixture();
  await start(f);
  f.receive("f70b01190140100000b5ee");                       // the line is busy as of now
  const pending = f.daemon.handle({ cmd: "send", hex: "f70b01190240110100b6ee", arm: true, quietMs: 60 });
  await f.settle();
  assert.equal(f.writes.length, 0, "it does not write into a line that just spoke");

  f.advance(70);
  await f.settle();
  const reply = await pending;
  assert.equal(reply.outcome, "written", JSON.stringify(reply));
  assert.equal(f.writes.length, 1);
  assert.ok(Number(reply.achievedQuietMs) >= 60, `achieved ${reply.achievedQuietMs}`);
  assert.ok(Number(reply.quietWaitedMs) >= 60, `waited ${reply.quietWaitedMs}`);
});

test("E3 RED: a line that never goes quiet is not written to, and that is the result", async () => {
  const f = createFixture();
  await start(f);
  f.receive("f70b01190140100000b5ee");                       // the line is already busy
  const pending = f.daemon.handle({
    cmd: "send", hex: "f70b01190240110100b6ee", arm: true, quietMs: 60, quietWaitMs: 300,
  });
  for (let i = 0; i < 12; i += 1) {
    f.receive("f70b01190140100000b5ee");                     // something arrives every 30 ms
    f.advance(30);
    await f.settle();
  }
  const reply = await pending;
  assert.equal(reply.outcome, "no_quiet_window", JSON.stringify(reply));
  assert.equal(f.writes.length, 0, "a frame written into traffic is a collision, not a measurement");
});

test("E3 RED: an idle line is written to at once, without waiting out the whole window", async () => {
  const f = createFixture();
  await start(f);
  const reply = await f.daemon.handle({ cmd: "send", hex: "f70b01190240110100b6ee", arm: true, quietMs: 60 });
  assert.equal(reply.outcome, "written");
  assert.equal(reply.achievedQuietMs, null, "nothing has ever been received, so there is no gap to report");
});

test("E3 RED: a reply inside the direct window is measured from the write, and called direct", async () => {
  const f = createFixture();
  await start(f);
  const pending = f.daemon.handle({
    cmd: "send", hex: "f70b01190240110100b6ee", arm: true, quietMs: 0, expect: "f70b0119044011",
  });
  await f.settle();
  f.advance(63);
  f.receive(replyFrame("01190440110101"));
  await f.settle();
  const reply = await pending;
  assert.equal(reply.outcome, "written");
  const answer = reply.reply as Record<string, unknown>;
  assert.equal(answer.hex, replyFrame("01190440110101"));
  assert.equal(answer.window, "direct");
  assert.ok(Number(answer.latencyMs) >= 60 && Number(answer.latencyMs) <= 65, `latency ${answer.latencyMs}`);
  assert.equal(reply.latencyIsUpperBound, true);
  assert.equal(reply.gatewayFlushMs, 50, "the gateway's own 50 ms sits inside that figure");
});

test("E3 RED: a reply after the direct window is reported as polling, not as an answer", async () => {
  // The wallpad polls every two seconds or so. A frame that arrives 900 ms after a write may
  // simply be that poll, and calling it a response is the weakness `P2-C` already records.
  const f = createFixture();
  await start(f);
  const pending = f.daemon.handle({
    cmd: "send", hex: "f70b01190240110100b6ee", arm: true, quietMs: 0,
    expect: "f70b0119044011", directMs: 150, pollingMs: 3_000,
  });
  await f.settle();
  f.advance(900);
  f.receive(replyFrame("01190440110101"));
  await f.settle();
  const reply = await pending;
  const answer = reply.reply as Record<string, unknown>;
  assert.equal(answer.window, "polling");
  assert.ok(Number(answer.latencyMs) >= 895, `latency ${answer.latencyMs}`);
});

test("E3 RED: silence for the whole polling window is silence, not a failure to look", async () => {
  const f = createFixture();
  await start(f);
  const pending = f.daemon.handle({
    cmd: "send", hex: "f70b01190240110100b6ee", arm: true, quietMs: 0,
    expect: "f70b0119044011", directMs: 150, pollingMs: 600,
  });
  await f.settle();
  f.advance(400);
  f.receive("f70b011b0143110000b5ee");                       // an unrelated poll
  await f.settle();
  f.advance(400);
  await f.settle();
  const reply = await pending;
  assert.equal(reply.reply, null);
  assert.equal(reply.outcome, "written", "the frame did go out; nothing answered it");
});

test("E3 RED: what the line was doing just before the write is kept, so coincidence can be judged", async () => {
  // A polling frame landing inside a 150 ms window by chance is roughly a one-in-fourteen event
  // at this bus's rate. Recording the phase of the poll before the write is what lets an
  // analysis tell "arrived in the window" from "arrived because of us".
  const f = createFixture();
  await start(f);
  f.receive(replyFrame("01190440110101"));
  f.advance(500);
  const pending = f.daemon.handle({
    cmd: "send", hex: "f70b01190240110200b5ee", arm: true, quietMs: 60, expect: "f70b0119044011",
  });
  await f.settle();
  f.advance(63);
  f.receive(replyFrame("01190440110202"));
  await f.settle();
  const reply = await pending;
  // Measured at the write, not at the reply: 500 ms of quiet plus the 2 ms the fake write
  // takes to flush. The 63 ms that follows is when the answer came, which is a different figure.
  assert.equal(Number(reply.matchingFrameAgoMs), 502,
    "how long since a matching frame last appeared, as of the moment we wrote");
});

test("E3 RED: a write the socket rejects is recorded as an error, not as an unanswered send", async () => {
  const f = createFixture();
  await start(f);
  f.setWriteError(new Error("EPIPE"));
  const reply = await f.daemon.handle({ cmd: "send", hex: "f70b01190240110100b6ee", arm: true, quietMs: 0 });
  assert.equal(reply.ok, false);
  assert.match(String(reply.reason), /EPIPE/);
  assert.equal(f.session.records.filter((r) => r.kind === "tx_error").length, 1);
});

test("E3 RED: the run log carries the send and its result, not only the reply to the caller", async () => {
  const f = createFixture();
  await start(f);
  const pending = f.daemon.handle({
    cmd: "send", hex: "f70b01190240110100b6ee", arm: true, quietMs: 0, expect: "f70b0119044011",
  });
  await f.settle();
  f.advance(63);
  f.receive(replyFrame("01190440110101"));
  await f.settle();
  await pending;

  const kinds = f.session.records.map((r) => r.kind);
  assert.ok(kinds.includes("tx"), kinds.join(","));
  assert.ok(kinds.includes("tx_result"), kinds.join(","));
  const tx = f.session.records.find((r) => r.kind === "tx")!;
  assert.equal(tx.fields.hex, "f70b01190240110100b6ee");
  const result = f.session.records.find((r) => r.kind === "tx_result")!;
  assert.equal(result.fields.replyHex, replyFrame("01190440110101"));
  assert.equal(result.fields.window, "direct");
});

test("E3 RED: a second send while one is in flight is refused, not run beside it", async () => {
  // One frame on the line at a time is the premise of this whole exercise. Two writes racing
  // is the collision the tool exists to measure, not something it should cause.
  const f = createFixture();
  await start(f);
  f.receive(replyFrame("01190140100000"));
  const first = f.daemon.handle({ cmd: "send", hex: "f70b01190240110100b6ee", arm: true, quietMs: 60 });
  await f.settle();
  const second = await f.daemon.handle({ cmd: "send", hex: "f70b01190240120100b5ee", arm: true, quietMs: 60 });
  assert.equal(second.ok, false, JSON.stringify(second));
  assert.match(String(second.reason), /in flight|busy/i);

  f.advance(70);
  await f.settle();
  const done = await first;
  assert.equal(done.outcome, "written");
  assert.equal(f.writes.length, 1, "only the first frame went out");

  const after = await f.daemon.handle({ cmd: "send", hex: "f70b01190240120100b5ee", arm: true, quietMs: 0 });
  assert.equal(after.outcome, "written", "and the lane frees up afterwards");
});

test("E3 RED: a send with no --expect says it never waited, rather than reporting silence", async () => {
  const f = createFixture();
  await start(f);
  const reply = await f.daemon.handle({ cmd: "send", hex: "f70b01190240110100b6ee", arm: true, quietMs: 0 });
  assert.equal(reply.outcome, "written");
  assert.equal(reply.reply, null);
  assert.equal(reply.waitedForReply, false, "nothing was asked for, so nothing was missed");
});

test("E3 RED: a send that did wait and heard nothing says that instead", async () => {
  const f = createFixture();
  await start(f);
  const pending = f.daemon.handle({
    cmd: "send", hex: "f70b01190240110100b6ee", arm: true, quietMs: 0,
    expect: "f70b0119044011", directMs: 100, pollingMs: 400,
  });
  await f.settle();
  f.advance(500);
  await f.settle();
  const reply = await pending;
  assert.equal(reply.reply, null);
  assert.equal(reply.waitedForReply, true, "silence after waiting is a different result from not waiting");
});

test("E4 RED: the silent-query gate writes on the query, not on a stretch of silence", async () => {
  // Four devices never answer their query: 0x1E, 0x34, 0x2B and 0x1F. The wallpad asks and then
  // waits about 270 ms before moving on, and that wait is the only place on this bus where an
  // eleven-byte frame fits every time. Measured over 7,019 such queries in
  // `capture-1788009200284`: 100 % fit, against 42 % for a 60 ms quiet window.
  const f = createFixture();
  await start(f);
  const pending = f.daemon.handle({
    cmd: "send", hex: "f70b01190240110100b6ee", arm: true, gate: "silent-query", gateWaitMs: 5_000,
  });
  await f.settle();
  assert.equal(f.writes.length, 0, "it waits for the query rather than for silence");

  f.advance(30);
  f.receive(replyFrame("01190440110101"));               // a reply: not the signal
  await f.settle();
  assert.equal(f.writes.length, 0, "a reply is the wrong moment; the next query follows at once");

  f.advance(30);
  f.receive("f70b011f0140100000b3ee");                   // the outlet query, which nothing answers
  await f.settle();
  const reply = await pending;
  assert.equal(reply.outcome, "written", JSON.stringify(reply));
  assert.equal(f.writes.length, 1);
  assert.equal(reply.gate, "silent-query");
  assert.equal(reply.gateDevice, "1f", "the record says which query opened the window");
});

test("E4 RED: a query that is answered inside the same read is not the signal", async () => {
  // A query and its reply arriving together means the exchange finished and the next query is
  // moments away. Only a read that *ends* on one of the four silent queries counts.
  const f = createFixture();
  await start(f);
  const pending = f.daemon.handle({
    cmd: "send", hex: "f70b01190240110100b6ee", arm: true, gate: "silent-query", gateWaitMs: 5_000,
  });
  await f.settle();
  f.advance(20);
  f.receive("f70b011f0140100000b3ee" + replyFrame("011f04401000000000"));
  await f.settle();
  assert.equal(f.writes.length, 0, "the read ended on the reply, so the window is already closing");

  f.advance(20);
  f.receive("f70b012b014011000086ee");                   // ventilation query, unanswered
  await f.settle();
  await pending;
  assert.equal(f.writes.length, 1);
});

test("E4 RED: if no such query comes, nothing is written and the result says why", async () => {
  const f = createFixture();
  await start(f);
  const pending = f.daemon.handle({
    cmd: "send", hex: "f70b01190240110100b6ee", arm: true, gate: "silent-query", gateWaitMs: 400,
  });
  await f.settle();
  for (let i = 0; i < 10; i += 1) {
    f.advance(60);
    f.receive(replyFrame("01190440110101"));
    await f.settle();
  }
  const reply = await pending;
  assert.equal(reply.outcome, "no_gate_window", JSON.stringify(reply));
  assert.equal(f.writes.length, 0);
});
