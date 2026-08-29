// `run.ndjson` is the only original evidence this tool produces. Two rules follow from that.
//
// It never applies backpressure to the socket. The add-on pauses its transport while an append
// is in flight, which is what `Idle-Recovery Backpressure Data Loss` in the ledger describes,
// and pausing the read distorts exactly the timing being measured here. Records go to the
// stream as they are made and Node buffers them.
//
// When the writer falls behind, that is said out loud rather than hidden. A `backlog` record
// marks the moment it starts and a `backlog_cleared` record the moment it ends, so a run whose
// timings were affected by a slow disk can be recognised as such during analysis.

export type SessionSummary = {
  reason: string;
  records: number;
  rxBytes: number;
};

type WriteStreamLike = {
  readonly writableLength: number;
  write(chunk: string): boolean;
  end(callback?: () => void): void;
  on?(event: string, listener: (...args: unknown[]) => unknown): unknown;
};

export type SessionDeps = {
  nowMs(): number;
  monoNs(): bigint;
  createWriteStream(path: string): WriteStreamLike;
  mkdir(path: string): Promise<void>;
};

export type Session = ReturnType<typeof createSession>;

const DEFAULT_BACKLOG_BYTES = 64 * 1024;

export function createSession(opts: {
  runDir: string;
  deps: SessionDeps;
  redact: (text: string) => string;
  backlogBytes?: number;
  onWriterError?(error: Error): void;
}) {
  const backlogBytes = opts.backlogBytes ?? DEFAULT_BACKLOG_BYTES;
  let stream: WriteStreamLike | null = null;
  let closed = false;
  let records = 0;
  let rxBytes = 0;
  let congested = false;
  let writerError: Error | null = null;

  const emit = (kind: string, fields: Record<string, unknown>): void => {
    const line = JSON.stringify(
      { t: kind, wallMs: opts.deps.nowMs(), monoNs: opts.deps.monoNs().toString(), ...fields },
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    );
    stream!.write(`${opts.redact(line)}\n`);
    records += 1;
  };

  const record = (kind: string, fields: Record<string, unknown> = {}): void => {
    if (closed || !stream) throw new Error("buslab session is closed");
    // Checked before the record so the marker sits ahead of the records it explains.
    const behind = stream.writableLength > backlogBytes;
    if (behind && !congested) {
      congested = true;
      emit("backlog", { writableLength: stream.writableLength, backlogBytes });
    } else if (!behind && congested) {
      congested = false;
      emit("backlog_cleared", {});
    }
    if (kind === "rx" && typeof fields.byteLength === "number") rxBytes += fields.byteLength;
    emit(kind, fields);
  };

  return {
    async open(): Promise<void> {
      await opts.deps.mkdir(opts.runDir);
      stream = opts.deps.createWriteStream(`${opts.runDir}/run.ndjson`);
      // Without this the first write failure is an unhandled 'error' event and the process
      // dies mid-run, taking the clean close with it. The run is finished either way, but
      // the operator learns why instead of finding a truncated file.
      stream.on?.("error", (error: unknown) => {
        writerError = error instanceof Error ? error : new Error("run writer failed");
        closed = true;
        opts.onWriterError?.(writerError);
      });
    },
    record,
    stats: (): { records: number; rxBytes: number } => ({ records, rxBytes }),
    writerError: (): Error | null => writerError,
    async close(reason: string): Promise<SessionSummary> {
      if (writerError && stream) {
        closed = true;
        const failed = stream;
        stream = null;
        await new Promise<void>((resolve) => { failed.end(() => resolve()); });
        return { reason, records, rxBytes };
      }
      if (closed || !stream) return { reason, records, rxBytes };
      record("close", { reason });
      closed = true;
      const active = stream;
      await new Promise<void>((resolve) => { active.end(() => resolve()); });
      return { reason, records, rxBytes };
    },
  };
}

/**
 * A recorder that refuses quietly. `record` throws on a closed run by design, and the link
 * calls it from inside socket listeners: a throw there is an uncaught exception during
 * shutdown, which is the worst moment to lose the process. What is dropped is announced.
 */
export function createSafeRecorder(
  session: Pick<Session, "record">,
  onDropped: (kind: string, error: Error) => void,
): (kind: string, fields?: Record<string, unknown>) => boolean {
  return (kind, fields = {}) => {
    try {
      session.record(kind, fields);
      return true;
    } catch (error) {
      onDropped(kind, error instanceof Error ? error : new Error("record failed"));
      return false;
    }
  };
}
