import assert from "node:assert/strict";
import test from "node:test";

import { createDaemon, parseControlLine } from "../tools/buslab/daemon.ts";
import { createFramer } from "../tools/buslab/framer.ts";

// The daemon exists so the receive stream survives between commands. A tool that reconnected
// per command could not answer "what arrived 200 ms after the write", which is the whole
// measurement. Commands reach it over a line-delimited JSON control channel; this file tests
// the protocol and the wiring, not the socket that carries them.

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
      async close(reason: string) {
        closed = true;
        return { reason, records: records.length, rxBytes: 0 };
      },
    },
  };
}

function fakeLink() {
  let opened = false;
  let closed = false;
  let lastRx: bigint | null = null;
  return {
    get opened() { return opened; },
    get closed() { return closed; },
    setLastRx(value: bigint | null) { lastRx = value; },
    link: {
      async open() { opened = true; },
      close() { closed = true; },
      lastRxMonoNs: () => lastRx,
      isOpen: () => opened && !closed,
      write: async () => ({ requestedMonoNs: 0n, returnedMonoNs: 0n, flushedMonoNs: 0n }),
    },
  };
}

function createFixture() {
  const session = fakeSession();
  const link = fakeLink();
  let wall = 1_700_000_000_000;
  let mono = 0n;
  const daemon = createDaemon({
    runName: "light1-discovery",
    session: session.session as never,
    link: link.link as never,
    framer: createFramer(),
    deps: {
      nowMs: () => wall,
      monoNs: () => mono,
      setTimeout: (fn: () => void, delayMs: number) => setTimeout(fn, delayMs),
      clearTimeout: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>),
    },
  });
  const advance = (ms: number): void => { wall += ms; mono += BigInt(ms) * 1_000_000n; };
  return { daemon, session, link, advance, setMono: (v: bigint) => { mono = v; } };
}

test("E1 RED: a control line that is not an object is refused with a reason", () => {
  for (const line of ["", "not json", "[]", "null", "42", '{"noCmd":1}']) {
    const parsed = parseControlLine(line);
    assert.equal(parsed.ok, false, line);
    assert.equal(typeof parsed.reason, "string");
  }
  const good = parseControlLine('{"cmd":"status"}');
  assert.equal(good.ok, true);
  assert.deepEqual(good.request, { cmd: "status" });
});

test("E1 RED: starting opens the link and the run in that order", async () => {
  const fixture = createFixture();
  await fixture.daemon.start();
  assert.equal(fixture.link.opened, true);
  assert.equal(fixture.session.records[0]?.kind, "start");
  assert.equal(fixture.session.records[0]?.fields.run, "light1-discovery");
});

test("E1 RED: a mark lands in the same log on the same clock as the reads", async () => {
  const fixture = createFixture();
  await fixture.daemon.start();
  fixture.advance(5_000);
  const reply = await fixture.daemon.handle({ cmd: "mark", label: "hand-on" });
  assert.equal(reply.ok, true);
  const mark = fixture.session.records.at(-1);
  assert.equal(mark?.kind, "mark");
  assert.equal(mark?.fields.label, "hand-on");
});

test("E1 RED: a mark without a usable label is refused rather than recorded blank", async () => {
  const fixture = createFixture();
  await fixture.daemon.start();
  for (const label of [undefined, "", "   ", 42]) {
    const reply = await fixture.daemon.handle({ cmd: "mark", label });
    assert.equal(reply.ok, false, JSON.stringify(label));
  }
  assert.equal(fixture.session.records.filter((r) => r.kind === "mark").length, 0);
});

test("E1 RED: status reports how long the line has been quiet, in milliseconds", async () => {
  const fixture = createFixture();
  await fixture.daemon.start();
  let reply = await fixture.daemon.handle({ cmd: "status" });
  assert.equal(reply.ok, true);
  assert.equal(reply.quietMs, null, "nothing has been received yet");

  fixture.setMono(1_000_000_000n);          // 1 s
  fixture.link.setLastRx(1_000_000_000n);
  fixture.setMono(1_080_000_000n);          // 80 ms later
  reply = await fixture.daemon.handle({ cmd: "status" });
  assert.equal(reply.quietMs, 80);
});

test("E1 RED: an unknown command is named in the reply instead of being ignored", async () => {
  const fixture = createFixture();
  await fixture.daemon.start();
  const reply = await fixture.daemon.handle({ cmd: "teleport" });
  assert.equal(reply.ok, false);
  assert.match(String(reply.reason), /teleport/);
});

test("E1 RED: stopping closes the link before the run, so no read can outlive the file", async () => {
  const fixture = createFixture();
  await fixture.daemon.start();
  const reply = await fixture.daemon.handle({ cmd: "stop" });
  assert.equal(reply.ok, true);
  assert.equal(fixture.link.closed, true);
  assert.equal(fixture.session.closed, true);
});

test("E1 RED: a second stop returns the same answer rather than throwing", async () => {
  const fixture = createFixture();
  await fixture.daemon.start();
  const first = await fixture.daemon.handle({ cmd: "stop" });
  const second = await fixture.daemon.handle({ cmd: "stop" });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(fixture.session.records.filter((r) => r.kind === "stop").length, 1);
});

test("E1 RED: a command arriving after stop is refused, not applied to a closed run", async () => {
  const fixture = createFixture();
  await fixture.daemon.start();
  await fixture.daemon.handle({ cmd: "stop" });
  const reply = await fixture.daemon.handle({ cmd: "mark", label: "too late" });
  assert.equal(reply.ok, false);
  assert.match(String(reply.reason), /stopped/i);
});
