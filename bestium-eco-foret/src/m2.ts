import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createConnection } from "node:net";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes as secureRandomBytes } from "node:crypto";

import { createCaptureRecorder, type CaptureRecord } from "./capture.ts";
import {
  createCaptureStore,
  type CaptureFileMetadata,
  type CaptureStore,
  type StoreFileMetadata,
} from "./capture-store.ts";
import { renderAppHtml } from "./ui.ts";
import { DEFAULT_OPTIONS_PATH, parseM2Settings, type ParsedSettings } from "./settings.ts";
import { createProtocolDebugMonitor, encodeSemanticAction } from "./protocol-debug.ts";
import { createIntentQueue, expandAction, intentKey, isConfirmed, isQueueable, isRetryableRefusal } from "./tx-queue.ts";

export { DEFAULT_OPTIONS_PATH, parseM2Settings };
export type { ParsedSettings };

type TimerToken = unknown;
type Transport = {
  on(event: string, listener: (...args: unknown[]) => unknown): unknown;
  once?(event: string, listener: (...args: unknown[]) => unknown): unknown;
  off(event: string, listener: (...args: unknown[]) => unknown): unknown;
  removeAllListeners(): unknown;
  pause?(): unknown;
  resume?(): unknown;
  setTimeout?(timeoutMs: number): unknown;
  destroy(): unknown;
  write?(chunk: Uint8Array, callback?: (error?: Error | null) => void): boolean;
};

export type CapturePhase = "starting" | "running" | "finalizing" | "stopped";

export type CaptureBounds = {
  ew11_host: string;
  ew11_port: number;
  connect_timeout_ms: number;
  idle_timeout_ms: number;
  capture_duration_ms: number;
  maximum_bytes: number;
  maximum_records: number;
};

export type CaptureSummary = {
  startedAtMs: number;
  elapsedMs: number;
  limitMs: number;
  byteCount: number;
  recordCount: number;
  file: CaptureFileMetadata | null;
  preview: CaptureRecord[];
  phase: CapturePhase;
  bounds: CaptureBounds;
  generation?: number;
  rxByteEpoch?: number;
  lastRxByteAtMs?: number;
  lastValidFrameAtMs?: number;
  validFrameEpoch?: number;
  validFrameGeneration?: number;
  lastValidSevenFFrameAtMs?: number;
  validSevenFFrameGeneration?: number;
  readEpoch?: number;
  lastResumeAtMs?: number;
  protocol?: Record<string, unknown>;
};

export type CoordinatorResult = CaptureSummary & {
  reason: string;
  stoppedAtMs: number;
};

type RuntimeCoordinator = {
  start(): Promise<void>;
  stop(): Promise<CoordinatorResult>;
  getState(): CaptureSummary & { state: "running" | "stopped"; lastResult?: CoordinatorResult };
  getTransport(): Transport | null;
  getTxState(): {
    connected: boolean;
    pendingAppend: boolean;
    generation: number;
    rxByteEpoch: number;
    lastRxByteAtMs: number;
    lastValidFrameAtMs: number;
    validFrameEpoch: number;
    validFrameGeneration: number;
    lastValidSevenFFrameAtMs: number;
    validSevenFFrameGeneration: number;
    readEpoch: number;
    lastResumeAtMs: number;
    phase: CapturePhase;
    sevenFProof?: SevenFProof;
  };
};

const INGRESS_PEER_ALLOWED = "172.30.32.2";
const PROGRESS_INTERVAL_MS = 3_600_000;
/** How long to wait before each relink attempt. The last value repeats from then on. */
const RECONNECT_BACKOFF_MS = [0, 1_000, 2_000, 5_000, 15_000, 30_000] as const;

type FakeReq = {
  method: string;
  url: string;
  socket: { remoteAddress?: string };
  headers?: Record<string, string | undefined>;
};

type FakeRes = {
  statusCode: number;
  headers: Map<string, string>;
  setHeader(name: string, value: string): unknown;
  writeHead(code: number): void;
  write?(chunk: string | Uint8Array): boolean;
  end(chunk?: string): void;
  once?(event: string, listener: (...args: unknown[]) => unknown): unknown;
  off?(event: string, listener: (...args: unknown[]) => unknown): unknown;
  destroy?(): unknown;
  writableEnded?: boolean;
};
type AnyRecord = Record<string, any>;

type SevenFProof = {
  generation: number;
  action: string;
  frames: string[];
  completedAtMs: number;
};

const bytesToHex = (value: Uint8Array): string => Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
const bytesToBase64Url = (value: Uint8Array): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let encoded = "";
  for (let index = 0; index < value.length; index += 3) {
    const first = value[index] ?? 0;
    const second = value[index + 1] ?? 0;
    const third = value[index + 2] ?? 0;
    encoded += alphabet[first >> 2];
    encoded += alphabet[((first & 3) << 4) | (second >> 4)];
    encoded += alphabet[((second & 15) << 2) | (third >> 6)];
    encoded += alphabet[third & 63];
  }
  const remainder = value.length % 3;
  if (remainder === 1) encoded = encoded.slice(0, -2);
  if (remainder === 2) encoded = encoded.slice(0, -1);
  return encoded.replace(/\+/g, "-").replace(/\//g, "_");
};

type AppLogger = {
  info(event: string, summary: Record<string, unknown>): void;
  error(event: string, summary: Record<string, unknown>): void;
};

function createConsoleLogger(): AppLogger {
  return {
    info(event, summary) {
      console.info(`[capture] ${event}`, JSON.stringify(summary));
    },
    error(event, summary) {
      console.error(`[capture] ${event}`, JSON.stringify(summary));
    },
  };
}

function createMemoryStore(): CaptureStore {
  let active = false;
  let lines: string[] = [];
  let lastFile: CaptureFileMetadata | null = null;
  return {
    async begin() {
      active = true;
      lines = [];
      lastFile = null;
    },
    async append(line) {
      if (!active) throw new Error("capture store is not active");
      lines.push(line);
    },
    async finalize() {
      active = false;
      lastFile = {
        name: "capture.ndjson",
        sizeBytes: new TextEncoder().encode(lines.join("")).byteLength,
        finalized: true,
      };
      return lastFile;
    },
    async recover() {
      return null;
    },
    createReadStream() {
      const snapshot = lastFile ? [...lines] : [];
      return (async function* () {
        for (const line of snapshot) yield line;
      })();
    },
  };
}

function summaryForLog(summary: CaptureSummary): Record<string, unknown> {
  return {
    startedAtMs: summary.startedAtMs,
    elapsedMs: summary.elapsedMs,
    limitMs: summary.limitMs,
    byteCount: summary.byteCount,
    recordCount: summary.recordCount,
    file: summary.file?.name ?? null,
  };
}

export function normalizeIngressPeer(remoteAddress: string | undefined): string | null {
  if (typeof remoteAddress !== "string" || remoteAddress.length === 0) return null;
  if (remoteAddress === INGRESS_PEER_ALLOWED) return INGRESS_PEER_ALLOWED;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(remoteAddress);
  return mapped?.[1] === INGRESS_PEER_ALLOWED ? INGRESS_PEER_ALLOWED : null;
}

export function createServerResponseAdapter(response: ServerResponse): FakeRes {
  return {
    statusCode: response.statusCode,
    headers: new Map<string, string>(),
    setHeader: (name, value) => response.setHeader(name, value),
    writeHead: (code) => {
      response.writeHead(code);
    },
    write: response.write.bind(response),
    end: (body) => {
      response.end(body);
    },
    once: response.once.bind(response),
    off: response.off.bind(response),
    destroy: response.destroy.bind(response),
    get writableEnded() {
      return response.writableEnded;
    },
  };
}

function metadataFromRecovered(file: StoreFileMetadata, settings: ParsedSettings): CoordinatorResult {
  const stoppedAtMs = Date.now();
  return {
    reason: file.reason,
    startedAtMs: 0,
    elapsedMs: 0,
    limitMs: settings.capture_duration_ms,
    byteCount: 0,
    recordCount: 0,
    stoppedAtMs,
    file: {
      name: file.name,
      sizeBytes: file.sizeBytes,
      finalized: file.finalized,
    },
    preview: [],
    phase: "stopped",
    bounds: {
      ew11_host: settings.ew11_host,
      ew11_port: settings.ew11_port,
      connect_timeout_ms: settings.connect_timeout_ms,
      idle_timeout_ms: settings.idle_timeout_ms,
      capture_duration_ms: settings.capture_duration_ms,
      maximum_bytes: settings.maximum_bytes,
      maximum_records: settings.maximum_records,
    },
  };
}

export function createBoundedCaptureCoordinator(opts: {
  settings: ParsedSettings;
  createTransport: () => Transport;
  nowMs(): number;
  setTimeout(fn: () => void, delayMs: number): TimerToken;
  clearTimeout(id: TimerToken): void;
  store?: CaptureStore;
  logger?: AppLogger;
  initialResult?: CoordinatorResult;
}): RuntimeCoordinator {
  const settings = opts.settings;
  const store = opts.store ?? createMemoryStore();
  const logger = opts.logger ?? createConsoleLogger();
  const bounds: CaptureBounds = {
    ew11_host: settings.ew11_host,
    ew11_port: settings.ew11_port,
    connect_timeout_ms: settings.connect_timeout_ms,
    idle_timeout_ms: settings.idle_timeout_ms,
    capture_duration_ms: settings.capture_duration_ms,
    maximum_bytes: settings.maximum_bytes,
    maximum_records: settings.maximum_records,
  };

  // Two lifecycles, not one.
  //
  // `phase` is the link: the socket to the gateway, the decoder that reads it, and the
  // generation counter that invalidates confirmations across a reconnect. The app opens it at
  // startup and keeps it open, because control and observation are what the page is for.
  //
  // `recording` is the capture file, which the operator starts and stops. It rides on the
  // link and nothing depends on it except the file itself. Until now one `start()` opened
  // both, so nothing decoded and nothing sent until somebody started a capture — the send
  // gate literally carried "capture is not running" as a reason.
  let phase: CapturePhase = "stopped";
  let recording: "off" | "opening" | "open" = "off";
  let transport: Transport | null = null;
  let connectTimeoutId: TimerToken | null = null;
  let runningTimeoutId: TimerToken | null = null;
  let progressTimeoutId: TimerToken | null = null;
  let connected = false;
  let reconnecting = false;
  /** Escalating waits so a gateway that is down does not become a reconnect loop. */
  let reconnectAttempts = 0;
  let reconnectTimeoutId: TimerToken | null = null;
  let startedAtMs = 0;
  let stoppedAtMs = 0;
  let byteCount = 0;
  let recordCount = 0;
  let preview: CaptureRecord[] = [];
  let recorder = createCaptureRecorder();
  let lastResult: CoordinatorResult | null = opts.initialResult ?? null;
  let finishPromise: Promise<CoordinatorResult> | null = null;
  let pendingAppend: Promise<void> | null = null;
  let storeActive = false;
  let lastFailure: Error | null = null;
  let generation = 0;
  let rxByteEpoch = 0;
  let lastRxByteAtMs = 0;
  let lastValidFrameAtMs = 0;
  let validFrameEpoch = 0;
  let validFrameGeneration = 0;
  let lastValidSevenFFrameAtMs = 0;
  let validSevenFFrameGeneration = 0;
  let readEpoch = 0;
  let lastResumeAtMs = 0;
  const protocol = createProtocolDebugMonitor({
    nowMs: opts.nowMs,
    staleAfterMs: Math.max(settings.tx_quiet_ms, 30_000),
  });
  type PendingStop = {
    promise: Promise<CoordinatorResult>;
    resolve(result: CoordinatorResult): void;
    reject(error: unknown): void;
    reason: string;
  };
  let pendingStop: PendingStop | null = null;
  const listeners: [string, (...args: unknown[]) => unknown][] = [];
  const takePendingStop = (): PendingStop | null => {
    const request = pendingStop;
    pendingStop = null;
    return request;
  };
  const getPhase = (): CapturePhase => phase;

  const currentSummary = (file: CaptureFileMetadata | null = null): CaptureSummary => {
    const end = phase === "running" ? opts.nowMs() : stoppedAtMs;
    return {
      startedAtMs,
      elapsedMs: startedAtMs > 0 ? Math.max(0, end - startedAtMs) : 0,
      limitMs: settings.capture_duration_ms,
      byteCount,
      recordCount,
      file,
      preview: [...preview],
      phase,
      bounds,
      generation,
      rxByteEpoch,
      lastRxByteAtMs,
      lastValidFrameAtMs,
      validFrameEpoch,
      validFrameGeneration,
      lastValidSevenFFrameAtMs,
      validSevenFFrameGeneration,
      readEpoch,
      lastResumeAtMs,
      protocol: protocol.snapshot(),
    };
  };

  // `state` has always meant "is a capture running", and it still does. The link has its own
  // field now rather than borrowing this one.
  const stateForPhase = (): "running" | "stopped" =>
    recording === "open" ? "running" : "stopped";

  const detachTransport = (target: Transport | null): void => {
    if (!target) return;
    for (const [event, listener] of listeners) target.off(event, listener);
    target.removeAllListeners();
    target.destroy();
    if (transport === target) {
      transport = null;
      connected = false;
      listeners.length = 0;
    }
  };

  const clearAll = (): void => {
    if (connectTimeoutId !== null) {
      opts.clearTimeout(connectTimeoutId);
      connectTimeoutId = null;
    }
    if (runningTimeoutId !== null) {
      opts.clearTimeout(runningTimeoutId);
      runningTimeoutId = null;
    }
    if (progressTimeoutId !== null) {
      opts.clearTimeout(progressTimeoutId);
      progressTimeoutId = null;
    }
    // A relink waiting to fire would hold the event loop open past shutdown and, worse, put
    // a socket back after the caller asked for the link to be gone.
    if (reconnectTimeoutId !== null) {
      opts.clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }
    reconnecting = false;
    detachTransport(transport);
    listeners.length = 0;
    connected = false;
  };

  const scheduleProgress = (): void => {
    progressTimeoutId = opts.setTimeout(() => {
      progressTimeoutId = null;
      if (phase !== "running") return;
      logger.info("progress", summaryForLog(currentSummary()));
      scheduleProgress();
    }, PROGRESS_INTERVAL_MS);
  };

  const asError = (error: unknown, fallback: string): Error =>
    error instanceof Error ? error : new Error(fallback);

  const logFailure = (event: string, error: unknown, reason: string): Error => {
    const normalized = asError(error, reason);
    logger.error(event, {
      reason,
      byteCount,
      recordCount,
    });
    lastFailure = lastFailure ?? normalized;
    return normalized;
  };

  let requestFinish: (reason: string) => Promise<CoordinatorResult>;

  /**
   * Ends the capture file because it reached one of its own limits — duration, bytes or
   * records — and leaves the link untouched. All three bound the file, not the socket: a link
   * that closed itself after `capture_duration_ms` would take the page's control with it.
   */
  let endRecording: (reason: string) => Promise<CoordinatorResult>;

  const handleAppendFailure = (error: unknown): void => {
    const normalized = logFailure("append", error, "append");
    if (phase !== "stopped" && !finishPromise) {
      void requestFinish("error").catch(() => undefined);
    }
    void normalized;
  };

  const queueRecord = (record: CaptureRecord): void => {
    // No recording open, nothing to write. The link decodes either way; this is the one place
    // where the two lifecycles meet, and getting it wrong means every decoded frame throws
    // against a store that was never begun.
    if (recording !== "open" || !storeActive) return;
    const line = `${JSON.stringify(record)}\n`;
    const activeTransport = transport;
    if (!activeTransport || pendingAppend) return;
    try {
      activeTransport.pause?.();
      readEpoch += 1;
    } catch (error) {
      handleAppendFailure(error);
      return;
    }

    let append: Promise<void>;
    try {
      append = Promise.resolve(store.append(line));
    } catch (error) {
      handleAppendFailure(error);
      return;
    }
    pendingAppend = append;
    void append.then(
      () => {
        if (pendingAppend === append) pendingAppend = null;
        if (phase === "running" && transport) {
          try {
            transport.resume?.();
            readEpoch += 1;
            lastResumeAtMs = opts.nowMs();
          } catch (error) {
            handleAppendFailure(error);
          }
        }
      },
      (error: unknown) => {
        if (pendingAppend === append) pendingAppend = null;
        handleAppendFailure(error);
      },
    ).catch(() => undefined);
  };

  /**
   * Closes the capture file.
   *
   * `closeLink` says whether the socket goes with it. Stopping a recording leaves the link up
   * — that is the whole point of the split — while a transport error or a shutdown takes both.
   */
  const finishCapture = (reason: string, closeLink = true): Promise<CoordinatorResult> => {
    if (finishPromise) return finishPromise;

    stoppedAtMs = opts.nowMs();
    // The recording closes here, not when finalization resolves: from this moment no further
    // record is queued, and every caller that asks whether a capture is running gets the
    // answer the operator just gave. `storeActive` is what still has a file to finalize.
    recording = "off";
    if (closeLink) {
      phase = "finalizing";
      protocol.stop();
      clearAll();
    } else {
      // Only the recording's own timers stop; the connect and idle timers belong to the link.
      if (progressTimeoutId !== null) { opts.clearTimeout(progressTimeoutId); progressTimeoutId = null; }
      if (runningTimeoutId !== null) { opts.clearTimeout(runningTimeoutId); runningTimeoutId = null; }
    }
    const appendToAwait = pendingAppend;
    const summary: CoordinatorResult = {
      ...currentSummary(),
      reason,
      stoppedAtMs,
      phase: "finalizing",
    };
    lastResult = summary;
    logger.info("stop", summaryForLog(summary));

    const finishing = (async (): Promise<CoordinatorResult> => {
      let failure = lastFailure;
      try {
        if (appendToAwait) await appendToAwait;
      } catch (error) {
        failure = failure ?? logFailure("append", error, "append");
      }

      let file: CaptureFileMetadata | null = null;
      if (storeActive) {
        try {
          file = await store.finalize(summary);
        } catch (error) {
          failure = failure ?? logFailure("finalize", error, "finalize");
        }
      }

      storeActive = false;
      if (closeLink) {
        phase = "stopped";
      } else {
        // The link is still up, so a later recording must be able to start and finish. Only
        // a link that closed keeps its finish promise as the terminal answer.
        finishPromise = null;
      }
      const result: CoordinatorResult = {
        ...summary,
        file,
        phase: "stopped",
      };
      lastResult = result;

      if (file) {
        logger.info("finalize", {
          reason,
          stoppedAtMs,
          file: { name: file.name, sizeBytes: file.sizeBytes },
          byteCount,
          recordCount,
        });
      }
      if (failure) throw failure;
      return result;
    })();
    finishPromise = finishing;
    return finishing;
  };

  endRecording = (reason: string): Promise<CoordinatorResult> => {
    if (recording === "off") {
      return Promise.resolve(lastResult ?? { ...currentSummary(), reason, stoppedAtMs, phase });
    }
    if (finishPromise) return finishPromise;
    if (recording === "opening") return requestFinish(reason);
    return finishCapture(reason, false);
  };

  requestFinish = (reason: string): Promise<CoordinatorResult> => {
    if (finishPromise) return finishPromise;
    // A stop arriving while the store is still opening cannot finalize a file that does not
    // exist yet, so it waits for `beginRecording` to hand it the newly opened one. This used
    // to be keyed on the link's "starting", because the two lifecycles were one.
    if (phase === "starting" || recording === "opening") {
      if (pendingStop) return pendingStop.promise;
      let resolvePending!: (result: CoordinatorResult) => void;
      let rejectPending!: (error: unknown) => void;
      const promise = new Promise<CoordinatorResult>((resolve, reject) => {
        resolvePending = resolve;
        rejectPending = reject;
      });
      pendingStop = {
        promise,
        resolve: resolvePending,
        reject: rejectPending,
        reason,
      };
      return promise;
    }
    if (phase === "stopped") {
      if (lastFailure) return Promise.reject(lastFailure);
      if (lastResult) return Promise.resolve(lastResult);
    }
    return finishCapture(reason);
  };

  /**
   * Puts the link back after it drops, and ends any recording that was riding on it.
   *
   * A dropped socket used to end everything, which was right when the link belonged to a
   * capture: a capture is a finite job and losing the line ends it. A link is not finite — it
   * lives as long as the page does — so a gateway that reboots, a network that blinks, or an
   * EW11 that is not answering yet when Home Assistant starts the add-on all have to be
   * recovered from rather than surrendered to.
   *
   * The recording does end. Frames were lost, and a capture file with a hole in it is worse
   * than a short one: whoever analyses it later has no way to see the gap.
   */
  const relinkAfter = (reason: string): void => {
    if (reconnecting) return;
    reconnecting = true;
    const wasRecording = recording !== "off";
    const attempt = Math.min(reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1);
    const delayMs = RECONNECT_BACKOFF_MS[attempt]!;
    reconnectAttempts += 1;
    logger.info("relink", { reason, delayMs, attempt: reconnectAttempts, byteCount, recordCount });
    const finished = wasRecording
      ? endRecording(reason).catch(() => undefined)
      : Promise.resolve(undefined);
    void finished.then(() => {
      // The link may have been taken down deliberately while the recording was closing —
      // `stop()` does exactly that — and scheduling here would both hold the event loop open
      // and put a socket back that the caller asked to be gone.
      if (phase !== "running") { reconnecting = false; return; }
      if (reconnectTimeoutId !== null) opts.clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = opts.setTimeout(() => {
        reconnectTimeoutId = null;
        reconnecting = false;
        if (phase !== "running") return;
        try {
          detachTransport(transport);
          listeners.length = 0;
          connected = false;
          protocol.resetGeneration();
          attachTransport();
        } catch (error) {
          logFailure("relink", error, "relink");
          // Nothing else is going to retry, so schedule the next attempt from here.
          relinkAfter("relink_failed");
        }
      }, delayMs);
    });
  };

  const onConnectTimeout = (activeTransport: Transport): void => {
    if (phase === "running" && transport === activeTransport && !connected) {
      relinkAfter("connect_timeout");
    }
  };

  const onError = (activeTransport: Transport, _error?: unknown): void => {
    if (phase !== "running" || transport !== activeTransport) return;
    logger.error("transport", {
      reason: "transport",
      byteCount,
      recordCount,
    });
    relinkAfter("error");
  };

  const onClose = (activeTransport: Transport): void => {
    if (phase === "running" && transport === activeTransport) {
      relinkAfter("closed");
    }
  };

  const onConnect = (activeTransport: Transport): void => {
    if (phase !== "running" || transport !== activeTransport || connected) return;
    connected = true;
    reconnectAttempts = 0;
    if (connectTimeoutId !== null) {
      opts.clearTimeout(connectTimeoutId);
      connectTimeoutId = null;
    }
    try {
      activeTransport.setTimeout?.(settings.idle_timeout_ms);
      if (pendingAppend) activeTransport.pause?.();
    } catch (error) {
      onError(activeTransport, error);
      return;
    }
    if (runningTimeoutId === null && recording === "open") {
      // The duration limit bounds the capture file, not the link. A link that closed itself
      // after `capture_duration_ms` would take the page's control with it.
      runningTimeoutId = opts.setTimeout(() => {
        if (recording === "open") void endRecording("duration").catch(() => undefined);
      }, settings.capture_duration_ms);
    }
  };

  const onData = (activeTransport: Transport, chunk: unknown): void => {
    if (phase !== "running" || transport !== activeTransport || !connected) return;
    if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0) return;
    rxByteEpoch += 1;
    lastRxByteAtMs = opts.nowMs();
    const beforeSnapshot = protocol.snapshot();
    const beforeFrames = beforeSnapshot.validFrameCount ?? beforeSnapshot.frames.length;
    try {
      protocol.push(chunk);
    } catch {
      logger.error("protocol", { reason: "bounded parser input", byteCount, recordCount });
    }
    const afterSnapshot = protocol.snapshot();
    const afterFrames = afterSnapshot.validFrameCount ?? afterSnapshot.frames.length;
    const newFrameCount = Math.max(0, afterFrames - beforeFrames);
    if (newFrameCount > 0) {
      lastValidFrameAtMs = lastRxByteAtMs;
      validFrameEpoch += newFrameCount;
      validFrameGeneration = generation;
      const newFrames = afterSnapshot.frames.slice(-newFrameCount);
      if (newFrames.some((frame: AnyRecord) => typeof frame.rawHex === "string" && frame.rawHex.startsWith("7f"))) {
        lastValidSevenFFrameAtMs = lastRxByteAtMs;
        validSevenFFrameGeneration = generation;
      }
    }
    if (pendingAppend) return;

    // Everything below belongs to the capture file: the byte and record counts, the preview,
    // and the two limits that end it. A link with no recording open must do none of it.
    //
    // E2B guarded `queueRecord`, which is where the file is actually written, and left this
    // accounting running. So a link that had never recorded anything still counted its way to
    // `maximum_records` — about four minutes on this bus — and then called `requestFinish`,
    // which closed the link and with it the page's control. Starting and stopping a capture
    // reset the counters, which is why it looked like the split worked afterwards.
    if (recording !== "open") return;

    const remaining = settings.maximum_bytes - byteCount;
    if (remaining <= 0) {
      void endRecording("maximum_bytes").catch(() => undefined);
      return;
    }
    const accepted = chunk.byteLength > remaining ? chunk.slice(0, remaining) : chunk;
    const record = recorder(accepted, opts.nowMs());
    byteCount += accepted.byteLength;
    recordCount += 1;
    preview.push(record);
    if (preview.length > 20) preview = preview.slice(-20);
    queueRecord(record);

    if (byteCount >= settings.maximum_bytes) {
      void endRecording("maximum_bytes").catch(() => undefined);
    } else if (recordCount >= settings.maximum_records) {
      void endRecording("maximum_records").catch(() => undefined);
    }
  };

  const onIdleTimeout = (activeTransport: Transport): void => {
    if (phase !== "running" || transport !== activeTransport || !connected || reconnecting) return;
    if (pendingAppend) {
      try {
        activeTransport.setTimeout?.(settings.idle_timeout_ms);
      } catch (error) {
        onError(activeTransport, error);
      }
      return;
    }
    reconnecting = true;
    try {
      detachTransport(activeTransport);
      protocol.resetGeneration();
      attachTransport();
      logger.info("reconnect", {
        reason: "idle_timeout",
        byteCount,
        recordCount,
      });
    } catch (error) {
      logFailure("reconnect", error, "reconnect");
      void requestFinish("error").catch(() => undefined);
    } finally {
      reconnecting = false;
    }
  };

  function attachTransport(): void {
    const activeTransport = opts.createTransport();
    generation += 1;
    validFrameGeneration = 0;
    lastValidSevenFFrameAtMs = 0;
    validSevenFFrameGeneration = generation;
    protocol.start();
    transport = activeTransport;
    const connectListener = () => onConnect(activeTransport);
    const dataListener = (data: unknown) => onData(activeTransport, data);
    const errorListener = (error: unknown) => onError(activeTransport, error);
    const closeListener = () => onClose(activeTransport);
    const timeoutListener = () => onIdleTimeout(activeTransport);
    activeTransport.on("connect", connectListener);
    activeTransport.on("data", dataListener);
    activeTransport.on("error", errorListener);
    activeTransport.on("close", closeListener);
    activeTransport.on("timeout", timeoutListener);
    listeners.push(
      ["connect", connectListener],
      ["data", dataListener],
      ["error", errorListener],
      ["close", closeListener],
      ["timeout", timeoutListener],
    );
    connectTimeoutId = opts.setTimeout(
      () => onConnectTimeout(activeTransport),
      settings.connect_timeout_ms,
    );
  }

  /**
   * Opens the socket to the gateway and starts decoding. No file is touched.
   *
   * Everything reset here belongs to the link: the connection itself, the byte and frame
   * epochs a confirmation is judged against, and the generation counter that invalidates a
   * pending confirmation when the transport is replaced. A capture starting must not bump the
   * generation — that would discard confirmations for writes already on the bus.
   */
  const openLink = async (): Promise<void> => {
    if (phase !== "stopped") throw new Error(`link phase is ${phase}`);
    phase = "starting";
    lastFailure = null;
    connected = false;
    rxByteEpoch = 0;
    lastRxByteAtMs = 0;
    lastValidFrameAtMs = 0;
    validFrameEpoch = 0;
    validFrameGeneration = generation;
    lastValidSevenFFrameAtMs = 0;
    validSevenFFrameGeneration = generation;
    readEpoch += 1;
    lastResumeAtMs = opts.nowMs();
    protocol.resetGeneration();
    try {
      attachTransport();
    } catch (error) {
      // A transport factory that throws leaves nothing attached, so the link is simply down
      // again. The failure is recorded the same way any other start failure is, so a caller
      // asking what happened gets an answer rather than an empty state.
      phase = "stopped";
      clearAll();
      stoppedAtMs = opts.nowMs();
      logFailure("start", error, "start");
      lastResult = { ...currentSummary(), reason: "error", stoppedAtMs, phase: "stopped" };
      throw error;
    }
    phase = "running";
  };

  /** Opens the capture file. The link is left alone; it may already be carrying frames. */
  const beginRecording = async (): Promise<void> => {
    if (recording !== "off") throw new Error(`a recording is already ${recording}`);
    // `store.begin()` can take a while, and a second request arriving in that window used to
    // queue behind it and open a second file. The intermediate state is what refuses it.
    recording = "opening";
    startedAtMs = opts.nowMs();
    stoppedAtMs = 0;
    byteCount = 0;
    recordCount = 0;
    preview = [];
    recorder = createCaptureRecorder();
    lastResult = null;
    finishPromise = null;
    pendingAppend = null;
    storeActive = false;
    pendingStop = null;
    logger.info("start", summaryForLog(currentSummary()));
    try {
      await store.begin(startedAtMs);
    } catch (error) {
      recording = "off";
      throw error;
    }
    storeActive = true;
    recording = "open";
    const request = takePendingStop();
    if (request) {
      try {
        request.resolve(await finishCapture(request.reason));
      } catch (error) {
        request.reject(error);
        throw error;
      }
      return;
    }
    scheduleProgress();
  };

  /** Closes the capture file and returns its metadata. The link stays up. */
  const stopRecording = async (): Promise<CoordinatorResult> => {
    if (recording === "off") {
      return lastResult ?? { ...currentSummary(), reason: "stopped", stoppedAtMs, phase };
    }
    return finishCapture("stopped", false);
  };

  // Kept for the tests and callers that predate the split: open the link, then the recording.
  const start = async (): Promise<void> => {
    // A link that will not open is not a recording that failed: there is no store to
    // finalize and nothing in flight to unwind. Letting this fall into the recovery below
    // made a refused `start()` await a finalize already running, which never returned.
    if (phase === "stopped") await openLink();
    else if (phase !== "running") throw new Error(`link phase is ${phase}`);
    // A second request arriving while the first is still opening is refused, not recovered
    // from: there is no half-built recording to unwind, and touching the state here would
    // reject the pending stop that belongs to the request already in flight.
    if (recording !== "off") throw new Error(`a recording is already ${recording}`);
    try {
      await beginRecording();
    } catch (error) {
      if (getPhase() !== "stopped" && storeActive) {
        try {
          await finishCapture("error");
        } catch {
          // The start error remains the caller-visible failure.
        }
      } else {
        phase = "stopped";
        protocol.stop();
        stoppedAtMs = opts.nowMs();
        logFailure("start", error, "start");
        lastResult = {
          ...currentSummary(),
          reason: "error",
          stoppedAtMs,
          phase: "stopped",
        };
      }
      takePendingStop()?.reject(error);
      throw error;
    }
  };

  return {
    start,
    openLink,
    beginRecording,
    stopRecording,
    async stop(): Promise<CoordinatorResult> {
      if (phase === "starting") return requestFinish("stopped");
      if (phase === "running") return requestFinish("stopped");
      if (finishPromise) return finishPromise;
      if (lastFailure) return Promise.reject(lastFailure);
      if (lastResult) return lastResult;

      stoppedAtMs = opts.nowMs();
      phase = "stopped";
      protocol.stop();
      lastResult = {
        ...currentSummary(),
        reason: "stopped",
        stoppedAtMs,
        phase: "stopped",
      };
      return lastResult;
    },
    getState() {
      // A recording in progress reports itself. Once it closes, the last result is the
      // answer — including the file it produced — whether or not the link is still up. Before
      // the split those were the same condition, so a stopped recording on a live link fell
      // through to the live summary and the finished file went missing from `/api/download`.
      if (recording === "open") return {
        state: "running" as const,
        ...currentSummary(),
      };
      const result = lastResult ?? {
        ...currentSummary(),
        reason: "stopped",
        stoppedAtMs,
        phase: "stopped" as const,
      };
      return {
        state: "stopped" as const,
        ...result,
        // The reported `phase` is the link's. A recording that has finished says so through
        // `state`, and the link it ran on may well still be up — that is the split.
        phase,
        lastResult: lastResult ?? undefined,
      };
    },
    getDevices(): { devices: Record<string, any>; generation: number } {
      return { devices: protocol.deviceState() as Record<string, any>, generation: protocol.currentGeneration() };
    },
    getTransport(): Transport | null {
      return transport;
    },
    getTxState() {
      const protocolState = protocol.snapshot();
      return {
        connected: phase === "running" && connected && transport !== null,
        unparsedByteCount: protocolState.unparsedByteCount ?? 0,
        link: phase === "running" ? "up" : phase === "starting" ? "connecting" : "down",
        recording,
        pendingAppend: pendingAppend !== null,
        generation,
        rxByteEpoch,
        lastRxByteAtMs,
        lastValidFrameAtMs,
        validFrameEpoch,
        validFrameGeneration,
        lastValidSevenFFrameAtMs,
        validSevenFFrameGeneration,
        readEpoch,
        lastResumeAtMs,
        phase,
        sevenFProof: protocolState.sevenFProof as SevenFProof | undefined,
      };
    },
  };
}

function endpointPath(url: string): string {
  return url.split("?", 1)[0] ?? url;
}

type TxReject = { outcome: string; reason: string; confirmed: false; deviceConfirmed: false; generation: number; journal?: TxJournalEntry[] };
type TxJournalEntry = { atMs: number; outcome: string; reason?: string; generation: number };

function txReject(reason: string, generation: number, journal: TxJournalEntry[]): TxReject {
  return { outcome: "rejected", reason, confirmed: false, deviceConfirmed: false, generation, journal: journal.slice(-32) };
}

function canonicalAction(action: unknown): string {
  return JSON.stringify(action, (_key, value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = value[key];
      return result;
    }, {});
  });
}

export function createTxCoordinator(opts: {
  settings: ParsedSettings;
  nowMs(): number;
  setTimeout(fn: () => void, delayMs: number): TimerToken;
  clearTimeout(id: TimerToken): void;
  randomBytes?(size: number): Uint8Array;
  challengeTtlMs?: number;
  maxChallenges?: number;
  getCurrentUserId(): string | undefined;
  getTransport(): Transport | null;
  getGeneration(): number;
  /**
   * The decoded device state and the generation it belongs to. Supplying it turns on the
   * send queue, retry and state-match confirmation; without it the coordinator writes once
   * and reports `socket_written_unconfirmed`, because it has nothing to confirm against.
   */
  getDevices?(): { devices: Record<string, any>; generation: number } | null;
  getRxState(): {
    connected?: boolean;
    pendingAppend?: boolean;
    rxByteEpoch?: number;
    lastRxByteAtMs?: number;
    lastValidFrameAtMs?: number;
    validFrameEpoch?: number;
    validFrameGeneration?: number;
    lastValidSevenFFrameAtMs?: number;
    validSevenFFrameGeneration?: number;
    link?: "down" | "connecting" | "up";
    recording?: "off" | "open";
    readEpoch?: number;
    lastResumeAtMs?: number;
    phase?: CapturePhase | string;
    sevenFProof?: SevenFProof;
    txByteEpoch?: number;
    tailHash?: string;
  };
  journalLimit?: number;
}) {
  const settings = opts.settings;
  const journal: TxJournalEntry[] = [];
  const challenges = new Map<string, {
    action: string;
    frames: string;
    userId: string;
    generation: number;
    rxByteEpoch: number;
    readEpoch: number;
    txByteEpoch: number;
    tailHash: string;
    schedule: string;
    readinessRevision: string;
    expiresAtMs: number;
    consumed: boolean;
  }>();
  const challengeTtlMs = Math.max(1, Math.min(30_000, opts.challengeTtlMs ?? 30_000));
  const maxChallenges = Math.max(1, Math.min(32, opts.maxChallenges ?? 32));
  const journalLimit = Math.max(1, Math.min(64, opts.journalLimit ?? 32));
  const randomBytes = opts.randomBytes ?? ((size: number) => secureRandomBytes(size));
  let inFlight = false;
  let lastNormalAttempt = -Infinity;
  let lastSpeculativeAttempt = -Infinity;
  let lastUnsafeAttempt = -Infinity;
  let transportGeneration = opts.getGeneration();
  const quarantined = new Set<number>();
  let outboundGeneration = transportGeneration;
  let outboundTail = new Uint8Array();
  let outboundEpoch = 0;
  let generationRxBaseline = opts.getRxState()?.rxByteEpoch ?? 0;
  let generationNeedsRx = false;
  let generationValidFrameBaseline = opts.getRxState()?.validFrameEpoch;
  let generationNeedsValidFrame = generationValidFrameBaseline !== undefined ? false : generationNeedsRx;
  let operationEpoch = 0;
  let abortInFlight: (() => void) | null = null;
  const waiters = new Set<{ timer: TimerToken; resolve(): void }>();
  const hashTail = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");
  const purgeExpiredChallenges = (): void => {
    const now = opts.nowMs();
    for (const [id, challenge] of challenges) if (challenge.expiresAtMs <= now) challenges.delete(id);
  };
  const syncGeneration = (): number => {
    const current = opts.getGeneration();
    if (current !== outboundGeneration) {
      const state = opts.getRxState() ?? {};
      generationRxBaseline = state.rxByteEpoch ?? 0;
      generationValidFrameBaseline = state.validFrameEpoch;
      const hasCurrentFrame = state.validFrameGeneration === current && (state.validFrameEpoch ?? 0) > 0;
      generationNeedsValidFrame = !hasCurrentFrame && (state.validFrameEpoch !== undefined || state.validFrameGeneration !== undefined);
      generationNeedsRx = !hasCurrentFrame && !generationNeedsValidFrame;
      outboundGeneration = current;
      outboundTail = new Uint8Array();
      outboundEpoch = 0;
      challenges.clear();
    }
    purgeExpiredChallenges();
    return current;
  };
  // A fresh transport resets validFrameGeneration to 0, which means "no frame
  // observed yet in this generation", not "generation zero". Using that 0 as a
  // lookup key reports a quarantine that never happened and hides the real
  // blocker, so fall back to the generation actually in force.
  const quarantinedFor = (state?: { validFrameGeneration?: number }): boolean => {
    const observed = state?.validFrameGeneration;
    return quarantined.has(typeof observed === "number" && observed > 0 ? observed : opts.getGeneration());
  };
  const hasCurrentGenerationRx = (state: { rxByteEpoch?: number; validFrameEpoch?: number; validFrameGeneration?: number }): boolean => {
    if (state.validFrameEpoch !== undefined || state.validFrameGeneration !== undefined) {
      return state.validFrameGeneration === outboundGeneration && (state.validFrameEpoch ?? 0) > 0;
    }
    if (generationNeedsValidFrame) {
      if (state.validFrameEpoch === undefined || state.validFrameEpoch <= (generationValidFrameBaseline ?? 0)) return false;
      if (state.validFrameGeneration !== undefined && state.validFrameGeneration !== outboundGeneration) return false;
      return true;
    }
    return !generationNeedsRx || (state.rxByteEpoch ?? 0) > generationRxBaseline;
  };
  const writeJournal = (outcome: string, reason?: string): void => {
    journal.push({ atMs: opts.nowMs(), outcome, reason, generation: opts.getGeneration() });
    while (journal.length > journalLimit) journal.shift();
  };
  const readinessRevisionFor = (state: AnyRecord): string => createHash("sha256").update(JSON.stringify({
    generation: state.generation,
    rxByteEpoch: state.rxByteEpoch,
    readEpoch: state.readEpoch,
    validFrameEpoch: state.validFrameEpoch,
    validFrameGeneration: state.validFrameGeneration,
    phase: state.phase,
    connected: state.connected,
    pendingAppend: state.pendingAppend,
    currentGenerationRx: state.currentGenerationRx,
    fresh: state.fresh,
    quiet: state.quiet,
    inFlight: state.inFlight,
    quarantined: state.quarantined,
    txByteEpoch: state.txByteEpoch,
    tailHash: state.tailHash,
    proof: state.sevenFProof ? {
      generation: state.sevenFProof.generation,
      action: state.sevenFProof.action,
      frames: state.sevenFProof.frames,
      completedAtMs: state.sevenFProof.completedAtMs,
    } : null,
  })).digest("hex").slice(0, 64);
  const currentState = () => {
    syncGeneration();
    const state = opts.getRxState() ?? {};
    const now = opts.nowMs();
    const lastValidFrameAtMs = state.lastValidFrameAtMs ?? state.lastRxByteAtMs ?? 0;
    const lastRxByteAtMs = state.lastRxByteAtMs ?? 0;
    const lastResumeAtMs = state.lastResumeAtMs ?? 0;
    const currentGenerationRx = hasCurrentGenerationRx(state);
    const fresh = lastValidFrameAtMs > 0 && now - lastValidFrameAtMs <= Math.max(45_000, settings.idle_timeout_ms + settings.tx_write_timeout_ms);
    // The line is busy when the bus last spoke, not when we resumed our own socket after
    // writing a capture record to disk. Counting the resume made every append look like
    // traffic, and on this bus an append follows every read.
    const quietAt = lastRxByteAtMs;
    const quiet = quietAt > 0 && now - quietAt >= settings.tx_quiet_ms;
    const result = {
      generation: outboundGeneration,
      // A caller that predates the split reports `phase`, where "running" meant the one
      // combined lifecycle, or reports neither and speaks only of `connected`. Both said the
      // same thing this field says: there is a socket, and frames are coming through it.
      link: state.link
        ?? (state.phase === "running" ? "up"
          : state.phase === "starting" ? "connecting"
          : state.phase !== undefined ? "down"
          : state.connected === true ? "up" : "down"),
      recording: state.recording ?? (state.phase === "running" ? "open" : "off"),
      connected: state.connected === true,
      pendingAppend: state.pendingAppend === true,
      rxByteEpoch: state.rxByteEpoch ?? 0,
      lastRxByteAtMs,
      lastValidFrameAtMs,
      validFrameEpoch: state.validFrameEpoch,
      validFrameGeneration: state.validFrameGeneration,
      lastValidSevenFFrameAtMs: state.lastValidSevenFFrameAtMs ?? 0,
      validSevenFFrameGeneration: state.validSevenFFrameGeneration,
      readEpoch: state.readEpoch ?? 0,
      lastResumeAtMs,
      phase: typeof state.phase === "string" ? state.phase : "running",
      sevenFProof: state.sevenFProof,
      currentGenerationRx,
      fresh,
      quiet,
      inFlight,
      quarantined: quarantinedFor(state),
      externalTxByteEpoch: state.txByteEpoch ?? 0,
      externalTailHash: state.tailHash ?? "",
      txByteEpoch: (state.txByteEpoch ?? 0) + outboundEpoch,
      tailHash: `${state.tailHash ?? ""}:${hashTail(outboundTail)}`,
    };
    // Outside `result`, so it stays out of the readiness hash: a byte of line noise does not
    // change whether a send is allowed, and folding it in would churn the revision on every read.
    return { ...result, readinessRevision: readinessRevisionFor(result), unparsedByteCount: state.unparsedByteCount ?? 0 };
  };
  const hasCurrentSevenFProof = (
    state: ReturnType<typeof currentState>,
    generation: number,
    action?: unknown,
    frames?: Uint8Array[],
  ): boolean => {
    const proof = state.sevenFProof;
    const proofAt = proof?.completedAtMs ?? 0;
    if (!Number.isFinite(proofAt) || proofAt <= 0) return false;
    if (proof?.generation !== generation) return false;
    if (opts.nowMs() - proofAt > Math.max(45_000, settings.idle_timeout_ms + settings.tx_write_timeout_ms)) return false;
    if (typeof action !== "object" || !action) return false;
    const candidate = action as AnyRecord;
    const expectedAction = `${String(candidate.target ?? "")}:${String(candidate.state ?? "")}`;
    if (proof.action !== expectedAction) return false;
    if (!frames) return true;
    return proof.frames.length === frames.length && proof.frames.every((value, index) => value === frameHex(frames[index]!));
  };
  const frameHex = (frame: Uint8Array): string => bytesToHex(frame);
  const framesFor = (encoded: AnyRecord): Uint8Array[] => {
    if (encoded.frame instanceof Uint8Array) return [encoded.frame];
    if (Array.isArray(encoded.frames) && encoded.frames.every((frame: unknown) => frame instanceof Uint8Array)) return encoded.frames as Uint8Array[];
    return [];
  };
  const recognizedFrames = new Set([
    "f70d011904401000020102b5ee",
    "f70b01190240110100b6ee", "f70b01190240110200b5ee",
    "f70b01190240120100b5ee", "f70b01190240120200b6ee",
    "f70b01190240130100b4ee", "f70b01190240130200b7ee",
    "f70b011b0243110300b5ee", "f70d013401411000a5040b35ee",
    "f70d01340141100006040b96ee", "f70d01340141100001040b91ee",
    "f70b011f0140100000b3ee", "f70b012b014011000086ee",
    "f70d011b04431100040000b2ee",
    "f70e011e024311040004ffffb6ee",
    "f70c011802401101010000b1ee", "f70c011802401101040000b4ee",
    "f70c011802401102010000b2ee", "f70c011802401103010000b3ee",
    "f70c011802401104010000b4ee", "f715011804401100040000040000040000040000aeee",
    "f70c011802401101011414b1ee",
    "7fb90000ee", "7fb40000ee", "7fba0000ee", "7fb70000ee", "7fb80000ee",
    "7f5f0000ee", "7f610000ee", "7f600000ee",
  ]);
  const wouldCrossRecognized = (frame: Uint8Array, exactAllowed: boolean): boolean => {
    const tailHex = frameHex(outboundTail);
    const proposedHex = frameHex(frame);
    const combined = `${tailHex}${proposedHex}`;
    for (const signature of recognizedFrames) {
      let offset = combined.indexOf(signature);
      while (offset >= 0) {
        const end = offset + signature.length;
        if (end > tailHex.length) {
          const exact = exactAllowed && offset === tailHex.length && end === combined.length && signature === proposedHex;
          if (!exact) return true;
        }
        offset = combined.indexOf(signature, offset + 1);
      }
    }
    const combinedBytes = new Uint8Array(outboundTail.length + frame.length);
    combinedBytes.set(outboundTail);
    combinedBytes.set(frame, outboundTail.length);
    const recognizedFamilies = new Set([0x18, 0x19, 0x1b, 0x1e, 0x1f, 0x2a, 0x2b, 0x34, 0x7e]);
    for (let start = 0; start + 4 < combinedBytes.length; start += 1) {
      if (combinedBytes[start] !== 0xf7) continue;
      const family = combinedBytes[start + 3];
      if (!recognizedFamilies.has(family)) continue;
      const declared = combinedBytes[start + 1];
      const lengths = [declared];
      if (family === 0x18 || family === 0x2a || family === 0x7e) lengths.push(declared + 1);
      for (const length of lengths) {
        if (length < 5 || start + length > combinedBytes.length || combinedBytes[start + length - 1] !== 0xee) continue;
        if (start + length <= outboundTail.length) continue;
        const exact = exactAllowed && start === outboundTail.length && length === frame.length;
        if (!exact) return true;
      }
    }
    for (let start = 0; start + 1 < combinedBytes.length; start += 1) {
      if (combinedBytes[start] !== 0x7f) continue;
      const end = start + 5;
      if (end > combinedBytes.length || combinedBytes[end - 1] !== 0xee) continue;
      if (end <= outboundTail.length) continue;
      const exact = exactAllowed && start === outboundTail.length && end === combinedBytes.length;
      if (!exact) return true;
    }
    return false;
  };
  const recordOutbound = (frame: Uint8Array): void => {
    const combined = new Uint8Array(outboundTail.length + frame.length);
    combined.set(outboundTail);
    combined.set(frame, outboundTail.length);
    outboundTail = combined.slice(-255);
    outboundEpoch += 1;
  };
  const evaluateReadiness = (action: unknown, encoded: AnyRecord, request: AnyRecord, state: ReturnType<typeof currentState>): { ready: boolean; reasons: string[]; readinessRevision: string } => {
    const reasons: string[] = [];
    const userId = typeof request.userId === "string" ? request.userId : "";
    const inferredAction = encoded.evidence === "inferred_candidate";
    const unsafeAction = encoded.evidence === "unsafe_candidate";
    if (encoded.evidence === "rejected") reasons.push(encoded.reason ?? "action rejected");
    if (settings.transmit_enabled !== true) reasons.push("master TX disabled");
    // No action produces `inferred_candidate` any more: the elevator was the last one and
    // measurement promoted it. The door macros are `unsafe_candidate` and answer to
    // `unsafe_transmit_enabled` instead. This branch and its setting stay because the
    // subphone line — where the bell, the intercom and the video live — is not captured yet,
    // and whatever it turns out to carry will start as an inferred candidate.
    if (inferredAction && settings.speculative_transmit_enabled !== true) reasons.push("speculative TX disabled");
    if (unsafeAction && settings.unsafe_transmit_enabled !== true) reasons.push("unsafe TX disabled");
    if (userId.length === 0 || userId !== opts.getCurrentUserId() || userId !== settings.transmit_user_id) reasons.push("authorized user mismatch");
    // Was "capture is not running", because one call opened the recording file and the socket
    // together. They are separate now: what a send needs is a link, and a recording is a
    // thing the operator starts on top of it.
    if (state.link !== "up") reasons.push("gateway link is not up");
    if (inFlight) reasons.push("one in-flight write only");
    if (state.quarantined) reasons.push("transport generation quarantined");
    if (!state.connected || !opts.getTransport()?.write) reasons.push("transport not connected");
    if (state.pendingAppend) reasons.push("capture append pending");
    if (!state.currentGenerationRx) reasons.push("no current-generation valid RX frame");
    if (state.lastValidFrameAtMs <= 0 || state.lastRxByteAtMs <= 0) reasons.push("no current valid RX frame");
    if (!state.fresh) reasons.push("current RX frame stale");
    // A busy line is not a refusal: the window opens within tx_quiet_ms and `send` waits
    // for it. Reporting it as a blocker turned a 20 ms wait into a dead button.
    const cooldownAt = unsafeAction ? lastUnsafeAttempt : inferredAction ? lastSpeculativeAttempt : lastNormalAttempt;
    const cooldownMs = unsafeAction ? settings.unsafe_tx_cooldown_ms : inferredAction ? settings.speculative_tx_cooldown_ms : settings.tx_cooldown_ms;
    if (opts.nowMs() - cooldownAt < cooldownMs) reasons.push("TX cooldown active");
    const frames = framesFor(encoded);
    const rawAction = !!(action && typeof action === "object" && (action as AnyRecord).kind === "raw");
    if (frames.length === 0) reasons.push("empty action frame");
    if (frames.some((frame) => wouldCrossRecognized(frame, !rawAction))) reasons.push("recognized frame boundary collision");
    if (unsafeAction && !rawAction && frames.some((frame) => frame[0] === 0x7f) && !hasCurrentSevenFProof(state, opts.getGeneration(), action, frames)) reasons.push("current-generation 7F compatibility proof required");
    return { ready: reasons.length === 0, reasons: reasons.slice(0, 12), readinessRevision: state.readinessRevision };
  };
  const challengeId = (): string => {
    const value = randomBytes(24);
    return bytesToBase64Url(value);
  };
  const challengeKey = (id: string): string => createHash("sha256").update(id, "utf8").digest("hex");
  const issueSpeculativeChallenge = (action: unknown, request: { userId: string; confirmationPhrase: string; schedule?: string }) => {
    const generation = syncGeneration();
    if (request.schedule !== undefined && request.schedule !== "immediate") throw new Error("schedule must be immediate");
    const userId = opts.getCurrentUserId();
    if (!userId || request.userId !== userId) throw new Error("trusted user required");
    if (request.confirmationPhrase !== "I UNDERSTAND THIS IS AN INFERRED CANDIDATE") throw new Error("confirmation phrase required");
    const encoded = encodeSemanticAction(action, {
      transmitEnabled: settings.transmit_enabled,
      speculativeTransmitEnabled: settings.speculative_transmit_enabled,
      unsafeTransmitEnabled: settings.unsafe_transmit_enabled,
      authorizedUser: request.userId === settings.transmit_user_id && request.userId === userId,
    });
    if (encoded.evidence !== "inferred_candidate" && encoded.evidence !== "unsafe_candidate") throw new Error("challenge requires candidate action");
    const frames = framesFor(encoded);
    if (frames.length === 0) throw new Error("challenge requires a frame");
    const inferredAction = encoded.evidence === "inferred_candidate";
    const unsafeAction = encoded.evidence === "unsafe_candidate";
    if (inferredAction && (settings.transmit_enabled !== true || settings.speculative_transmit_enabled !== true)) throw new Error("speculative TX disabled");
    if (unsafeAction && (settings.transmit_enabled !== true || settings.unsafe_transmit_enabled !== true)) throw new Error("master or unsafe TX disabled");
    if (inFlight) throw new Error("one in-flight write only");
    const state = currentState();
    const readiness = evaluateReadiness(action, encoded, request, state);
    if (!readiness.ready) throw new Error(readiness.reasons[0] ?? "TX readiness gate rejected");
    const transport = opts.getTransport();
    if (quarantinedFor(opts.getRxState())) throw new Error("transport generation quarantined");
    if (!state.connected || !transport?.write) throw new Error("transport not connected");
    if (state.pendingAppend) throw new Error("capture append pending");
    if (!state.currentGenerationRx) throw new Error("no current-generation valid RX frame");
    if (state.lastValidFrameAtMs <= 0 || state.lastRxByteAtMs <= 0) throw new Error("no current valid RX frame");
    const rawAction = !!(action && typeof action === "object" && (action as AnyRecord).kind === "raw");
    if (unsafeAction && !rawAction && frames.some((frame) => frame[0] === 0x7f) && !hasCurrentSevenFProof(state, generation, action, frames)) {
      throw new Error("current-generation 7F compatibility proof required");
    }
    if (opts.nowMs() - state.lastValidFrameAtMs > Math.max(45_000, settings.idle_timeout_ms + settings.tx_write_timeout_ms)) throw new Error("current RX frame stale");
    const cooldownAt = unsafeAction ? lastUnsafeAttempt : lastSpeculativeAttempt;
    const cooldownMs = unsafeAction ? settings.unsafe_tx_cooldown_ms : settings.speculative_tx_cooldown_ms;
    if (opts.nowMs() - cooldownAt < cooldownMs) throw new Error("TX cooldown active");
    if (frames.some((frame) => wouldCrossRecognized(frame, !rawAction))) throw new Error("recognized frame boundary collision");
    const id = challengeId();
    challenges.clear();
    challenges.set(challengeKey(id), {
      action: canonicalAction(action), frames: frames.map(frameHex).join(","), userId, generation, rxByteEpoch: state.rxByteEpoch,
      readEpoch: state.readEpoch, txByteEpoch: state.txByteEpoch, tailHash: state.tailHash,
      schedule: request.schedule ?? "immediate", readinessRevision: state.readinessRevision,
      expiresAtMs: opts.nowMs() + challengeTtlMs, consumed: false,
    });
    while (challenges.size > maxChallenges) challenges.delete(challenges.keys().next().value as string);
    return {
      id,
      expiresAtMs: opts.nowMs() + challengeTtlMs,
      evidence: encoded.evidence,
      frameHex: frames[0] ? frameHex(frames[0]) : undefined,
      framesHex: frames.map(frameHex),
      readinessRevision: state.readinessRevision,
    };
  };
  const rejectChallenge = (id: unknown, action: unknown, encoded: AnyRecord, request: AnyRecord, state: ReturnType<typeof currentState>): string | null => {
    if (typeof id !== "string") return "speculative challenge required";
    const record = challenges.get(challengeKey(id));
    if (!record) return "challenge expired or purged";
    if (record.consumed) return "challenge replay rejected";
    if (opts.nowMs() > record.expiresAtMs) { challenges.delete(challengeKey(id)); return "challenge expired"; }
    if (record.userId !== request.userId) return "challenge user mismatch";
    if (record.action !== canonicalAction(action)) return "challenge action mismatch";
    if (record.frames !== framesFor(encoded).map(frameHex).join(",")) return "challenge frame mismatch";
    if (record.schedule !== (request.schedule ?? "immediate")) return "challenge schedule mismatch";
    if (record.generation !== opts.getGeneration()) return "challenge generation stale";
    // The challenge deliberately does NOT bind inbound counters. rxByteEpoch, readEpoch
    // and readinessRevision all advance on every received byte, so binding them made a
    // confirmation a race against the next frame and the commit almost always died on a
    // live bus. Every live condition they stood in for — connected, currentGenerationRx,
    // fresh, quiet, lastValidFrameAtMs, quarantine — is re-checked below at commit time.
    // The outbound tail stays bound: our own intervening write is a real hazard.
    if (record.txByteEpoch !== state.txByteEpoch || record.tailHash !== state.tailHash) return "challenge TX tail stale";
    record.consumed = true;
    return null;
  };
  const cancelSpeculativeChallenge = (id: unknown, userId: string): boolean => {
    purgeExpiredChallenges();
    if (typeof id !== "string" || typeof userId !== "string" || userId.length === 0) return false;
    const key = challengeKey(id);
    const record = challenges.get(key);
    if (!record || record.consumed || record.userId !== userId) return false;
    challenges.delete(key);
    return true;
  };
  const waitUntil = (delayMs: number): Promise<void> => new Promise((resolve) => {
    const waiter = { timer: null as TimerToken, resolve };
    waiter.timer = opts.setTimeout(() => {
      waiters.delete(waiter);
      resolve();
    }, Math.max(0, delayMs));
    waiters.add(waiter);
  });
  const cancelWaiters = (): void => {
    for (const waiter of waiters) {
      opts.clearTimeout(waiter.timer);
      waiter.resolve();
    }
    waiters.clear();
  };
  const writeOne = async (frame: Uint8Array, generation: number, transport: Transport, deadlineAtMs: number): Promise<AnyRecord> => {
    recordOutbound(frame);
    return new Promise<AnyRecord>((resolve) => {
      let settled = false;
      let callbackSeen = false;
      let drainSeen = true;
      let writeReturned = false;
      let callbackError: Error | null = null;
      let timer: TimerToken | null = null;
      let onDrain: (() => void) | null = null;
      let abortHandler: (() => void) | null = null;
      const finish = (outcome: string, reason?: string, destroy = false): void => {
        if (settled) return;
        settled = true;
        if (timer !== null) opts.clearTimeout(timer);
        if (onDrain) transport.off?.("drain", onDrain);
        if (abortInFlight === abortHandler) abortInFlight = null;
        if (destroy) {
          quarantined.add(generation);
          try { transport.destroy(); } catch { /* exact generation remains quarantined */ }
        }
        writeJournal(outcome, reason);
        resolve({ outcome, reason, confirmed: false, deviceConfirmed: false });
      };
      const maybeFinish = (): void => {
        if (writeReturned && callbackSeen && drainSeen) finish("socket_written_unconfirmed", callbackError?.message, false);
      };
      const callback = (error?: Error | null): void => {
        callbackSeen = true;
        callbackError = error ?? null;
        if (callbackError) {
          finish("socket_write_error_unconfirmed", callbackError.message, true);
          return;
        }
        if (opts.getGeneration() !== generation) {
          finish("transport_generation_stale", "transport generation changed during write", true);
          return;
        }
        maybeFinish();
      };
      abortHandler = () => finish("transport_stopped", "transport stopped during write", true);
      abortInFlight = abortHandler;
      timer = opts.setTimeout(() => finish("write_deadline", "write deadline exceeded", true), Math.max(0, deadlineAtMs - opts.nowMs()));
      try {
        const accepted = transport.write?.(frame, callback);
        drainSeen = accepted === true;
        writeReturned = true;
        if (settled) return;
        if (!drainSeen) {
          if (!transport.once) {
            finish("write_deadline", "drain boundary unavailable", true);
            return;
          }
          onDrain = () => {
            if (onDrain) transport.off?.("drain", onDrain);
            if (opts.getGeneration() !== generation) {
              finish("transport_generation_stale", "transport generation changed during drain", true);
              return;
            }
            drainSeen = true;
            maybeFinish();
          };
          transport.once("drain", onDrain);
        }
        maybeFinish();
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error("write failed");
        finish("socket_write_error_unconfirmed", normalized.message, true);
      }
    });
  };
  // Both the queue and the write path have to read the same evidence class off the same
  // context, or the queue could route as observed something the write path treats otherwise.
  const actionContext = (request: AnyRecord): AnyRecord => ({
    transmitEnabled: settings.transmit_enabled,
    speculativeTransmitEnabled: settings.speculative_transmit_enabled,
    unsafeTransmitEnabled: settings.unsafe_transmit_enabled,
    authorizedUser: request.userId === settings.transmit_user_id && request.userId === opts.getCurrentUserId(),
  });

  const sendOnce = async (action: unknown, request: AnyRecord): Promise<any> => {
    const mode = request.mode ?? "preview";
    if (request.schedule !== undefined && request.schedule !== "immediate") {
      return txReject("schedule must be immediate", syncGeneration(), journal);
    }
    const encoded = encodeSemanticAction(action, actionContext(request));
    if (mode === "preview") {
      const readiness = evaluateReadiness(action, encoded, request, currentState());
      return {
        ...encoded,
        preview: true,
        outcome: "preview",
        ready: readiness.ready,
        reasons: readiness.reasons,
        readiness,
        readinessRevision: readiness.readinessRevision,
      };
    }
    if (mode !== "live") return txReject("unsupported mode", syncGeneration(), journal);
    const userId = opts.getCurrentUserId();
    if (!userId || request.userId !== userId || request.userId !== settings.transmit_user_id) return txReject("authorized user mismatch", syncGeneration(), journal);
    if (inFlight) return txReject("one in-flight write only", opts.getGeneration(), journal);
    const currentGeneration = syncGeneration();
    transportGeneration = currentGeneration;
    if (quarantinedFor(opts.getRxState())) return txReject("transport generation quarantined; speculative challenge unavailable", currentGeneration, journal);
    if (encoded.evidence === "rejected" || encoded.frame === undefined && !encoded.frames) return txReject(encoded.reason ?? "action rejected", currentGeneration, journal);
    const frames = framesFor(encoded);
    if (frames.length === 0) return txReject("empty action frame", currentGeneration, journal);
    const inferredAction = encoded.evidence === "inferred_candidate";
    const unsafeAction = encoded.evidence === "unsafe_candidate";
    if (inferredAction && (settings.transmit_enabled !== true || settings.speculative_transmit_enabled !== true)) return txReject("master or speculative TX disabled", currentGeneration, journal);
    if (unsafeAction && (settings.transmit_enabled !== true || settings.unsafe_transmit_enabled !== true)) return txReject("master or unsafe TX disabled", currentGeneration, journal);
    if (!inferredAction && !unsafeAction && settings.transmit_enabled !== true) return txReject("TX disabled", currentGeneration, journal);
    const state = currentState();
    let challengeAccepted = false;
    if (inferredAction || unsafeAction) {
      const challengeError = rejectChallenge(request.challengeId, action, encoded, request, state);
      if (challengeError) return txReject(challengeError, currentGeneration, journal);
      challengeAccepted = true;
      if (unsafeAction) lastUnsafeAttempt = opts.nowMs();
      else if (inferredAction) lastSpeculativeAttempt = opts.nowMs();
    }
    if (!state.connected || !opts.getTransport()) return txReject("transport not connected", currentGeneration, journal);
    if (state.pendingAppend) return txReject("capture append pending", currentGeneration, journal);
    if (!state.currentGenerationRx) return txReject("no current-generation valid RX frame", currentGeneration, journal);
    if (state.lastValidFrameAtMs <= 0 || state.lastRxByteAtMs <= 0) return txReject("no current valid RX frame", currentGeneration, journal);
    const rawAction = !!(action && typeof action === "object" && (action as AnyRecord).kind === "raw");
    if (unsafeAction && !rawAction && frames.some((frame) => frame[0] === 0x7f) && !hasCurrentSevenFProof(state, currentGeneration, action, frames)) return txReject("current-generation 7F compatibility proof required", currentGeneration, journal);
    if (opts.nowMs() - state.lastValidFrameAtMs > Math.max(45_000, settings.idle_timeout_ms + settings.tx_write_timeout_ms)) return txReject("current RX frame stale", currentGeneration, journal);
    // Wait for the quiet window rather than refusing. Measured on the operator's captures,
    // a read lands about every 121 ms, so at a random instant the window is open 89% of the
    // time; a send that checked it several times succeeded about 64% of the time and the
    // operator had to press until one landed. The window opens within tx_quiet_ms.
    // Taken before the wait on purpose. Comparing two snapshots from the same synchronous
    // block would make every field below equal to itself, which is what an earlier cut of
    // this repair did: it left a check that could only ever fire on `pendingAppend`.
    const beforeWaitState = currentState();
    const quietDeadline = opts.nowMs() + Math.max(settings.tx_quiet_ms, settings.tx_write_timeout_ms);
    for (;;) {
      const waitState = currentState();
      const openAt = waitState.lastRxByteAtMs + settings.tx_quiet_ms;
      if (opts.nowMs() >= openAt) break;
      if (opts.nowMs() >= quietDeadline) return txReject("line busy: quiet interval not met", currentGeneration, journal);
      await waitUntil(Math.max(1, Math.min(openAt - opts.nowMs(), quietDeadline - opts.nowMs())));
    }
    const state2 = currentState();
    if (!state2.connected || !opts.getTransport()) return txReject("transport not connected", currentGeneration, journal);
    if (opts.getGeneration() !== currentGeneration) return txReject("transport generation changed while waiting for the line", currentGeneration, journal);
    const cooldownAt = unsafeAction ? lastUnsafeAttempt : inferredAction ? lastSpeculativeAttempt : lastNormalAttempt;
    const cooldownMs = unsafeAction ? settings.unsafe_tx_cooldown_ms : inferredAction ? settings.speculative_tx_cooldown_ms : settings.tx_cooldown_ms;
    if (!challengeAccepted && opts.nowMs() - cooldownAt < cooldownMs) return txReject("TX cooldown active", currentGeneration, journal);
    const transport = opts.getTransport();
    if (!transport?.write) return txReject("transport write unavailable", currentGeneration, journal);
    if (frames.some((frame) => wouldCrossRecognized(frame, !rawAction))) return txReject("recognized frame boundary collision", currentGeneration, journal);
    // The inbound counters were the wrong comparands: they advance on every received byte
    // and on every capture append, so waiting for the line could by itself refuse the write.
    // `externalTxByteEpoch` and `externalTailHash` are what detect another transmitter
    // speaking while we waited, and they are compared against the pre-wait snapshot so that
    // there is a window in which they can actually differ.
    const initialState = { ...beforeWaitState };
    const initialOutboundEpoch = outboundEpoch;
    const beforeWriteGeneration = opts.getGeneration();
    const beforeWriteState = currentState();
    const quietBeforeWrite = beforeWriteState.lastRxByteAtMs;
    if (
      beforeWriteGeneration !== currentGeneration ||
      !beforeWriteState.connected ||
      beforeWriteState.pendingAppend ||
      beforeWriteState.externalTxByteEpoch !== initialState.externalTxByteEpoch ||
      beforeWriteState.externalTailHash !== initialState.externalTailHash ||
      opts.nowMs() - quietBeforeWrite < settings.tx_quiet_ms
    ) return txReject("transport/RX race before write", currentGeneration, journal);
    inFlight = true;
    if (unsafeAction) lastUnsafeAttempt = opts.nowMs(); else if (inferredAction) lastSpeculativeAttempt = opts.nowMs(); else lastNormalAttempt = opts.nowMs();
    const macro = frames.length > 1;
    const currentOperation = operationEpoch;
    const startedAt = opts.nowMs();
    const totalDeadline = startedAt + (macro ? 5_000 : settings.tx_write_timeout_ms);
    let framesWritten = 0;
    let previousSuccessAt = startedAt - 200;
    let outcome: AnyRecord = { outcome: "socket_written_unconfirmed", confirmed: false, deviceConfirmed: false };
    try {
      for (const frame of frames) {
        if (currentOperation !== operationEpoch) {
          outcome = { outcome: macro && framesWritten > 0 ? "partial_indeterminate" : "rejected", reason: "TX operation stopped", confirmed: false, deviceConfirmed: false, framesWritten };
          break;
        }
        if (opts.nowMs() > totalDeadline) {
          outcome = { outcome: macro ? "partial_indeterminate" : "write_deadline", reason: "write deadline exceeded", confirmed: false, deviceConfirmed: false, framesWritten };
          quarantined.add(currentGeneration);
          try { transport.destroy(); } catch { /* quarantine is authoritative */ }
          break;
        }
        if (framesWritten > 0) {
          const gapDeadline = previousSuccessAt + 2_000;
          while (true) {
            if (currentOperation !== operationEpoch) {
              outcome = { outcome: "partial_indeterminate", reason: "TX operation stopped", confirmed: false, deviceConfirmed: false, framesWritten };
              quarantined.add(currentGeneration);
              try { transport.destroy(); } catch { /* quarantine is authoritative */ }
              break;
            }
            const gapState = currentState();
            const expectedTailHash = `${initialState.externalTailHash}:${hashTail(outboundTail)}`;
            // rxByteEpoch and readEpoch advance on every received byte and every capture
            // append. The inter-frame gap is at least 200 ms and this bus delivers a read
            // about every 121 ms, so requiring them to hold still meant frame two always
            // failed, quarantined the generation and destroyed the transport. Incoming
            // traffic during our own macro is normal; another transmitter writing is not,
            // and externalTxByteEpoch/externalTailHash still catch that.
            const stableOperation =
              gapState.externalTxByteEpoch === initialState.externalTxByteEpoch &&
              gapState.externalTailHash === initialState.externalTailHash &&
              outboundEpoch - initialOutboundEpoch === framesWritten &&
              gapState.txByteEpoch === initialState.externalTxByteEpoch + outboundEpoch &&
              gapState.tailHash === expectedTailHash;
            if (!stableOperation) {
              outcome = { outcome: "partial_indeterminate", reason: "transport/RX state changed between frames", confirmed: false, deviceConfirmed: false, framesWritten };
              quarantined.add(currentGeneration);
              try { transport.destroy(); } catch { /* quarantine is authoritative */ }
              break;
            }
            // 200 ms is the spacing the legacy door macro documents for 0x7F. An F7
            // sequence has no such requirement, so it only waits for the line.
            const quietAt = gapState.lastRxByteAtMs;
            const spacingMs = frames.some((entry) => entry[0] === 0x7f) ? 200 : settings.tx_quiet_ms;
            const nextAllowed = Math.max(previousSuccessAt + spacingMs, quietAt + settings.tx_quiet_ms);
            if (opts.nowMs() >= gapDeadline || opts.nowMs() >= totalDeadline) {
              outcome = { outcome: "partial_indeterminate", reason: "door inter-frame deadline exceeded", confirmed: false, deviceConfirmed: false, framesWritten };
              quarantined.add(currentGeneration);
              try { transport.destroy(); } catch { /* quarantine is authoritative */ }
              break;
            }
            if (gapState.connected && !gapState.pendingAppend && opts.getGeneration() === currentGeneration && opts.nowMs() >= nextAllowed) break;
            await waitUntil(Math.max(1, Math.min(nextAllowed - opts.nowMs(), gapDeadline - opts.nowMs(), totalDeadline - opts.nowMs())));
          }
          if (outcome.outcome === "partial_indeterminate") break;
        }
        const beforeFrameState = currentState();
        const beforeFrameQuiet = beforeFrameState.lastRxByteAtMs;
        const expectedTailHash = `${initialState.externalTailHash}:${hashTail(outboundTail)}`;
        // Same reasoning as the inter-frame gap above: inbound counters move on every byte
        // and every capture append, so binding them here refused a frame the bus had no
        // objection to. What must hold still is our own outbound accounting and the
        // evidence that no other transmitter wrote.
        const stableOperation =
          beforeFrameState.externalTxByteEpoch === initialState.externalTxByteEpoch &&
          beforeFrameState.externalTailHash === initialState.externalTailHash &&
          outboundEpoch - initialOutboundEpoch === framesWritten &&
          beforeFrameState.txByteEpoch === initialState.externalTxByteEpoch + outboundEpoch &&
          beforeFrameState.tailHash === expectedTailHash;
        if (
          opts.getGeneration() !== currentGeneration ||
          !beforeFrameState.connected ||
          beforeFrameState.pendingAppend ||
          !stableOperation ||
          opts.nowMs() - beforeFrameQuiet < settings.tx_quiet_ms
        ) {
          outcome = { outcome: macro && framesWritten > 0 ? "partial_indeterminate" : "rejected", reason: "transport/RX race before frame", confirmed: false, deviceConfirmed: false, framesWritten };
          if (macro && framesWritten > 0) {
            quarantined.add(currentGeneration);
            try { transport.destroy(); } catch { /* quarantine is authoritative */ }
          }
          break;
        }
        const frameDeadline = Math.min(totalDeadline, opts.nowMs() + settings.tx_write_timeout_ms);
        // The quiet wait above can take up to a second, and every frame that arrives during it
        // would otherwise count as an observation made after "the write".
        const frameWrittenAtMs = opts.nowMs();
        const frameResult = await writeOne(frame, currentGeneration, transport, frameDeadline);
        if (frameResult.outcome === "socket_written_unconfirmed") frameResult.writtenAtMs = frameWrittenAtMs;
        framesWritten += frameResult.outcome === "socket_written_unconfirmed" ? 1 : 0;
        previousSuccessAt = opts.nowMs();
        if (frameResult.outcome !== "socket_written_unconfirmed") {
          outcome = macro ? { ...frameResult, outcome: "partial_indeterminate", framesWritten } : { ...frameResult, framesWritten };
          break;
        }
        outcome = frameResult;
      }
    } finally {
      inFlight = false;
    }
    if (macro && framesWritten === frames.length && outcome.outcome === "socket_written_unconfirmed") {
      lastUnsafeAttempt = opts.nowMs();
    }
    if (outcome.outcome === "partial_indeterminate" || quarantined.has(currentGeneration)) {
      outcome.quarantined = quarantined.has(currentGeneration);
    }
    return { ...outcome, journal: journal.slice(-journalLimit) };
  };

  // --- the send queue --------------------------------------------------------------
  // One frame can be on the line at a time, which used to mean a second press was refused
  // outright and a lost frame was never sent again. Commands now queue by the settable they
  // address, the last request for a settable wins, and each one is written until the device
  // is observed holding the value that was asked for.
  const queue = createIntentQueue();
  const queueWaiters = new Map<number, (value: AnyRecord) => void>();
  let draining = false;
  let lastBusWriteAtMs = -Infinity;


  /** Every intent this action becomes, or null when it must keep the single-shot path. */
  const queueableIntents = (action: unknown): { key: string; action: AnyRecord }[] | null => {
    if (!opts.getDevices) return null;
    const parts = expandAction(action);
    if (parts.length === 0) return null;
    const keyed = parts.map((part) => ({ key: intentKey(part), action: part }));
    if (keyed.some((entry) => entry.key === null)) return null;
    return keyed as { key: string; action: AnyRecord }[];
  };

  // Only the elevator needs a before-value, and only its standing call: everything else is
  // confirmed by a match because a no-op command is a legitimate success.
  const callBaseline = (): AnyRecord => ({ elevator: { call: opts.getDevices?.()?.devices?.elevator?.call } });

  const confirmedNow = (action: AnyRecord, writeAtMs: number, before?: AnyRecord): boolean => {
    const view = opts.getDevices?.();
    return view ? isConfirmed(action, view.devices, writeAtMs, view.generation, before) : false;
  };

  const awaitConfirmation = async (action: AnyRecord, writeAtMs: number, before?: AnyRecord): Promise<boolean> => {
    // What is waited for is the device's next poll, not the reply to our frame.
    //
    // A direct reply usually does arrive in the same read as the write, and it used to look
    // like the answer. Measurement showed it is not one: the gas valve answers byte-identically
    // whether or not the state changed, a heating zone echoed a target it did not adopt, and a
    // group command draws no direct reply at all. So the window has to be wide enough for a
    // poll of the addressed device — three of them, at the slowest cadence measured.
    const deadline = opts.nowMs() + settings.tx_observation_timeout_ms;
    for (;;) {
      if (confirmedNow(action, writeAtMs, before)) return true;
      const remaining = deadline - opts.nowMs();
      if (remaining <= 0) return false;
      await waitUntil(Math.max(1, Math.min(25, remaining)));
    }
  };

  const runIntent = async (entry: { key: string; value: AnyRecord }): Promise<AnyRecord> => {
    const action = entry.value.action as AnyRecord;
    const request = entry.value.request as AnyRecord;
    // A candidate's challenge is single use, so it gets exactly one attempt. Retrying is for
    // controls that need no confirmation to send in the first place.
    const maxAttempts = entry.value.evidence === "observed" ? settings.tx_max_attempts : 1;
    let last: AnyRecord = { outcome: "rejected", reason: "no attempt made", confirmed: false, deviceConfirmed: false };
    let framesWritten = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (queue.has(entry.key)) return { outcome: "superseded", key: entry.key, reason: "replaced by a newer request for the same control", confirmed: false, deviceConfirmed: false, attempts: attempt - 1, framesWritten };
      const spacingMs = lastBusWriteAtMs + settings.tx_cooldown_ms - opts.nowMs();
      if (spacingMs > 0) await waitUntil(spacingMs);
      const before = callBaseline();
      const result = await sendOnce(action, request) as AnyRecord;
      last = result;
      if (result.outcome === "socket_written_unconfirmed") {
        framesWritten += 1;
        lastBusWriteAtMs = opts.nowMs();
        const writeAtMs = Number.isSafeInteger(result.writtenAtMs) ? result.writtenAtMs as number : opts.nowMs();
        const alreadyHeld = confirmedNow(action, 0, before);
        if (await awaitConfirmation(action, writeAtMs, before)) {
          return { ...result, outcome: "confirmed", confirmed: true, deviceConfirmed: true, key: entry.key, attempts: attempt, framesWritten, alreadyHeld };
        }
        continue;
      }
      if (!isRetryableRefusal(result.reason)) return { ...result, key: entry.key, attempts: attempt, framesWritten };
    }
    // A frame that reached the bus must never be reported as "not sent". Once one attempt
    // wrote, the answer is unconfirmed even if every later attempt was refused, because the
    // device may well have acted on the frame that did go out.
    return {
      ...last,
      outcome: framesWritten > 0 || last.outcome === "socket_written_unconfirmed" ? "unconfirmed" : last.outcome,
      reason: framesWritten > 0 && last.outcome !== "socket_written_unconfirmed" ? `${String(last.reason ?? "refused")} after ${framesWritten} frame(s) reached the bus` : last.reason,
      confirmed: false,
      deviceConfirmed: false,
      key: entry.key,
      attempts: maxAttempts,
      framesWritten,
    };
  };

  const drain = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    try {
      for (;;) {
        const entry = queue.take();
        if (!entry) break;
        const resolve = queueWaiters.get(entry.seq);
        queueWaiters.delete(entry.seq);
        let result: AnyRecord;
        try {
          result = await runIntent(entry);
        } catch (error) {
          result = { outcome: "indeterminate", reason: String((error as Error)?.message ?? error), confirmed: false, deviceConfirmed: false, key: entry.key };
        }
        resolve?.(result);
      }
    } finally {
      draining = false;
    }
  };

  const enqueueIntent = (key: string, action: AnyRecord, request: AnyRecord, evidence: unknown): Promise<AnyRecord> =>
    new Promise((resolve) => {
      const { entry, superseded } = queue.enqueue(key, { action, request, evidence });
      if (superseded) {
        const stale = queueWaiters.get(superseded.seq);
        queueWaiters.delete(superseded.seq);
        stale?.({ outcome: "superseded", key, reason: "replaced by a newer request for the same control", confirmed: false, deviceConfirmed: false });
      }
      queueWaiters.set(entry.seq, resolve);
      void drain();
    });

  const queueSummary = (): AnyRecord[] => queue.list().map((entry) => ({
    key: entry.key,
    action: entry.value.action,
  }));

  /** Drops everything queued. A reconnect makes every pending intent unsafe to resume. */
  const clearQueue = (reason: string): void => {
    for (const entry of queue.clear()) {
      const resolve = queueWaiters.get(entry.seq);
      queueWaiters.delete(entry.seq);
      resolve?.({ outcome: "rejected", reason, key: entry.key, confirmed: false, deviceConfirmed: false });
    }
  };

  const send = async (action: unknown, request: AnyRecord): Promise<any> => {
    if ((request.mode ?? "preview") !== "live") return sendOnce(action, request);
    // Authorisation before enqueue. A request that was always going to be refused must not
    // take a queue slot, because taking one evicts the legitimate intent already waiting on
    // that control. `sendOnce` names the refusal exactly as it always did.
    const currentUser = opts.getCurrentUserId();
    if (!currentUser || request.userId !== currentUser || request.userId !== settings.transmit_user_id) {
      return sendOnce(action, request);
    }
    if (settings.transmit_enabled !== true) return sendOnce(action, request);
    const intents = queueableIntents(action);
    if (!intents) return sendOnce(action, request);
    const encoded = encodeSemanticAction(action, actionContext(request));
    if (encoded.evidence === "rejected") return sendOnce(action, request);
    const results = await Promise.all(intents.map((intent) => enqueueIntent(intent.key, intent.action, request, encoded.evidence)));
    if (results.length === 1) return { ...results[0], journal: journal.slice(-journalLimit) };
    // Every part must be confirmed for the whole to be, and the whole must never stand in for
    // its parts: collapsing four zones to the first non-confirmed outcome told the operator
    // nothing was sent while three zones had already acted on a frame.
    const confirmedParts = results.filter((entry) => entry.outcome === "confirmed").length;
    const framesWritten = results.reduce((total, entry) => total + (Number(entry.framesWritten) || 0), 0);
    const summary = results.map((entry) => `${String(entry.key)}=${String(entry.outcome)}`).join(", ");
    return {
      outcome: confirmedParts === results.length ? "confirmed" : "partial",
      reason: confirmedParts === results.length ? undefined : `${confirmedParts}/${results.length} 확인 · ${summary}`,
      confirmed: confirmedParts === results.length,
      deviceConfirmed: confirmedParts === results.length,
      confirmedParts,
      partCount: results.length,
      framesWritten,
      results,
      journal: journal.slice(-journalLimit),
    };
  };
  const getTxStatus = (request?: AnyRecord): Record<string, unknown> => {
    const state = currentState();
    const requestedUser = typeof request?.userId === "string"
      ? request.userId
      : typeof request?.headers?.["x-remote-user-id"] === "string"
        ? request.headers["x-remote-user-id"]
        : "";
    const authorized = requestedUser.length > 0 && requestedUser === settings.transmit_user_id && requestedUser === opts.getCurrentUserId();
    const sevenFProof = Boolean(state.sevenFProof && hasCurrentSevenFProof(state, state.generation, {
      target: state.sevenFProof.action.split(":", 1)[0],
      state: state.sevenFProof.action.split(":", 2)[1],
    }));
    return {
      enabled: settings.transmit_enabled === true,
      speculativeEnabled: settings.speculative_transmit_enabled === true,
      unsafeEnabled: settings.unsafe_transmit_enabled === true,
      authorized,
      connected: state.connected,
      // The banner's first state is a link that is not up, not a capture that is not
      // running. Those were the same thing until E2B; they are not any more.
      link: state.link,
      recording: state.recording,
      inFlight,
      quarantined: state.quarantined,
      pendingAppend: state.pendingAppend,
      quiet: state.quiet,
      currentGenerationRx: state.currentGenerationRx,
      fresh: state.fresh,
      sevenFProof,
      observationTimeoutMs: settings.tx_observation_timeout_ms,
      maxAttempts: settings.tx_max_attempts,
      // Bytes the decoder threw away this link generation. buslab counts the same bytes as
      // `unparsedBytes`, where 183 ungated transmits produced 959 and 194 gated ones produced
      // none. This add-on transmits on a quiet interval and has no gate, and no run on disk was
      // taken with it on the bus, so this is the number that says whether that matters here.
      unparsedByteCount: state.unparsedByteCount ?? 0,
      queue: queueSummary(),
      readinessRevision: state.readinessRevision,
    };
  };
  return {
    send,
    issueSpeculativeChallenge,
    cancelSpeculativeChallenge,
    hasOutstandingSpeculativeChallenge(): boolean {
      purgeExpiredChallenges();
      for (const challenge of challenges.values()) if (!challenge.consumed) return true;
      return false;
    },
    getTxStatus,
    stop(): void {
      operationEpoch += 1;
      challenges.clear();
      // The bus may be in a different state by the time we come back, so nothing that was
      // still waiting to be written may survive a stop or a reconnect.
      clearQueue("transport stopped before this command reached the bus");
      cancelWaiters();
      quarantined.add(opts.getGeneration());
      abortInFlight?.();
    },
    isQuarantined(generation: number): boolean { return quarantined.has(generation); },
    snapshot(): { journal: TxJournalEntry[]; inFlight: boolean } { return { journal: journal.slice(-journalLimit), inFlight }; },
  };
}

function safeDownloadName(name: string | undefined): string {
  return name && /^[A-Za-z0-9_.-]+$/.test(name) ? name : "capture.ndjson";
}

export async function readBoundedJsonBody(
  body: AsyncIterable<string | Uint8Array>,
  maxBytes = 1_024,
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("invalid body limit");
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for await (const chunk of body) {
      const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
      byteLength += bytes.byteLength;
      if (byteLength > maxBytes) throw new Error(`request body exceeds ${maxBytes} bytes`);
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("request body aborted");
  }
  const joined = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

export function createProductionRequestHandler(
  handler: (req: FakeReq & { body?: string }, res: FakeRes) => Promise<void> | void,
  maxBytes = 1_024,
): (request: AnyRecord, response: AnyRecord) => Promise<void> {
  return async (request: AnyRecord, response: AnyRecord): Promise<void> => {
    const sendError = (status: number): void => {
      try {
        response.setHeader?.("cache-control", "no-store");
        response.setHeader?.("content-type", "text/plain; charset=utf-8");
        response.writeHead?.(status);
        if (!response.writableEnded) response.end?.("invalid body");
      } catch {
        response.destroy?.();
      }
    };
    const iterable = request !== null && typeof request === "object"
      ? Reflect.get(request, Symbol.asyncIterator)
      : undefined;
    if (typeof iterable !== "function") {
      await handler(request as FakeReq & { body?: string }, response as FakeRes);
      return;
    }
    try {
      const body = await readBoundedJsonBody(request as AsyncIterable<string | Uint8Array>, maxBytes);
      await handler({ ...(request as FakeReq), body }, response as FakeRes);
    } catch (error) {
      const message = error instanceof Error ? error.message : "request body aborted";
      sendError(/exceeds|large|size/i.test(message) ? 413 : 400);
    }
  };
}

export function createIngressHandler(deps: {
  getState(): CaptureSummary & { state: "running" | "stopped"; lastResult?: CoordinatorResult };
  startCapture(): Promise<void>;
  stopCapture(): Promise<CoordinatorResult>;
  createDownloadStream?(): AsyncIterable<string | Uint8Array>;
  getAuthenticatedIngressUserId?(): string | undefined;
  getConfiguredTransmitUserId?(): string | undefined;
  getTxStatus?(request?: FakeReq): Record<string, unknown>;
  csrfToken?: string;
  nowMs?(): number;
  issueSpeculativeChallenge?(action: AnyRecord, request: AnyRecord): Record<string, unknown> | Promise<Record<string, unknown>>;
  cancelSpeculativeChallenge?(id: string, request: AnyRecord): boolean | Record<string, unknown> | Promise<boolean | Record<string, unknown>>;
  hasOutstandingSpeculativeChallenge?(): boolean;
  executeSemanticAction?(action: AnyRecord, request?: AnyRecord): Promise<Record<string, unknown>> | Record<string, unknown>;
}) {
  let mutationTail: Promise<void> = Promise.resolve();
  let pendingChallengeIssues = 0;
  let pendingLiveCommits = 0;
  let localChallenge: { id: string; expiresAtMs: number } | null = null;
  let unknownOutstandingUntilMs = 0;
  const ingressNowMs = (): number => deps.nowMs?.() ?? Date.now();
  const validChallengeId = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value);
  const validLocalChallenge = (value: unknown): value is { id: string; expiresAtMs: number } => {
    if (!value || typeof value !== "object") return false;
    const candidate = value as AnyRecord;
    return validChallengeId(candidate.id)
      && Number.isSafeInteger(candidate.expiresAtMs)
      && candidate.expiresAtMs > ingressNowMs()
      && candidate.expiresAtMs <= ingressNowMs() + 30_000;
  };
  const purgeLocalChallenge = (): void => {
    if (localChallenge && localChallenge.expiresAtMs <= ingressNowMs()) localChallenge = null;
    if (unknownOutstandingUntilMs <= ingressNowMs()) unknownOutstandingUntilMs = 0;
  };
  const mutationBusy = (reason: string): Error => {
    const error = new Error(reason) as Error & { statusCode?: number };
    error.statusCode = 409;
    return error;
  };
  const enqueueMutation = <T>(job: () => T | Promise<T>): Promise<T> => {
    const runJob = async (): Promise<T> => await job();
    const run = mutationTail.then(runJob, runJob);
    mutationTail = run.then(() => undefined, () => undefined);
    return run;
  };
  const hasOutstandingChallenge = (): boolean => {
    if (typeof deps.hasOutstandingSpeculativeChallenge === "function") return deps.hasOutstandingSpeculativeChallenge() === true;
    purgeLocalChallenge();
    return localChallenge !== null || unknownOutstandingUntilMs > ingressNowMs();
  };
  return async (req: FakeReq, res: FakeRes): Promise<void> => {
    if (normalizeIngressPeer(req.socket.remoteAddress) === null) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    res.setHeader("cache-control", "no-store");

    const secure = typeof deps.getAuthenticatedIngressUserId === "function";
    const authenticatedUser = deps.getAuthenticatedIngressUserId?.();
    const sendResponse = (code: number, body: string): void => {
      res.setHeader("cache-control", "no-store");
      res.setHeader("x-content-type-options", "nosniff");
      res.writeHead(code);
      res.end(body);
    };
    const redactDebug = (value: unknown): unknown => {
      if (!value || typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map((entry) => redactDebug(entry));
      const copy: AnyRecord = { ...(value as AnyRecord) };
      delete copy.rawBytes;
      delete copy.pendingHex;
      for (const key of Object.keys(copy)) {
        if (/ew11|host|port|user|challenge|token/i.test(key)) {
          delete copy[key];
          continue;
        }
        if (copy[key] && typeof copy[key] === "object") copy[key] = redactDebug(copy[key]);
      }
      return copy;
    };
    const redactTx = (value: Record<string, unknown> | undefined): Record<string, unknown> => {
      const safe: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value ?? {})) {
        if (/user|token|challenge|raw|hex|host|port|frame/i.test(key)) continue;
        if (["string", "number", "boolean"].includes(typeof entry) || entry === null) safe[key] = entry;
      }
      return safe;
    };
    const mutationAuthorized = (): boolean => {
      const remoteUser = req.headers?.["x-remote-user-id"];
      const csrf = req.headers?.["x-csrf-token"];
      if (!deps.csrfToken) return !secure;
      if (typeof remoteUser !== "string" || remoteUser.length === 0 || csrf !== deps.csrfToken) return false;
      return !secure || remoteUser === authenticatedUser;
    };
    const safeStatus = (): Record<string, unknown> => {
      const state = deps.getState() as AnyRecord;
      const copy: AnyRecord = { ...state };
      delete copy.authenticatedIngressUserId;
      delete copy.configuredTransmitUserId;
      delete copy.challenge;
      delete copy.rawBytes;
      delete copy.ew11_host;
      delete copy.ew11_port;
      if (copy.lastResult && typeof copy.lastResult === "object") {
        copy.lastResult = redactDebug(copy.lastResult);
        if (Array.isArray((copy.lastResult as AnyRecord).preview)) (copy.lastResult as AnyRecord).preview = [];
      }
      if (copy.bounds && typeof copy.bounds === "object") copy.bounds = redactDebug(copy.bounds);
      const debug = redactDebug(copy.protocol ?? { generation: copy.generation ?? 0, stale: true });
      const rawTx = deps.getTxStatus?.(req) ?? copy.tx as Record<string, unknown> ?? {};
      const observationTimeoutMs = rawTx.observationTimeoutMs;
      const tx: Record<string, unknown> = {
        enabled: rawTx.enabled === true,
        speculativeEnabled: rawTx.speculativeEnabled === true,
        unsafeEnabled: rawTx.unsafeEnabled === true,
        authorized: secure && typeof req.headers?.["x-remote-user-id"] === "string" && req.headers["x-remote-user-id"] === authenticatedUser,
        connected: rawTx.connected === true,
        link: typeof rawTx.link === "string" ? rawTx.link : "down",
        recording: typeof rawTx.recording === "string" ? rawTx.recording : "off",
        inFlight: rawTx.inFlight === true,
        quarantined: rawTx.quarantined === true,
        pendingAppend: rawTx.pendingAppend === true,
        quiet: rawTx.quiet === true,
        currentGenerationRx: rawTx.currentGenerationRx === true,
        fresh: rawTx.fresh === true,
        sevenFProof: rawTx.sevenFProof === true,
        observationTimeoutMs: typeof observationTimeoutMs === "number"
          && Number.isSafeInteger(observationTimeoutMs)
          && observationTimeoutMs >= 1_000
          && observationTimeoutMs <= 30_000
          ? observationTimeoutMs
          : 10_000,
        unparsedByteCount: Number.isSafeInteger(rawTx.unparsedByteCount) && (rawTx.unparsedByteCount as number) >= 0
          ? rawTx.unparsedByteCount
          : 0,
        readinessRevision: typeof rawTx.readinessRevision === "string" && rawTx.readinessRevision.length <= 256
          ? rawTx.readinessRevision
          : undefined,
      };
      return {
        serverNowMs: Number.isFinite(copy.serverNowMs) ? copy.serverNowMs : Date.now(),
        generation: copy.generation ?? (debug as AnyRecord)?.generation ?? 0,
        lastRxByteAtMs: copy.lastRxByteAtMs ?? 0,
        lastValidFrameAtMs: copy.lastValidFrameAtMs ?? 0,
        lastValidFrameGeneration: copy.lastValidFrameGeneration ?? copy.validFrameGeneration ?? (debug as AnyRecord)?.lastValidFrameGeneration,
        validFrameEpoch: copy.validFrameEpoch ?? 0,
        phase: copy.phase ?? copy.state,
        state: copy.state,
        startedAtMs: copy.startedAtMs,
        elapsedMs: copy.elapsedMs,
        limitMs: copy.limitMs,
        byteCount: copy.byteCount,
        recordCount: copy.recordCount,
        file: copy.file,
        lastResult: copy.lastResult,
        bounds: copy.bounds,
        tx: redactTx(tx),
        csrfToken: deps.csrfToken,
        debug,
      };
    };

    const path = endpointPath(req.url);
    if (path === "/api/status" && req.method === "GET") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.writeHead(200);
      res.end(JSON.stringify(safeStatus()));
      return;
    }

    if (path === "/api/action" && req.method === "POST") {
      if (!mutationAuthorized()) { sendResponse(403, "forbidden"); return; }
      const body = (req as FakeReq & { body?: string }).body;
      if (typeof body !== "string" || body.length > 1024 || new TextEncoder().encode(body).byteLength > 1_024) { sendResponse(400, "invalid body"); return; }
      const contentType = req.headers?.["content-type"];
      if (typeof contentType !== "string" || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) { sendResponse(400, "invalid content type"); return; }
      let parsed: AnyRecord;
      try { parsed = JSON.parse(body) as AnyRecord; } catch { sendResponse(400, "invalid body"); return; }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) { sendResponse(400, "invalid body"); return; }
      const forbidden = ["rawHex", "host", "port", "delayMs", "repeat", "retry", "queue", "batch", "address"];
      const hasForbidden = (value: unknown): boolean => {
        if (!value || typeof value !== "object") return false;
        if (Array.isArray(value)) return value.some((entry) => hasForbidden(entry));
        const record = value as AnyRecord;
        if (forbidden.some((key) => Object.prototype.hasOwnProperty.call(record, key))) return true;
        return Object.values(record).some((entry) => hasForbidden(entry));
      };
      if (hasForbidden(parsed)) { sendResponse(400, "unsupported action"); return; }
      const controlKeys = ["mode", "challengeId", "confirmationPhrase", "schedule"];
      const directAllowed = new Set(["kind", "target", "state", "zone", "temperatureC", "direction", "action", "hex", ...controlKeys]);
      const nestedAllowed = new Set(["action", ...controlKeys]);
      const nested = parsed.action !== undefined && typeof parsed.action === "object" && parsed.action !== null && !Array.isArray(parsed.action);
      const envelopeAllowed = nested ? nestedAllowed : directAllowed;
      if (Object.keys(parsed).some((key) => !envelopeAllowed.has(key))) { sendResponse(400, "unsupported action"); return; }
      if (nested && (!parsed.action || typeof parsed.action !== "object" || Array.isArray(parsed.action))) { sendResponse(400, "unsupported action"); return; }
      if (nested && Object.keys(parsed.action as AnyRecord).some((key) => controlKeys.includes(key))) { sendResponse(400, "unsupported action"); return; }
      const action = nested ? parsed.action as AnyRecord : { ...parsed };
      delete action.mode;
      delete action.challengeId;
      delete action.confirmationPhrase;
      delete action.schedule;
      if (parsed.schedule !== undefined && parsed.schedule !== "immediate") { sendResponse(400, "schedule must be immediate"); return; }
      if (parsed.mode === "cancel") {
        if (Object.keys(parsed).some((key) => !["mode", "challengeId"].includes(key)) || !validChallengeId(parsed.challengeId)) {
          sendResponse(400, "unsupported action");
          return;
        }
        if (!deps.cancelSpeculativeChallenge) { sendResponse(503, "challenge unavailable"); return; }
        try {
          const cancelled = await enqueueMutation(() => deps.cancelSpeculativeChallenge!(parsed.challengeId, { ...parsed, userId: authenticatedUser }));
          if (cancelled !== true) { sendResponse(409, "challenge unavailable"); return; }
          if (localChallenge?.id === parsed.challengeId) localChallenge = null;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.writeHead(200);
          res.end(JSON.stringify({ cancelled: true }));
        } catch { sendResponse(409, "challenge unavailable"); }
        return;
      }
      const actionAllowed: Record<string, string[]> = {
        light: ["kind", "target", "state"],
        gas: ["kind", "state"],
        heat: ["kind", "zone", "target", "state", "temperatureC"],
        elevator: ["kind", "direction"],
        outlet: ["kind", "action"],
        ventilation: ["kind", "action"],
        entrance: ["kind", "target", "state"],
        raw: ["kind", "hex"],
      };
      const actionKind = typeof action.kind === "string" ? action.kind : "";
      const allowedKeys = actionAllowed[actionKind] ?? ["kind"];
      if (Object.keys(action).some((key) => !allowedKeys.includes(key))) { sendResponse(400, "unsupported action"); return; }
      const trustedRequest: AnyRecord = {
        ...parsed,
        userId: authenticatedUser,
        mode: parsed.mode === "commit" ? "live" : parsed.mode ?? "preview",
      };
      if (trustedRequest.mode === "challenge" || trustedRequest.mode === "issue_challenge") {
        if (!deps.issueSpeculativeChallenge) { sendResponse(503, "challenge unavailable"); return; }
        pendingChallengeIssues += 1;
        try {
          const result = await enqueueMutation(() => deps.issueSpeculativeChallenge!(action, trustedRequest));
          if (typeof deps.hasOutstandingSpeculativeChallenge !== "function") {
            if (validLocalChallenge(result)) {
              localChallenge = { id: result.id, expiresAtMs: result.expiresAtMs };
              unknownOutstandingUntilMs = 0;
            } else {
              unknownOutstandingUntilMs = ingressNowMs() + 30_000;
              sendResponse(422, "challenge rejected");
              return;
            }
          }
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (error) {
          if (typeof deps.hasOutstandingSpeculativeChallenge !== "function") unknownOutstandingUntilMs = ingressNowMs() + 30_000;
          sendResponse((error as AnyRecord)?.statusCode === 409 ? 409 : 422, "challenge rejected");
        }
        finally { pendingChallengeIssues -= 1; }
        return;
      }
      if (!deps.executeSemanticAction) { sendResponse(503, "TX unavailable"); return; }
      const liveCommit = parsed.mode === "commit" || parsed.mode === "live";
      if (liveCommit) pendingLiveCommits += 1;
      try {
        // A queued control is serialised by the send queue itself, which is what lets a
        // second press of the same control replace the first instead of being refused.
        // Putting it through the mutation chain as well made that unreachable: the second
        // request waited for the first to finish, so nothing was ever in the queue to
        // replace. Capture start and stop still refuse while `pendingLiveCommits > 0`, so
        // the invariant that chain was protecting holds without it.
        const queuedCommit = liveCommit && isQueueable(action);
        const result = liveCommit && !queuedCommit
          ? await enqueueMutation(() => deps.executeSemanticAction!(action, trustedRequest))
          : await deps.executeSemanticAction(action, trustedRequest);
        if (liveCommit && typeof deps.hasOutstandingSpeculativeChallenge !== "function"
          && typeof trustedRequest.challengeId === "string"
          && localChallenge?.id === trustedRequest.challengeId
          && result && typeof result === "object"
          && (result as AnyRecord).outcome !== "rejected") {
          localChallenge = null;
        }
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (error) { sendResponse((error as AnyRecord)?.statusCode === 409 ? 409 : 422, "action rejected"); }
      finally { if (liveCommit) pendingLiveCommits -= 1; }
      return;
    }

    if (path === "/api/capture" && req.method === "POST") {
      if (!mutationAuthorized()) { sendResponse(403, "forbidden"); return; }
      if (pendingChallengeIssues > 0 || pendingLiveCommits > 0) { sendResponse(409, "mutation busy"); return; }
      try {
        await enqueueMutation(async () => {
          if (pendingLiveCommits > 0) throw mutationBusy("live action in flight");
          if (hasOutstandingChallenge()) throw mutationBusy("speculative challenge outstanding");
          await deps.startCapture();
        });
        sendResponse(200, "ok");
      } catch (error) {
        sendResponse((error as AnyRecord)?.statusCode === 409 ? 409 : 500, (error as AnyRecord)?.statusCode === 409 ? "mutation busy" : "internal error");
      }
      return;
    }

    if (path === "/api/stop" && req.method === "POST") {
      if (!mutationAuthorized()) { sendResponse(403, "forbidden"); return; }
      try {
        await enqueueMutation(async () => {
          localChallenge = null;
          unknownOutstandingUntilMs = 0;
          await deps.stopCapture();
        });
        sendResponse(200, "ok");
      } catch {
        sendResponse(500, "internal error");
      }
      return;
    }

    if (path === "/api/download" && req.method === "GET") {
      const current = deps.getState();
      const file = current.lastResult?.file ?? current.file;
      if (!file?.finalized || !deps.createDownloadStream) {
        res.writeHead(404);
        res.end("not found");
        return;
      }

      let aborted = false;
      let headersStarted = false;
      let abortReason: Error | null = null;
      let drainReject: ((error: Error) => void) | null = null;
      const rejectPendingDrain = (error: Error): void => {
        const rejectDrain = drainReject;
        drainReject = null;
        rejectDrain?.(error);
      };
      const normalizeResponseError = (error: unknown, fallback: string): Error =>
        error instanceof Error ? error : new Error(fallback);
      const abortResponse = (error: unknown): void => {
        if (aborted) return;
        aborted = true;
        abortReason = normalizeResponseError(error, "response closed");
        const rejectDrain = drainReject;
        drainReject = null;
        rejectDrain?.(abortReason);
        try {
          res.destroy?.();
        } catch {
          // The response is already unusable; preserve the original failure.
        }
      };
      const onClose = (): void => abortResponse(new Error("response closed"));
      const onError = (error: unknown): void => abortResponse(error);
      const removeResponseListener = (
        event: string,
        listener: (...args: unknown[]) => unknown,
      ): void => {
        res.off?.(event, listener);
      };
      res.once?.("close", onClose);
      res.once?.("error", onError);

      const waitForDrain = (): Promise<void> => new Promise<void>((resolve, reject) => {
        if (aborted) {
          reject(abortReason ?? new Error("response closed"));
          return;
        }
        if (!res.once) {
          reject(new Error("response drain boundary unavailable"));
          return;
        }
        let settled = false;
        const onDrain = (): void => {
          if (settled) return;
          settled = true;
          drainReject = null;
          removeResponseListener("drain", onDrain);
          resolve();
        };
        drainReject = (error: Error): void => {
          if (settled) return;
          settled = true;
          drainReject = null;
          removeResponseListener("drain", onDrain);
          reject(error);
        };
        res.once("drain", onDrain);
      });

      try {
        res.setHeader("content-type", "application/x-ndjson");
        res.setHeader("content-disposition", `attachment; filename="${safeDownloadName(file.name)}"`);
        res.writeHead(200);
        headersStarted = true;

        for await (const chunk of deps.createDownloadStream()) {
          if (aborted) throw abortReason ?? new Error("response closed");
          if (!res.write) throw new Error("response write unavailable");
          if (!res.write(chunk)) await waitForDrain();
        }
        if (!aborted && !res.writableEnded) res.end();
      } catch (error) {
        if (!headersStarted && !aborted) {
          res.writeHead(500);
          res.end("internal error");
        } else {
          abortResponse(error);
        }
      } finally {
        rejectPendingDrain(abortReason ?? new Error("response closed"));
        removeResponseListener("close", onClose);
        removeResponseListener("error", onError);
      }
      return;
    }

    if (path === "/" && req.method === "GET") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.writeHead(200);
      res.end(renderAppHtml());
      return;
    }

    res.writeHead(404);
    res.end("not found");
  };
}

export async function startM2Runtime(opts: {
  readOptions?(path: string): Promise<unknown>;
  createTransport?(input: { host: string; port: number }): Transport;
  store?: CaptureStore;
  createServer?: (
    handler: (req: FakeReq, res: FakeRes) => Promise<void> | void,
  ) => { listen(port: number, cb?: () => void): void; close(): void };
} = {}): Promise<{
  requestHandler(req: FakeReq, res: FakeRes): Promise<void>;
  stop(): Promise<void>;
}> {
  const readOptions = opts.readOptions ?? (async (path: string): Promise<unknown> => {
    return JSON.parse(await readFile(path, "utf8"));
  });
  const transportFactory = opts.createTransport ?? ((input: { host: string; port: number }): Transport => {
    return createConnection(input) as unknown as Transport;
  });
  const settings = parseM2Settings(await readOptions(DEFAULT_OPTIONS_PATH));
  const store = opts.store ?? (
    opts.readOptions || opts.createTransport || opts.createServer
      ? createMemoryStore()
      : createCaptureStore()
  );
  const recovered = store.recover ? await store.recover() : null;
  const coordinator = createBoundedCaptureCoordinator({
    settings,
    createTransport: () => {
      return transportFactory({ host: settings.ew11_host, port: settings.ew11_port });
    },
    nowMs: () => Date.now(),
    setTimeout: (fn, delayMs) => setTimeout(fn, delayMs),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    store,
    initialResult: recovered ? metadataFromRecovered(recovered, settings) : undefined,
  });
  const csrfToken = secureRandomBytes(24).toString("base64url");
  const tx = createTxCoordinator({
    settings,
    nowMs: () => Date.now(),
    setTimeout: (fn, delayMs) => setTimeout(fn, delayMs),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    getCurrentUserId: () => settings.transmit_user_id,
    getTransport: () => coordinator.getTransport(),
    getGeneration: () => coordinator.getState().generation ?? 0,
    getDevices: () => coordinator.getDevices(),
    getRxState: () => coordinator.getTxState(),
  });
  // The link opens with the app and stays open. Control and observation are what the page is
  // for; a capture is something the operator starts on top of them.
  await coordinator.openLink();
  const secureIngress = settings.transmit_user_id !== undefined;
  const txStatus = (request?: FakeReq): Record<string, unknown> => tx.getTxStatus(request);
  const handler = createIngressHandler({
    getState: () => coordinator.getState(),
    // Starting a recording must not abort a control the operator just pressed. `tx.stop()`
    // purges challenges and in-flight writes; it belongs to the runtime's own shutdown, where
    // the link is going away, not to a capture beginning on top of a link that stays up.
    startCapture: async () => {
      await coordinator.beginRecording();
    },
    stopCapture: async () => coordinator.stopRecording(),
    createDownloadStream: store.createReadStream ? () => store.createReadStream!() : undefined,
    getTxStatus: txStatus,
    csrfToken,
    executeSemanticAction: (action, request) => tx.send(action, request ?? { mode: "preview", userId: settings.transmit_user_id }),
    ...(secureIngress ? {
      getAuthenticatedIngressUserId: () => settings.transmit_user_id,
      getConfiguredTransmitUserId: () => settings.transmit_user_id,
      issueSpeculativeChallenge: (action, request) => tx.issueSpeculativeChallenge(action, {
        userId: String(request.userId ?? ""),
        confirmationPhrase: String(request.confirmationPhrase ?? ""),
        schedule: typeof request.schedule === "string" ? request.schedule : "immediate",
      }),
      cancelSpeculativeChallenge: (id, request) => tx.cancelSpeculativeChallenge(id, String(request.userId ?? "")),
      hasOutstandingSpeculativeChallenge: () => tx.hasOutstandingSpeculativeChallenge(),
      executeSemanticAction: (action, request) => tx.send(action, request ?? { mode: "preview", userId: settings.transmit_user_id }),
    } : {}),
  });
  const productionHandler = createProductionRequestHandler(handler);
  const serverFactory = opts.createServer ?? (() => createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    // Contract: handler({ method: req.method, url: req.url, socket: req.socket, headers: req.headers }, createServerResponseAdapter(res))
    const request = {
      method: req.method ?? "GET",
      url: req.url ?? "/",
      socket: { remoteAddress: req.socket.remoteAddress ?? undefined },
      headers: req.headers as Record<string, string | undefined>,
      [Symbol.asyncIterator]: req[Symbol.asyncIterator].bind(req),
    };
    void productionHandler(request, createServerResponseAdapter(res)).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      if (!res.writableEnded) res.end("internal error");
    });
  }));
  const server = serverFactory(productionHandler as unknown as (req: FakeReq, res: FakeRes) => Promise<void>);
  server.listen(8099);

  return {
    requestHandler: productionHandler as unknown as (req: FakeReq, res: FakeRes) => Promise<void>,
    async stop(): Promise<void> {
      tx.stop();
      server.close();
      await coordinator.stop();
    },
  };
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const runtime = await startM2Runtime();
  process.on("SIGTERM", () => {
    void runtime.stop();
  });
}
