import assert from "node:assert/strict";
import test from "node:test";
import { createServer, createConnection, type Server, type Socket } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseArgs, controlSocketPath } from "../tools/buslab/cli.ts";
import { createSession } from "../tools/buslab/session.ts";
import { createLink } from "../tools/buslab/link.ts";
import { createDaemon } from "../tools/buslab/daemon.ts";
import { createFramer } from "../tools/buslab/framer.ts";
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
  written(): string[];
  stopAll(): Promise<void>;
  runLines(): Promise<Record<string, unknown>[]>;
};

async function wire(): Promise<Wired> {
  const dir = await mkdtemp(join(tmpdir(), "buslab-"));
  const gatewayPath = join(dir, "gateway.sock");
  const socketPath = join(dir, "control.sock");

  let peer: Socket | null = null;
  const sentToGateway: Buffer[] = [];
  const gateway: Server = createServer((connection) => {
    peer = connection;
    connection.on("data", (chunk: Buffer) => { sentToGateway.push(Buffer.from(chunk)); });
  });
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
    onChunk: (bytes, wallMs, monoNs) => daemonRef!.observe(bytes, wallMs, monoNs),
    onEvent: (kind, fields) => session.record(kind, fields),
  });
  void seq;

  let daemonRef: ReturnType<typeof createDaemon> | null = null;
  const daemon = createDaemon({
    runName: "wiring",
    session,
    link,
    framer: createFramer(),
    deps: {
      nowMs: () => Date.now(),
      monoNs: () => process.hrtime.bigint(),
      setTimeout: (fn, delayMs) => setTimeout(fn, delayMs),
      clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    },
  });
  daemonRef = daemon;
  await daemon.start();
  const server = await serveControl({ socketPath, handle: (request) => daemon.handle(request) });

  return {
    dir,
    socketPath,
    push: (hex) => { peer?.write(Buffer.from(hex, "hex")); },
    written: () => sentToGateway.map((b) => b.toString("hex")),
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

test("E3 RED: an armed send really reaches the gateway, and a refused one really does not", async () => {
  const w = await wire();
  try {
    const dry = await requestControl({
      socketPath: w.socketPath,
      request: { cmd: "send", hex: "f70b01190240110100b6ee" },
    });
    assert.equal(dry.outcome, "dry_run", JSON.stringify(dry));
    await settle();
    assert.deepEqual(w.written(), [], "a dry run puts no byte on the wire");

    const refused = await requestControl({
      socketPath: w.socketPath,
      request: { cmd: "send", hex: "7f01020304", arm: true },
    });
    assert.equal(refused.ok, false, JSON.stringify(refused));
    await settle();
    assert.deepEqual(w.written(), [], "a refusal puts no byte on the wire either");

    const armed = await requestControl({
      socketPath: w.socketPath,
      request: { cmd: "send", hex: "f70b01190240110100b6ee", arm: true, quietMs: 0 },
    });
    assert.equal(armed.outcome, "written", JSON.stringify(armed));
    await settle();
    assert.deepEqual(w.written(), ["f70b01190240110100b6ee"], "and exactly those eleven bytes go out");

    await requestControl({ socketPath: w.socketPath, request: { cmd: "stop" } });
    const kinds = (await w.runLines()).map((line) => line.t);
    assert.ok(kinds.includes("tx_dry_run") && kinds.includes("tx_refused") && kinds.includes("tx"),
      kinds.join(","));
  } finally {
    await w.stopAll();
  }
});

test("E4 RED: the control socket path fits in a unix socket address", () => {
  // macOS holds 104 bytes in sun_path, terminator included. The obvious place for the socket —
  // beside the run inside the repository — is 105 bytes for a run named `light1-discovery`, and
  // `listen` fails with EINVAL. The unit tests never saw it because `mkdtemp` gives short paths.
  const long = controlSocketPath("light1-discovery");
  assert.ok(Buffer.byteLength(long) <= 103, `${long} is ${Buffer.byteLength(long)} bytes`);

  const longest = controlSocketPath("a".repeat(64));
  assert.ok(Buffer.byteLength(longest) <= 103, `${longest} is ${Buffer.byteLength(longest)} bytes`);

  // Deterministic, so `status` and `stop` reach the daemon `start` created.
  assert.equal(controlSocketPath("light1-discovery"), long);
  assert.notEqual(controlSocketPath("light1-tx"), long, "two runs do not share one socket");
});

// ---------------------------------------------------------------------------
// `stop` used to leave the process behind.
//
// Found while closing down the heating run: `stop` returned `{"ok":true,"reason":"stopped"}`, the
// run's `stop` and `close` records were written and the gateway socket dropped, and the process
// was still alive minutes later with its control socket still on disk. The control socket routed
// straight to `daemon.handle`, which stops the daemon and knows nothing about the process around
// it, so only the `--seconds` timer or a signal ever ended it. An operator who runs `stop` and
// starts the next run is entitled to assume the last one is gone.

test("E5 RED: a stop over the control socket asks the process to end, and still answers", async () => {
  const { createControlHandler } = await import("../tools/buslab/cli.ts");
  let stopped = 0;
  const handler = createControlHandler({
    handle: async (request) => ({ ok: true, echoed: request.cmd }),
    onStopped: () => { stopped += 1; },
  });
  const reply = await handler({ cmd: "stop", reason: "stopped" });
  assert.deepEqual(reply, { ok: true, echoed: "stop" }, "the caller still gets the daemon's reply");
  assert.equal(stopped, 1, "and the process is asked to end exactly once");
});

test("E5 RED: no other command ends the process", async () => {
  const { createControlHandler } = await import("../tools/buslab/cli.ts");
  let stopped = 0;
  const handler = createControlHandler({
    handle: async () => ({ ok: true }),
    onStopped: () => { stopped += 1; },
  });
  for (const cmd of ["status", "mark", "send", "", undefined]) {
    await handler({ cmd });
  }
  assert.equal(stopped, 0);
});

test("E5 RED: a stop the daemon refused leaves the process running", async () => {
  // Tearing down on a refusal would end a run over a request that changed nothing.
  const { createControlHandler } = await import("../tools/buslab/cli.ts");
  let stopped = 0;
  const handler = createControlHandler({
    handle: async () => ({ ok: false, reason: "already stopped" }),
    onStopped: () => { stopped += 1; },
  });
  const reply = await handler({ cmd: "stop" });
  assert.deepEqual(reply, { ok: false, reason: "already stopped" });
  assert.equal(stopped, 0);
});

test("E5 RED: a handler that throws does not end the process either", async () => {
  const { createControlHandler } = await import("../tools/buslab/cli.ts");
  let stopped = 0;
  const handler = createControlHandler({
    handle: async () => { throw new Error("boom"); },
    onStopped: () => { stopped += 1; },
  });
  await assert.rejects(() => handler({ cmd: "stop" }), /boom/);
  assert.equal(stopped, 0, "the control server turns the throw into its own error reply");
});
