import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createConnection } from "node:net";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createCaptureRecorder, type CaptureRecord } from "./capture.ts";
import {
  createCaptureStore,
  type CaptureFileMetadata,
  type CaptureStore,
  type StoreFileMetadata,
} from "./capture-store.ts";
import { renderAppHtml } from "./ui.ts";
import { DEFAULT_OPTIONS_PATH, parseM2Settings, type ParsedSettings } from "./settings.ts";

export { DEFAULT_OPTIONS_PATH, parseM2Settings };
export type { ParsedSettings };

type TimerToken = unknown;
type Transport = {
  on(event: string, listener: (...args: unknown[]) => unknown): unknown;
  off(event: string, listener: (...args: unknown[]) => unknown): unknown;
  removeAllListeners(): unknown;
  pause?(): unknown;
  resume?(): unknown;
  setTimeout?(timeoutMs: number): unknown;
  destroy(): unknown;
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
};

export type CoordinatorResult = CaptureSummary & {
  reason: string;
  stoppedAtMs: number;
};

type RuntimeCoordinator = {
  start(): Promise<void>;
  stop(): Promise<CoordinatorResult>;
  getState(): CaptureSummary & { state: "running" | "stopped"; lastResult?: CoordinatorResult };
};

const INGRESS_PEER_ALLOWED = "172.30.32.2";
const PROGRESS_INTERVAL_MS = 3_600_000;

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

  let phase: CapturePhase = "stopped";
  let transport: Transport | null = null;
  let connectTimeoutId: TimerToken | null = null;
  let runningTimeoutId: TimerToken | null = null;
  let progressTimeoutId: TimerToken | null = null;
  let connected = false;
  let reconnecting = false;
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
    };
  };

  const stateForPhase = (): "running" | "stopped" =>
    phase === "running" ? "running" : "stopped";

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
      message: normalized.message,
      byteCount,
      recordCount,
    });
    lastFailure = lastFailure ?? normalized;
    return normalized;
  };

  let requestFinish: (reason: string) => Promise<CoordinatorResult>;

  const handleAppendFailure = (error: unknown): void => {
    const normalized = logFailure("append", error, "append");
    if (phase !== "stopped" && !finishPromise) {
      void requestFinish("error").catch(() => undefined);
    }
    void normalized;
  };

  const queueRecord = (record: CaptureRecord): void => {
    const line = `${JSON.stringify(record)}\n`;
    const activeTransport = transport;
    if (!activeTransport || pendingAppend) return;
    try {
      activeTransport.pause?.();
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

  const finishCapture = (reason: string): Promise<CoordinatorResult> => {
    if (finishPromise) return finishPromise;

    phase = "finalizing";
    stoppedAtMs = opts.nowMs();
    clearAll();
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
      phase = "stopped";
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

  requestFinish = (reason: string): Promise<CoordinatorResult> => {
    if (finishPromise) return finishPromise;
    if (phase === "starting") {
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

  const onConnectTimeout = (activeTransport: Transport): void => {
    if (phase === "running" && transport === activeTransport && !connected) {
      void requestFinish("connect_timeout").catch(() => undefined);
    }
  };

  const onError = (activeTransport: Transport, error?: unknown): void => {
    if (phase !== "running" || transport !== activeTransport) return;
    const normalized = asError(error, "transport failed");
    logger.error("transport", {
      reason: "transport",
      message: normalized.message,
      byteCount,
      recordCount,
    });
    void requestFinish("error").catch(() => undefined);
  };

  const onClose = (activeTransport: Transport): void => {
    if (phase === "running" && transport === activeTransport) {
      void requestFinish("closed").catch(() => undefined);
    }
  };

  const onConnect = (activeTransport: Transport): void => {
    if (phase !== "running" || transport !== activeTransport || connected) return;
    connected = true;
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
    if (runningTimeoutId === null) {
      runningTimeoutId = opts.setTimeout(() => {
        if (phase === "running") void requestFinish("duration").catch(() => undefined);
      }, settings.capture_duration_ms);
    }
  };

  const onData = (activeTransport: Transport, chunk: unknown): void => {
    if (phase !== "running" || transport !== activeTransport || !connected) return;
    if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0) return;
    if (pendingAppend) return;

    const remaining = settings.maximum_bytes - byteCount;
    if (remaining <= 0) {
      void requestFinish("maximum_bytes").catch(() => undefined);
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
      void requestFinish("maximum_bytes").catch(() => undefined);
    } else if (recordCount >= settings.maximum_records) {
      void requestFinish("maximum_records").catch(() => undefined);
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

  const start = async (): Promise<void> => {
    if (phase !== "stopped") throw new Error(`capture phase is ${phase}`);

    phase = "starting";
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
    lastFailure = null;
    pendingStop = null;
    connected = false;
    logger.info("start", { startedAtMs, bounds });

    try {
      await store.begin(startedAtMs);
      storeActive = true;

      const request = takePendingStop();
      if (request) {
        try {
          const result = await finishCapture(request.reason);
          request.resolve(result);
          return;
        } catch (error) {
          request.reject(error);
          throw error;
        }
      }

      attachTransport();
      scheduleProgress();
      phase = "running";
    } catch (error) {
      if (getPhase() !== "stopped" && storeActive) {
        try {
          await finishCapture("error");
        } catch {
          // The start error remains the caller-visible failure.
        }
      } else {
        phase = "stopped";
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
    async stop(): Promise<CoordinatorResult> {
      if (phase === "starting") return requestFinish("stopped");
      if (phase === "running") return requestFinish("stopped");
      if (finishPromise) return finishPromise;
      if (lastFailure) return Promise.reject(lastFailure);
      if (lastResult) return lastResult;

      stoppedAtMs = opts.nowMs();
      phase = "stopped";
      lastResult = {
        ...currentSummary(),
        reason: "stopped",
        stoppedAtMs,
        phase: "stopped",
      };
      return lastResult;
    },
    getState() {
      if (phase !== "stopped") return {
        state: stateForPhase(),
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
        phase: "stopped" as const,
        lastResult: lastResult ?? undefined,
      };
    },
  };
}

function endpointPath(url: string): string {
  return url.split("?", 1)[0] ?? url;
}

function safeDownloadName(name: string | undefined): string {
  return name && /^[A-Za-z0-9_.-]+$/.test(name) ? name : "capture.ndjson";
}

export function createIngressHandler(deps: {
  getState(): CaptureSummary & { state: "running" | "stopped"; lastResult?: CoordinatorResult };
  startCapture(): Promise<void>;
  stopCapture(): Promise<CoordinatorResult>;
  createDownloadStream?(): AsyncIterable<string | Uint8Array>;
}) {
  return async (req: FakeReq, res: FakeRes): Promise<void> => {
    if (normalizeIngressPeer(req.socket.remoteAddress) === null) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }

    const path = endpointPath(req.url);
    if (path === "/api/status" && req.method === "GET") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.writeHead(200);
      res.end(JSON.stringify(deps.getState()));
      return;
    }

    if (path === "/api/capture" && req.method === "POST") {
      try {
        await deps.startCapture();
        res.writeHead(200);
        res.end("ok");
      } catch {
        res.writeHead(500);
        res.end("internal error");
      }
      return;
    }

    if (path === "/api/stop" && req.method === "POST") {
      try {
        await deps.stopCapture();
        res.writeHead(200);
        res.end("ok");
      } catch {
        res.writeHead(500);
        res.end("internal error");
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
  const serverFactory = opts.createServer ?? ((handler) => createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    void Promise.resolve().then(() => handler(
      {
        method: req.method ?? "GET",
        url: req.url ?? "/",
        socket: { remoteAddress: req.socket.remoteAddress ?? undefined },
        headers: req.headers as Record<string, string | undefined>,
      },
      createServerResponseAdapter(res)
    )).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      if (!res.writableEnded) res.end("internal error");
    });
  }));

  const settings = parseM2Settings(await readOptions(DEFAULT_OPTIONS_PATH));
  const store = opts.store ?? (
    opts.readOptions || opts.createTransport || opts.createServer
      ? createMemoryStore()
      : createCaptureStore()
  );
  const recovered = store.recover ? await store.recover() : null;
  const coordinator = createBoundedCaptureCoordinator({
    settings,
    createTransport: () => transportFactory({ host: settings.ew11_host, port: settings.ew11_port }),
    nowMs: () => Date.now(),
    setTimeout: (fn, delayMs) => setTimeout(fn, delayMs),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    store,
    initialResult: recovered ? metadataFromRecovered(recovered, settings) : undefined,
  });
  const handler = createIngressHandler({
    getState: () => coordinator.getState(),
    startCapture: () => coordinator.start(),
    stopCapture: () => coordinator.stop(),
    createDownloadStream: store.createReadStream ? () => store.createReadStream!() : undefined,
  });
  const server = serverFactory(handler);
  server.listen(8099);

  return {
    requestHandler: handler,
    async stop(): Promise<void> {
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
