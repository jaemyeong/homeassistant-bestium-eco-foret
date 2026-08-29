// The daemon holds the socket open across commands. A tool that reconnected for each command
// could not answer "what arrived 200 ms after the write", and that question is the whole
// measurement. Commands arrive as one JSON object per line over a unix socket; this module owns
// the protocol, the wiring and the send path, and `cli.ts` owns the socket that carries them.

import type { Link } from "./link.ts";
import type { Session, SessionSummary } from "./session.ts";
import type { BusFrame, Framer } from "./framer.ts";
import { checkOutgoing, matchesMask, parseMask, type Mask } from "./guard.ts";

export type ControlRequest = Record<string, unknown>;
export type ControlReply = Record<string, unknown>;

export type ParsedControlLine =
  | { ok: true; request: ControlRequest }
  | { ok: false; reason: string };

export function parseControlLine(line: string): ParsedControlLine {
  const text = line.trim();
  if (text.length === 0) return { ok: false, reason: "empty control line" };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "control line is not JSON" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "control line must be a JSON object" };
  }
  const request = value as ControlRequest;
  if (typeof request.cmd !== "string" || request.cmd.length === 0) {
    return { ok: false, reason: "control line has no cmd" };
  }
  return { ok: true, request };
}

export type DaemonDeps = {
  nowMs(): number;
  monoNs(): bigint;
  setTimeout(fn: () => void, delayMs: number): unknown;
  clearTimeout(id: unknown): void;
};

/** The gateway forwards serial bytes only after 50 ms of silence, so every latency includes it. */
const GATEWAY_FLUSH_MS = 50;
const DEFAULT_DIRECT_MS = 150;
const DEFAULT_POLLING_MS = 3_000;
const DEFAULT_QUIET_MS = 60;
const DEFAULT_QUIET_WAIT_MS = 1_000;
/** How often to re-check whether the line has gone quiet. Well under one frame time. */
const QUIET_POLL_MS = 5;
/** Enough tail to answer "when did this last appear" over a minute of a busy bus. */
const RECENT_FRAMES = 512;
/**
 * Devices whose query the bus never answers. The wallpad asks and then waits about 270 ms before
 * moving on, and that wait is the only place on this line where an eleven-byte frame fits every
 * time: 7,019 such queries in `capture-1788009200284`, 100 % fit, against 42 % for a 60 ms quiet
 * window. Entrance, elevator, ventilation and outlet.
 */
const SILENT_QUERY_DEVICES = new Set([0x1e, 0x34, 0x2b, 0x1f]);
const DEFAULT_GATE_WAIT_MS = 3_000;

const ms = (ns: bigint): number => Math.round(Number(ns) / 1_000) / 1_000;

type Waiter = {
  mask: Mask | null;
  fromMonoNs: bigint;
  directUntilNs: bigint;
  settle(frame: BusFrame | null): void;
};

export function createDaemon(opts: {
  runName: string;
  session: Session;
  link: Link;
  framer: Framer;
  deps: DaemonDeps;
}) {
  let stopped = false;
  let summary: SessionSummary | null = null;
  let rxSeq = 0;
  /** One frame on the line at a time. Two writes racing is the collision being measured. */
  let sendInFlight = false;
  const waiters = new Set<Waiter>();
  const gateWaiters = new Set<(device: number | null) => void>();
  /** A short tail of what has arrived, so a coincidence can be told from a response. */
  const recent: BusFrame[] = [];

  const lastMatchingMonoNs = (mask: Mask): bigint | undefined => {
    for (let i = recent.length - 1; i >= 0; i -= 1) {
      if (matchesMask(recent[i].bytes, mask)) return recent[i].monoNs;
    }
    return undefined;
  };

  const quietMsNow = (): number | null => {
    const last = opts.link.lastRxMonoNs();
    return last === null ? null : ms(opts.deps.monoNs() - last);
  };

  /** Called by the CLI for every read: records it, frames it, and wakes anything waiting. */
  const observe = (bytes: Uint8Array, wallMs: number, monoNs: bigint): void => {
    try {
      opts.session.record("rx", { seq: rxSeq++, byteLength: bytes.byteLength, hex: Buffer.from(bytes).toString("hex"), wallMs, monoNs });
    } catch {
      return;                                    // the run closed under us; nothing to record into
    }
    const framed = opts.framer.push(bytes, { seq: rxSeq - 1, wallMs, monoNs });
    for (const frame of framed.frames) {
      recent.push(frame);
      if (recent.length > RECENT_FRAMES) recent.shift();
      for (const waiter of [...waiters]) {
        if (frame.monoNs < waiter.fromMonoNs) continue;
        if (waiter.mask && !matchesMask(frame.bytes, waiter.mask)) continue;
        waiters.delete(waiter);
        waiter.settle(frame);
      }
    }
    // A read that *ends* on one of the silent queries opens the window. A query answered inside
    // the same read does not: that exchange is over and the next query is moments away.
    const last = framed.frames.at(-1);
    if (last && last.bytes[0] === 0xf7 && last.bytes[4] === 0x01 && SILENT_QUERY_DEVICES.has(last.bytes[3])) {
      for (const wake of [...gateWaiters]) { gateWaiters.delete(wake); wake(last.bytes[3]); }
    }
    for (const stray of framed.unparsed) {
      opts.session.record("unparsed", { hex: stray.hex, seq: stray.seq, offset: stray.offset, reason: stray.reason });
    }
  };

  /**
   * Wait until the line has been silent for `quietMs`, or give up and say so. `timedOut` is
   * separate from `achieved` on purpose: a line that has never spoken and a line that would not
   * stop both leave nothing to report, and writing into the second is the collision this whole
   * tool exists to measure.
   */
  const waitForQuiet = (quietMs: number, quietWaitMs: number): Promise<{ achieved: number | null; waited: number; timedOut: boolean }> => {
    const startedNs = opts.deps.monoNs();
    return new Promise((resolve) => {
      const check = (): void => {
        const quiet = quietMsNow();
        const waited = ms(opts.deps.monoNs() - startedNs);
        if (quiet === null || quiet >= quietMs) { resolve({ achieved: quiet, waited, timedOut: false }); return; }
        if (waited >= quietWaitMs) { resolve({ achieved: quiet, waited, timedOut: true }); return; }
        opts.deps.setTimeout(check, QUIET_POLL_MS);
      };
      check();
    });
  };

  const waitForSilentQuery = (waitMs: number): Promise<number | null> =>
    new Promise((resolve) => {
      const wake = (device: number | null): void => { opts.deps.clearTimeout(timer); resolve(device); };
      gateWaiters.add(wake);
      const timer = opts.deps.setTimeout(() => {
        if (gateWaiters.delete(wake)) resolve(null);
      }, Math.max(0, waitMs));
    });

  const waitForReply = (mask: Mask | null, fromNs: bigint, directMs: number, pollingMs: number): Promise<{ frame: BusFrame | null; window: "direct" | "polling" | null }> =>
    new Promise((resolve) => {
      const waiter: Waiter = {
        mask,
        fromMonoNs: fromNs,
        directUntilNs: fromNs + BigInt(Math.max(0, directMs)) * 1_000_000n,
        settle: (frame) => {
          opts.deps.clearTimeout(timer);
          if (!frame) { resolve({ frame: null, window: null }); return; }
          resolve({ frame, window: frame.monoNs <= waiter.directUntilNs ? "direct" : "polling" });
        },
      };
      waiters.add(waiter);
      const timer = opts.deps.setTimeout(() => {
        if (waiters.delete(waiter)) waiter.settle(null);
      }, Math.max(directMs, pollingMs));
    });

  const send = async (request: ControlRequest): Promise<ControlReply> => {
    const hex = typeof request.hex === "string" ? request.hex.trim().toLowerCase() : "";
    const armed = request.arm === true;
    const verdict = checkOutgoing({ hex, armed, phase: Number(request.phase ?? 1), allowAll: request.allowAll === true });
    if (!verdict.ok) {
      opts.session.record("tx_refused", { hex, reason: verdict.reason });
      return { ok: false, outcome: "refused", hex, reason: verdict.reason };
    }
    if (!verdict.write) {
      opts.session.record("tx_dry_run", { hex });
      return { ok: true, outcome: "dry_run", hex, bytes: verdict.bytes.byteLength };
    }
    const outgoing = verdict.bytes;

    let mask: Mask | null = null;
    if (typeof request.expect === "string") {
      const parsed = parseMask(request.expect);
      if (!parsed.ok) return { ok: false, outcome: "refused", hex, reason: `bad --expect mask: ${parsed.reason}` };
      mask = parsed.mask;
    }

    const quietMs = Number(request.quietMs ?? DEFAULT_QUIET_MS);
    const quietWaitMs = Number(request.quietWaitMs ?? DEFAULT_QUIET_WAIT_MS);
    const directMs = Number(request.directMs ?? DEFAULT_DIRECT_MS);
    const pollingMs = Number(request.pollingMs ?? DEFAULT_POLLING_MS);

    if (sendInFlight) {
      return { ok: false, outcome: "busy", hex, reason: "another send is in flight on this run" };
    }
    sendInFlight = true;
    try {
      return await writeAndListen();
    } finally {
      sendInFlight = false;
    }

    async function writeAndListen(): Promise<ControlReply> {
    if (request.gate === "silent-query") {
      const device = await waitForSilentQuery(Number(request.gateWaitMs ?? DEFAULT_GATE_WAIT_MS));
      if (device === null) {
        opts.session.record("tx_skipped", { hex, reason: "no_gate_window", gate: "silent-query" });
        return {
          ok: true, outcome: "no_gate_window", hex, gate: "silent-query",
          note: "no unanswered query came by; nothing was written",
        };
      }
      return writeNow({ achieved: null, waited: 0 }, { gate: "silent-query", gateDevice: device.toString(16).padStart(2, "0") });
    }
    const quiet = await waitForQuiet(quietMs, quietWaitMs);
    if (quiet.timedOut) {
      opts.session.record("tx_skipped", { hex, reason: "no_quiet_window", quietMs, quietWaitedMs: quiet.waited });
      return {
        ok: true, outcome: "no_quiet_window", hex,
        quietMs, quietWaitedMs: quiet.waited,
        note: "a frame written into traffic is a collision, not a measurement",
      };
    }

    return writeNow(quiet, {});

    }

    async function writeNow(
      quiet: { achieved: number | null; waited: number },
      extra: Record<string, unknown>,
    ): Promise<ControlReply> {
    // How long since a frame matching `expect` last appeared, before we wrote anything. A poll
    // landing inside the direct window by chance is roughly a one-in-fourteen event at this
    // bus's rate, and this is what lets an analysis tell "arrived in the window" from "arrived
    // because of us".
    const lastMatching = mask === null ? undefined : lastMatchingMonoNs(mask);

    let stamps;
    try {
      stamps = await opts.link.write(outgoing);
    } catch (error) {
      const message = error instanceof Error ? error.message : "write failed";
      opts.session.record("tx_error", { hex, message });
      return { ok: false, outcome: "write_failed", hex, reason: message };
    }

    const matchingFrameAgoMs = lastMatching === undefined ? null : ms(stamps.flushedMonoNs - lastMatching);
    opts.session.record("tx", {
      hex,
      ...extra,
      achievedQuietMs: quiet.achieved,
      quietWaitedMs: quiet.waited,
      requestedMonoNs: stamps.requestedMonoNs,
      returnedMonoNs: stamps.returnedMonoNs,
      flushedMonoNs: stamps.flushedMonoNs,
      expect: request.expect ?? null,
      matchingFrameAgoMs,
    });

    const answer = mask === null
      ? { frame: null, window: null as null }
      : await waitForReply(mask, stamps.flushedMonoNs, directMs, pollingMs);

    const reply = answer.frame
      ? {
          hex: answer.frame.hex,
          window: answer.window,
          latencyMs: ms(answer.frame.monoNs - stamps.flushedMonoNs),
        }
      : null;

    opts.session.record("tx_result", {
      hex,
      replyHex: reply?.hex ?? null,
      window: reply?.window ?? null,
      latencyMs: reply?.latencyMs ?? null,
    });

    return {
      ok: true,
      outcome: "written",
      hex,
      ...extra,
      achievedQuietMs: quiet.achieved,
      quietWaitedMs: quiet.waited,
      matchingFrameAgoMs,
      reply,
      // Every figure above is an upper bound on what the device did. The write callback
      // guarantees only the kernel buffer, the path adds two WiFi round trips, and the gateway
      // holds each direction until the serial line has been quiet for its Gap Time.
      latencyIsUpperBound: true,
      gatewayFlushMs: Number(request.gatewayFlushMs ?? GATEWAY_FLUSH_MS),
      // Without this, `reply: null` after asking is indistinguishable from never having asked.
      waitedForReply: mask !== null,
    };
    }
  };

  const stop = async (reason: string): Promise<ControlReply> => {
    if (stopped) return { ok: true, ...summary, alreadyStopped: true };
    stopped = true;
    for (const waiter of [...waiters]) { waiters.delete(waiter); waiter.settle(null); }
    // The link closes first so that no read can land after the file has been finalised.
    opts.link.close();
    opts.session.record("stop", { reason });
    summary = await opts.session.close(reason);
    return { ok: true, ...summary };
  };

  return {
    async start(): Promise<void> {
      await opts.session.open();
      try {
        await opts.link.open();
      } catch (error) {
        const message = error instanceof Error ? error.message : "link failed to open";
        opts.session.record("error", { message });
        await opts.session.close("connect_failed");
        stopped = true;
        throw error;
      }
      opts.session.record("start", { run: opts.runName });
    },

    observe,

    async handle(request: ControlRequest): Promise<ControlReply> {
      const cmd = request.cmd;
      if (cmd === "stop") return stop(typeof request.reason === "string" ? request.reason : "stopped");
      if (stopped) return { ok: false, reason: `run ${opts.runName} is already stopped` };

      if (cmd === "status") {
        const stats = opts.session.stats();
        return {
          ok: true,
          run: opts.runName,
          connected: opts.link.isOpen(),
          quietMs: quietMsNow(),
          records: stats.records,
          rxBytes: stats.rxBytes,
          frames: opts.framer.stats().frames,
        };
      }

      if (cmd === "mark") {
        const label = request.label;
        if (typeof label !== "string" || label.trim().length === 0) {
          return { ok: false, reason: "mark needs a non-empty label" };
        }
        opts.session.record("mark", { label: label.trim() });
        return { ok: true, label: label.trim() };
      }

      if (cmd === "send") return send(request);

      return { ok: false, reason: `unknown command ${JSON.stringify(cmd)}` };
    },

    stop,
    isStopped: (): boolean => stopped,
  };
}
