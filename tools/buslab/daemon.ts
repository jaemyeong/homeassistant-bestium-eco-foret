// The daemon holds the socket open across commands. A tool that reconnected for each command
// could not answer "what arrived 200 ms after the write", and that question is the whole
// measurement. Commands arrive as one JSON object per line over a unix socket; this module
// owns the protocol and the wiring, and `main.ts` owns the socket that carries them.

import type { Link } from "./link.ts";
import type { Session, SessionSummary } from "./session.ts";

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
};

export function createDaemon(opts: {
  runName: string;
  session: Session;
  link: Link;
  deps: DaemonDeps;
}) {
  let stopped = false;
  let summary: SessionSummary | null = null;

  const quietMs = (): number | null => {
    const last = opts.link.lastRxMonoNs();
    if (last === null) return null;
    return Number((opts.deps.monoNs() - last) / 1_000_000n);
  };

  const stop = async (reason: string): Promise<ControlReply> => {
    if (stopped) return { ok: true, ...summary, alreadyStopped: true };
    stopped = true;
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
          quietMs: quietMs(),
          records: stats.records,
          rxBytes: stats.rxBytes,
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

      return { ok: false, reason: `unknown command ${JSON.stringify(cmd)}` };
    },

    stop,
    isStopped: (): boolean => stopped,
  };
}
