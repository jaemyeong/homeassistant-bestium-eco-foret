// buslab — a local RS485 measurement tool. Everything here is process wiring; the parts worth
// testing live in config.ts, session.ts, link.ts, daemon.ts and control.ts.
//
//   buslab start  --run <name> [--seconds N]
//   buslab status --run <name>
//   buslab mark   --run <name> --label "..."
//   buslab stop   --run <name>
//
// `start` stays in the foreground and holds the socket. Run it with `&` or in another terminal
// and drive it with the other three.

import { createConnection } from "node:net";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createRedactor, parseBuslabConfig, type BuslabConfig } from "./config.ts";
import { createSafeRecorder, createSession } from "./session.ts";
import { createLink } from "./link.ts";
import { createDaemon } from "./daemon.ts";
import { isRunAlive, requestControl, serveControl } from "./control.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(HERE, "config.json");
const RUNS_DIR = join(HERE, "runs");

export function parseArgs(argv: string[]): { command: string; flags: Record<string, string | true> } {
  const [command = "", ...rest] = argv;
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function requireRun(flags: Record<string, string | true>): string {
  const run = flags.run;
  if (typeof run !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(run)) {
    throw new Error("buslab needs --run <name>, using letters, digits, dot, dash or underscore");
  }
  return run;
}

async function loadConfig(): Promise<BuslabConfig> {
  let file: unknown;
  try {
    file = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch {
    file = undefined;
  }
  return parseBuslabConfig({ configPath: CONFIG_PATH, file, env: process.env });
}

async function commandStart(flags: Record<string, string | true>): Promise<void> {
  const runName = requireRun(flags);
  const runDir = join(RUNS_DIR, runName);
  const socketPath = join(runDir, "control.sock");
  const config = await loadConfig();
  const redact = createRedactor(config);

  await mkdir(runDir, { recursive: true });
  if (await isRunAlive(socketPath)) {
    throw new Error(
      `run ${runName} is already recording. Stop it first, or choose another --run name; ` +
      "two daemons appending to one run.ndjson interleave two streams into one file.",
    );
  }
  await rm(socketPath, { force: true });

  const session = createSession({
    runDir,
    redact,
    onWriterError: (error) => process.stderr.write(`buslab: the run writer failed: ${error.message}\n`),
    deps: {
      nowMs: () => Date.now(),
      monoNs: () => process.hrtime.bigint(),
      createWriteStream: (path) => createWriteStream(path, { flags: "a" }) as never,
      mkdir: async (path) => { await mkdir(path, { recursive: true }); },
    },
  });

  const safeRecord = createSafeRecorder(session, (kind) => {
    process.stderr.write(`buslab: dropped a late ${kind} record after the run closed\n`);
  });

  let rxSeq = 0;
  const link = createLink({
    config,
    connect: (input) => createConnection(input) as never,
    connectTimeoutMs: Number(flags["connect-timeout-ms"] ?? 3_000),
    deps: {
      nowMs: () => Date.now(),
      monoNs: () => process.hrtime.bigint(),
      setTimeout: (fn, delayMs) => setTimeout(fn, delayMs),
      clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    },
    onChunk: (bytes, wallMs, monoNs) => {
      safeRecord("rx", {
        seq: rxSeq++,
        byteLength: bytes.byteLength,
        hex: Buffer.from(bytes).toString("hex"),
        wallMs,
        monoNs,
      });
    },
    onEvent: (kind, fields) => safeRecord(kind, fields),
  });

  const daemon = createDaemon({
    runName,
    session,
    link,
    deps: { nowMs: () => Date.now(), monoNs: () => process.hrtime.bigint() },
  });

  await daemon.start();
  const server = await serveControl({
    socketPath,
    handle: (request) => daemon.handle(request),
  });
  process.stderr.write(`buslab: run ${runName} recording to ${runDir}\n`);

  const finish = async (reason: string): Promise<void> => {
    await daemon.stop(reason);
    await server.close();
    await rm(socketPath, { force: true });
    process.stderr.write(`buslab: run ${runName} stopped (${reason})\n`);
    process.exit(0);
  };

  process.on("SIGINT", () => void finish("sigint"));
  process.on("SIGTERM", () => void finish("sigterm"));
  const seconds = Number(flags.seconds ?? 0);
  if (Number.isFinite(seconds) && seconds > 0) setTimeout(() => void finish("duration"), seconds * 1_000);

  // Hold the process open until the daemon stops; the control server keeps the loop alive.
  await new Promise<void>(() => {});
}

async function commandControl(command: string, flags: Record<string, string | true>): Promise<void> {
  const runName = requireRun(flags);
  const socketPath = join(RUNS_DIR, runName, "control.sock");
  const request: Record<string, unknown> = { cmd: command };
  if (typeof flags.label === "string") request.label = flags.label;
  const reply = await requestControl({ socketPath, request });
  process.stdout.write(`${JSON.stringify(reply, null, 2)}\n`);
  if (reply.ok !== true) process.exitCode = 1;
}

const USAGE = `buslab — local RS485 measurement over the EW11 gateway

  buslab start  --run <name> [--seconds N] [--connect-timeout-ms N]
  buslab status --run <name>
  buslab mark   --run <name> --label "what just happened"
  buslab stop   --run <name>

The gateway address comes from BUSLAB_HOST / BUSLAB_PORT or from tools/buslab/config.json,
neither of which is committed. It is never written into a run's artifacts.
`;

export async function main(argv: string[]): Promise<void> {
  const { command, flags } = parseArgs(argv);
  if (command === "start") return commandStart(flags);
  if (command === "status" || command === "mark" || command === "stop") return commandControl(command, flags);
  process.stderr.write(USAGE);
  process.exitCode = command === "" || command === "help" || command === "--help" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`buslab: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
