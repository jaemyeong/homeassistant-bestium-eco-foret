import assert from "node:assert/strict";
import test from "node:test";

import { createSafeRecorder, createSession } from "../tools/buslab/session.ts";

// `run.ndjson` is the only original evidence this tool produces, so how it is written is part
// of the contract, not an implementation detail. It never applies backpressure to the socket,
// because pausing the read distorts exactly the timing being measured, and it says so out loud
// when the writer falls behind rather than hiding it.

type Line = string;

function fakeWriter() {
  const lines: Line[] = [];
  const listeners = new Map<string, ((...args: unknown[]) => unknown)[]>();
  let writableLength = 0;
  let ended = false;
  return {
    lines,
    setWritableLength(value: number) { writableLength = value; },
    get ended() { return ended; },
    fail(error: Error) {
      for (const listener of listeners.get("error") ?? []) listener(error);
    },
    stream: {
      get writableLength() { return writableLength; },
      write(chunk: string) { lines.push(chunk); return writableLength === 0; },
      end(callback?: () => void) { ended = true; callback?.(); },
      on(event: string, listener: (...args: unknown[]) => unknown) {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      },
      once() {}, off() {},
    },
  };
}

function createFixture(options: { backlogBytes?: number } = {}) {
  const writer = fakeWriter();
  const writerErrors: Error[] = [];
  let wall = 1_700_000_000_000;
  let mono = 0n;
  const session = createSession({
    runDir: "/runs/demo",
    backlogBytes: options.backlogBytes ?? 64 * 1024,
    onWriterError: (error: Error) => { writerErrors.push(error); },
    redact: (text: string) => text.replaceAll("10.0.0.5", "<gateway>"),
    deps: {
      nowMs: () => (wall += 1),
      monoNs: () => (mono += 1_000_000n),
      createWriteStream: () => writer.stream as never,
      mkdir: async () => {},
    },
  });
  const parsed = (): Record<string, unknown>[] => writer.lines.map((l) => JSON.parse(l));
  return { session, writer, parsed, writerErrors };
}

test("E1 RED: every record carries both clocks and one JSON object per line", async () => {
  const fixture = createFixture();
  await fixture.session.open();
  fixture.session.record("rx", { seq: 0, byteLength: 11, hex: "f70b01190140100000b5ee" });
  fixture.session.record("mark", { label: "hand-on" });
  const lines = fixture.writer.lines;
  assert.equal(lines.length, 2);
  for (const line of lines) assert.ok(line.endsWith("\n"), "records are newline delimited");
  const [rx, mark] = fixture.parsed();
  assert.equal(rx.t, "rx");
  assert.equal(rx.hex, "f70b01190140100000b5ee");
  assert.equal(typeof rx.wallMs, "number");
  assert.equal(typeof rx.monoNs, "string", "nanoseconds are a bigint, so they serialise as a string");
  assert.equal(mark.t, "mark");
  assert.equal(mark.label, "hand-on");
});

test("E1 RED: the gateway address never reaches the file", async () => {
  const fixture = createFixture();
  await fixture.session.open();
  fixture.session.record("close", { reason: "connect ECONNREFUSED 10.0.0.5:8899" });
  const written = fixture.writer.lines.join("");
  assert.ok(!written.includes("10.0.0.5"), written);
  assert.match(written, /<gateway>/);
});

test("E1 RED: a congested writer is announced once, not on every record", async () => {
  const fixture = createFixture({ backlogBytes: 100 });
  await fixture.session.open();
  fixture.session.record("rx", { seq: 0 });
  fixture.writer.setWritableLength(500);
  fixture.session.record("rx", { seq: 1 });
  fixture.session.record("rx", { seq: 2 });
  fixture.session.record("rx", { seq: 3 });
  fixture.writer.setWritableLength(0);
  fixture.session.record("rx", { seq: 4 });

  const kinds = fixture.parsed().map((entry) => entry.t);
  assert.deepEqual(
    kinds,
    ["rx", "backlog", "rx", "rx", "rx", "backlog_cleared", "rx"],
    JSON.stringify(kinds),
  );
  // Losing a record would be worse than a late one, so nothing is dropped while congested.
  assert.deepEqual(
    fixture.parsed().filter((e) => e.t === "rx").map((e) => e.seq),
    [0, 1, 2, 3, 4],
  );
});

test("E1 RED: nothing is buffered in the process, so a long run cannot grow without bound", async () => {
  const fixture = createFixture();
  await fixture.session.open();
  for (let i = 0; i < 500; i += 1) fixture.session.record("rx", { seq: i });
  assert.equal(fixture.writer.lines.length, 500, "each record reaches the stream as it is made");
});

test("E1 RED: closing waits for the writer and reports what was recorded", async () => {
  const fixture = createFixture();
  await fixture.session.open();
  fixture.session.record("rx", { seq: 0, byteLength: 11 });
  fixture.session.record("rx", { seq: 1, byteLength: 13 });
  const summary = await fixture.session.close("stopped");
  assert.equal(fixture.writer.ended, true);
  assert.equal(summary.records, 3, "two reads plus the close record");
  assert.equal(summary.rxBytes, 24);
  assert.equal(fixture.parsed().at(-1)?.t, "close");
});

test("E1 RED: recording after close is refused rather than silently lost", async () => {
  const fixture = createFixture();
  await fixture.session.open();
  await fixture.session.close("stopped");
  assert.throws(() => fixture.session.record("rx", { seq: 0 }), /closed/i);
});

test("E1 RED: a writer failure is surfaced instead of taking the process down", async () => {
  // `fs.createWriteStream` emits 'error' asynchronously. With nobody listening that is an
  // unhandled event and the process dies mid-run, losing the clean close as well as the run.
  const fixture = createFixture();
  await fixture.session.open();
  fixture.session.record("rx", { seq: 0, byteLength: 11 });
  fixture.writer.fail(new Error("ENOSPC: no space left on device"));

  assert.equal(fixture.writerErrors.length, 1, "the operator is told");
  assert.match(String(fixture.session.writerError()?.message), /ENOSPC/);
  assert.throws(() => fixture.session.record("rx", { seq: 1 }), /closed/i,
    "nothing is written to a stream that has already failed");

  const summary = await fixture.session.close("stopped");
  assert.equal(summary.records, 1, "the failed write is not counted twice");
  assert.equal(fixture.writer.ended, true, "the stream is still ended rather than left open");
});

test("E1 RED: the guard the CLI wires into socket listeners swallows a closed-run refusal", async () => {
  // The link calls this from inside socket listeners. `record` throws on a closed run by
  // design, and a throw there is an uncaught exception during shutdown.
  const fixture = createFixture();
  const dropped: string[] = [];
  const safeRecord = createSafeRecorder(fixture.session, (kind) => { dropped.push(kind); });
  await fixture.session.open();

  assert.equal(safeRecord("rx", { seq: 0, byteLength: 11 }), true);
  assert.deepEqual(dropped, []);

  await fixture.session.close("stopped");
  assert.doesNotThrow(() => safeRecord("closed", { reason: "peer" }));
  assert.equal(safeRecord("rx", { seq: 1 }), false, "the caller is told it was dropped");
  assert.deepEqual(dropped, ["closed", "rx"], "and what was dropped is named");
});
