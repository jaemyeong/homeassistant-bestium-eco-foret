import assert from "node:assert/strict";
import test from "node:test";
import { createServer, createConnection, type Server, type Socket } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseArgs } from "../tools/buslab/cli.ts";
import { createSession } from "../tools/buslab/session.ts";
import { createLink } from "../tools/buslab/link.ts";
import { createDaemon } from "../tools/buslab/daemon.ts";
import { serveControl, requestControl, isRunAlive } from "../tools/buslab/control.ts";
import { createRedactor } from "../tools/buslab/config.ts";

// The unit suites use fakes for speed. This one runs the real thing against a real TCP server
// and a real unix socket, because the pieces can each be right while the wiring is wrong.

test("E1 RED: flags are read whether or not they carry a value", () => {
  assert.deepEqual(parseArgs(["start", "--run", "light1", "--seconds", "60"]),
    { command: "start", flags: { run: "light1", seconds: "60" } });
  assert.deepEqual(parseArgs(["send", "--hex", "f70b", "--arm"]),
    { command: "send", flags: { hex: "f70b", arm: true } });
  assert.deepEqual(parseArgs([]), { command: "", flags: {} });
  assert.deepEqual(parseArgs(["mark", "--label", "hand-on"]),
    { command: "mark", flags: { label: "hand-on" } });
});

type Wired = {
  dir: string;
  socketPath: string;
  push(hex: string): void;
  stopAll(): Promise<void>;
  runLines(): Promise<Record<string, unknown>[]>;
};

async function wire(): Promise<Wired> {
  const dir = await mkdtemp(join(tmpdir(), "buslab-"));
  const gatewayPath = join(dir, "gateway.sock");
  const socketPath = join(dir, "control.sock");

  let peer: Socket | null = null;
  const gateway: Server = createServer((connection) => { peer = connection; });
  await new Promise<void>((resolve) => gateway.listen(gatewayPath, resolve));

  const config = { host: "ew11-77e3a1.invalid", port: 8899 };
  const session = createSession({
    runDir: dir,
    redact: createRedactor(config),
    deps: {
      nowMs: () => Date.now(),
      monoNs: () => process.hrtime.bigint(),
      createWriteStream: (path) => createWriteStream(path, { flags: "a" }) as never,
      mkdir: async () => {},
    },
  });

  let seq = 0;
  const link = createLink({
    config,
    // The gateway is a unix socket here; everything above this line is the production path.
    connect: () => createConnection(gatewayPath) as never,
    connectTimeoutMs: 2_000,
    deps: {
      nowMs: () => Date.now(),
      monoNs: () => process.hrtime.bigint(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    },
    onChunk: (bytes) => session.record("rx", {
      seq: seq++, byteLength: bytes.byteLength, hex: Buffer.from(bytes).toString("hex"),
    }),
    onEvent: (kind, fields) => session.record(kind, fields),
  });

  const daemon = createDaemon({
    runName: "wiring",
    session,
    link,
    deps: { nowMs: () => Date.now(), monoNs: () => process.hrtime.bigint() },
  });
  await daemon.start();
  const server = await serveControl({ socketPath, handle: (request) => daemon.handle(request) });

  return {
    dir,
    socketPath,
    push: (hex) => { peer?.write(Buffer.from(hex, "hex")); },
    async stopAll() {
      await daemon.stop("test");
      await server.close();
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    },
    async runLines() {
      const text = await readFile(join(dir, "run.ndjson"), "utf8");
      return text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    },
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 60));

test("E1 RED: a real run records real bytes and answers real commands", async () => {
  const w = await wire();
  try {
    w.push("f70b01190140100000b5ee");
    await settle();

    const marked = await requestControl({ socketPath: w.socketPath, request: { cmd: "mark", label: "hand-on" } });
    assert.equal(marked.ok, true, JSON.stringify(marked));

    const status = await requestControl({ socketPath: w.socketPath, request: { cmd: "status" } });
    assert.equal(status.ok, true, JSON.stringify(status));
    assert.equal(status.connected, true);
    assert.equal(status.rxBytes, 11);
    assert.ok(typeof status.quietMs === "number" && status.quietMs >= 0, JSON.stringify(status));

    const bad = await requestControl({ socketPath: w.socketPath, request: { cmd: "teleport" } });
    assert.equal(bad.ok, false);

    const stopped = await requestControl({ socketPath: w.socketPath, request: { cmd: "stop" } });
    assert.equal(stopped.ok, true, JSON.stringify(stopped));

    const lines = await w.runLines();
    const kinds = lines.map((l) => l.t);
    // No `closed` record: that one exists for the peer dropping us. Closing the link
    // ourselves is already told by the `stop` that follows it.
    assert.deepEqual(kinds, ["open", "start", "rx", "mark", "stop", "close"], JSON.stringify(kinds));
    const rx = lines.find((l) => l.t === "rx")!;
    assert.equal(rx.hex, "f70b01190140100000b5ee");
    assert.equal(typeof rx.monoNs, "string");
  } finally {
    await w.stopAll();
  }
});

test("E1 RED: a read split across two packets is kept as two records, losing nothing", async () => {
  const w = await wire();
  try {
    w.push("f70b0119014010");
    await settle();
    w.push("0000b5ee");
    await settle();
    await requestControl({ socketPath: w.socketPath, request: { cmd: "stop" } });

    const rx = (await w.runLines()).filter((l) => l.t === "rx");
    assert.equal(rx.length, 2, "the link records reads, not frames");
    assert.equal(`${rx[0].hex}${rx[1].hex}`, "f70b01190140100000b5ee", "no byte is lost at the seam");
  } finally {
    await w.stopAll();
  }
});

test("E1 RED: a malformed control line gets a reason back and does not kill the run", async () => {
  const w = await wire();
  try {
    const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const c = createConnection(w.socketPath);
      let buffer = "";
      c.setEncoding("utf8");
      c.on("connect", () => c.write("this is not json\n"));
      c.on("data", (chunk: string) => {
        buffer += chunk;
        if (buffer.includes("\n")) { c.destroy(); resolve(JSON.parse(buffer.split("\n")[0])); }
      });
      c.on("error", reject);
    });
    assert.equal(reply.ok, false);
    assert.match(String(reply.reason), /JSON/i);

    const status = await requestControl({ socketPath: w.socketPath, request: { cmd: "status" } });
    assert.equal(status.ok, true, "the run survives a bad line");
  } finally {
    await w.stopAll();
  }
});

test("E1 RED: a live run is detected, so a second start under the same name can be refused", async () => {
  const w = await wire();
  try {
    assert.equal(await isRunAlive(w.socketPath), true, "the daemon answers on its socket");
    assert.equal(await isRunAlive(join(w.dir, "no-such.sock")), false, "an absent socket is not a run");
    await requestControl({ socketPath: w.socketPath, request: { cmd: "stop" } });
  } finally {
    await w.stopAll();
  }
});

test("E1 RED: a read arriving after stop reaches no file, because the link closes first", async () => {
  const w = await wire();
  try {
    await requestControl({ socketPath: w.socketPath, request: { cmd: "stop" } });
    w.push("f70b01190140100000b5ee");
    await settle();
    const rx = (await w.runLines()).filter((l) => l.t === "rx");
    assert.equal(rx.length, 0, "stopping detaches the link before the run file is finalised");
  } finally {
    await w.stopAll();
  }
});
