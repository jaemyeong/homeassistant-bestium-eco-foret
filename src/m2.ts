import { createConnection } from "node:net";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { createCaptureRecorder, type CaptureRecord } from "./capture.ts";
import { DEFAULT_OPTIONS_PATH, parseM2Settings, type ParsedSettings } from "./settings.ts";

export { DEFAULT_OPTIONS_PATH, parseM2Settings };
export type { ParsedSettings };

type TimerToken = ReturnType<typeof setTimeout>;
type Transport = {
  on(event: string, listener: (...args: unknown[]) => unknown): unknown;
  off(event: string, listener: (...args: unknown[]) => unknown): unknown;
  removeAllListeners(): unknown;
  destroy(): unknown;
};

type CoordinatorResult = {
  reason: string;
  byteCount: number;
  recordCount: number;
  stoppedAtMs: number;
  records: CaptureRecord[];
};

type RuntimeCoordinator = {
  start(): Promise<void>;
  stop(): Promise<CoordinatorResult>;
  getState(): { state: "running" | "stopped"; lastResult?: CoordinatorResult };
};

const INGRESS_PEER_ALLOWED = "172.30.32.2";

type FakeReq = {
  method: string;
  url: string;
  socket: { remoteAddress?: string };
};

type FakeRes = {
  statusCode: number;
  headers: Map<string, string>;
  setHeader(name: string, value: string): unknown;
  writeHead(code: number): void;
  end(chunk?: string): void;
};

export function normalizeIngressPeer(remoteAddress: string | undefined): string | null {
  if (typeof remoteAddress !== "string" || remoteAddress.length === 0) return null;
  if (remoteAddress === INGRESS_PEER_ALLOWED) return INGRESS_PEER_ALLOWED;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(remoteAddress);
  return mapped?.[1] === INGRESS_PEER_ALLOWED ? INGRESS_PEER_ALLOWED : null;
}

export function createBoundedCaptureCoordinator(opts: {
  settings: ParsedSettings;
  createTransport: () => Transport;
  nowMs(): number;
  setTimeout(fn: () => void, delayMs: number): TimerToken;
  clearTimeout(id: TimerToken): void;
}): RuntimeCoordinator {
  const settings = opts.settings;
  let recorder = createCaptureRecorder();

  let state: "running" | "stopped" = "stopped";
  let running = false;
  let transport: Transport | null = null;
  let connectTimeoutId: TimerToken | null = null;
  let runningTimeoutId: TimerToken | null = null;
  let connected = false;
  let byteCount = 0;
  let records: CaptureRecord[] = [];
  let lastResult: CoordinatorResult | null = null;
  const listeners: [string, (...args: unknown[]) => void][] = [];

  const clearAll = (): void => {
    if (connectTimeoutId !== null) {
      opts.clearTimeout(connectTimeoutId);
      connectTimeoutId = null;
    }
    if (runningTimeoutId !== null) {
      opts.clearTimeout(runningTimeoutId);
      runningTimeoutId = null;
    }
    if (transport) {
      for (const [event, listener] of listeners) {
        transport.off(event, listener);
      }
      transport.removeAllListeners();
      transport.destroy();
      transport = null;
    }
    listeners.length = 0;
    connected = false;
  };

  const finish = (reason: CoordinatorResult["reason"]): void => {
    if (!running) return;
    running = false;
    state = "stopped";
    lastResult = {
      reason,
      byteCount,
      recordCount: records.length,
      stoppedAtMs: opts.nowMs(),
      records: [...records],
    };
    clearAll();
  };

  const onTimeout = (): void => {
    if (!running) return;
    finish("connect_timeout");
  };

  const onConnect = (): void => {
    if (!running || connected) return;
    connected = true;
    if (connectTimeoutId !== null) {
      opts.clearTimeout(connectTimeoutId);
      connectTimeoutId = null;
    }
    runningTimeoutId = opts.setTimeout(() => finish("duration"), settings.capture_duration_ms);
  };

  const onError = (): void => {
    finish("error");
  };

  const onClose = (): void => {
    finish("closed");
  };

  const onData = (chunk: unknown): void => {
    if (!running || !connected) return;
    if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0) return;

    const remaining = settings.maximum_bytes - byteCount;
    if (remaining <= 0) {
      finish("maximum_bytes");
      return;
    }

    const accepted = chunk.byteLength > remaining ? chunk.slice(0, remaining) : chunk;
    byteCount += accepted.byteLength;
    records.push(recorder(accepted, opts.nowMs()));

    if (byteCount >= settings.maximum_bytes) {
      finish("maximum_bytes");
      return;
    }

    if (records.length >= settings.maximum_records) {
      finish("maximum_records");
    }
  };

  return {
    async start(): Promise<void> {
      if (running) {
        throw new Error("capture already running");
      }

      state = "running";
      running = true;
      byteCount = 0;
      records = [];
      lastResult = null;
      connected = false;
      recorder = createCaptureRecorder();

      try {
        transport = opts.createTransport();

        const connectListener = () => onConnect();
        const dataListener = (chunk: unknown) => onData(chunk);
        const errorListener = () => onError();
        const closeListener = () => onClose();

        transport.on("connect", connectListener);
        transport.on("data", dataListener);
        transport.on("error", errorListener);
        transport.on("close", closeListener);
        listeners.push(["connect", connectListener], ["data", dataListener], ["error", errorListener], ["close", closeListener]);

        connectTimeoutId = opts.setTimeout(onTimeout, settings.connect_timeout_ms);
      } catch (error) {
        finish("error");
        throw error;
      }
    },

    async stop(): Promise<CoordinatorResult> {
      if (!running && lastResult !== null) {
        return lastResult;
      }

      if (!running) {
        state = "stopped";
        const stoppedAtMs = opts.nowMs();
        lastResult = {
          reason: "stopped",
          byteCount,
          recordCount: records.length,
          stoppedAtMs,
          records: [...records],
        };
        clearAll();
      } else {
        finish("stopped");
      }

      return (
        lastResult ?? {
          reason: "stopped",
          byteCount,
          recordCount: records.length,
          stoppedAtMs: opts.nowMs(),
          records: [...records],
        }
      );
    },

    getState() {
      return {
        state,
        ...(lastResult ? { lastResult } : {}),
      };
    },
  };
}

export function createIngressHandler(deps: {
  getState(): { state: "running" | "stopped"; lastResult?: CoordinatorResult };
  startCapture(): Promise<void>;
  stopCapture(): Promise<CoordinatorResult>;
}) {
  return async (req: FakeReq, res: FakeRes): Promise<void> => {
    const peer = normalizeIngressPeer(req.socket.remoteAddress);
    if (peer === null) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }

    if (req.url === "/api/status" && req.method === "GET") {
      const state = deps.getState();
      res.setHeader("content-type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify({ state: state.state, lastResult: state.lastResult }));
      return;
    }

    if (req.url === "/api/capture" && req.method === "POST") {
      try {
        await deps.startCapture();
      } catch {
        res.writeHead(500);
        res.end("internal error");
        return;
      }
      res.writeHead(200);
      res.end("ok");
      return;
    }

    if (req.url === "/api/stop" && req.method === "POST") {
      try {
        await deps.stopCapture();
      } catch {
        res.writeHead(500);
        res.end("internal error");
        return;
      }
      res.writeHead(200);
      res.end("ok");
      return;
    }

    if (req.url === "/" && req.method === "GET") {
      const state = deps.getState();
      res.setHeader("content-type", "text/html");
      res.writeHead(200);
      res.end(`<html><body><pre>current:${state.state}</pre><pre>last:${JSON.stringify(state.lastResult ?? null)}</pre></body></html>`);
      return;
    }

    res.writeHead(404);
    res.end("not found");
  };
}

export async function startM2Runtime(opts: {
  readOptions?(path: string): Promise<unknown>;
  createTransport?(input: { host: string; port: number }): Transport;
  createServer?: (
    handler: (req: FakeReq, res: FakeRes) => Promise<void> | void,
  ) => { listen(port: number, cb?: () => void): void; close(): void };
} = {}): Promise<{
  requestHandler(req: FakeReq, res: FakeRes): Promise<void>;
  stop(): Promise<void>;
}> {
  const readOptions = opts.readOptions ?? (async (path: string): Promise<unknown> => {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  });
  const createTransport = opts.createTransport ?? ((input: { host: string; port: number }): Transport => {
    return createConnection(input);
  });
  const createServer = opts.createServer ?? ((handler) => {
    return createHttpServer((req: IncomingMessage, res: ServerResponse): void => {
      void Promise.resolve()
        .then(() => handler(
          {
            method: req.method ?? "GET",
            url: req.url ?? "/",
            socket: { remoteAddress: req.socket.remoteAddress },
          },
          {
            setHeader(name, value) {
              res.setHeader(name, value);
              return this;
            },
            writeHead(code) {
              res.writeHead(code);
            },
            statusCode: 0,
            headers: new Map<string, string>(),
            end(body) {
              if (body === undefined) {
                res.end();
              } else {
                res.end(body);
              }
            },
          } as FakeRes,
        ))
        .catch(() => {
          if (!res.headersSent) res.writeHead(500);
          if (!res.writableEnded) res.end("internal error");
        });
    });
  });
  const rawOptions = await readOptions(DEFAULT_OPTIONS_PATH);
  const settings = parseM2Settings(rawOptions);

  let activeTransport: Transport | null = null;
  const coordinator = createBoundedCaptureCoordinator({
    settings,
    createTransport: () => {
      const transport = createTransport({
        host: settings.ew11_host,
        port: settings.ew11_port,
      });
      activeTransport = transport;
      return transport;
    },
    nowMs: () => Date.now(),
    setTimeout: (fn, delayMs) => setTimeout(fn, delayMs),
    clearTimeout: (id) => clearTimeout(id),
  });

  const handler = createIngressHandler({
    getState: () => coordinator.getState(),
    startCapture: () => coordinator.start(),
    stopCapture: () => coordinator.stop(),
  });

  const server = createServer(handler);
  server.listen(8099);

  return {
    requestHandler: handler,
    async stop(): Promise<void> {
      server.close();
      await coordinator.stop();
      if (activeTransport) {
        activeTransport.destroy();
        activeTransport.removeAllListeners();
        activeTransport = null;
      }
    },
  };
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const runtime = await startM2Runtime();

  process.on("SIGTERM", () => {
    void runtime.stop();
  });
}
