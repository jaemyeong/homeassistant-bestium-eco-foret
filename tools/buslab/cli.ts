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
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createRedactor, parseBuslabConfig, type BuslabConfig } from "./config.ts";
import { createSafeRecorder, createSession } from "./session.ts";
import { createLink } from "./link.ts";
import { createDaemon } from "./daemon.ts";
import { isRunAlive, requestControl, serveControl } from "./control.ts";
import { createFramer, type BusFrame } from "./framer.ts";
import { around, frameKey, gapSummary, inventory, loadRecords } from "./analyze.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(HERE, "config.json");
const RUNS_DIR = join(HERE, "runs");

/**
 * A unix socket address holds 104 bytes on macOS, terminator included, and the natural place
 * for this file — beside the run inside the repository — is already over that for an ordinary
 * run name. The socket therefore lives in the per-user temporary directory under a digest of
 * the run's own path, which is short, deterministic so `status` and `stop` find it, and not
 * shared with another checkout of this repository.
 */
export function controlSocketPath(runName: string): string {
  const digest = createHash("sha256").update(join(RUNS_DIR, runName)).digest("hex").slice(0, 12);
  return join(tmpdir(), `buslab-${digest}.sock`);
}

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
  const socketPath = controlSocketPath(runName);
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

  // The daemon receives every read, because the send path has to see frames as they arrive to
  // tell a reply from the wallpad's own polling.
  let deliver: (bytes: Uint8Array, wallMs: number, monoNs: bigint) => void = () => {};
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
    onChunk: (bytes, wallMs, monoNs) => deliver(bytes, wallMs, monoNs),
    onEvent: (kind, fields) => safeRecord(kind, fields),
  });

  const daemon = createDaemon({
    runName,
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
  deliver = (bytes, wallMs, monoNs) => daemon.observe(bytes, wallMs, monoNs);

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

/** Read a finished run, or any add-on capture, and frame it. Nothing here touches the network. */
async function readFrames(flags: Record<string, string | true>): Promise<{
  frames: BusFrame[];
  run: ReturnType<typeof loadRecords>;
  unparsedBytes: number;
  spanning: number;
  source: string;
}> {
  const file = typeof flags.file === "string"
    ? flags.file
    : join(RUNS_DIR, requireRun(flags), "run.ndjson");
  const run = loadRecords(await readFile(file, "utf8"));
  const framer = createFramer();
  const frames: BusFrame[] = [];
  for (const read of run.reads) {
    frames.push(...framer.push(Uint8Array.from(Buffer.from(read.hex, "hex")), read).frames);
  }
  // `flush` can still complete a frame when a forced resync left one whole in the buffer.
  frames.push(...framer.flush().frames);
  const stats = framer.stats();
  return { frames, run, unparsedBytes: stats.unparsedBytes, spanning: stats.spanning, source: file };
}

async function commandFrames(flags: Record<string, string | true>): Promise<void> {
  const { frames, run, unparsedBytes, spanning, source } = await readFrames(flags);
  const gaps = gapSummary(run.reads);
  // Count the reads that carried more than one frame, not the surplus frames: the two differ
  // whenever a read carries three or more, and the first is the property of the gateway's
  // 50 ms flush that we actually want to report.
  const perRead = new Map<number, number>();
  for (const frame of frames) perRead.set(frame.endSeq, (perRead.get(frame.endSeq) ?? 0) + 1);
  let readsWithSeveral = 0;
  for (const count of perRead.values()) if (count > 1) readsWithSeveral += 1;
  process.stdout.write(JSON.stringify({
    source,
    reads: run.reads.length,
    bytes: run.reads.reduce((sum, read) => sum + read.byteLength, 0),
    frames: frames.length,
    unparsedBytes,
    framesSpanningReads: spanning,
    readsCarryingSeveralFrames: readsWithSeveral,
    readsCarryingSeveralFramesPercent: run.reads.length
      ? Math.round((1000 * readsWithSeveral) / run.reads.length) / 10
      : 0,
    marks: run.marks.map((mark) => mark.label),
    gapMs: {
      count: gaps.count, min: gaps.minMs, median: gaps.medianMs, max: gaps.maxMs,
      atLeast50: gaps.atLeast(50), atLeast100: gaps.atLeast(100),
    },
  }, null, 2) + "\n");
}

async function commandInventory(flags: Record<string, string | true>): Promise<void> {
  const { frames } = await readFrames(flags);
  const rows = inventory(frames).map((row) => ({
    key: row.key,
    count: row.count,
    periodMedianMs: row.periodMedianMs,
    lengths: row.lengths,
    sampleHex: row.sampleHex,
    byLength: row.byLength.map((group) => ({
      length: group.length,
      count: group.count,
      sampleHex: group.sampleHex,
      movingBytes: group.byteValues
        .map((values, index) => ({ index, values, distinct: group.byteValueCounts[index] }))
        .filter((entry) => entry.distinct > 1),
    })),
  }));
  process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
}

async function commandAround(flags: Record<string, string | true>): Promise<void> {
  const { frames, run } = await readFrames(flags);
  const label = typeof flags.label === "string" ? flags.label : "";
  const mark = run.marks.find((entry) => entry.label === label);
  if (!mark) {
    throw new Error(
      `no mark named ${JSON.stringify(label)} in this run. Marks present: ` +
      (run.marks.map((entry) => entry.label).join(", ") || "none"),
    );
  }
  const found = around({
    frames,
    atMonoNs: mark.monoNs,
    windowMs: Number(flags.window ?? 2_000),
    baselineMs: Number(flags.baseline ?? 10_000),
  });
  process.stdout.write(JSON.stringify({ label, ...found }, null, 2) + "\n");
}

async function commandControl(command: string, flags: Record<string, string | true>): Promise<void> {
  const runName = requireRun(flags);
  const socketPath = controlSocketPath(runName);
  const request: Record<string, unknown> = { cmd: command };
  if (typeof flags.label === "string") request.label = flags.label;
  if (typeof flags.hex === "string") request.hex = flags.hex;
  if (flags.arm === true) request.arm = true;
  if (typeof flags.expect === "string") request.expect = flags.expect;
  for (const [flag, key] of [["quiet-ms", "quietMs"], ["quiet-wait-ms", "quietWaitMs"],
                             ["direct-ms", "directMs"], ["polling-ms", "pollingMs"]] as const) {
    if (typeof flags[flag] === "string") request[key] = Number(flags[flag]);
  }
  // A send waits for a quiet window and then for a reply, so it outlives the default deadline.
  const reply = await requestControl({ socketPath, request, timeoutMs: command === "send" ? 30_000 : 5_000 });
  process.stdout.write(`${JSON.stringify(reply, null, 2)}\n`);
  // A skipped send is a legitimate outcome, not an error, but a loop of twenty sends must not
  // exit zero while half of them never reached the bus.
  const wroteNothing = reply.outcome === "no_quiet_window" || reply.outcome === "refused"
    || reply.outcome === "busy" || reply.outcome === "write_failed";
  if (reply.ok !== true || wroteNothing) process.exitCode = 1;
}

const USAGE = `buslab — local RS485 measurement over the EW11 gateway

  buslab start  --run <name> [--seconds N] [--connect-timeout-ms N]
  buslab status --run <name>
  buslab mark   --run <name> --label "what just happened"
  buslab send   --run <name> --hex <hex> [--arm] [--expect <mask>] [--quiet-ms 60]
  buslab stop   --run <name>

  buslab frames    --run <name> | --file <path>
  buslab inventory --run <name> | --file <path>
  buslab around    --run <name> --label "..." [--window 2000] [--baseline 10000]

The three analysis commands read a finished run, or any add-on capture, and touch no network.

The gateway address comes from BUSLAB_HOST / BUSLAB_PORT or from tools/buslab/config.json,
neither of which is committed. It is never written into a run's artifacts.
`;

export async function main(argv: string[]): Promise<void> {
  const { command, flags } = parseArgs(argv);
  if (command === "start") return commandStart(flags);
  if (command === "status" || command === "mark" || command === "stop" || command === "send") {
    return commandControl(command, flags);
  }
  if (command === "frames") return commandFrames(flags);
  if (command === "inventory") return commandInventory(flags);
  if (command === "around") return commandAround(flags);
  process.stderr.write(USAGE);
  process.exitCode = command === "" || command === "help" || command === "--help" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`buslab: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
