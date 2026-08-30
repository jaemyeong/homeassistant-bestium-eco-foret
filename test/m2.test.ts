import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

import { encodeSemanticAction } from "../bestium-eco-foret/src/protocol-debug.ts";

const root = new URL("..", import.meta.url);
const APP_FOLDER = "bestium-eco-foret";
const EXPECTED_VERSION = "0.3.1";
const VALID_CHALLENGE_ID = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const VALID_UNKNOWN_CHALLENGE_ID = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const appRoot = new URL(`${APP_FOLDER}/`, root);
const layoutPaths = {
  repository: new URL("repository.yaml", root),
  appRoot,
  config: new URL("config.json", appRoot),
  dockerfile: new URL("Dockerfile", appRoot),
  dockerIgnore: new URL(".dockerignore", appRoot),
  package: new URL("package.json", appRoot),
  captureSource: new URL("src/capture.ts", appRoot),
  captureStoreSource: new URL("src/capture-store.ts", appRoot),
  settingsSource: new URL("src/settings.ts", appRoot),
  m2Source: new URL("src/m2.ts", appRoot),
  uiSource: new URL("src/ui.ts", appRoot),
};
const paths = {
  config: layoutPaths.config,
  dockerfile: layoutPaths.dockerfile,
  dockerIgnore: layoutPaths.dockerIgnore,
  captureSource: layoutPaths.captureSource,
  captureStoreSource: layoutPaths.captureStoreSource,
  settingsSource: layoutPaths.settingsSource,
  m2Source: layoutPaths.m2Source,
  uiSource: layoutPaths.uiSource,
};
const rootAppArtifacts = {
  config: new URL("config.json", root),
  dockerfile: new URL("Dockerfile", root),
  dockerIgnore: new URL(".dockerignore", root),
  source: new URL("src/", root),
};

const CONFIG_TOP_KEYS = [
  "name",
  "slug",
  "description",
  "version",
  "arch",
  "boot",
  "stage",
  "panel_admin",
  "ingress",
  "ingress_port",
  "panel_icon",
  "panel_title",
  "options",
  "schema",
] as const;
const CONFIG_STRING_KEYS = ["name", "slug", "description"] as const;
const CONFIG_OPTION_DEFAULT_KEYS = [
  "connect_timeout_ms",
  "idle_timeout_ms",
  "capture_duration_ms",
  "maximum_bytes",
  "maximum_records",
  "transmit_enabled",
  "speculative_transmit_enabled",
  "unsafe_transmit_enabled",
  "tx_write_timeout_ms",
  "tx_observation_timeout_ms",
  "tx_cooldown_ms",
  "tx_quiet_ms",
  "tx_max_attempts",
  "speculative_tx_cooldown_ms",
  "unsafe_tx_cooldown_ms",
] as const;
const CONFIG_SCHEMA_KEYS = [
  "ew11_host",
  "ew11_port",
  "connect_timeout_ms",
  "idle_timeout_ms",
  "capture_duration_ms",
  "maximum_bytes",
  "maximum_records",
  "transmit_enabled",
  "speculative_transmit_enabled",
  "unsafe_transmit_enabled",
  "transmit_user_id",
  "tx_write_timeout_ms",
  "tx_observation_timeout_ms",
  "tx_cooldown_ms",
  "tx_quiet_ms",
  "tx_max_attempts",
  "speculative_tx_cooldown_ms",
  "unsafe_tx_cooldown_ms",
] as const;
const REQUIRED_RUNTIME_INPUT_KEYS = ["ew11_host", "ew11_port"] as const;
const EXACT_ARCH = ["aarch64", "amd64"] as const;
const DOCKERFILE_COPY_ALLOWLIST = [
  "package.json",
  "src/capture.ts",
  "src/capture-store.ts",
  "src/settings.ts",
  "src/m2.ts",
  "src/protocol-debug.ts",
  "src/tx-queue.ts",
  "src/ha-design-system.ts",
  "src/ui.ts",
] as const;
const DOCKERIGNORE_INCLUDES = [
  "!package.json",
  "!src/",
  "!src/capture.ts",
  "!src/capture-store.ts",
  "!src/settings.ts",
  "!src/m2.ts",
  "!src/protocol-debug.ts",
  "!src/tx-queue.ts",
  "!src/ha-design-system.ts",
  "!src/ui.ts",
] as const;
const DOCKERIGNORE_FORBIDDEN = [".env", ".env*", ".git", ".agent", ".codex", ".serena", ".codegraph", "graphify-out"] as const;
const EXPECTED_REPOSITORY_LINES = [
  "name: BESTIUM Eco-Foret Home Assistant App",
  "url: https://github.com/jaemyeong/homeassistant-bestium-eco-foret",
  "maintainer: jaemyeong",
] as const;

type AnyRecord = Record<string, any>;
type Listener = (...args: any[]) => void;
type FakeTransport = {
  on(event: string, listener: Listener): FakeTransport;
  off(event: string, listener: Listener): FakeTransport;
  removeAllListeners(): FakeTransport;
  pause(): FakeTransport;
  resume(): FakeTransport;
  setTimeout(timeoutMs: number): FakeTransport;
  destroy(): void;
  emit(event: string, ...args: unknown[]): void;
  listenerCount(): number;
  isDestroyed(): boolean;
  pauseCount(): number;
  resumeCount(): number;
};

type FakeTimer = {
  nowMs(): number;
  pendingCount(): number;
  advance(ms: number): void;
  setTimeout(fn: () => void, delayMs: number): unknown;
  clearTimeout(id: unknown): void;
};

type FakeReq = {
  method: string;
  url: string;
  socket: { remoteAddress?: string };
  headers: Record<string, string>;
  body?: string;
};
type FakeRes = {
  statusCode: number;
  headers: Map<string, string>;
  body: string;
  writes: string[];
  setHeader(name: string, value: string): FakeRes;
  writeHead(code: number): void;
  write(chunk: string | Uint8Array): boolean;
  end(chunk?: string): void;
  once?(event: string, listener: Listener): FakeRes;
  off?(event: string, listener: Listener): FakeRes;
  destroy?(): void;
  writableEnded?: boolean;
};

type ServerResponseAdapter = {
  setHeader(name: string, value: string): unknown;
  writeHead(code: number): void;
  write(chunk: string | Uint8Array): boolean;
  end(chunk?: string): void;
  once(event: string, listener: Listener): unknown;
  off(event: string, listener: Listener): unknown;
  destroy(error?: Error): unknown;
  readonly writableEnded: boolean;
};

const COORDINATOR_RECORD_TS = 1_700_000_000;

type CaptureRecord = { sequence: number; receivedAtMs: number; byteLength: number; hex: string };
type CaptureFileMetadata = {
  name: string;
  sizeBytes: number;
  finalized: boolean;
};
type CaptureSummary = {
  startedAtMs: number;
  elapsedMs: number;
  limitMs: number;
  byteCount: number;
  recordCount: number;
  file: CaptureFileMetadata | null;
  preview: CaptureRecord[];
  phase?: "starting" | "running" | "finalizing" | "stopped";
  bounds?: AnyRecord;
};
type IngressState = CaptureSummary & {
  state: "running" | "stopped";
  lastResult?: CoordinatorResult;
  [key: string]: any;
};
type CoordinatorResult = CaptureSummary & {
  reason: string;
  stoppedAtMs: number;
};
type CaptureStore = {
  begin(startedAtMs: number): Promise<void>;
  append(line: string): Promise<void>;
  finalize(summary: CaptureSummary & { reason: string }): Promise<CaptureFileMetadata>;
};
type StoreFileMetadata = CaptureFileMetadata & {
  filename: string;
  path: string;
  reason: string;
  downloadable: boolean;
};
type StoreFs = {
  readdir(path: string): Promise<string[]>;
  rename(from: string, to: string): Promise<void>;
  createReadStream(path: string): AsyncIterable<string | Uint8Array>;
  mkdir?(path: string, options: { recursive: boolean }): Promise<void>;
  createWriteStream?(
    path: string,
    options: { flags: string; flush: boolean },
  ): WriteStream;
  stat?(path: string): Promise<{ size: number }>;
};
type WriteStream = {
  write(
    chunk: string,
    encoding: string,
    callback: (error?: Error | null) => void,
  ): boolean;
  once(event: string, listener: Listener): unknown;
  off(event: string, listener: Listener): unknown;
  end(): void;
  destroy?(): void;
};
type StoreFsCalls = {
  readdir: string[];
  rename: Array<{ from: string; to: string }>;
  readStream: string[];
};
type CaptureStoreExports = {
  createCaptureStore(opts: { fs: StoreFs; nowMs?(): number }): {
    recover(): Promise<StoreFileMetadata | null>;
    createReadStream(): AsyncIterable<string | Uint8Array>;
    begin(startedAtMs: number): Promise<void>;
    append(line: string): Promise<void>;
    finalize(summary: AnyRecord): Promise<CaptureFileMetadata>;
  };
};
type AppLogger = {
  info(event: string, summary: AnyRecord): void;
  error(event: string, summary: AnyRecord): void;
};
type RuntimeCoordinator = {
  start(): Promise<void>;
  stop(): Promise<CoordinatorResult>;
  getState(): CaptureSummary & { state: "running" | "stopped"; lastResult?: CoordinatorResult };
};
type M2Settings = {
  ew11_host: string;
  ew11_port: number;
  connect_timeout_ms: number;
  idle_timeout_ms: number;
  capture_duration_ms: number;
  maximum_bytes: number;
  maximum_records: number;
  transmit_enabled?: boolean;
  speculative_transmit_enabled?: boolean;
  unsafe_transmit_enabled?: boolean;
  transmit_user_id?: string;
  tx_write_timeout_ms?: number;
  tx_observation_timeout_ms?: number;
  tx_cooldown_ms?: number;
  tx_quiet_ms?: number;
  tx_max_attempts?: number;
  speculative_tx_cooldown_ms?: number;
  unsafe_tx_cooldown_ms?: number;
};

type RuntimeExports = {
  DEFAULT_OPTIONS_PATH?: string;
  parseM2Settings(raw: unknown): M2Settings;
  createBoundedCaptureCoordinator(opts: {
    settings: M2Settings;
    createTransport: () => FakeTransport;
    nowMs(): number;
    setTimeout(fn: () => void, delayMs: number): unknown;
    clearTimeout(id: unknown): void;
    store?: CaptureStore;
    logger?: AppLogger;
  }): RuntimeCoordinator;
  normalizeIngressPeer(remoteAddress: string | undefined): string | null;
  createServerResponseAdapter(response: unknown): ServerResponseAdapter;
  createIngressHandler(deps: {
    getState(): CaptureSummary & { state: "running" | "stopped"; lastResult?: CoordinatorResult };
    startCapture(): Promise<void>;
    stopCapture(): Promise<CoordinatorResult>;
    createDownloadStream?(): AsyncIterable<string | Uint8Array>;
    getAuthenticatedIngressUserId?(): string | undefined;
    getConfiguredTransmitUserId?(): string | undefined;
    getTxStatus?(): Record<string, unknown>;
    csrfToken?: string;
    nowMs?(): number;
    issueSpeculativeChallenge?(action: AnyRecord, request: AnyRecord): Record<string, unknown> | Promise<Record<string, unknown>>;
    cancelSpeculativeChallenge?(id: string, request: AnyRecord): boolean | Record<string, unknown> | Promise<boolean | Record<string, unknown>>;
    hasOutstandingSpeculativeChallenge?(): boolean;
    executeSemanticAction?(action: AnyRecord, request?: AnyRecord): Record<string, unknown> | Promise<Record<string, unknown>>;
  }): (req: FakeReq, res: FakeRes) => Promise<void> | void;
  startM2Runtime(opts: {
    readOptions(path: string): Promise<unknown>;
    createTransport(input: { host: string; port: number }): FakeTransport;
    createServer(
      handler: (req: FakeReq, res: FakeRes) => Promise<void> | void,
    ): { listen(port: number, cb?: () => void): void; close(): void };
    store?: CaptureStore;
  }): Promise<{
    requestHandler(req: FakeReq, res: FakeRes): Promise<void> | void;
    stop(): Promise<void>;
  }>;
};

type NumericBound = {
  name: keyof Pick<
    M2Settings,
    | "connect_timeout_ms"
    | "idle_timeout_ms"
    | "capture_duration_ms"
    | "maximum_bytes"
    | "maximum_records"
    | "tx_write_timeout_ms"
    | "tx_observation_timeout_ms"
    | "tx_cooldown_ms"
    | "tx_quiet_ms"
    | "tx_max_attempts"
    | "speculative_tx_cooldown_ms"
    | "unsafe_tx_cooldown_ms"
  >;
  min: number;
  max: number;
};

const numericBounds: readonly NumericBound[] = [
  { name: "connect_timeout_ms", min: 100, max: 30_000 },
  { name: "idle_timeout_ms", min: 5_000, max: 3_600_000 },
  { name: "capture_duration_ms", min: 100, max: 86_400_000 },
  { name: "maximum_bytes", min: 1, max: 67_108_864 },
  { name: "maximum_records", min: 1, max: 1_000_000 },
] as const;
const txNumericBounds: readonly NumericBound[] = [
  { name: "tx_write_timeout_ms", min: 100, max: 10_000 },
  { name: "tx_observation_timeout_ms", min: 1_000, max: 30_000 },
  { name: "tx_cooldown_ms", min: 0, max: 10_000 },
  { name: "tx_quiet_ms", min: 5, max: 1_000 },
  { name: "tx_max_attempts", min: 1, max: 10 },
  { name: "speculative_tx_cooldown_ms", min: 1_000, max: 60_000 },
  { name: "unsafe_tx_cooldown_ms", min: 1_000, max: 60_000 },
] as const;

function path(url: URL): string {
  return fileURLToPath(url);
}

function readText(url: URL, label: string): string {
  const p = path(url);
  assert.ok(existsSync(p), `RED-M2 missing ${label}: ${p}`);
  return readFileSync(p, "utf8");
}

function requireFile(url: URL, label: string): void {
  assert.ok(existsSync(path(url)), `RED-M2 missing ${label}: ${path(url)}`);
}

function parseJson<T>(text: string): T {
  return JSON.parse(text) as T;
}

function assertExactSet(values: readonly string[], expected: readonly string[], label: string): void {
  assert.equal(
    values.length,
    [...new Set(values)].length,
    `${label}: duplicate entries found`,
  );
  assert.deepStrictEqual(
    [...values].sort(),
    [...expected].sort(),
    `${label}: unexpected values`,
  );
}

function createFakeTransport(
  events: string[] = [],
  timeoutValues: number[] = [],
  bufferDataWhilePaused = false,
): FakeTransport {
  const listeners = new Map<string, Set<Listener>>();
  const bufferedData: unknown[][] = [];
  let destroyed = false;
  let paused = false;
  let pauses = 0;
  let resumes = 0;
  const emitData = (args: unknown[]): void => {
    for (const listener of listeners.get("data") ?? []) listener(...args);
  };
  return {
    on(event, listener) {
      const bucket = listeners.get(event) ?? new Set<Listener>();
      bucket.add(listener);
      listeners.set(event, bucket);
      return this;
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
      return this;
    },
    removeAllListeners() {
      listeners.clear();
      return this;
    },
    pause() {
      pauses += 1;
      paused = true;
      events.push("transport.pause");
      return this;
    },
    resume() {
      resumes += 1;
      paused = false;
      events.push("transport.resume");
      if (bufferDataWhilePaused) {
        const queued = bufferedData.splice(0);
        for (const args of queued) emitData(args);
      }
      return this;
    },
    setTimeout(timeoutMs) {
      timeoutValues.push(timeoutMs);
      events.push(`transport.setTimeout:${timeoutMs}`);
      return this;
    },
    destroy() {
      events.push("transport.destroy");
      destroyed = true;
    },
    emit(event, ...args: unknown[]) {
      if (paused && event === "data") {
        if (bufferDataWhilePaused) bufferedData.push(args);
        return;
      }
      if (event === "data") {
        emitData(args);
        return;
      }
      for (const listener of listeners.get(event) ?? []) listener(...args);
    },
    listenerCount() {
      let total = 0;
      for (const bucket of listeners.values()) total += bucket.size;
      return total;
    },
    isDestroyed() {
      return destroyed;
    },
    pauseCount() {
      return pauses;
    },
    resumeCount() {
      return resumes;
    },
  };
}

function createFakeTimer(scheduledDelays: number[] = []): FakeTimer {
  let now = 1_700_000_000;
  let nextId = 1;
  const pending = new Map<number, { due: number; cb: () => void }>();

  return {
    nowMs() {
      return now;
    },
    pendingCount() {
      return pending.size;
    },
    advance(ms: number) {
      const target = now + ms;
      while (true) {
        let nearest: number | undefined;
        let at = Infinity;
        let cb: (() => void) | undefined;
        for (const [id, task] of pending) {
          if (task.due <= target && task.due < at) {
            nearest = id;
            at = task.due;
            cb = task.cb;
          }
        }
        if (nearest === undefined || cb === undefined) break;
        now = at;
        pending.delete(nearest);
        cb();
      }
      now = target;
    },
    setTimeout(cb, delayMs) {
      scheduledDelays.push(delayMs);
      const id = nextId++;
      pending.set(id, { due: now + delayMs, cb });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id as number);
    },
  };
}

function createFakeStore(events: string[] = []): CaptureStore & {
  lines: string[];
  finalized: boolean;
  finalizeCalls: number;
  finalFile: CaptureFileMetadata;
} {
  const lines: string[] = [];
  const finalFile: CaptureFileMetadata = {
    name: "capture.ndjson",
    sizeBytes: 0,
    finalized: true,
  };
  return {
    lines,
    finalized: false,
    finalizeCalls: 0,
    finalFile,
    async begin() {
      events.push("store.begin");
    },
    async append(line) {
      lines.push(line);
    },
    async finalize() {
      events.push("store.finalize");
      this.finalizeCalls += 1;
      this.finalFile.sizeBytes = lines.reduce(
        (total, line) => total + new TextEncoder().encode(line).byteLength,
        0,
      );
      this.finalized = true;
      return this.finalFile;
    },
  };
}

function createReq(init: Partial<FakeReq> = {}): FakeReq {
  return {
    method: init.method ?? "GET",
    url: init.url ?? "/",
    socket: { remoteAddress: init.socket?.remoteAddress },
    headers: init.headers ?? {},
    body: init.body,
  };
}

function createRes(): FakeRes {
  const chunks: string[] = [];
  const headers = new Map<string, string>();
  return {
    statusCode: 200,
    headers,
    body: "",
    writes: chunks,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    write(chunk) {
      chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    },
    end(chunk) {
      if (typeof chunk === "string") chunks.push(chunk);
      this.body = chunks.join("");
    },
  };
}

function createStreamingRes(opts: { blockWrites?: boolean } = {}): FakeRes & {
  emit(event: string, ...args: unknown[]): void;
  releaseDrain(): void;
  isDestroyed(): boolean;
} {
  const listeners = new Map<string, Set<Listener>>();
  const response = createRes() as FakeRes & {
    emit(event: string, ...args: unknown[]): void;
    releaseDrain(): void;
    isDestroyed(): boolean;
  };
  let destroyed = false;
  let blocked = opts.blockWrites ?? false;
  const emit = (event: string, ...args: unknown[]): void => {
    for (const listener of listeners.get(event) ?? []) listener(...args);
    listeners.delete(event);
  };
  response.once = (event, listener) => {
    const bucket = listeners.get(event) ?? new Set<Listener>();
    bucket.add(listener);
    listeners.set(event, bucket);
    return response;
  };
  response.off = (event, listener) => {
    listeners.get(event)?.delete(listener);
    return response;
  };
  response.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    emit("close");
  };
  response.write = (chunk) => {
    response.writes.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    if (blocked) return false;
    return true;
  };
  response.emit = emit;
  response.releaseDrain = () => {
    blocked = false;
    emit("drain");
  };
  response.isDestroyed = () => destroyed;
  return response;
}

function parseCopySourcesFromDockerfile(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("COPY ")) continue;
    const rhs = trimmed.slice(5).trim();
    if (rhs.startsWith("[")) {
      const parsed = parseJson<string[]>(rhs);
      assert.ok(Array.isArray(parsed));
      assert.equal(parsed.length >= 2, true);
      out.push(...parsed.slice(0, -1));
      continue;
    }
    const tokens = rhs.split(/\s+/).filter((token) => !token.startsWith("--"));
    assert.equal(tokens.length >= 2, true);
    out.push(...tokens.slice(0, -1));
  }
  return out;
}

function readConfigLines(url: URL): string[] {
  return readText(url, path(url))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

test("RED: URL-installable repository layout is canonical", () => {
  assert.deepStrictEqual(
    readConfigLines(layoutPaths.repository),
    [...EXPECTED_REPOSITORY_LINES],
    "repository.yaml fields",
  );
  requireFile(layoutPaths.appRoot, `App folder ${APP_FOLDER}`);

  const config = parseJson<AnyRecord>(readText(layoutPaths.config, "App config.json"));
  assert.equal(config.slug, APP_FOLDER, "config slug must match the App folder");
  const rootPackage = parseJson<AnyRecord>(readText(new URL("package.json", root), "root package.json"));
  const appPackage = parseJson<AnyRecord>(readText(layoutPaths.package, "App package.json"));
  assert.deepStrictEqual(appPackage, rootPackage, "root and App package.json must match");
  assert.equal(rootPackage.version, EXPECTED_VERSION, "root package version");
  assert.equal(appPackage.version, EXPECTED_VERSION, "App package version");
  for (const [label, url] of Object.entries({
    config: layoutPaths.config,
    Dockerfile: layoutPaths.dockerfile,
    ".dockerignore": layoutPaths.dockerIgnore,
    "App package.json": layoutPaths.package,
    "src/capture.ts": layoutPaths.captureSource,
    "src/capture-store.ts": layoutPaths.captureStoreSource,
    "src/settings.ts": layoutPaths.settingsSource,
    "src/m2.ts": layoutPaths.m2Source,
    "src/ui.ts": layoutPaths.uiSource,
  })) {
    requireFile(url, `App ${label}`);
  }

  for (const [label, url] of Object.entries({
    "root config.json": rootAppArtifacts.config,
    "root Dockerfile": rootAppArtifacts.dockerfile,
    "root .dockerignore": rootAppArtifacts.dockerIgnore,
    "root src/": rootAppArtifacts.source,
  })) {
    assert.equal(existsSync(path(url)), false, `${label} must be absent after the move`);
  }
});

function validSettings(overrides: AnyRecord = {}): M2Settings {
  return {
    ew11_host: "gateway-1",
    ew11_port: 9001,
    connect_timeout_ms: 3_000,
    idle_timeout_ms: 30_000,
    capture_duration_ms: 5_000,
    maximum_bytes: 65_536,
    maximum_records: 1_000,
    transmit_enabled: false,
    speculative_transmit_enabled: false,
    unsafe_transmit_enabled: false,
    tx_write_timeout_ms: 1_000,
    tx_observation_timeout_ms: 10_000,
    tx_cooldown_ms: 250,
    tx_quiet_ms: 20,
    speculative_tx_cooldown_ms: 5_000,
    unsafe_tx_cooldown_ms: 5_000,
    ...overrides,
  } as M2Settings;
}

function importM2(): Promise<RuntimeExports> {
  requireFile(paths.m2Source, "src/m2.ts");
  return import(pathToFileURL(path(paths.m2Source)).href) as Promise<RuntimeExports>;
}

function importCaptureStore(): Promise<CaptureStoreExports> {
  requireFile(paths.captureStoreSource, "src/capture-store.ts");
  return import(pathToFileURL(path(paths.captureStoreSource)).href) as Promise<CaptureStoreExports>;
}

function createFakeStoreFs(initial: Record<string, string> = {}): StoreFs & {
  calls: StoreFsCalls;
  files: Map<string, string>;
} {
  const files = new Map(Object.entries(initial));
  const calls: StoreFsCalls = { readdir: [], rename: [], readStream: [] };
  return {
    files,
    calls,
    async readdir(directory) {
      calls.readdir.push(directory);
      const prefix = `${directory}/`;
      return [...files.keys()]
        .filter((filePath) => filePath.startsWith(prefix))
        .map((filePath) => filePath.slice(prefix.length));
    },
    async rename(from, to) {
      calls.rename.push({ from, to });
      const data = files.get(from);
      files.delete(from);
      if (data !== undefined) files.set(to, data);
    },
    createReadStream(filePath) {
      calls.readStream.push(filePath);
      const data = files.get(filePath) ?? "";
      return (async function* () {
        yield data;
      })();
    },
  };
}

function createFakeWriteStream(opts: { error?: Error; defer?: boolean; deferClose?: boolean } = {}): WriteStream & {
  emit(event: string, ...args: unknown[]): void;
  unhandledErrors: Error[];
  writeCalls: number;
} {
  const listeners = new Map<string, Set<Listener>>();
  const unhandledErrors: Error[] = [];
  let writeCalls = 0;
  const emit = (event: string, ...args: unknown[]): void => {
    const bucket = listeners.get(event);
    if (!bucket || bucket.size === 0) {
      if (event === "error" && args[0] instanceof Error) unhandledErrors.push(args[0]);
      return;
    }
    listeners.delete(event);
    for (const listener of bucket) listener(...args);
  };
  const stream: WriteStream & {
    emit(event: string, ...args: unknown[]): void;
    unhandledErrors: Error[];
    writeCalls: number;
  } = {
    unhandledErrors,
    get writeCalls() {
      return writeCalls;
    },
    once(event, listener) {
      const bucket = listeners.get(event) ?? new Set<Listener>();
      bucket.add(listener);
      listeners.set(event, bucket);
      return stream;
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
      return stream;
    },
    write(_chunk, _encoding, callback) {
      writeCalls += 1;
      callback(null);
      return true;
    },
    end() {
      emit("finish");
      if (!opts.deferClose) emit("close");
    },
    destroy() {},
    emit,
  };
  if (!opts.defer) {
    Promise.resolve().then(() => {
      if (opts.error) emit("error", opts.error);
      else {
        emit("open");
        emit("ready");
      }
    });
  }
  return stream;
}

test("RED: required M2 artifacts must exist", () => {
  requireFile(paths.config, "config.json");
  requireFile(paths.dockerfile, "Dockerfile");
  requireFile(paths.dockerIgnore, ".dockerignore");
  requireFile(paths.captureSource, "src/capture.ts");
  requireFile(paths.captureStoreSource, "src/capture-store.ts");
  requireFile(paths.settingsSource, "src/settings.ts");
  requireFile(paths.m2Source, "src/m2.ts");
  requireFile(paths.uiSource, "src/ui.ts");
});

test("RED: production store recovers one internal partial capture without client paths", async () => {
  const storeModule = await importCaptureStore();
  const partialPath = "/data/captures/capture-1700000000000.partial.ndjson";
  const fs = createFakeStoreFs({ [partialPath]: '{"sequence":0}\n' });
  const store = storeModule.createCaptureStore({
    fs,
    nowMs: () => COORDINATOR_RECORD_TS,
  });

  const recovered = await store.recover();
  if (recovered === null) throw new Error("an existing partial capture must be recovered");
  assert.equal(fs.calls.readdir.length > 0, true);
  assert.equal(fs.calls.readdir.every((directory) => directory === "/data/captures"), true);
  assert.deepStrictEqual(fs.calls.rename, [
    { from: partialPath, to: "/data/captures/capture-1700000000000.ndjson" },
  ]);
  assert.equal(recovered.reason, "interrupted");
  assert.equal(recovered.finalized, true);
  assert.equal(recovered.downloadable, true);
  assert.equal(recovered.path, fs.calls.rename[0]?.to);
  assert.match(recovered.filename, /^capture-[A-Za-z0-9_-]+\.ndjson$/);
  assert.doesNotMatch(recovered.filename, /[/\\]|\.\./);
  assert.equal(recovered.path.startsWith("/data/captures/"), true);

  const clientPath = "/etc/passwd";
  const stream = (store.createReadStream as unknown as (path?: string) => AsyncIterable<string>)(clientPath);
  const chunks: string[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.deepStrictEqual(fs.calls.readStream, ["/data/captures/capture-1700000000000.ndjson"]);
  assert.equal(fs.calls.readStream.includes(clientPath), false);
  assert.equal(chunks.join(""), '{"sequence":0}\n');
});

test("RED: config strictness and exact static contract", () => {
  const config = parseJson<AnyRecord>(readText(paths.config, "config.json"));

  assertExactSet(Object.keys(config), CONFIG_TOP_KEYS, "config top-level allowlist");
  for (const key of CONFIG_STRING_KEYS) {
    assert.equal(typeof config[key], "string");
    assert.equal((config[key] as string).trim().length > 0, true);
  }
  assert.equal(config.version, EXPECTED_VERSION);
  assert.equal(config.boot, "auto");
  assert.equal(config.stage, "experimental");
  assert.equal(config.panel_admin, true);
  assert.equal(config.ingress, true);
  assert.equal(config.ingress_port, 8099);
  assert.equal(config.panel_icon, "mdi:radio-tower");
  assert.equal(config.panel_title, "BESTIUM 월패드");

  if (!Array.isArray(config.arch)) throw new TypeError("config.arch must be array");
  assert.equal(config.arch.length, 2);
  assertExactSet(config.arch as string[], EXACT_ARCH, "config.arch");

  const options = parseJson<AnyRecord>(JSON.stringify(config.options));
  assertExactSet(Object.keys(options), CONFIG_OPTION_DEFAULT_KEYS, "config.options defaults");
  assert.deepStrictEqual(options, {
    connect_timeout_ms: 3_000,
    idle_timeout_ms: 30_000,
    capture_duration_ms: 5_000,
    maximum_bytes: 65_536,
    maximum_records: 1_000,
    transmit_enabled: false,
    speculative_transmit_enabled: false,
    unsafe_transmit_enabled: false,
    tx_write_timeout_ms: 1_000,
    tx_observation_timeout_ms: 4_600,
    tx_cooldown_ms: 250,
    tx_quiet_ms: 60,
    tx_max_attempts: 3,
    speculative_tx_cooldown_ms: 1_000,
    unsafe_tx_cooldown_ms: 5_000,
  });
  for (const key of CONFIG_OPTION_DEFAULT_KEYS) {
    if (key === "transmit_enabled" || key === "speculative_transmit_enabled" || key === "unsafe_transmit_enabled") {
      assert.equal(typeof options[key], "boolean");
    } else {
      assert.equal(typeof options[key], "number");
      assert.equal(Number.isSafeInteger(options[key]), true);
    }
  }

  for (const required of REQUIRED_RUNTIME_INPUT_KEYS) {
    assert.equal(required in options, false, `RED-M2: ${required} must not be in defaults`);
  }

  const schema = parseJson<AnyRecord>(JSON.stringify(config.schema));
  assertExactSet(Object.keys(schema), CONFIG_SCHEMA_KEYS, "config.schema key allowlist");
  assert.equal(schema.ew11_host, "str(1,253)");
  assert.equal(schema.ew11_port, "port");
  assert.equal(schema.connect_timeout_ms, "int(100,30000)");
  assert.equal(schema.idle_timeout_ms, "int(5000,3600000)");
  assert.equal(schema.capture_duration_ms, "int(100,86400000)");
  assert.equal(schema.maximum_bytes, "int(1,67108864)");
  assert.equal(schema.maximum_records, "int(1,1000000)");
  assert.equal(schema.transmit_enabled, "bool");
  assert.equal(schema.speculative_transmit_enabled, "bool");
  assert.equal(schema.unsafe_transmit_enabled, "bool");
  assert.equal(schema.transmit_user_id, "str(1,128)?");
  assert.equal(schema.tx_write_timeout_ms, "int(100,10000)");
  assert.equal(schema.tx_observation_timeout_ms, "int(1000,30000)");
  assert.equal(schema.tx_cooldown_ms, "int(0,10000)");
  assert.equal(schema.tx_quiet_ms, "int(5,1000)");
  assert.equal(schema.tx_max_attempts, "int(1,10)");
  assert.equal(schema.speculative_tx_cooldown_ms, "int(1000,60000)");
  assert.equal(schema.unsafe_tx_cooldown_ms, "int(1000,60000)");
});

test("RED: Dockerfile allowlist and pinned production constraints", () => {
  const dockerfile = readText(paths.dockerfile, "Dockerfile");
  assert.match(dockerfile, /^FROM\s+node:24\.19\.0-bookworm-slim/im);
  assert.match(dockerfile, /^LABEL\b/im);
  const versionLabel = /^LABEL\s+io\.hass\.version\s*=\s*["']([^"']+)["']\s*$/im.exec(dockerfile);
  if (versionLabel === null) throw new Error("Dockerfile must declare io.hass.version");
  assert.equal(versionLabel[1], EXPECTED_VERSION);
  assert.match(dockerfile, /io\.hass\.type\s*=\s*["']app["']/i);
  assert.match(dockerfile, /io\.hass\.arch\s*=\s*["']aarch64\|amd64["']/i);
  assert.equal(/^\s*USER\b/im.test(dockerfile), false, "Dockerfile must retain the base image user for /data/options.json access");
  assert.equal(/(npm|yarn|pnpm)\s+(install|add)/.test(dockerfile), false);

  const copies = parseCopySourcesFromDockerfile(dockerfile);
  assert.ok(copies.length > 0, "RED-M2 no COPY source parsed");
  for (const source of copies) {
    assert.ok((DOCKERFILE_COPY_ALLOWLIST as readonly string[]).includes(source), `RED-M2 disallowed COPY source: ${source}`);
    assert.equal(source.includes("*"), false);
  }
  assertExactSet(copies, DOCKERFILE_COPY_ALLOWLIST, "Dockerfile copy allowlist");
});

test("RED: dockerignore must deny-by-default with exact re-include allowlist", () => {
  const lines = readConfigLines(paths.dockerIgnore);
  assert.equal(lines[0], "**", "Dockerignore first line must deny all");

  const includes = lines.filter((line) => line.startsWith("!"));
  assert.ok(includes.includes("!src/"), ".dockerignore must include !src/");
  assertExactSet(includes, DOCKERIGNORE_INCLUDES, ".dockerignore include allowlist");
  for (const forbidden of DOCKERIGNORE_FORBIDDEN) {
    assert.equal(
      includes.some((line) => line === `!${forbidden}` || line.includes(`!${forbidden}/`)),
      false,
      `Forbidden include not allowed: ${forbidden}`,
    );
  }
  assert.equal(includes.includes("!anything.tmp"), false);
});

test("RED: settings parser strict host/port and bounded numeric validation", async () => {
  const m2 = await importM2();
  const parse = m2.parseM2Settings;

  const base = validSettings();
  const validTrimmed = parse({ ...base, ew11_host: "  gateway-1  " });
  assert.equal(validTrimmed.ew11_host, "gateway-1");
  assert.equal(validTrimmed.ew11_port, 9001);

  const invalid: Array<{ label: string; input: unknown; expect: RegExp }> = [
    { label: "null", input: null, expect: /object/i },
    { label: "array", input: [], expect: /object/i },
    { label: "string", input: "object", expect: /object/i },
    { label: "number", input: 1, expect: /object/i },
    { label: "boolean", input: true, expect: /object/i },
  ];

  for (const key of REQUIRED_RUNTIME_INPUT_KEYS) {
    const missing = { ...base };
    delete (missing as AnyRecord)[key];
    invalid.push({ label: `missing ${key}`, input: missing, expect: new RegExp(key) });
  }
  invalid.push(
    { label: "host empty", input: { ...base, ew11_host: "" }, expect: /ew11_host/i },
    { label: "host whitespace", input: { ...base, ew11_host: "   " }, expect: /ew11_host/i },
    { label: "host control chars", input: { ...base, ew11_host: "gw\u0001" }, expect: /ew11_host/i },
    { label: "host newline", input: { ...base, ew11_host: "gw\n1" }, expect: /ew11_host/i },
    { label: "host path", input: { ...base, ew11_host: "/tmp/gw" }, expect: /ew11_host/i },
    { label: "host url", input: { ...base, ew11_host: "http://gateway" }, expect: /ew11_host/i },
    { label: "host too long", input: { ...base, ew11_host: "a".repeat(254) }, expect: /ew11_host/i },
    { label: "host non-string", input: { ...base, ew11_host: 10 }, expect: /ew11_host/i },
    { label: "port non-number", input: { ...base, ew11_port: "9001" }, expect: /ew11_port/i },
    { label: "port zero", input: { ...base, ew11_port: 0 }, expect: /ew11_port/i },
    { label: "port too high", input: { ...base, ew11_port: 65_536 }, expect: /ew11_port/i },
    { label: "port fraction", input: { ...base, ew11_port: 9001.5 }, expect: /ew11_port/i },
  );
  for (const rule of numericBounds) {
    invalid.push(
      { label: `${rule.name} non-number`, input: { ...base, [rule.name]: `bad-${rule.name}` }, expect: new RegExp(rule.name) },
      { label: `${rule.name} NaN`, input: { ...base, [rule.name]: Number.NaN }, expect: new RegExp(rule.name) },
      { label: `${rule.name} infinity`, input: { ...base, [rule.name]: Number.POSITIVE_INFINITY }, expect: new RegExp(rule.name) },
      { label: `${rule.name} negative`, input: { ...base, [rule.name]: -1 }, expect: new RegExp(rule.name) },
      { label: `${rule.name} fraction`, input: { ...base, [rule.name]: rule.min + 0.5 }, expect: new RegExp(rule.name) },
      { label: `${rule.name} below`, input: { ...base, [rule.name]: rule.min - 1 }, expect: new RegExp(rule.name) },
      { label: `${rule.name} above`, input: { ...base, [rule.name]: rule.max + 1 }, expect: new RegExp(rule.name) },
    );
  }
  for (const rule of txNumericBounds) {
    invalid.push(
      { label: `${rule.name} non-number`, input: { ...base, [rule.name]: `bad-${rule.name}` }, expect: new RegExp(rule.name) },
      { label: `${rule.name} NaN`, input: { ...base, [rule.name]: Number.NaN }, expect: new RegExp(rule.name) },
      { label: `${rule.name} infinity`, input: { ...base, [rule.name]: Number.POSITIVE_INFINITY }, expect: new RegExp(rule.name) },
      { label: `${rule.name} negative`, input: { ...base, [rule.name]: -1 }, expect: new RegExp(rule.name) },
      { label: `${rule.name} fraction`, input: { ...base, [rule.name]: rule.min + 0.5 }, expect: new RegExp(rule.name) },
      { label: `${rule.name} below`, input: { ...base, [rule.name]: rule.min - 1 }, expect: new RegExp(rule.name) },
      { label: `${rule.name} above`, input: { ...base, [rule.name]: rule.max + 1 }, expect: new RegExp(rule.name) },
    );
  }
  invalid.push(
    { label: "transmit user non-string", input: { ...base, transmit_user_id: 7 }, expect: /transmit_user_id/i },
    { label: "transmit user empty", input: { ...base, transmit_user_id: "" }, expect: /transmit_user_id/i },
    { label: "transmit user too long", input: { ...base, transmit_user_id: "x".repeat(129) }, expect: /transmit_user_id/i },
  );

  for (const check of invalid) {
    assert.throws(() => parse(check.input), check.expect, check.label);
  }

  const boundaryOk: AnyRecord[] = [];
  for (const rule of numericBounds) {
    const min = { ...base, [rule.name]: rule.min } as M2Settings;
    const max = { ...base, [rule.name]: rule.max } as M2Settings;
    boundaryOk.push(min, max);
  }
  for (const input of boundaryOk) {
    const parsed = parse(input);
    for (const rule of numericBounds) {
      assert.equal(parsed[rule.name], input[rule.name]);
    }
  }
  for (const rule of txNumericBounds) {
    for (const value of [rule.min, rule.max]) {
      const parsed = parse({ ...base, [rule.name]: value });
      assert.equal(parsed[rule.name], value);
    }
  }

  assert.deepStrictEqual(parse({ ew11_host: "gateway-1", ew11_port: 9001 }), {
    ew11_host: "gateway-1",
    ew11_port: 9001,
    connect_timeout_ms: 3_000,
    idle_timeout_ms: 30_000,
    capture_duration_ms: 5_000,
    maximum_bytes: 65_536,
    maximum_records: 1_000,
    transmit_enabled: false,
    speculative_transmit_enabled: false,
    unsafe_transmit_enabled: false,
    tx_write_timeout_ms: 1_000,
    tx_observation_timeout_ms: 4_600,
    tx_cooldown_ms: 250,
    tx_quiet_ms: 60,
    tx_max_attempts: 3,
    speculative_tx_cooldown_ms: 1_000,
    unsafe_tx_cooldown_ms: 5_000,
  });
  const enabled = parse({ ...base, transmit_enabled: true, transmit_user_id: "operator-7" });
  assert.equal(enabled.transmit_enabled, true);
  assert.equal(enabled.transmit_user_id, "operator-7");
  const missingTransmitUser = parse({
    ...base,
    transmit_enabled: true,
    speculative_transmit_enabled: true,
    unsafe_transmit_enabled: true,
  });
  assert.equal(missingTransmitUser.transmit_enabled, false);
  assert.equal(missingTransmitUser.speculative_transmit_enabled, false);
  assert.equal(missingTransmitUser.unsafe_transmit_enabled, false);
  assert.equal(missingTransmitUser.transmit_user_id, undefined);
  assert.equal(parse({ ...base, transmit_user_id: "operator-7" }).transmit_enabled, false);
  assert.equal(parse({ ...base, speculative_transmit_enabled: true, transmit_user_id: "operator-7" }).speculative_transmit_enabled, true);
  assert.equal(parse({ ...base, unsafe_transmit_enabled: true, transmit_user_id: "operator-7" }).unsafe_transmit_enabled, true);

  for (const host of ["gateway-1", "192.168.1.10", "edge-gateway.local"]) {
    assert.equal(parse({ ...base, ew11_host: host }).ew11_host, host);
  }
});

test("RED: bounded coordinator stop reasons, recorder outputs, and deterministic single-run behavior", async () => {
  const m2 = await importM2();
  const makeCoordinator = m2.createBoundedCaptureCoordinator;
  const base = validSettings({ connect_timeout_ms: 40, capture_duration_ms: 80, maximum_bytes: 4, maximum_records: 1 });

  const active = makeCoordinator({
    settings: base,
    createTransport: createFakeTransport,
    nowMs() {
      return 1;
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
  await active.start();
  await assert.rejects(() => active.start(), /already|running/i);
  await active.stop();

  const cases = [
    {
      name: "connect_timeout",
      settings: base,
      trigger(_transport: FakeTransport, timer: FakeTimer) {
        timer.advance(base.connect_timeout_ms + 1);
      },
      expect: { reason: "connect_timeout", byteCount: 0, recordCount: 0, preview: [] as CaptureRecord[] },
    },
    {
      name: "duration",
      settings: base,
      trigger(transport: FakeTransport, timer: FakeTimer) {
        transport.emit("connect");
        timer.advance(base.capture_duration_ms + 1);
      },
      expect: { reason: "duration", byteCount: 0, recordCount: 0, preview: [] as CaptureRecord[] },
    },
    {
      name: "maximum_bytes",
      settings: { ...base, maximum_bytes: 3 },
      trigger(transport: FakeTransport) {
        transport.emit("connect");
        transport.emit("data", new Uint8Array([0x0a, 0x0b, 0x0c, 0x0d]));
      },
      expect: {
        reason: "maximum_bytes",
        byteCount: 3,
        recordCount: 1,
        preview: [
          { sequence: 0, receivedAtMs: COORDINATOR_RECORD_TS, byteLength: 3, hex: "0a0b0c" },
        ] as CaptureRecord[],
      },
    },
    {
      name: "maximum_records",
      settings: { ...base, maximum_records: 1 },
      trigger(transport: FakeTransport) {
        transport.emit("connect");
        transport.emit("data", new Uint8Array([0x7f]));
        transport.emit("data", new Uint8Array([0x55, 0x56]));
      },
      expect: {
        reason: "maximum_records",
        byteCount: 1,
        recordCount: 1,
        preview: [
          { sequence: 0, receivedAtMs: COORDINATOR_RECORD_TS, byteLength: 1, hex: "7f" },
        ] as CaptureRecord[],
      },
    },
    {
      name: "closed",
      settings: base,
      trigger(transport: FakeTransport) {
        transport.emit("connect");
        transport.emit("close");
      },
      expect: { reason: "closed", byteCount: 0, recordCount: 0, preview: [] as CaptureRecord[] },
    },
    {
      name: "error",
      settings: base,
      trigger(transport: FakeTransport) {
        transport.emit("connect");
        transport.emit("error", new Error("boom"));
      },
      expect: { reason: "error", byteCount: 0, recordCount: 0, preview: [] as CaptureRecord[] },
    },
  ] as const;

  for (const tc of cases) {
    const events: string[] = [];
    const transport = createFakeTransport(events);
    const store = createFakeStore(events);
    const timer = createFakeTimer();
    const coordinator = makeCoordinator({
      settings: tc.settings,
      createTransport: () => transport,
      nowMs: timer.nowMs,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
      store,
    });
    await coordinator.start();
    tc.trigger(transport, timer);
    const result = await coordinator.stop();
    const state = coordinator.getState();

    assert.equal(state.state, "stopped");
    assert.equal(state.lastResult?.reason, tc.expect.reason);
    assert.equal(result.reason, tc.expect.reason);
    assert.equal(result.byteCount, tc.expect.byteCount);
    assert.equal(result.recordCount, tc.expect.recordCount);
    assert.ok(Array.isArray(result.preview), `${tc.name} must return preview records`);
    assert.deepStrictEqual(result.preview, tc.expect.preview);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "records"), false);
    assert.equal(store.finalizeCalls, 1, `${tc.name} must finalize its partial store`);
    assert.equal(store.finalized, true, `${tc.name} must await store finalization`);
    assert.equal(events.indexOf("transport.destroy") < events.indexOf("store.finalize"), true);
    assert.equal(store.lines.every((line) => line.endsWith("\n")), true);
    assert.deepStrictEqual(
      store.lines.map((line) => parseJson<CaptureRecord>(line)),
      tc.expect.preview,
      `${tc.name} must persist every preview record as NDJSON`,
    );
    assert.equal(transport.isDestroyed(), true);
    assert.equal(transport.listenerCount(), 0);
    assert.equal(timer.pendingCount(), 0);
  }
});

test("RED: M3.2 persistence streams every record, bounds preview, and awaits finalization", async () => {
  const m2 = await importM2();
  const timer = createFakeTimer();
  const transport = createFakeTransport();
  const lines: string[] = [];
  const file: CaptureFileMetadata = { name: "capture.ndjson", sizeBytes: 1, finalized: true };
  let finalizeStarted = false;
  let finalized = false;
  let releaseFinalize: (() => void) | undefined;
  const store: CaptureStore = {
    async begin() {},
    async append(line) {
      lines.push(line);
    },
    finalize() {
      finalizeStarted = true;
      return new Promise<CaptureFileMetadata>((resolve) => {
        releaseFinalize = () => {
          finalized = true;
          resolve(file);
        };
      });
    },
  };
  const coordinator = m2.createBoundedCaptureCoordinator({
    settings: validSettings({
      connect_timeout_ms: 1_000,
      capture_duration_ms: 86_400_000,
      maximum_bytes: 1_000,
      maximum_records: 1_000,
    }),
    createTransport: () => transport,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    store,
  });

  await coordinator.start();
  const running = coordinator.getState();
  assert.equal(running.state, "running");
  assert.equal(typeof running.startedAtMs, "number");
  assert.equal(running.elapsedMs, 0);
  assert.equal(running.limitMs, 86_400_000);
  assert.equal(running.byteCount, 0);
  assert.equal(running.recordCount, 0);
  assert.deepStrictEqual(running.preview, []);
  assert.equal(Object.prototype.hasOwnProperty.call(running, "records"), false);

  transport.emit("connect");
  timer.advance(1_234);
  assert.equal(coordinator.getState().elapsedMs, 1_234);
  for (let sequence = 0; sequence < 25; sequence += 1) {
    transport.emit("data", new Uint8Array([sequence]));
    await Promise.resolve();
  }
  const pendingStop = coordinator.stop();
  await Promise.resolve();

  const stopped = coordinator.getState();
  assert.equal(stopped.state, "stopped");
  assert.equal(stopped.byteCount, 25);
  assert.equal(stopped.recordCount, 25);
  assert.equal(stopped.preview.length, 20);
  assert.equal(stopped.preview[0]?.sequence, 5);
  assert.equal(stopped.preview[19]?.sequence, 24);
  assert.equal(Object.prototype.hasOwnProperty.call(stopped, "records"), false);
  assert.equal(finalizeStarted, true);
  assert.equal(finalized, false);

  releaseFinalize?.();
  const result = await pendingStop;
  assert.equal(finalized, true);
  assert.deepStrictEqual(result.file, file);
  assert.equal(result.recordCount, 25);
  assert.equal(result.preview.length, 20);
  assert.equal(lines.length, 25);
  assert.equal(lines.every((line) => line.endsWith("\n")), true);
  assert.deepStrictEqual(
    lines.map((line) => parseJson<CaptureRecord>(line).sequence),
    Array.from({ length: 25 }, (_, sequence) => sequence),
  );
});

test("RED: capture logger emits lifecycle and hourly summaries without raw hex", async () => {
  const m2 = await importM2();
  const timer = createFakeTimer();
  const transport = createFakeTransport();
  const store = createFakeStore();
  const entries: string[] = [];
  const logger: AppLogger = {
    info(event, summary) {
      entries.push(`${event}:${JSON.stringify(summary)}`);
    },
    error(event, summary) {
      entries.push(`${event}:${JSON.stringify(summary)}`);
    },
  };
  const coordinator = m2.createBoundedCaptureCoordinator({
    settings: validSettings({
      connect_timeout_ms: 1_000,
      capture_duration_ms: 86_400_000,
      maximum_bytes: 100,
      maximum_records: 100,
    }),
    createTransport: () => transport,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    store,
    logger,
  });

  await coordinator.start();
  transport.emit("connect");
  transport.emit("data", new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  timer.advance(3_600_001);
  await coordinator.stop();

  const errorTransport = createFakeTransport();
  const errorCoordinator = m2.createBoundedCaptureCoordinator({
    settings: validSettings({ connect_timeout_ms: 1_000 }),
    createTransport: () => errorTransport,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    store: createFakeStore(),
    logger,
  });
  await errorCoordinator.start();
  errorTransport.emit("error", new Error("transport failed"));
  await errorCoordinator.stop();

  assert.equal(entries.some((entry) => /^start:/i.test(entry)), true);
  assert.equal(entries.some((entry) => /progress/i.test(entry)), true);
  assert.equal(entries.some((entry) => /stop|complete/i.test(entry)), true);
  assert.equal(entries.some((entry) => /error/i.test(entry)), true);
  assert.equal(entries.join("\n").includes("deadbeef"), false);
  assert.equal(entries.join("\n").includes("de ad be ef"), false);
});

test("RED: sequential coordinator runs reset recorder sequence and clean each transport", async () => {
  const m2 = await importM2();
  const firstTransport = createFakeTransport();
  const secondTransport = createFakeTransport();
  const timer = createFakeTimer();
  let transportNumber = 0;
  const coordinator = m2.createBoundedCaptureCoordinator({
    settings: validSettings({ maximum_bytes: 8, maximum_records: 8 }),
    createTransport() {
      transportNumber += 1;
      return transportNumber === 1 ? firstTransport : secondTransport;
    },
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  await coordinator.start();
  firstTransport.emit("connect");
  firstTransport.emit("data", new Uint8Array([0x01]));
  const firstResult = await coordinator.stop();
  assert.equal(firstResult.preview[0]?.sequence, 0);
  assert.equal(firstTransport.isDestroyed(), true);
  assert.equal(firstTransport.listenerCount(), 0);
  assert.equal(timer.pendingCount(), 0);

  await coordinator.start();
  secondTransport.emit("connect");
  secondTransport.emit("data", new Uint8Array([0x02]));
  const secondResult = await coordinator.stop();
  assert.equal(secondResult.preview[0]?.sequence, 0);
  assert.equal(secondTransport.isDestroyed(), true);
  assert.equal(secondTransport.listenerCount(), 0);
  assert.equal(timer.pendingCount(), 0);
});

test("RED: idle timeout replaces transport inside one capture without resetting records or duration", async () => {
  const m2 = await importM2();
  const events: string[] = [];
  const firstTimeouts: number[] = [];
  const replacementTimeouts: number[] = [];
  const firstTransport = createFakeTransport(events, firstTimeouts);
  const replacementTransport = createFakeTransport(events, replacementTimeouts);
  const scheduledDelays: number[] = [];
  const timer = createFakeTimer(scheduledDelays);
  const store = createFakeStore(events);
  const settings = validSettings({
    connect_timeout_ms: 1_000,
    idle_timeout_ms: 30_000,
    capture_duration_ms: 60_000,
    maximum_bytes: 8,
    maximum_records: 8,
  });
  let transportCount = 0;
  const coordinator = m2.createBoundedCaptureCoordinator({
    settings,
    createTransport() {
      transportCount += 1;
      if (transportCount === 1) return firstTransport;
      if (transportCount === 2) return replacementTransport;
      throw new Error("unexpected extra replacement");
    },
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    store,
  });

  await coordinator.start();
  firstTransport.emit("connect");
  firstTransport.emit("data", new Uint8Array([0x01]));
  await Promise.resolve();
  const startedAtMs = coordinator.getState().startedAtMs;
  assert.deepStrictEqual(firstTimeouts, [30_000]);
  assert.equal(coordinator.getState().byteCount, 1);
  assert.equal(coordinator.getState().recordCount, 1);

  timer.advance(900);
  firstTransport.emit("timeout");
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(transportCount, 2, "one idle event must create exactly one replacement");
  assert.equal(firstTransport.isDestroyed(), true);
  assert.equal(firstTransport.listenerCount(), 0);
  assert.equal(store.finalizeCalls, 0);
  assert.equal(events.filter((event) => event === "store.begin").length, 1);

  replacementTransport.emit("connect");
  replacementTransport.emit("data", new Uint8Array([0x02]));
  await Promise.resolve();
  assert.deepStrictEqual(replacementTimeouts, [30_000]);
  assert.equal(coordinator.getState().phase, "running");
  assert.equal(coordinator.getState().startedAtMs, startedAtMs);
  assert.equal(coordinator.getState().byteCount, 2);
  assert.equal(coordinator.getState().recordCount, 2);
  assert.deepStrictEqual(
    store.lines.map((line) => parseJson<CaptureRecord>(line).sequence),
    [0, 1],
  );
  assert.equal(
    scheduledDelays.filter((delay) => delay === settings.capture_duration_ms).length,
    1,
    "reconnect must not restart the original duration ceiling",
  );

  const result = await coordinator.stop();
  assert.equal(result.reason, "stopped");
  assert.equal(store.finalizeCalls, 1);
  assert.equal(store.finalized, true);
  assert.equal(replacementTransport.isDestroyed(), true);
  assert.equal(replacementTransport.listenerCount(), 0);
  assert.equal(timer.pendingCount(), 0);
});

test("RED: idle timeout preserves buffered data on a paused current transport", async () => {
  const m2 = await importM2();
  const events: string[] = [];
  const firstTimeouts: number[] = [];
  const firstTransport = createFakeTransport(events, firstTimeouts, true);
  const replacementTransport = createFakeTransport(events, [], true);
  const scheduledDelays: number[] = [];
  const timer = createFakeTimer(scheduledDelays);
  const baseStore = createFakeStore(events);
  let firstAppend = true;
  let appendReleased = false;
  let releaseFirstAppend: (() => void) | undefined;
  const store = {
    ...baseStore,
    append(line: string): Promise<void> {
      if (!firstAppend) return baseStore.append(line);
      firstAppend = false;
      return new Promise<void>((resolve) => {
        releaseFirstAppend = () => {
          if (appendReleased) return;
          appendReleased = true;
          baseStore.lines.push(line);
          resolve();
        };
      });
    },
  };
  const settings = validSettings({
    connect_timeout_ms: 1_000,
    idle_timeout_ms: 30_000,
    capture_duration_ms: 60_000,
    maximum_bytes: 8,
    maximum_records: 8,
  });
  let transportCount = 0;
  const coordinator = m2.createBoundedCaptureCoordinator({
    settings,
    createTransport() {
      transportCount += 1;
      if (transportCount === 1) return firstTransport;
      if (transportCount === 2) return replacementTransport;
      throw new Error("unexpected extra replacement");
    },
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    store,
  });

  let stopped = false;
  try {
    await coordinator.start();
    firstTransport.emit("connect");
    firstTransport.emit("data", new Uint8Array([0x01]));
    assert.deepStrictEqual(firstTimeouts, [30_000]);
    assert.equal(firstTransport.pauseCount(), 1);
    assert.equal(coordinator.getState().byteCount, 1);
    assert.equal(coordinator.getState().recordCount, 1);

    firstTransport.emit("data", new Uint8Array([0x02]));
    assert.deepStrictEqual(baseStore.lines, [], "the held append is still unresolved");
    firstTransport.emit("timeout");
    assert.deepStrictEqual(firstTimeouts, [30_000, 30_000]);
    assert.equal(firstTransport.isDestroyed(), false);
    assert.equal(firstTransport.listenerCount() > 0, true);
    assert.equal(transportCount, 1);
    firstTransport.emit("timeout");
    assert.deepStrictEqual(firstTimeouts, [30_000, 30_000, 30_000]);
    assert.equal(firstTransport.isDestroyed(), false);
    assert.equal(firstTransport.listenerCount() > 0, true);
    assert.equal(transportCount, 1);

    assert.equal(
      firstTransport.isDestroyed(),
      false,
      "idle timeout must preserve a paused transport with buffered data",
    );
    assert.equal(transportCount, 1, "buffered old data must not trigger a replacement");
    assert.equal(coordinator.getState().byteCount, 1);
    assert.equal(coordinator.getState().recordCount, 1);
    assert.deepStrictEqual(baseStore.lines, [], "the held append remains uncommitted");

    releaseFirstAppend?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(firstTransport.resumeCount() >= 1, true);
    assert.deepStrictEqual(
      baseStore.lines.map((line) => parseJson<CaptureRecord>(line).sequence),
      [0, 1],
    );
    assert.deepStrictEqual(
      baseStore.lines.map((line) => parseJson<CaptureRecord>(line).hex),
      ["01", "02"],
    );
    assert.equal(coordinator.getState().byteCount, 2);
    assert.equal(coordinator.getState().recordCount, 2);
    assert.equal(events.filter((event) => event === "store.begin").length, 1);
    assert.equal(
      scheduledDelays.filter((delay) => delay === settings.capture_duration_ms).length,
      1,
      "draining buffered data must not restart the original duration ceiling",
    );

    const result = await coordinator.stop();
    stopped = true;
    assert.equal(result.reason, "stopped");
    assert.equal(store.finalizeCalls, 1);
    assert.equal(firstTransport.isDestroyed(), true);
    assert.equal(firstTransport.listenerCount(), 0);
    assert.equal(replacementTransport.isDestroyed(), false);
    assert.equal(replacementTransport.listenerCount(), 0);
    assert.equal(timer.pendingCount(), 0);
  } finally {
    releaseFirstAppend?.();
    if (!stopped) await coordinator.stop().catch(() => undefined);
  }
});

test("RED: synchronous transport factory failure restores stopped state and allows retry", async () => {
  const m2 = await importM2();
  const timer = createFakeTimer();
  const retryTransport = createFakeTransport();
  let attempts = 0;
  const coordinator = m2.createBoundedCaptureCoordinator({
    settings: validSettings(),
    createTransport() {
      attempts += 1;
      if (attempts === 1) throw new Error("factory failed");
      return retryTransport;
    },
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  await assert.rejects(() => coordinator.start(), /factory failed/);
  assert.equal(coordinator.getState().state, "stopped");
  assert.equal(coordinator.getState().lastResult?.reason, "error");
  assert.equal(timer.pendingCount(), 0);

  await coordinator.start();
  retryTransport.emit("connect");
  const result = await coordinator.stop();
  assert.equal(result.reason, "stopped");
  assert.equal(retryTransport.isDestroyed(), true);
  assert.equal(retryTransport.listenerCount(), 0);
  assert.equal(timer.pendingCount(), 0);
});

test("RED: download is an internal-file attachment with a streaming boundary", async () => {
  const m2 = await importM2();
  let releaseSecond: (() => void) | undefined;
  const handler = m2.createIngressHandler({
    getState: () => ({
      state: "stopped" as const,
      startedAtMs: 0,
      elapsedMs: 1,
      limitMs: 86_400_000,
      byteCount: 1,
      recordCount: 1,
      file: { name: "capture.ndjson", sizeBytes: 6, finalized: true },
      preview: [],
    }),
    async startCapture() {},
    async stopCapture() {
      throw new Error("not used");
    },
    createDownloadStream() {
      return (async function* () {
        yield "first\n";
        await new Promise<void>((resolve) => {
          releaseSecond = resolve;
        });
        yield "second\n";
      })();
    },
  });

  const response = createRes();
  const pending = handler(
    createReq({
      socket: { remoteAddress: "172.30.32.2" },
      url: "/api/download?path=/etc/passwd",
    }),
    response,
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  const firstWrites = [...response.writes];
  releaseSecond?.();
  await pending;

  assert.deepStrictEqual(firstWrites, ["first\n"], "download must write before the next chunk is available");
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="capture.ndjson"');
  assert.equal(response.headers.get("content-type"), "application/x-ndjson");
  assert.equal(response.body, "first\nsecond\n");
});

test("RED: ingress dependency failures return bounded 500 responses", async () => {
  const m2 = await importM2();
  const handler = m2.createIngressHandler({
    getState: () => ({ state: "stopped" as const } as CaptureSummary & { state: "running" | "stopped" }),
    async startCapture() {
      throw new Error("dependency failed");
    },
    async stopCapture() {
      throw new Error("dependency failed");
    },
  });

  const capture = createRes();
  await handler(
    createReq({
      socket: { remoteAddress: "172.30.32.2" },
      method: "POST",
      url: "/api/capture",
    }),
    capture,
  );
  assert.equal(capture.statusCode, 500);
  assert.equal(capture.body, "internal error");

  const stop = createRes();
  await handler(
    createReq({
      socket: { remoteAddress: "172.30.32.2" },
      method: "POST",
      url: "/api/stop",
    }),
    stop,
  );
  assert.equal(stop.statusCode, 500);
  assert.equal(stop.body, "internal error");
});

test("RED: runtime fails closed when all TX flags are enabled without a transmit user", async () => {
  const m2 = await importM2();
  const listenPorts: number[] = [];
  let transportCreations = 0;
  let app: {
    requestHandler(req: FakeReq, res: FakeRes): Promise<void> | void;
    stop(): Promise<void>;
  } | undefined;

  try {
    app = await m2.startM2Runtime({
      async readOptions() {
        return validSettings({
          transmit_enabled: true,
          speculative_transmit_enabled: true,
          unsafe_transmit_enabled: true,
        });
      },
      createTransport() {
        transportCreations += 1;
        return createFakeTransport();
      },
      createServer() {
        return {
          listen(port) {
            listenPorts.push(port);
          },
          close() {},
        };
      },
    });

    const res = createRes();
    await app.requestHandler(
      createReq({ socket: { remoteAddress: "::ffff:172.30.32.2" }, url: "/api/status" }),
      res,
    );
    const status = parseJson<AnyRecord>(res.body);
    const tx = status.tx as AnyRecord;
    assert.equal(res.statusCode, 200);
    assert.equal(tx.enabled, false);
    assert.equal(tx.speculativeEnabled, false);
    assert.equal(tx.unsafeEnabled, false);
    assert.equal(tx.authorized, false);
    assert.deepStrictEqual(listenPorts, [8099]);
    // The link opens with the app now. It used to wait for a capture, which is exactly what
    // made the page dead until somebody started one.
    assert.equal(transportCreations, 1);
  } finally {
    await app?.stop();
  }
});

test("RED: runtime preserves enabled TX flags with a valid transmit user", async () => {
  const m2 = await importM2();
  const listenPorts: number[] = [];
  let transportCreations = 0;
  let app: {
    requestHandler(req: FakeReq, res: FakeRes): Promise<void> | void;
    stop(): Promise<void>;
  } | undefined;

  try {
    app = await m2.startM2Runtime({
      async readOptions() {
        return validSettings({
          transmit_enabled: true,
          speculative_transmit_enabled: true,
          unsafe_transmit_enabled: true,
          transmit_user_id: "operator-7",
        });
      },
      createTransport() {
        transportCreations += 1;
        return createFakeTransport();
      },
      createServer() {
        return {
          listen(port) {
            listenPorts.push(port);
          },
          close() {},
        };
      },
    });

    const res = createRes();
    await app.requestHandler(
      createReq({
        socket: { remoteAddress: "::ffff:172.30.32.2" },
        url: "/api/status",
        headers: { "x-remote-user-id": "operator-7" },
      }),
      res,
    );
    const status = parseJson<AnyRecord>(res.body);
    const tx = status.tx as AnyRecord;
    assert.equal(res.statusCode, 200);
    assert.equal(tx.enabled, true);
    assert.equal(tx.speculativeEnabled, true);
    assert.equal(tx.unsafeEnabled, true);
    assert.equal(tx.authorized, true);
    assert.deepStrictEqual(listenPorts, [8099]);
    // The link opens with the app now. It used to wait for a capture, which is exactly what
    // made the page dead until somebody started one.
    assert.equal(transportCreations, 1);
  } finally {
    await app?.stop();
  }
});

test("RED: offline production wiring accepts defaults, uses 8099, and cleans transport on stop", async () => {
  const m2 = await importM2();
  const readPaths: string[] = [];
  const connectorInputs: Array<{ host: string; port: number }> = [];
  const transports: FakeTransport[] = [];
  const listenPorts: number[] = [];
  let closeCount = 0;

  const app = await m2.startM2Runtime({
    async readOptions(path) {
      readPaths.push(path);
      return validSettings({ ew11_host: "  gw-1  ", ew11_port: 9001, maximum_bytes: 2, maximum_records: 1 });
    },
    createTransport(input) {
      const transport = createFakeTransport();
      connectorInputs.push(input);
      transports.push(transport);
      return transport;
    },
    createServer() {
      return {
        listen(port) {
          listenPorts.push(port);
        },
        close() {
          closeCount += 1;
        },
      };
    },
  });

  assert.equal(readPaths[0], m2.DEFAULT_OPTIONS_PATH ?? "/data/options.json");
  assert.deepStrictEqual(listenPorts, [8099]);

  const pre = createRes();
  await app.requestHandler(
    createReq({ socket: { remoteAddress: "::ffff:172.30.32.2" }, url: "/api/status" }),
    pre,
  );
  assert.equal(pre.statusCode, 200);
  // The link opens with the app, so the connector has already been asked for a socket. It
  // used to wait for a capture, which is what left the page unable to control anything.
  assert.equal(connectorInputs.length, 1);
  const runtimeCsrf = parseJson<AnyRecord>(pre.body).csrfToken as string;
  const runtimeHeaders = { "x-remote-user-id": "operator-7", "x-csrf-token": runtimeCsrf };

  const startCapture = createRes();
  await app.requestHandler(
    createReq({ socket: { remoteAddress: "::ffff:172.30.32.2" }, method: "POST", url: "/api/capture", headers: runtimeHeaders }),
    startCapture,
  );
  assert.equal(startCapture.statusCode, 200);
  assert.equal(connectorInputs.length, 1);
  assert.deepStrictEqual(connectorInputs[0], { host: "gw-1", port: 9001 });

  await app.stop();
  assert.equal(closeCount, 1);
  for (const transport of transports) {
    assert.equal(transport.isDestroyed(), true);
    assert.equal(transport.listenerCount(), 0);
  }
});

test("RED: M1 recorder output shape is reused for bounded chunks", async () => {
  const { createCaptureRecorder } = await import("../bestium-eco-foret/src/capture.ts");
  const record = createCaptureRecorder();
  const first = record(new Uint8Array([0xde, 0xad]), 1_700_000_000);
  const second = record(new Uint8Array([0xbe, 0xef]), 1_700_000_001);
  assert.equal(first.sequence, 0);
  assert.equal(second.sequence, 1);
  assert.equal(first.byteLength, 2);
  assert.equal(second.byteLength, 2);
  assert.equal(first.hex, "dead");
  assert.equal(second.hex, "beef");
});

test("RED: coordinator bounds disk append to one in-flight record and resumes only after it settles", async () => {
  const m2 = await importM2();
  const timer = createFakeTimer();
  const events: string[] = [];
  const transport = createFakeTransport(events);
  const lines: string[] = [];
  let releaseAppend: (() => void) | undefined;
  let firstAppend = true;
  const store: CaptureStore = {
    async begin() {},
    append(line) {
      lines.push(line);
      if (!firstAppend) return Promise.resolve();
      firstAppend = false;
      return new Promise<void>((resolve) => {
        releaseAppend = resolve;
      });
    },
    async finalize() {
      return { name: "capture.ndjson", sizeBytes: lines.join("").length, finalized: true };
    },
  };
  const coordinator = m2.createBoundedCaptureCoordinator({
    settings: validSettings({ maximum_bytes: 8, maximum_records: 8 }),
    createTransport: () => transport,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    store,
  });

  await coordinator.start();
  transport.emit("connect");
  transport.emit("data", new Uint8Array([0x01]));
  assert.equal(transport.pauseCount(), 1);
  assert.equal(lines.length, 1);
  transport.emit("data", new Uint8Array([0x02]));
  assert.equal(lines.length, 1, "paused transport must not create a second in-flight append");

  releaseAppend?.();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(transport.resumeCount(), 1);
  transport.emit("data", new Uint8Array([0x02]));
  const result = await coordinator.stop();
  assert.equal(result.recordCount, 2);
  assert.deepStrictEqual(
    lines.map((line) => parseJson<CaptureRecord>(line).sequence),
    [0, 1],
  );
  assert.equal(events.filter((event) => event === "transport.pause").length, 2);
});

test("RED: finalization failures propagate to manual stop and automatic callbacks log them", async () => {
  const m2 = await importM2();
  const timer = createFakeTimer();
  const entries: Array<{ level: "info" | "error"; event: string; summary: AnyRecord }> = [];
  const logger: AppLogger = {
    info(event, summary) {
      entries.push({ level: "info", event, summary });
    },
    error(event, summary) {
      entries.push({ level: "error", event, summary });
    },
  };
  const manualTransport = createFakeTransport();
  const manualStore: CaptureStore = {
    async begin() {},
    async append() {},
    async finalize() {
      throw new Error("manual finalize failed");
    },
  };
  const manual = m2.createBoundedCaptureCoordinator({
    settings: validSettings(),
    createTransport: () => manualTransport,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    store: manualStore,
    logger,
  });
  await manual.start();
  manualTransport.emit("connect");
  await assert.rejects(() => manual.stop(), /manual finalize failed/);
  assert.equal(manual.getState().phase, "stopped");
  assert.equal(entries.some((entry) => entry.level === "error" && entry.event === "finalize"), true);

  const automaticTransport = createFakeTransport();
  const automaticStore: CaptureStore = {
    async begin() {},
    async append() {},
    async finalize() {
      throw new Error("automatic finalize failed");
    },
  };
  const automatic = m2.createBoundedCaptureCoordinator({
    settings: validSettings({ maximum_bytes: 1 }),
    createTransport: () => automaticTransport,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    store: automaticStore,
    logger,
  });
  await automatic.start();
  automaticTransport.emit("connect");
  automaticTransport.emit("data", new Uint8Array([0xaa]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(entries.some((entry) => entry.level === "error" && /finalize|automatic/.test(entry.summary.reason as string)), true);
  assert.equal(automatic.getState().phase, "stopped");
});

test("RED: lifecycle phases serialize stop-during-start and start-during-finalize", async () => {
  const m2 = await importM2();
  const timer = createFakeTimer();
  const transport = createFakeTransport();
  let releaseBegin: (() => void) | undefined;
  let beginCalls = 0;
  let finalizeCalls = 0;
  const store: CaptureStore = {
    begin() {
      beginCalls += 1;
      return new Promise<void>((resolve) => {
        releaseBegin = resolve;
      });
    },
    async append() {},
    async finalize() {
      finalizeCalls += 1;
      return { name: "capture.ndjson", sizeBytes: 0, finalized: true };
    },
  };
  let transportCreates = 0;
  const coordinator = m2.createBoundedCaptureCoordinator({
    settings: validSettings(),
    createTransport: () => {
      transportCreates += 1;
      return transport;
    },
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    store,
  });

  const starting = coordinator.start();
  await Promise.resolve();
  // `phase` is the link's, and the link is up as soon as the socket is attached — it no
  // longer waits for the store to open. What is still starting is the recording, which is
  // blocked on `store.begin()`, and a second `start()` has to be refused because of it.
  assert.equal(coordinator.getState().phase, "running");
  assert.equal(coordinator.getState().state, "stopped", "no recording is open yet");
  await assert.rejects(() => coordinator.start(), /recording|phase|running|stopped|already/i);
  const stopping = coordinator.stop();
  releaseBegin?.();
  await starting;
  const stopped = await stopping;
  assert.equal(stopped.reason, "stopped");
  assert.equal(coordinator.getState().phase, "stopped");
  assert.equal(beginCalls, 1);
  assert.equal(finalizeCalls, 1);
  // The link opens first now, so one transport exists before any recording is asked for.
  // What this still guards is that a stop during `begin` creates no second one.
  assert.equal(transportCreates, 1, "stop during begin must not create another transport");

  let releaseFinalize: (() => void) | undefined;
  const heldStore: CaptureStore = {
    async begin() {},
    async append() {},
    finalize() {
      return new Promise<CaptureFileMetadata>((resolve) => {
        releaseFinalize = () => resolve({ name: "held.ndjson", sizeBytes: 0, finalized: true });
      });
    },
  };
  const heldTransport = createFakeTransport();
  const held = m2.createBoundedCaptureCoordinator({
    settings: validSettings(),
    createTransport: () => heldTransport,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    store: heldStore,
  });
  await held.start();
  heldTransport.emit("connect");
  const heldStop = held.stop();
  await Promise.resolve();
  assert.equal(held.getState().phase, "finalizing");
  await assert.rejects(() => held.start(), /phase|finalizing|running/i);
  releaseFinalize?.();
  await heldStop;
  assert.equal(held.getState().phase, "stopped");
});

test("RED: status exposes exact bounds and logger emits bounded lifecycle summaries", async () => {
  const m2 = await importM2();
  const timer = createFakeTimer();
  const transport = createFakeTransport();
  const info: Array<{ event: string; summary: AnyRecord }> = [];
  const errors: Array<{ event: string; summary: AnyRecord }> = [];
  const logger: AppLogger = {
    info(event, summary) {
      info.push({ event, summary });
    },
    error(event, summary) {
      errors.push({ event, summary });
    },
  };
  const settings = validSettings({
    ew11_host: "gateway.example",
    ew11_port: 9001,
    connect_timeout_ms: 1_200,
    capture_duration_ms: 86_400_000,
    maximum_bytes: 67_108_864,
    maximum_records: 1_000_000,
  });
  const coordinator = m2.createBoundedCaptureCoordinator({
    settings,
    createTransport: () => transport,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    logger,
  });
  const bounds = {
    ew11_host: settings.ew11_host,
    ew11_port: settings.ew11_port,
    connect_timeout_ms: settings.connect_timeout_ms,
    idle_timeout_ms: settings.idle_timeout_ms,
    capture_duration_ms: settings.capture_duration_ms,
    maximum_bytes: settings.maximum_bytes,
    maximum_records: settings.maximum_records,
  };
  assert.deepStrictEqual(coordinator.getState().bounds, bounds);
  await coordinator.start();
  assert.equal(coordinator.getState().phase, "running");
  assert.deepStrictEqual(coordinator.getState().bounds, bounds);
  transport.emit("connect");
  transport.emit("data", new Uint8Array([0xde, 0xad]));
  timer.advance(3_600_001);
  const result = await coordinator.stop();

  const start = info.find((entry) => entry.event === "start");
  const progress = info.find((entry) => entry.event === "progress");
  const finalize = info.find((entry) => entry.event === "finalize");
  if (!start || !progress || !finalize) {
    throw new Error("start, progress, and finalize log entries are required");
  }
  assert.equal(Object.prototype.hasOwnProperty.call(start.summary, "bounds"), false);
  assert.equal(JSON.stringify(start.summary).includes("gateway.example"), false);
  assert.equal(JSON.stringify(start.summary).includes("9001"), false);
  assert.equal(typeof start.summary.startedAtMs, "number");
  assert.equal(progress.summary.byteCount, 2);
  assert.equal(progress.summary.recordCount, 1);
  assert.equal(finalize.summary.reason, result.reason);
  assert.equal(finalize.summary.stoppedAtMs, result.stoppedAtMs);
  assert.deepStrictEqual(finalize.summary.file, {
    name: result.file?.name,
    sizeBytes: result.file?.sizeBytes,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(finalize.summary, "preview"), false);
  assert.equal(JSON.stringify(info).includes("dead"), false);
  assert.deepStrictEqual(errors, []);
});

test("RED: download honors response drain, aborts on close, and never appends an error body", async () => {
  const m2 = await importM2();
  const state = {
    state: "stopped" as const,
    startedAtMs: 0,
    elapsedMs: 1,
    limitMs: 86_400_000,
    byteCount: 1,
    recordCount: 1,
    file: { name: "capture.ndjson", sizeBytes: 12, finalized: true },
    preview: [] as CaptureRecord[],
  };
  const makeHandler = (stream: () => AsyncIterable<string | Uint8Array>) => m2.createIngressHandler({
    getState: () => state,
    async startCapture() {},
    async stopCapture() {
      throw new Error("unused");
    },
    createDownloadStream: stream,
  });

  let finished = false;
  const delayed = createStreamingRes({ blockWrites: true });
  const delayedPending = Promise.resolve(makeHandler(async function* () {
    yield "first\n";
    yield "second\n";
  } as unknown as () => AsyncIterable<string>)(createReq({ socket: { remoteAddress: "172.30.32.2" }, url: "/api/download" }), delayed))
    .then(() => { finished = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepStrictEqual(delayed.writes, ["first\n"]);
  assert.equal(finished, false);
  delayed.releaseDrain();
  await delayedPending;
  assert.equal(delayed.body, "first\nsecond\n");

  const aborted = createStreamingRes({ blockWrites: true });
  const abortPending = makeHandler(async function* () {
    yield "first\n";
    yield "second\n";
  } as unknown as () => AsyncIterable<string>)(createReq({ socket: { remoteAddress: "172.30.32.2" }, url: "/api/download" }), aborted);
  await new Promise((resolve) => setTimeout(resolve, 0));
  aborted.emit("close");
  await abortPending;
  assert.equal(aborted.isDestroyed(), true);
  assert.equal(aborted.body.includes("internal error"), false);

  const failed = createStreamingRes();
  const failedPending = makeHandler(async function* () {
    yield "first\n";
    throw new Error("iterator failed");
  } as unknown as () => AsyncIterable<string>)(createReq({ socket: { remoteAddress: "172.30.32.2" }, url: "/api/download" }), failed);
  await failedPending;
  assert.equal(failed.isDestroyed(), true);
  assert.equal(failed.body.includes("internal error"), false);
});

test("RED: finalized and recovered internal stores both serve downloads without client paths", async () => {
  const m2 = await importM2();
  const makeStore = (recovered: StoreFileMetadata | null = null): CaptureStore & {
    recover(): Promise<StoreFileMetadata | null>;
    createReadStream(): AsyncIterable<string>;
  } => {
    let lines: string[] = recovered ? ['{"sequence":7}\n'] : [];
    let file: CaptureFileMetadata | null = recovered
      ? { name: recovered.name, sizeBytes: recovered.sizeBytes, finalized: true }
      : null;
    return {
      async begin() {
        lines = [];
        file = null;
      },
      async append(line) {
        lines.push(line);
      },
      async finalize() {
        file = { name: "capture-final.ndjson", sizeBytes: lines.join("").length, finalized: true };
        return file;
      },
      async recover() {
        return recovered;
      },
      createReadStream() {
        const snapshot = [...lines];
        return (async function* () {
          for (const line of snapshot) yield line;
        })();
      },
    };
  };
  const transport = createFakeTransport();
  const server = { listen() {}, close() {} };
  const normalStore = makeStore();
  const normal = await m2.startM2Runtime({
    readOptions: async () => validSettings({ maximum_bytes: 8 }),
    createTransport: () => transport,
    createServer: () => server,
    store: normalStore,
  });
  const normalStatus = createRes();
  await normal.requestHandler(createReq({ socket: { remoteAddress: "172.30.32.2" }, url: "/api/status" }), normalStatus);
  const normalHeaders = { "x-remote-user-id": "operator-7", "x-csrf-token": parseJson<AnyRecord>(normalStatus.body).csrfToken as string };
  const capture = createRes();
  await normal.requestHandler(
    createReq({ socket: { remoteAddress: "172.30.32.2" }, method: "POST", url: "/api/capture", headers: normalHeaders }),
    capture,
  );
  transport.emit("connect");
  transport.emit("data", new Uint8Array([0xaa]));
  const stop = createRes();
  await normal.requestHandler(
    createReq({ socket: { remoteAddress: "172.30.32.2" }, method: "POST", url: "/api/stop", headers: normalHeaders }),
    stop,
  );
  const finalDownload = createRes();
  await normal.requestHandler(
    createReq({ socket: { remoteAddress: "172.30.32.2" }, url: "/api/download?path=/etc/passwd" }),
    finalDownload,
  );
  assert.equal(finalDownload.statusCode, 200);
  assert.equal(finalDownload.headers.get("content-disposition"), 'attachment; filename="capture-final.ndjson"');
  assert.equal(finalDownload.body.includes("aa"), true);

  const recoveredStore = makeStore({
    name: "capture-recovered.ndjson",
    filename: "capture-recovered.ndjson",
    path: "/data/captures/capture-recovered.ndjson",
    sizeBytes: 17,
    finalized: true,
    reason: "interrupted",
    downloadable: true,
  });
  const recovered = await m2.startM2Runtime({
    readOptions: async () => validSettings(),
    createTransport: () => createFakeTransport(),
    createServer: () => server,
    store: recoveredStore,
  });
  const recoveredDownload = createRes();
  await recovered.requestHandler(
    createReq({ socket: { remoteAddress: "172.30.32.2" }, url: "/api/download?path=/etc/passwd" }),
    recoveredDownload,
  );
  assert.equal(recoveredDownload.statusCode, 200);
  assert.equal(recoveredDownload.headers.get("content-disposition"), 'attachment; filename="capture-recovered.ndjson"');
  assert.equal(recoveredDownload.body, '{"sequence":7}\n');
});

test("RED: capture-store begin observes delayed stream-open errors and remains reusable", async () => {
  const storeModule = await importCaptureStore();
  const failedStream = createFakeWriteStream({ defer: true });
  const healthyStream = createFakeWriteStream({ defer: true });
  let createCalls = 0;
  const fs = {
    ...createFakeStoreFs(),
    createWriteStream() {
      createCalls += 1;
      return createCalls === 1 ? failedStream : healthyStream;
    },
  } satisfies StoreFs;
  const store = storeModule.createCaptureStore({ fs, nowMs: () => COORDINATOR_RECORD_TS });

  const delayedError = new Error("delayed open failed");
  let beginSettled = false;
  const beginPromise = store.begin(COORDINATOR_RECORD_TS);
  void beginPromise.then(
    () => {
      beginSettled = true;
    },
    () => {
      beginSettled = true;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  const wasPending = !beginSettled;
  assert.equal(wasPending, true, "begin must still await the writer event");
  failedStream.emit("error", delayedError);
  await assert.rejects(beginPromise, /delayed open failed/);
  assert.deepStrictEqual(failedStream.unhandledErrors, []);
  assert.equal(failedStream.writeCalls, 0, "an open failure must precede append");
  await assert.rejects(store.append('{"sequence":0}\n'), /not active/);

  const retryBegin = store.begin(COORDINATOR_RECORD_TS + 1);
  healthyStream.emit("open");
  healthyStream.emit("ready");
  await retryBegin;
  await store.append('{"sequence":0}\n');
  assert.equal(healthyStream.writeCalls, 1);
});

test("RED: capture-store waits for close before renaming a finalized stream", async () => {
  const storeModule = await importCaptureStore();
  const writer = createFakeWriteStream({ defer: true, deferClose: true });
  const fs = {
    ...createFakeStoreFs(),
    createWriteStream() {
      return writer;
    },
  } satisfies StoreFs;
  const store = storeModule.createCaptureStore({ fs, nowMs: () => COORDINATOR_RECORD_TS });

  const beginPromise = store.begin(COORDINATOR_RECORD_TS);
  writer.emit("open");
  writer.emit("ready");
  await beginPromise;
  await store.append('{"sequence":0}\n');

  let settled = false;
  const finalization = store.finalize({ reason: "stopped" }).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(settled, false, "finish must not settle finalization before close");
  assert.deepStrictEqual(fs.calls.rename, []);

  writer.emit("close");
  const result = await finalization;
  assert.equal(result.finalized, true);
  assert.equal(fs.calls.rename.length, 1);
});

test("RED: capture-store rejects a late post-finish flush error before close", async () => {
  const storeModule = await importCaptureStore();
  const writer = createFakeWriteStream({ defer: true, deferClose: true });
  const fs = {
    ...createFakeStoreFs(),
    createWriteStream() {
      return writer;
    },
  } satisfies StoreFs;
  const store = storeModule.createCaptureStore({ fs, nowMs: () => COORDINATOR_RECORD_TS });

  const beginPromise = store.begin(COORDINATOR_RECORD_TS);
  writer.emit("open");
  writer.emit("ready");
  await beginPromise;
  await store.append('{"sequence":0}\n');

  const lateError = new Error("flush/fsync failed");
  writer.once("finish", () => {
    queueMicrotask(() => {
      writer.emit("error", lateError);
      writer.emit("close");
    });
  });
  const finalization = store.finalize({ reason: "stopped" });
  await assert.rejects(finalization, /flush\/fsync failed/);
  assert.deepStrictEqual(fs.calls.rename, []);
  assert.deepStrictEqual(writer.unhandledErrors, []);
});

test("RED: recover selects the newest valid capture across final and partial names", async () => {
  const storeModule = await importCaptureStore();
  const olderPartial = "/data/captures/capture-1700000000000.partial.ndjson";
  const newerFinal = "/data/captures/capture-1700000000100.ndjson";
  const unsafePartial = "/data/captures/capture-999999999999999999999.partial.ndjson";
  const unsafeFinal = "/data/captures/capture-1700000009999.ndjson.bak";
  const fs = createFakeStoreFs({
    [olderPartial]: '{"sequence":0}\n',
    [newerFinal]: '{"sequence":1}\n',
    [unsafePartial]: "unsafe\n",
    [unsafeFinal]: "unsafe\n",
  });
  const store = storeModule.createCaptureStore({
    fs,
    nowMs: () => COORDINATOR_RECORD_TS,
  });

  const final = await store.recover();
  assert.equal(final?.name, "capture-1700000000100.ndjson");
  assert.equal(final?.reason, "recovered");
  assert.deepStrictEqual(fs.calls.rename, []);

  const newerPartial = "/data/captures/capture-1700000000200.partial.ndjson";
  fs.files.set(newerPartial, '{"sequence":2}\n');
  const partial = await store.recover();
  assert.equal(partial?.name, "capture-1700000000200.ndjson");
  assert.equal(partial?.reason, "interrupted");
  assert.deepStrictEqual(fs.calls.rename, [
    { from: newerPartial, to: "/data/captures/capture-1700000000200.ndjson" },
  ]);
});

test("RED: production response adapter preserves events, abort, and live writableEnded", async () => {
  const m2 = await importM2();
  const underlying = createStreamingRes({ blockWrites: true });
  let ended = false;
  const originalEnd = underlying.end;
  underlying.end = (chunk) => {
    originalEnd.call(underlying, chunk);
    ended = true;
  };
  Object.defineProperty(underlying, "writableEnded", { get: () => ended });

  const adapter = m2.createServerResponseAdapter(underlying);
  assert.equal(adapter.writableEnded, false);
  let drainCount = 0;
  const onDrain = () => {
    drainCount += 1;
  };
  adapter.once("drain", onDrain);
  assert.equal(adapter.write("first\n"), false);
  underlying.emit("drain");
  assert.equal(drainCount, 1);
  adapter.once("drain", onDrain);
  adapter.off("drain", onDrain);
  underlying.emit("drain");
  assert.equal(drainCount, 1);

  let closeCount = 0;
  adapter.once("close", () => {
    closeCount += 1;
  });
  adapter.end();
  assert.equal(adapter.writableEnded, true);
  adapter.destroy(new Error("aborted"));
  assert.equal(closeCount, 1);
  assert.equal(underlying.isDestroyed(), true);
});

test("RED: production server hands the live response adapter directly", () => {
  const source = readText(paths.m2Source, "src/m2.ts");
  const runtimeSource = source.slice(source.indexOf("export async function startM2Runtime"));
  assert.match(
    runtimeSource,
    /handler\(\s*\{[\s\S]*?\},\s*createServerResponseAdapter\(res\)\s*\)/,
    "startM2Runtime must pass the live adapter directly",
  );
  assert.doesNotMatch(
    runtimeSource,
    /\.\.\.createServerResponseAdapter\(res\)/,
    "startM2Runtime must not snapshot the adapter with object spread",
  );
});

test("RED: status redacts EW11/configured user, exposes CSRF/TX gate, and bounds semantic mutation bodies", async () => {
  const m2 = await importM2();
  const csrfToken = "csrf-test-token";
  const actionCalls: AnyRecord[] = [];
  const state = {
    ...validSettings({ ew11_host: "gateway-secret", ew11_port: 9001 }),
    state: "stopped" as const,
    startedAtMs: 0,
    elapsedMs: 0,
    limitMs: 5_000,
    byteCount: 0,
    recordCount: 0,
    file: null,
    preview: [],
    authenticatedIngressUserId: "operator-7",
    configuredTransmitUserId: "configured-secret-user",
    tx: { enabled: true, speculativeEnabled: false, authorized: true, connected: true },
  } as IngressState;
  const handler = m2.createIngressHandler({
    getState: () => state,
    getAuthenticatedIngressUserId: () => "operator-7",
    getConfiguredTransmitUserId: () => "configured-secret-user",
    getTxStatus: () => state.tx,
    csrfToken,
    async executeSemanticAction(action: AnyRecord) {
      actionCalls.push(action);
      return { sendable: true, confirmed: false, evidence: "observed" };
    },
    async startCapture() {},
    async stopCapture() {
      throw new Error("unused");
    },
  });

  const status = createRes();
  await handler(createReq({ socket: { remoteAddress: "172.30.32.2" }, url: "/api/status" }), status);
  assert.equal(status.statusCode, 200);
  assert.equal(status.headers.get("cache-control"), "no-store");
  assert.equal(status.headers.has("access-control-allow-origin"), false);
  const payload = parseJson<AnyRecord>(status.body);
  assert.equal(payload.tx.authorized, false, "status authorization must be derived from this request user");
  for (const readiness of [
    "enabled", "speculativeEnabled", "unsafeEnabled", "connected", "inFlight", "quarantined",
    "pendingAppend", "quiet", "currentGenerationRx", "fresh", "sevenFProof",
  ]) assert.equal(typeof payload.tx[readiness], "boolean", `safe TX readiness missing: ${readiness}`);
  assert.equal(payload.csrfToken, csrfToken);
  assert.equal("authenticatedIngressUserId" in payload, false);
  assert.equal("configuredTransmitUserId" in payload, false);
  assert.equal("challenge" in payload, false);
  assert.equal("rawBytes" in payload, false);
  assert.equal("debug" in payload, true);
  assert.equal(JSON.stringify(payload).includes("gateway-secret"), false);
  assert.equal(JSON.stringify(payload).includes("9001"), false);
  assert.equal(JSON.stringify(payload).includes("configured-secret-user"), false);
  assert.equal(JSON.stringify(payload).includes("operator-7"), false);

  const trustedStatus = createRes();
  await handler(createReq({
    socket: { remoteAddress: "172.30.32.2" },
    headers: { "x-remote-user-id": "operator-7" },
    url: "/api/status",
  }), trustedStatus);
  assert.equal(trustedStatus.statusCode, 200);
  assert.equal(parseJson<AnyRecord>(trustedStatus.body).tx.authorized, true);

  const noUser = createRes();
  await handler(createReq({
    socket: { remoteAddress: "172.30.32.2" },
    method: "POST",
    url: "/api/action",
    headers: { "x-csrf-token": csrfToken },
    body: JSON.stringify({ kind: "light", target: 1, state: "on" }),
  }), noUser);
  assert.equal(noUser.statusCode, 403);

  const wrongUser = createRes();
  await handler(createReq({
    socket: { remoteAddress: "172.30.32.2" },
    method: "POST",
    url: "/api/action",
    headers: { "x-remote-user-id": "other-user", "x-csrf-token": csrfToken },
    body: JSON.stringify({ kind: "light", target: 1, state: "on" }),
  }), wrongUser);
  assert.equal(wrongUser.statusCode, 403);

  const wrongCsrf = createRes();
  await handler(createReq({
    socket: { remoteAddress: "172.30.32.2" },
    method: "POST",
    url: "/api/action",
    headers: { "x-remote-user-id": "operator-7", "x-csrf-token": "wrong" },
    body: JSON.stringify({ kind: "light", target: 1, state: "on" }),
  }), wrongCsrf);
  assert.equal(wrongCsrf.statusCode, 403);

  const arbitraryRaw = createRes();
  await handler(createReq({
    socket: { remoteAddress: "172.30.32.2" },
    method: "POST",
    url: "/api/action",
    headers: { "x-remote-user-id": "operator-7", "x-csrf-token": csrfToken, "content-type": "application/json" },
    body: JSON.stringify({ rawHex: "f700ee" }),
  }), arbitraryRaw);
  assert.equal(arbitraryRaw.statusCode, 400);

  const oversized = createRes();
  await handler(createReq({
    socket: { remoteAddress: "172.30.32.2" },
    method: "POST",
    url: "/api/action",
    headers: { "x-remote-user-id": "operator-7", "x-csrf-token": csrfToken, "content-type": "application/json" },
    body: JSON.stringify({ kind: "light", target: 1, state: "on", note: "x".repeat(1_100) }),
  }), oversized);
  assert.equal(oversized.statusCode, 400);

  const forbiddenKnobs = createRes();
  await handler(createReq({
    socket: { remoteAddress: "172.30.32.2" },
    method: "POST",
    url: "/api/action",
    headers: { "x-remote-user-id": "operator-7", "x-csrf-token": csrfToken, "content-type": "application/json" },
    body: JSON.stringify({ kind: "light", target: 1, state: "on", host: "gateway-secret", retry: 1, delayMs: 1, repeat: 2, queue: true, batch: [] }),
  }), forbiddenKnobs);
  assert.equal(forbiddenKnobs.statusCode, 400);

  const nestedForbiddenKnobs = createRes();
  await handler(createReq({
    socket: { remoteAddress: "172.30.32.2" },
    method: "POST",
    url: "/api/action",
    headers: { "x-remote-user-id": "operator-7", "x-csrf-token": csrfToken, "content-type": "application/json" },
    body: JSON.stringify({ action: { kind: "light", target: 1, state: "on", retry: 1 } }),
  }), nestedForbiddenKnobs);
  assert.equal(nestedForbiddenKnobs.statusCode, 400, "nested transport knobs must be rejected");

  for (const body of [
    JSON.stringify({ kind: "light", target: 1, state: "on", unknownTopLevel: true }),
    JSON.stringify({ action: { kind: "light", target: 1, state: "on" }, unknownEnvelopeField: true }),
    JSON.stringify({ action: { kind: "light", target: 1, state: "on", unknownActionField: true } }),
  ]) {
    const unknownEnvelope = createRes();
    await handler(createReq({
      socket: { remoteAddress: "172.30.32.2" },
      method: "POST",
      url: "/api/action",
      headers: { "x-remote-user-id": "operator-7", "x-csrf-token": csrfToken, "content-type": "application/json" },
      body,
    }), unknownEnvelope);
    assert.equal(unknownEnvelope.statusCode, 400, "action envelopes must use an exact key allowlist");
  }
  assert.deepStrictEqual(actionCalls, [], "rejected envelopes must not invoke semantic execution");

  const valid = createRes();
  await handler(createReq({
    socket: { remoteAddress: "172.30.32.2" },
    method: "POST",
    url: "/api/action",
    headers: { "x-remote-user-id": "operator-7", "x-csrf-token": csrfToken, "content-type": "application/json" },
    body: JSON.stringify({ kind: "light", target: 1, state: "on" }),
  }), valid);
  assert.equal(valid.statusCode, 200);
  assert.deepStrictEqual(actionCalls, [{ kind: "light", target: 1, state: "on" }]);

  for (const body of [
    JSON.stringify({ kind: "light", target: 1, state: "on", schedule: "tomorrow" }),
    JSON.stringify({ action: { kind: "light", target: 1, state: "on", schedule: "tomorrow" } }),
  ]) {
    const scheduled = createRes();
    await handler(createReq({
      socket: { remoteAddress: "172.30.32.2" },
      method: "POST",
      url: "/api/action",
      headers: { "x-remote-user-id": "operator-7", "x-csrf-token": csrfToken, "content-type": "application/json" },
      body,
    }), scheduled);
    assert.equal(scheduled.statusCode, 400, "only absent or immediate schedule is accepted");
  }
});

test("RED: TX coordinator is preview-safe, challenge-bound, quiet, single-write, and unconfirmed", async () => {
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function", "M2 must expose a bounded TX coordinator");
  if (typeof createTxCoordinator !== "function") return;

  const timer = createFakeTimer();
  let generation = 1;
  let rxByteEpoch = 1;
  let readEpoch = 1;
  let txByteEpoch = 0;
  let tailHash = "tail-0";
  let lastRxByteAtMs = timer.nowMs() - 100;
  let lastValidFrameAtMs = timer.nowMs() - 100;
  let lastResumeAtMs = timer.nowMs() - 100;
  let connected = true;
  let pendingAppend = false;
  let rngCounter = 0;
  const randomBytes = (size: number): Uint8Array => {
    rngCounter += 1;
    return Uint8Array.from({ length: size }, (_, index) => (rngCounter + index) & 0xff);
  };
  const settings = validSettings({
    transmit_enabled: true,
    speculative_transmit_enabled: true,
    unsafe_transmit_enabled: false,
    transmit_user_id: "operator-7",
    tx_write_timeout_ms: 25,
    tx_cooldown_ms: 100,
    tx_quiet_ms: 20,
    speculative_tx_cooldown_ms: 5_000,
    unsafe_tx_cooldown_ms: 5_000,
  });
  const lightOn = { kind: "light", target: 1, state: "on" };

  function makeTransport(opts: { blocked?: boolean; callbackError?: Error } = {}) {
    let blocked = opts.blocked ?? false;
    let destroyed = false;
    let pendingCallback: ((error?: Error | null) => void) | undefined;
    const listeners = new Map<string, Set<Listener>>();
    const writes: Uint8Array[] = [];
    const transport = {
      write(chunk: Uint8Array, callback: (error?: Error | null) => void) {
        writes.push(new Uint8Array(chunk));
        pendingCallback = callback;
        if (opts.callbackError !== undefined) queueMicrotask(() => callback(opts.callbackError));
        return !blocked;
      },
      once(event: string, listener: Listener) {
        const bucket = listeners.get(event) ?? new Set<Listener>();
        bucket.add(listener);
        listeners.set(event, bucket);
        return transport;
      },
      on(event: string, listener: Listener) {
        const bucket = listeners.get(event) ?? new Set<Listener>();
        bucket.add(listener);
        listeners.set(event, bucket);
        return transport;
      },
      off(event: string, listener: Listener) {
        listeners.get(event)?.delete(listener);
        return transport;
      },
      destroy() {
        destroyed = true;
      },
      releaseDrain() {
        blocked = false;
        for (const listener of listeners.get("drain") ?? []) listener();
        listeners.delete("drain");
        pendingCallback?.();
        pendingCallback = undefined;
      },
      writes,
      isDestroyed: () => destroyed,
    };
    return transport;
  }

  let transport = makeTransport({ blocked: true });
  const coordinator = createTxCoordinator({
    settings,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    randomBytes,
    challengeTtlMs: 30_000,
    maxChallenges: 32,
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => generation,
    getRxState: () => ({
      connected,
      pendingAppend,
      rxByteEpoch,
      readEpoch,
      txByteEpoch,
      tailHash,
      lastRxByteAtMs,
      lastValidFrameAtMs,
      lastResumeAtMs,
    }),
    journalLimit: 2,
  });

  async function rejected(call: () => Promise<unknown>, reason: RegExp): Promise<unknown> {
    try {
      const result = await call();
      assert.match(JSON.stringify(result), reason);
      return result;
    } catch (error) {
      assert.match(String(error), reason);
      return error;
    }
  }

  const preview = await coordinator.send(lightOn, { mode: "preview", userId: "operator-7" });
  assert.equal(preview.preview, true);
  assert.equal(transport.writes.length, 0);

  const livePending = coordinator.send(lightOn, { mode: "live", userId: "operator-7" });
  await Promise.resolve();
  assert.equal(transport.writes.length, 1);
  await rejected(
    () => coordinator.send(lightOn, { mode: "live", userId: "operator-7" }),
    /in.flight|busy|pending/i,
  );
  transport.releaseDrain();
  const liveResult = await livePending;
  assert.equal(liveResult.outcome, "socket_written_unconfirmed");
  assert.equal(liveResult.deviceConfirmed, false);
  assert.equal(transport.writes.length, 1, "write(false) must wait for drain without a second write");

  await rejected(
    () => coordinator.send(lightOn, { mode: "live", userId: "operator-7" }),
    /cooldown/i,
  );
  timer.advance(101);
  // A momentarily busy line is waited out rather than refused. Behind the EW11 a read lands
  // about every 121 ms, so refusing turned a sub-20 ms wait into a button the operator had
  // to press repeatedly. The write still never lands on a line that is talking.
  lastRxByteAtMs = timer.nowMs() - 1;
  const busyPending = coordinator.send(lightOn, { mode: "live", userId: "operator-7" });
  const writesBeforeWindow = transport.writes.length;
  await Promise.resolve();
  assert.equal(transport.writes.length, writesBeforeWindow, "nothing may go out while the line is busy");
  timer.advance(settings.tx_quiet_ms! + 1);
  await Promise.resolve();
  assert.equal(transport.writes.length, writesBeforeWindow + 1, "the frame goes out once the window opens");
  transport.releaseDrain();
  assert.match(JSON.stringify(await busyPending), /socket_written/i, "and the send resolves");
  timer.advance(settings.tx_cooldown_ms! + 1);
  lastRxByteAtMs = timer.nowMs() - settings.tx_quiet_ms! - 1;
  connected = false;
  await rejected(
    () => coordinator.send(lightOn, { mode: "live", userId: "operator-7" }),
    /connect|transport|stopped/i,
  );
  connected = true;
  pendingAppend = true;
  await rejected(
    () => coordinator.send(lightOn, { mode: "live", userId: "operator-7" }),
    /append|pending|store/i,
  );
  pendingAppend = false;

  generation += 1;
  rxByteEpoch = 0;
  lastRxByteAtMs = 0;
  lastValidFrameAtMs = 0;
  const stale = await coordinator.send(lightOn, { mode: "live", userId: "operator-7" });
  assert.match(JSON.stringify(stale), /generation|stale|ambiguous/i);
  // Two writes so far: the blocked-drain write, and the one that waited out a busy line.
  assert.equal(transport.writes.length, 2, "a stale generation must not add a third");

  lastValidFrameAtMs = timer.nowMs() - 60_000;
  await rejected(
    () => coordinator.send(lightOn, { mode: "live", userId: "operator-7" }),
    /frame|fresh|rx|stale/i,
  );
  lastValidFrameAtMs = timer.nowMs() - 1;
  rxByteEpoch = 2;
  lastRxByteAtMs = timer.nowMs() - settings.tx_quiet_ms! - 1;
  lastResumeAtMs = lastRxByteAtMs;

  // The challenge assertions that stood here moved to "M5: the challenge path, exercised by
  // the only candidate left". They needed a one-frame candidate, and the elevator — which was
  // that candidate — has been measured and promoted. The door macro that replaces it sends
  // three frames, and this fixture holds each write's callback so the single-write assertions
  // can control when a write finishes, so a three-frame action waits here forever.
  assert.equal(typeof coordinator.stop, "function", "stop must purge speculative challenges");
  await coordinator.stop();

  const deadlineTransport = makeTransport({ blocked: true });
  transport = deadlineTransport;
  const deadlineCoordinator = createTxCoordinator({
    settings: { ...settings, tx_cooldown_ms: 0, speculative_transmit_enabled: false },
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => generation,
    getRxState: () => ({
      connected: true,
      pendingAppend: false,
      rxByteEpoch,
      readEpoch,
      txByteEpoch,
      tailHash,
      lastRxByteAtMs,
      lastValidFrameAtMs,
      lastResumeAtMs,
    }),
  });
  const deadlinePending = deadlineCoordinator.send(lightOn, { mode: "live", userId: "operator-7" });
  await Promise.resolve();
  assert.equal(deadlineTransport.writes.length, 1);
  timer.advance(26);
  const deadlineResult = await deadlinePending;
  assert.match(JSON.stringify(deadlineResult), /deadline|timeout|ambiguous/i);
  assert.equal(deadlineTransport.isDestroyed(), true);
  deadlineTransport.releaseDrain();
  assert.equal(deadlineTransport.writes.length, 1, "late drain must not retry a quarantined generation");
  await rejected(
    () => deadlineCoordinator.send(lightOn, { mode: "live", userId: "operator-7" }),
    /quarant|destroy|generation|stale/i,
  );

  const errorTransport = makeTransport({ callbackError: new Error("socket failed") });
  transport = errorTransport;
  generation += 1;
  const errorCoordinator = createTxCoordinator({
    settings: { ...settings, tx_cooldown_ms: 0, speculative_transmit_enabled: false },
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => generation,
    getRxState: () => ({
      connected: true,
      pendingAppend: false,
      rxByteEpoch,
      readEpoch,
      txByteEpoch,
      tailHash,
      lastRxByteAtMs,
      lastValidFrameAtMs,
      lastResumeAtMs,
    }),
  });
  const errorResult = await errorCoordinator.send(lightOn, { mode: "live", userId: "operator-7" });
  await Promise.resolve();
  assert.match(JSON.stringify(errorResult), /error|ambiguous|unconfirmed/i);
  assert.equal(errorTransport.isDestroyed(), true);
  assert.equal(errorTransport.writes.length, 1, "socket errors must not retry");

});

type TxTestTransport = {
  writes: Uint8Array[];
  write(chunk: Uint8Array, callback?: (error?: Error | null) => void): boolean;
  once(event: string, listener: Listener): TxTestTransport;
  off(event: string, listener: Listener): TxTestTransport;
  destroy(): void;
  release(): void;
  isDestroyed(): boolean;
};

function createTxTestTransport(blocked = false): TxTestTransport {
  const listeners = new Map<string, Set<Listener>>();
  let destroyed = false;
  let pendingCallback: ((error?: Error | null) => void) | undefined;
  const transport: TxTestTransport = {
    writes: [],
    write(chunk, callback) {
      this.writes.push(new Uint8Array(chunk));
      pendingCallback = callback;
      if (!blocked) callback?.();
      return !blocked;
    },
    once(event, listener) {
      const bucket = listeners.get(event) ?? new Set<Listener>();
      bucket.add(listener);
      listeners.set(event, bucket);
      return this;
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
      return this;
    },
    destroy() {
      destroyed = true;
    },
    release() {
      for (const listener of listeners.get("drain") ?? []) listener();
      listeners.delete("drain");
      pendingCallback?.();
      pendingCallback = undefined;
    },
    isDestroyed() {
      return destroyed;
    },
  };
  return transport;
}

test("RED: production body bridge counts UTF-8 bytes, aborts, and reaches /api/action", async () => {
  const m2 = await importM2();
  const readBoundedJsonBody = (m2 as AnyRecord).readBoundedJsonBody as
    | ((body: AsyncIterable<string | Uint8Array>, maxBytes?: number) => Promise<string>)
    | undefined;
  assert.equal(typeof readBoundedJsonBody, "function", "M2 must expose the production body reader");
  if (typeof readBoundedJsonBody !== "function") return;
  const createProductionRequestHandler = (m2 as AnyRecord).createProductionRequestHandler as
    | ((handler: (req: AnyRecord, res: AnyRecord) => Promise<void> | void, maxBytes?: number) =>
        (request: AnyRecord, response: AnyRecord) => Promise<void>)
    | undefined;
  assert.equal(typeof createProductionRequestHandler, "function", "M2 must expose the reusable IncomingMessage bridge");
  if (typeof createProductionRequestHandler !== "function") return;
  const encoder = new TextEncoder();
  const body = (async function* () {
    yield encoder.encode('{"kind":"light",');
    yield encoder.encode('"target":1}');
  })();
  assert.equal(await readBoundedJsonBody(body), '{"kind":"light","target":1}');
  await assert.rejects(
    readBoundedJsonBody((async function* () { yield encoder.encode("가".repeat(600)); })(), 1_024),
    /1024|size|large/i,
  );
  await assert.rejects(
    readBoundedJsonBody((async function* () { yield encoder.encode("{"); throw new Error("request aborted"); })(), 1_024),
    /abort/i,
  );

  const state = {
    ...validSettings(),
    state: "stopped" as const,
    startedAtMs: 0,
    elapsedMs: 0,
    limitMs: 5_000,
    byteCount: 0,
    recordCount: 0,
    file: null,
    preview: [],
  } as IngressState;
  const actionCalls: AnyRecord[] = [];
  const ingress = m2.createIngressHandler({
    getState: () => state,
    async startCapture() {},
    async stopCapture() { throw new Error("unused"); },
    async executeSemanticAction(action: AnyRecord) {
      actionCalls.push(action);
      return { sendable: true, confirmed: false, evidence: "observed" };
    },
  });
  const seenBodies: string[] = [];
  const productionHandler = createProductionRequestHandler(async (request, response) => {
    seenBodies.push(String(request.body ?? ""));
    await ingress(request as any, response as any);
  }, 1_024);
  const makeIncoming = (chunks: Uint8Array[], error?: Error): AnyRecord => ({
    method: "POST",
    url: "/api/action",
    socket: { remoteAddress: "172.30.32.2" },
    headers: { "content-type": "application/json" },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
      if (error) throw error;
    },
  });
  const validBody = '{"kind":"light","target":1,"state":"on"}';
  const validResponse = createStreamingRes();
  await productionHandler(makeIncoming([encoder.encode(validBody.slice(0, 14)), encoder.encode(validBody.slice(14))]), validResponse);
  assert.equal(validResponse.statusCode, 200);
  assert.deepStrictEqual(seenBodies, [validBody]);
  assert.deepStrictEqual(actionCalls, [{ kind: "light", target: 1, state: "on" }]);

  const oversizeResponse = createStreamingRes();
  await assert.doesNotReject(() => productionHandler(makeIncoming([encoder.encode("가".repeat(600))]), oversizeResponse));
  assert.ok(oversizeResponse.statusCode >= 400 && oversizeResponse.statusCode < 500);
  assert.equal(seenBodies.length, 1, "oversize bodies must not reach ingress");

  const abortedResponse = createStreamingRes();
  await assert.doesNotReject(() => productionHandler(makeIncoming([encoder.encode("{")], new Error("request aborted")), abortedResponse));
  assert.ok(abortedResponse.statusCode >= 400 && abortedResponse.statusCode < 500);
  assert.equal(seenBodies.length, 1, "aborted bodies must not reach ingress");

  const source = readText(paths.m2Source, "src/m2.ts");
  assert.match(source, /readBoundedJsonBody/);
  assert.match(source, /createProductionRequestHandler/);
  const runtimeSource = source.slice(source.indexOf("export async function startM2Runtime"));
  assert.match(runtimeSource, /createProductionRequestHandler/);
});

test("RED: status and lifecycle logs always redact endpoint and user while retaining bounded debug", async () => {
  const m2 = await importM2();
  const frameHex = "f70b01190240110100b6ee";
  const state = {
    ...validSettings({ ew11_host: "ew11-status-secret", ew11_port: 8_899 }),
    state: "stopped" as const,
    startedAtMs: 0,
    elapsedMs: 0,
    limitMs: 5_000,
    byteCount: 0,
    recordCount: 0,
    file: null,
    preview: [],
    bounds: { ew11_host: "ew11-status-secret", ew11_port: 8_899 },
    configuredTransmitUserId: "configured-user-secret",
    authenticatedIngressUserId: "authenticated-user-secret",
    protocol: {
      generation: 3,
      frames: [{ rawHex: frameHex, generation: 3 }],
      unknown: [{ rawHex: "7fb70000ee", generation: 3 }],
      devices: { lights: [{ target: 1, state: "off" }] },
    },
  } as IngressState;
  const handler = m2.createIngressHandler({
    getState: () => state,
    async startCapture() {},
    async stopCapture() { throw new Error("unused"); },
  });
  const response = createRes();
  await handler(createReq({ socket: { remoteAddress: "172.30.32.2" }, url: "/api/status" }), response);
  assert.equal(response.statusCode, 200);
  const payload = parseJson<AnyRecord>(response.body);
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("ew11-status-secret"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "ew11_host"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "ew11_port"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.bounds ?? {}, "ew11_host"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.bounds ?? {}, "ew11_port"), false);
  assert.equal(JSON.stringify(payload.bounds ?? {}).includes("8899"), false);
  assert.equal(serialized.includes("configured-user-secret"), false);
  assert.equal(serialized.includes("authenticated-user-secret"), false);
  assert.equal(payload.debug.frames[0].rawHex, frameHex);
  assert.equal(payload.debug.unknown[0].rawHex, "7fb70000ee");

  const logs: AnyRecord[] = [];
  const timer = createFakeTimer();
  const coordinator = m2.createBoundedCaptureCoordinator({
    settings: validSettings({ ew11_host: "ew11-log-secret", ew11_port: 8_898 }),
    createTransport: () => createFakeTransport(),
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    logger: {
      info: (event, summary) => logs.push({ event, summary }),
      error: (event, summary) => logs.push({ event, summary }),
    },
  });
  await coordinator.start();
  await coordinator.stop();
  const logText = JSON.stringify(logs);
  assert.equal(logText.includes("ew11-log-secret"), false);
  assert.equal(logText.includes("8898"), false);
  assert.equal(logText.includes("rawHex"), false);
});

test("RED: master/subtype gates and current-generation RX have no artificial handshake", async () => {
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function");
  if (typeof createTxCoordinator !== "function") return;
  const timer = createFakeTimer();
  let generation = 1;
  let rxByteEpoch = 1;
  let readEpoch = 1;
  let txByteEpoch = 0;
  let lastRxByteAtMs = timer.nowMs() - 100;
  let lastValidFrameAtMs = timer.nowMs() - 100;
  let lastResumeAtMs = timer.nowMs() - 100;
  let connected = true;
  let pendingAppend = false;
  let transport = createTxTestTransport();
  let randomCounter = 0;
  const randomBytes = (size: number): Uint8Array => Uint8Array.from({ length: size }, () => randomCounter++ & 0xff);
  const base = validSettings({
    transmit_enabled: true,
    speculative_transmit_enabled: true,
    unsafe_transmit_enabled: true,
    transmit_user_id: "operator-7",
    tx_cooldown_ms: 0,
    speculative_tx_cooldown_ms: 0,
    unsafe_tx_cooldown_ms: 0,
  });
  const request = { userId: "operator-7", confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE", schedule: "immediate" };
  const make = (overrides: AnyRecord = {}) => createTxCoordinator({
    settings: { ...base, ...overrides },
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    randomBytes,
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => generation,
    // The door macro also wants a current-generation 0x7F compatibility proof. Supplying it
    // keeps the proof gate from firing ahead of the gates this test is about.
    getRxState: () => ({
      connected, pendingAppend, rxByteEpoch, readEpoch, txByteEpoch, lastRxByteAtMs, lastValidFrameAtMs, lastResumeAtMs,
      lastValidSevenFFrameAtMs: lastValidFrameAtMs,
      validSevenFFrameGeneration: generation,
      sevenFProof: { generation, action: "household:ringing", frames: ["7fb70000ee", "7fb40000ee", "7fb80000ee"], completedAtMs: lastValidFrameAtMs },
    }),
  });
  // The elevator is no longer a candidate — it was measured and promoted — so the door macro
  // is what exercises these gates now. It is the only candidate left, and it is deliberately
  // unreachable from the page.
  const candidate = { kind: "entrance", target: "household", state: "ringing" };
  const disabledMaster = make({ transmit_enabled: false });
  assert.throws(() => disabledMaster.issueSpeculativeChallenge(candidate, request), /TX|disabled|master/i);
  assert.equal(transport.writes.length, 0);
  const disabledUnsafe = make({ unsafe_transmit_enabled: false });
  assert.throws(() => disabledUnsafe.issueSpeculativeChallenge(candidate, request), /unsafe|disabled/i);
  // `speculative_transmit_enabled` gates the `inferred_candidate` tier, and after this
  // milestone nothing produces one: the elevator was the last, and measurement promoted it.
  // The door macro is `unsafe_candidate`, which the gate above covers. So the speculative
  // flag has no action left to refuse, and the assertion here is that fact rather than a
  // refusal it can no longer make.
  const speculativeOff = make({ speculative_transmit_enabled: false });
  assert.doesNotThrow(
    () => speculativeOff.issueSpeculativeChallenge(candidate, request),
    "an unsafe candidate answers to the unsafe flag, not the speculative one",
  );
  for (const value of [
    { kind: "elevator", direction: "up" }, { kind: "batchoff", state: "on" },
    { kind: "light", target: "all", state: "off" }, { kind: "heat", target: "all", state: "off" },
  ]) {
    assert.notEqual(
      (encodeSemanticAction(value, { transmitEnabled: true, authorizedUser: true }) as AnyRecord).evidence,
      "inferred_candidate",
      `${JSON.stringify(value)} is measured, not a candidate`,
    );
  }

  const normal = make({ speculative_transmit_enabled: false, unsafe_transmit_enabled: false });
  const firstTransport = transport;
  const first = await normal.send({ kind: "light", target: 1, state: "on" }, { mode: "live", userId: "operator-7" });
  assert.equal(first.outcome, "socket_written_unconfirmed");
  assert.equal(firstTransport.writes.length, 1);
  generation += 1;
  transport = createTxTestTransport();
  rxByteEpoch = 0;
  lastRxByteAtMs = 0;
  lastValidFrameAtMs = 0;
  const stale = await normal.send({ kind: "light", target: 1, state: "on" }, { mode: "live", userId: "operator-7" });
  assert.equal(transport.writes.length, 0);
  assert.match(JSON.stringify(stale), /generation|frame|fresh|rx|stale/i);
  rxByteEpoch = 2;
  lastRxByteAtMs = timer.nowMs() - 100;
  lastValidFrameAtMs = timer.nowMs() - 100;
  const fresh = await normal.send({ kind: "light", target: 1, state: "on" }, { mode: "live", userId: "operator-7" });
  assert.equal(fresh.outcome, "socket_written_unconfirmed");
  assert.equal(transport.writes.length, 1);
});

test("RED: coordinator RAW tail rejects semantic/gas/door splits and stop aborts macro safely", async () => {
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function");
  if (typeof createTxCoordinator !== "function") return;
  const timer = createFakeTimer();
  // The boundary sweep this test used to run needed `raw` to split a recognized frame across
  // two writes. `raw` is gone — arbitrary sends are the local buslab's job, behind its
  // allow-list — so the split can no longer be constructed from a semantic action at all,
  // which is a stronger guarantee than the sweep was checking. What is asserted instead is
  // that the kind refuses at the encoder, before any gate or tail check is reached.
  for (const hex of ["0102", "007f62", "0000ee00", "f70b01190240110100b6ee", "7fb90000ee"]) {
    assert.throws(
      () => encodeSemanticAction({ kind: "raw", hex }, { transmitEnabled: true, unsafeTransmitEnabled: true, authorizedUser: true }),
      /unsupported/,
      `raw must be refused outright: ${hex}`,
    );
  }


  let generation = 1;
  let connected = true;
  let transport = createTxTestTransport(true);
  const macro = createTxCoordinator({
    settings: validSettings({ transmit_enabled: true, speculative_transmit_enabled: true, unsafe_transmit_enabled: true, transmit_user_id: "operator-7", tx_cooldown_ms: 0, speculative_tx_cooldown_ms: 0 }),
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    randomBytes: (size: number) => Uint8Array.from({ length: size }, (_, index) => (index + 7) & 0xff),
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => generation,
    getRxState: () => ({ connected, pendingAppend: false, rxByteEpoch: 1, readEpoch: 1, txByteEpoch: 0, tailHash: "tail", lastRxByteAtMs: timer.nowMs() - 100, lastValidFrameAtMs: timer.nowMs() - 100, lastValidSevenFFrameAtMs: timer.nowMs() - 100, validSevenFFrameGeneration: generation, lastResumeAtMs: timer.nowMs() - 100, sevenFProof: { generation, action: "household:ringing", frames: ["7fb70000ee", "7fb40000ee", "7fb80000ee"], completedAtMs: timer.nowMs() - 100 } }),
  });
  const macroAction = { kind: "entrance", target: "household", state: "ringing" };
  const macroRequest = { userId: "operator-7", confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE", schedule: "immediate" };
  const challenge = macro.issueSpeculativeChallenge(macroAction, macroRequest);
  const pending = macro.send(macroAction, { ...macroRequest, mode: "live", challengeId: challenge.id });
  await Promise.resolve();
  assert.equal(transport.writes.length, 1);
  generation += 1;
  connected = false;
  macro.stop();
  transport.release();
  await Promise.resolve();
  timer.advance(10_000);
  await Promise.resolve();
  const result = await pending;
  assert.notEqual(result.outcome, "socket_written_unconfirmed");
  assert.equal(result.quarantined, true, "partial macro outcomes must authoritatively quarantine the generation");
  assert.equal(transport.writes.length, 1, "stop/reconnect must not write a later macro frame");
  assert.equal(timer.pendingCount(), 0);
});

test("RED-final: preview exposes canonical hex and generation one accepts its first tagged RX", async () => {
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function");
  if (typeof createTxCoordinator !== "function") return;
  const timer = createFakeTimer();
  let generation = 0;
  let rxByteEpoch = 0;
  let validFrameEpoch = 0;
  let validFrameGeneration = 0;
  let transport = createTxTestTransport();
  const state = () => ({
    connected: true,
    pendingAppend: false,
    rxByteEpoch,
    validFrameEpoch,
    validFrameGeneration,
    readEpoch: 1,
    txByteEpoch: 0,
    lastRxByteAtMs: timer.nowMs() - 100,
    lastValidFrameAtMs: timer.nowMs() - 100,
    lastResumeAtMs: timer.nowMs() - 100,
  });
  const coordinator = createTxCoordinator({
    settings: validSettings({ transmit_enabled: true, transmit_user_id: "operator-7", tx_cooldown_ms: 0 }),
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => generation,
    getRxState: state,
  });
  generation = 1;
  rxByteEpoch = 1;
  validFrameEpoch = 1;
  validFrameGeneration = 1;
  const light = { kind: "light", target: 1, state: "on" };
  const preview = await coordinator.send(light, { mode: "preview", userId: "operator-7" });
  assert.equal(preview.frameHex, "f70b01190240110100b6ee");
  assert.deepStrictEqual(preview.framesHex, ["f70b01190240110100b6ee"]);
  const candidatePreview = await coordinator.send({ kind: "elevator", direction: "up" }, { mode: "preview", userId: "operator-7" });
  assert.equal(typeof candidatePreview.frameHex, "string");
  assert.deepStrictEqual(candidatePreview.framesHex, [candidatePreview.frameHex]);

  const first = await coordinator.send(light, { mode: "live", userId: "operator-7" });
  assert.equal(first.outcome, "socket_written_unconfirmed", "a valid frame tagged to new generation is sufficient");
  assert.equal(transport.writes.length, 1);

  // RX from the prior generation, or no valid frame at all, cannot be reused.
  transport = createTxTestTransport();
  rxByteEpoch = 2;
  validFrameEpoch = 0;
  validFrameGeneration = 0;
  const noCurrentFrame = await coordinator.send(light, { mode: "live", userId: "operator-7" });
  assert.match(JSON.stringify(noCurrentFrame), /generation|frame|fresh|rx|stale/i);
  assert.equal(transport.writes.length, 0);
});

test("RED-final: absent or immediate schedule is accepted; other values reject", async () => {
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function");
  if (typeof createTxCoordinator !== "function") return;
  const timer = createFakeTimer();
  const transport = createTxTestTransport();
  const coordinator = createTxCoordinator({
    settings: validSettings({ transmit_enabled: true, transmit_user_id: "operator-7", tx_cooldown_ms: 0 }),
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => 1,
    getRxState: () => ({
      connected: true,
      pendingAppend: false,
      rxByteEpoch: 1,
      validFrameEpoch: 1,
      validFrameGeneration: 1,
      readEpoch: 1,
      txByteEpoch: 0,
      lastRxByteAtMs: timer.nowMs() - 100,
      lastValidFrameAtMs: timer.nowMs() - 100,
      lastResumeAtMs: timer.nowMs() - 100,
    }),
  });
  const light = { kind: "light", target: 1, state: "on" };
  for (const request of [
    { mode: "live", userId: "operator-7" },
    { mode: "live", userId: "operator-7", schedule: "immediate" },
  ]) {
    const accepted = await coordinator.send(light, request);
    assert.equal(accepted.outcome, "socket_written_unconfirmed");
  }
  const writesBeforeReject = transport.writes.length;
  const result = await coordinator.send(light, { mode: "live", userId: "operator-7", schedule: "tomorrow" });
  assert.match(JSON.stringify(result), /schedule|immediate|unsupported|rejected/i);
  assert.equal(transport.writes.length, writesBeforeReject);
});

test("M5: the challenge path, exercised by the only candidate left", async () => {
  // These assertions used to live in "TX coordinator is preview-safe", driven by the
  // elevator. Measurement promoted the elevator, so the door macro is the only candidate
  // left — kept in the contract for the subphone work, offered nowhere on the page. It sends
  // three frames, which the fixture there could not drive, so the challenge properties move
  // here where writes drain on their own.
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function");
  if (typeof createTxCoordinator !== "function") return;
  const timer = createFakeTimer();
  let transport = createTxTestTransport();
  let generation = 1;
  let tailHash = "tail";
  let rxByteEpoch = 1;
  let readEpoch = 1;
  let counter = 0;
  const candidate = { kind: "entrance", target: "household", state: "ringing" };
  const proof = () => ({
    generation,
    action: "household:ringing",
    frames: ["7fb70000ee", "7fb40000ee", "7fb80000ee"],
    completedAtMs: timer.nowMs() - 100,
  });
  const coordinator = createTxCoordinator({
    settings: validSettings({
      transmit_enabled: true,
      speculative_transmit_enabled: true,
      unsafe_transmit_enabled: true,
      transmit_user_id: "operator-7",
      tx_cooldown_ms: 0,
      speculative_tx_cooldown_ms: 0,
      unsafe_tx_cooldown_ms: 0,
    }),
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    randomBytes: (size: number) => Uint8Array.from({ length: size }, () => counter++ & 0xff),
    maxChallenges: 2,
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => generation,
    getRxState: () => ({
      connected: true,
      pendingAppend: false,
      rxByteEpoch,
      readEpoch,
      validFrameEpoch: 1,
      validFrameGeneration: generation,
      txByteEpoch: 0,
      tailHash,
      lastRxByteAtMs: timer.nowMs() - 100,
      lastValidFrameAtMs: timer.nowMs() - 100,
      lastValidSevenFFrameAtMs: timer.nowMs() - 100,
      validSevenFFrameGeneration: generation,
      lastResumeAtMs: timer.nowMs() - 100,
      sevenFProof: proof(),
    } as AnyRecord),
  });
  const request = { userId: "operator-7", confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE", schedule: "immediate" };
  const rejects = async (call: () => Promise<unknown>, reason: RegExp, message?: string): Promise<void> => {
    try {
      assert.match(JSON.stringify(await call()), reason, message);
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      assert.match(String(error), reason, message);
    }
  };

  // The id is opaque and time-bounded, and it carries none of the frame it authorises.
  const challenge = coordinator.issueSpeculativeChallenge(candidate, request);
  assert.match(challenge.id, /^[A-Za-z0-9_-]{16,}$/);
  assert.doesNotMatch(challenge.id, /7fb70000ee/i);
  assert.equal(challenge.expiresAtMs, timer.nowMs() + 30_000);

  // Bound to the operator who asked and to the action they asked about.
  await rejects(
    () => coordinator.send(candidate, { mode: "live", userId: "other-user", schedule: "immediate", challengeId: challenge.id }),
    /user|authorized|challenge/i,
  );
  await rejects(
    () => coordinator.send({ kind: "entrance", target: "communal", state: "ringing" }, { mode: "live", userId: "operator-7", schedule: "immediate", challengeId: challenge.id }),
    /action|frame|challenge|proof/i,
  );
  assert.equal(transport.writes.length, 0);

  // A generation change invalidates it: the transport it was reasoned about is gone.
  generation = 2;
  await rejects(
    () => coordinator.send(candidate, { mode: "live", userId: "operator-7", schedule: "immediate", challengeId: challenge.id }),
    /generation|stale|challenge|proof/i,
  );
  generation = 1;

  // So does the outbound tail moving, which means somebody else wrote in between.
  const tailChallenge = coordinator.issueSpeculativeChallenge(candidate, request);
  tailHash = "moved";
  await rejects(
    () => coordinator.send(candidate, { mode: "live", userId: "operator-7", schedule: "immediate", challengeId: tailChallenge.id }),
    /tail|tx|byte|stale|challenge/i,
  );
  tailHash = "tail";

  // Expiry is real, not advisory.
  const expiring = coordinator.issueSpeculativeChallenge(candidate, request);
  timer.advance(30_001);
  await rejects(
    () => coordinator.send(candidate, { mode: "live", userId: "operator-7", schedule: "immediate", challengeId: expiring.id }),
    /expir|challenge/i,
  );

  // An id that was never issued is refused the same way an expired one is.
  await rejects(
    () => coordinator.send(candidate, { mode: "live", userId: "operator-7", schedule: "immediate", challengeId: VALID_UNKNOWN_CHALLENGE_ID }),
    /unknown|invalid|challenge|expir/i,
  );

  // And stop purges whatever is outstanding. Carrying the macro all the way to the wire is
  // what "RED: coordinator RAW tail…" does with a fixture built for a multi-frame send;
  // what this test owns is the challenge, not the write.
  const outstanding = coordinator.issueSpeculativeChallenge(candidate, request);
  await coordinator.stop();
  await rejects(
    () => coordinator.send(candidate, { mode: "live", userId: "operator-7", schedule: "immediate", challengeId: outstanding.id }),
    /purge|stop|invalid|challenge|expir|transport/i,
  );
  assert.equal(transport.writes.length, 0, "not one of these reached the socket");
});

test("RED-final: a new candidate challenge supersedes its predecessor and door proof is action-specific", async () => {
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function");
  if (typeof createTxCoordinator !== "function") return;
  const timer = createFakeTimer();
  const transport = createTxTestTransport();
  let sevenFProof: AnyRecord = {
    generation: 1,
    action: "communal:ringing",
    frames: ["7f5f0000ee", "7f610000ee", "7f600000ee"],
    completedAtMs: timer.nowMs() - 100,
  };
  let randomCounter = 0;
  const coordinator = createTxCoordinator({
    settings: validSettings({
      transmit_enabled: true,
      speculative_transmit_enabled: true,
      unsafe_transmit_enabled: true,
      transmit_user_id: "operator-7",
      speculative_tx_cooldown_ms: 0,
      unsafe_tx_cooldown_ms: 0,
    }),
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    randomBytes: (size: number) => Uint8Array.from({ length: size }, () => randomCounter++ & 0xff),
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => 1,
    getRxState: () => ({
      connected: true,
      pendingAppend: false,
      rxByteEpoch: 1,
      validFrameEpoch: 1,
      validFrameGeneration: 1,
      readEpoch: 1,
      txByteEpoch: 0,
      lastRxByteAtMs: timer.nowMs() - 100,
      lastValidFrameAtMs: timer.nowMs() - 100,
      lastValidSevenFFrameAtMs: timer.nowMs() - 100,
      validSevenFFrameGeneration: 1,
      lastResumeAtMs: timer.nowMs() - 100,
      sevenFProof,
    } as AnyRecord),
  });
  const request = {
    userId: "operator-7",
    confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE",
    schedule: "immediate",
  };
  const household = { kind: "entrance", target: "household", state: "inactive" };
  assert.throws(() => coordinator.issueSpeculativeChallenge(household, request), /proof|compatib|state|match/i);
  sevenFProof = { generation: 1, action: "household:inactive", frames: ["7fb90000ee", "7fb40000ee", "7fba0000ee"], completedAtMs: timer.nowMs() - 100 };
  const first = coordinator.issueSpeculativeChallenge(household, request);
  // The second challenge used to be the elevator, which measurement has since promoted to an
  // observed control. Two challenges for the same action supersede each other the same way,
  // and that is the property under test.
  const second = coordinator.issueSpeculativeChallenge(household, request);
  assert.notEqual(first.id, second.id);
  const superseded = await coordinator.send(household, { ...request, mode: "live", challengeId: first.id });
  assert.match(JSON.stringify(superseded), /supersed|expired|invalid|challenge|replay/i);
  assert.equal(transport.writes.length, 0);

  // A proof recorded against an action nobody asked for must not license the door macro.
  sevenFProof = { generation: 1, action: "unknown", frames: ["7f620000ee"] };
  assert.throws(
    () => coordinator.issueSpeculativeChallenge({ kind: "entrance", target: "household", state: "ringing" }, request),
    /proof|compatib|recognized|door|unsafe|rejected|match/i,
    "a proof for another action is not proof for this one",
  );
});

test("RED-final: synchronous write callback error with write(false) leaves no drain listener or timer", async () => {
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function");
  if (typeof createTxCoordinator !== "function") return;
  const timer = createFakeTimer();
  let drainListeners = 0;
  let destroyed = false;
  const transport = {
    writes: [] as Uint8Array[],
    write(chunk: Uint8Array, callback: (error?: Error | null) => void): boolean {
      this.writes.push(new Uint8Array(chunk));
      callback(new Error("sync write failure"));
      return false;
    },
    once(event: string, _listener: Listener) {
      if (event === "drain") drainListeners += 1;
      return this;
    },
    off(event: string, _listener: Listener) {
      if (event === "drain") drainListeners = Math.max(0, drainListeners - 1);
      return this;
    },
    destroy() { destroyed = true; },
  };
  const coordinator = createTxCoordinator({
    settings: validSettings({ transmit_enabled: true, transmit_user_id: "operator-7", tx_write_timeout_ms: 25, tx_cooldown_ms: 0 }),
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => 1,
    getRxState: () => ({
      connected: true,
      pendingAppend: false,
      rxByteEpoch: 1,
      validFrameEpoch: 1,
      validFrameGeneration: 1,
      readEpoch: 1,
      txByteEpoch: 0,
      lastRxByteAtMs: timer.nowMs() - 100,
      lastValidFrameAtMs: timer.nowMs() - 100,
      lastResumeAtMs: timer.nowMs() - 100,
    }),
  });
  const result = await coordinator.send({ kind: "light", target: 1, state: "on" }, { mode: "live", userId: "operator-7" });
  assert.match(JSON.stringify(result), /error|unconfirmed|ambiguous/i);
  assert.equal(transport.writes.length, 1);
  assert.equal(drainListeners, 0, "sync callback error must not attach a late drain listener");
  assert.equal(timer.pendingCount(), 0, "sync callback error must clear its deadline");
  assert.equal(destroyed, true);
});

test("RED-final: capture coordinator keeps malformed RX evidence bounded without escaping onData", async () => {
  const m2 = await importM2();
  const timer = createFakeTimer();
  const transport = createFakeTransport();
  const coordinator = m2.createBoundedCaptureCoordinator({
    settings: validSettings({ maximum_bytes: 16_384, maximum_records: 32 }),
    createTransport: () => transport,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    store: createFakeStore(),
  });
  await coordinator.start();
  transport.emit("connect");
  assert.doesNotThrow(() => transport.emit("data", Uint8Array.from([0xf7, 0x05, 0x01, 0xf3, 0xee])));
  assert.doesNotThrow(() => transport.emit("data", new Uint8Array(4_096).fill(0x7f)));
  const debug = (coordinator.getState() as AnyRecord).protocol as AnyRecord;
  assert.ok(String(debug.parser?.pendingHex ?? "").length <= 512);
  await coordinator.stop();
});

test("RED-final: each door macro frame uses the write deadline, not only the five-second total", async () => {
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function");
  if (typeof createTxCoordinator !== "function") return;
  const delays: number[] = [];
  const timer = createFakeTimer(delays);
  const transport = createTxTestTransport(true);
  const coordinator = createTxCoordinator({
    settings: validSettings({
      transmit_enabled: true,
      unsafe_transmit_enabled: true,
      transmit_user_id: "operator-7",
      tx_write_timeout_ms: 50,
      unsafe_tx_cooldown_ms: 0,
    }),
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    randomBytes: (size: number) => new Uint8Array(size).fill(9),
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => 1,
    getRxState: () => ({
      connected: true,
      pendingAppend: false,
      rxByteEpoch: 1,
      validFrameEpoch: 1,
      validFrameGeneration: 1,
      readEpoch: 1,
      txByteEpoch: 0,
      lastRxByteAtMs: timer.nowMs() - 100,
      lastValidFrameAtMs: timer.nowMs() - 100,
      lastValidSevenFFrameAtMs: timer.nowMs() - 100,
      validSevenFFrameGeneration: 1,
      lastResumeAtMs: timer.nowMs() - 100,
      sevenFProof: {
        generation: 1,
        action: "household:inactive",
        frames: ["7fb90000ee", "7fb40000ee", "7fba0000ee"],
        completedAtMs: timer.nowMs() - 100,
      },
    } as AnyRecord),
  });
  const action = { kind: "entrance", target: "household", state: "inactive" };
  const request = { userId: "operator-7", confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE", schedule: "immediate" };
  const challenge = coordinator.issueSpeculativeChallenge(action, request);
  const pending = coordinator.send(action, { ...request, mode: "live", challengeId: challenge.id });
  await Promise.resolve();
  assert.ok(delays.some((delay) => delay <= 50), `macro write deadline must be bounded per frame: ${delays.join(",")}`);
  coordinator.stop();
  await pending;
});

test("RED-exception: every macro frame rechecks the hazards that matter and quarantines partial writes", async () => {
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function");
  if (typeof createTxCoordinator !== "function") return;

  // rxByteEpoch and readEpoch are deliberately absent. They advance on every received
  // byte and every capture append, and the inter-frame gap is longer than this bus goes
  // quiet, so binding them aborted every macro at frame two. What still aborts a macro
  // is a transport change, a pending append, or evidence that something else wrote.
  const mutations = ["generation", "pendingAppend", "txByteEpoch", "tailHash"] as const;
  for (const mutation of mutations) {
    const timer = createFakeTimer();
    let generation = 1;
    let rxByteEpoch = 1;
    let readEpoch = 1;
    let pendingAppend = false;
    let txByteEpoch = 0;
    let tailHash = "tail-0";
    const transport = createTxTestTransport();
    const proof = {
      generation: 1,
      action: "household:inactive",
      frames: ["7fb90000ee", "7fb40000ee", "7fba0000ee"],
      completedAtMs: timer.nowMs() - 100,
    };
    const coordinator = createTxCoordinator({
      settings: validSettings({
        transmit_enabled: true,
        unsafe_transmit_enabled: true,
        transmit_user_id: "operator-7",
        tx_quiet_ms: 20,
        unsafe_tx_cooldown_ms: 0,
      }),
      nowMs: timer.nowMs,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
      randomBytes: (size: number) => new Uint8Array(size).fill(7),
      getCurrentUserId: () => "operator-7",
      getTransport: () => transport,
      getGeneration: () => generation,
      getRxState: () => ({
        connected: true,
        pendingAppend,
        rxByteEpoch,
        readEpoch,
        txByteEpoch,
        tailHash,
        lastRxByteAtMs: timer.nowMs() - 100,
        lastValidFrameAtMs: timer.nowMs() - 100,
        lastValidSevenFFrameAtMs: timer.nowMs() - 100,
        validSevenFFrameGeneration: 1,
        lastResumeAtMs: timer.nowMs() - 100,
        sevenFProof: proof,
      }),
    });
    const action = { kind: "entrance", target: "household", state: "inactive" };
    const request = {
      userId: "operator-7",
      confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE",
      schedule: "immediate",
    };
    const challenge = coordinator.issueSpeculativeChallenge(action, request);
    const pending = coordinator.send(action, { ...request, mode: "live", challengeId: challenge.id });
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
    assert.equal(transport.writes.length, 1, `${mutation}: first macro frame should be written`);

    if (mutation === "generation") generation = 2;
    if (mutation === "pendingAppend") pendingAppend = true;
    if (mutation === "txByteEpoch") txByteEpoch = 1;
    if (mutation === "tailHash") tailHash = "tail-mutated";

    for (let index = 0; index < 12; index += 1) {
      timer.advance(200);
      await Promise.resolve();
    }
    const result = await pending;
    assert.equal(result.outcome, "partial_indeterminate", `${mutation} must abort the macro`);
    assert.equal(result.framesWritten, 1, `${mutation} must report the one attempted frame`);
    assert.equal(transport.writes.length, 1, `${mutation} must prevent frame 2/3`);
    assert.equal(transport.isDestroyed(), true, `${mutation} must destroy the exact transport`);
    assert.equal(coordinator.isQuarantined(1), true, `${mutation} must quarantine generation 1`);
    assert.equal(timer.pendingCount(), 0, `${mutation} must leave no timers`);
  }
});

test("M5: raw is gone, so a structural 7F can no longer be constructed from an action", () => {
  // This used to send `7f620000ee` and its offset variants through `raw` and check that the
  // coordinator refused each one — at the head of a frame, buried inside it, and split across
  // the outbound tail. `raw` was the only way to put arbitrary bytes on the line from a
  // semantic action, and it is gone: arbitrary sends belong to the local buslab, behind its
  // allow-list. The encoder refusing the kind outright is a stronger guarantee than the
  // coordinator refusing each shape, because there is no longer a shape to refuse.
  const gates = { transmitEnabled: true, speculativeTransmitEnabled: true, unsafeTransmitEnabled: true, authorizedUser: true };
  for (const hex of ["7f620000ee", "007f620000ee00", "aa7f620000ee", "7f620000eeaa", "007f62", "0000ee00"]) {
    assert.throws(() => encodeSemanticAction({ kind: "raw", hex }, gates), /unsupported/, hex);
  }
  // The 0x7F frames that do reach the bus are the door macro's, and those are a fixed
  // sequence the encoder chooses — never bytes an operator supplies.
  const macro = encodeSemanticAction({ kind: "entrance", target: "communal", state: "ringing" }, gates) as Record<string, unknown>;
  assert.deepEqual(macro.framesHex, ["7f5f0000ee", "7f610000ee", "7f600000ee"]);
  assert.equal(macro.sendable, false, "and no gate combination makes it one tap");
});

test("RED-exception: preview reports server readiness/reasons and commit rechecks changed gates", async () => {
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function");
  if (typeof createTxCoordinator !== "function") return;
  const timer = createFakeTimer();
  let pendingAppend = false;
  const transport = createTxTestTransport();
  const coordinator = createTxCoordinator({
    settings: validSettings({
      transmit_enabled: true,
      speculative_transmit_enabled: true,
      unsafe_transmit_enabled: true,
      transmit_user_id: "operator-7",
      tx_cooldown_ms: 0,
      speculative_tx_cooldown_ms: 0,
      unsafe_tx_cooldown_ms: 0,
    }),
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    randomBytes: (size: number) => new Uint8Array(size).fill(10),
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => 1,
    getRxState: () => ({
      connected: true,
      pendingAppend,
      rxByteEpoch: 1,
      validFrameEpoch: 1,
      validFrameGeneration: 1,
      readEpoch: 1,
      txByteEpoch: 0,
      tailHash: "tail",
      lastRxByteAtMs: timer.nowMs() - 100,
      lastValidFrameAtMs: timer.nowMs() - 100,
      lastValidSevenFFrameAtMs: timer.nowMs() - 100,
      validSevenFFrameGeneration: 1,
      lastResumeAtMs: timer.nowMs() - 100,
      sevenFProof: {
        generation: 1,
        action: "household:inactive",
        frames: ["7fb90000ee", "7fb40000ee", "7fba0000ee"],
        completedAtMs: timer.nowMs() - 100,
      },
    }),
  });
  const light = { kind: "light", target: 1, state: "on" };
  const preview = await coordinator.send(light, { mode: "preview", userId: "operator-7" });
  assert.equal(preview.ready, true, "preview readiness must be computed by the server");
  assert.ok(Array.isArray(preview.reasons), "preview must expose bounded readiness reasons");

  const door = { kind: "entrance", target: "household", state: "inactive" };
  const doorPreview = await coordinator.send(door, { mode: "preview", userId: "operator-7" });
  assert.equal(doorPreview.evidence, "unsafe_candidate");
  assert.ok("ready" in doorPreview && "reasons" in doorPreview, "door proof/cooldown readiness is server-owned");
  const request = {
    userId: "operator-7",
    confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE",
    schedule: "immediate",
  };
  const challenge = coordinator.issueSpeculativeChallenge(door, request);
  pendingAppend = true;
  const rejected = await coordinator.send(door, { ...request, mode: "live", challengeId: challenge.id });
  assert.match(JSON.stringify(rejected), /append|pending|rejected/i);
  assert.equal(transport.writes.length, 0, "changed server gate must prevent commit writes");
});

test("RED-exception: challenge cancellation is authenticated, single-use, and route-backed", async () => {
  const m2 = await importM2();
  const csrfToken = "csrf-cancel";
  const challenge = { id: VALID_CHALLENGE_ID, consumed: false, canceled: false };
  const cancelCalls: AnyRecord[] = [];
  const createIngressHandler = m2.createIngressHandler as unknown as (deps: AnyRecord) =>
    (req: FakeReq, res: FakeRes) => Promise<void> | void;
  const handler = createIngressHandler({
    getState: () => ({
      ...validSettings(), state: "stopped", phase: "stopped", startedAtMs: 0, elapsedMs: 0,
      limitMs: 5_000, byteCount: 0, recordCount: 0, file: null, preview: [],
    } as IngressState),
    async startCapture() {},
    async stopCapture() { throw new Error("unused"); },
    getAuthenticatedIngressUserId: () => "operator-7",
    getConfiguredTransmitUserId: () => "operator-7",
    csrfToken,
    issueSpeculativeChallenge: async () => ({ id: challenge.id, expiresAtMs: 1_700_001_000 }),
    cancelSpeculativeChallenge: async (id: string, request: AnyRecord) => {
      cancelCalls.push({ id, request });
      if (id !== challenge.id || request.userId !== "operator-7" || challenge.consumed || challenge.canceled) return false;
      challenge.canceled = true;
      return true;
    },
    executeSemanticAction: async () => { throw new Error("cancel must not execute as a semantic action"); },
  } as AnyRecord);
  const request = (userId: string, body: AnyRecord, token = csrfToken): FakeReq => createReq({
    method: "POST",
    url: "/api/action",
    socket: { remoteAddress: "172.30.32.2" },
    headers: { "content-type": "application/json", "x-remote-user-id": userId, "x-csrf-token": token },
    body: JSON.stringify(body),
  });
  const activeResponse = createRes();
  await handler(request("operator-7", { mode: "cancel", challengeId: challenge.id }), activeResponse);
  assert.equal(activeResponse.statusCode, 200, "same-user unconsumed challenge must cancel");
  assert.equal(challenge.canceled, true);
  assert.equal(cancelCalls.length, 1);

  const replay = createRes();
  await handler(request("operator-7", { mode: "cancel", challengeId: challenge.id }), replay);
  assert.ok(replay.statusCode >= 400 && replay.statusCode < 500, "canceled challenge must not be replayable");
  const unknown = createRes();
  await handler(request("operator-7", { mode: "cancel", challengeId: VALID_UNKNOWN_CHALLENGE_ID }), unknown);
  assert.ok(unknown.statusCode >= 400 && unknown.statusCode < 500, "unknown challenge must reject");
  const wrongUser = createRes();
  await handler(request("intruder", { mode: "cancel", challengeId: VALID_UNKNOWN_CHALLENGE_ID }), wrongUser);
  assert.equal(wrongUser.statusCode, 403, "wrong trusted user must reject before cancellation");
  const csrf = createRes();
  await handler(request("operator-7", { mode: "cancel", challengeId: VALID_UNKNOWN_CHALLENGE_ID }, "wrong-csrf"), csrf);
  assert.equal(csrf.statusCode, 403, "cancel must require CSRF");
});

test("RED-final: readiness revision is shared and stale proof rejects preview, challenge, and commit", async () => {
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function");
  if (typeof createTxCoordinator !== "function") return;

  const timer = createFakeTimer();
  let generation = 1;
  let rxByteEpoch = 1;
  let readEpoch = 1;
  let validFrameEpoch = 1;
  let phase = "running";
  let pendingAppend = false;
  let quarantined = false;
  let proofCompletedAtMs = timer.nowMs() - 10;
  let lastValidSevenFFrameAtMs = timer.nowMs() - 10;
  const proof = {
    generation: 1,
    action: "household:inactive",
    frames: ["7fb90000ee", "7fb40000ee", "7fba0000ee"],
  };
  const transport = createTxTestTransport();
  const getRxState = (): AnyRecord => ({
    connected: !quarantined,
    pendingAppend,
    phase,
    generation,
    rxByteEpoch,
    readEpoch,
    validFrameEpoch,
    validFrameGeneration: generation,
    txByteEpoch: 0,
    tailHash: "tail",
    lastRxByteAtMs: timer.nowMs() - 100,
    lastValidFrameAtMs: timer.nowMs() - 100,
    lastValidSevenFFrameAtMs,
    validSevenFFrameGeneration: generation,
    lastResumeAtMs: timer.nowMs() - 100,
    sevenFProof: { ...proof, completedAtMs: proofCompletedAtMs },
  });
  const coordinator = createTxCoordinator({
    settings: validSettings({
      transmit_enabled: true,
      speculative_transmit_enabled: true,
      unsafe_transmit_enabled: true,
      transmit_user_id: "operator-7",
      tx_cooldown_ms: 0,
      speculative_tx_cooldown_ms: 0,
      unsafe_tx_cooldown_ms: 0,
    }),
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    randomBytes: (size: number) => new Uint8Array(size).fill(7),
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => generation,
    getRxState,
  });
  // The elevator was measured and promoted, so the door macro is the candidate now. This
  // fixture already carries the matching `household:inactive` proof.
  const candidate = { kind: "entrance", target: "household", state: "inactive" };
  const preview = await coordinator.send(candidate, { mode: "preview", userId: "operator-7" });
  const revision = preview.readinessRevision;
  assert.ok(
    (typeof revision === "string" || Number.isSafeInteger(revision)) && String(revision).length <= 256,
    "preview must expose one bounded server-owned readinessRevision",
  );
  const challenge = coordinator.issueSpeculativeChallenge(candidate, {
    userId: "operator-7",
    confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE",
    schedule: "immediate",
  });
  assert.equal(challenge.readinessRevision, revision, "issued challenge must bind the same readiness revision");

  const statusProvider = (coordinator as AnyRecord).getTxStatus ?? (coordinator as AnyRecord).status;
  assert.equal(typeof statusProvider, "function", "TX coordinator must expose the server-owned status revision");
  const status = typeof statusProvider === "function" ? statusProvider.call(coordinator) : {};
  assert.equal(status.readinessRevision, revision, "status tx must expose the same revision");

  const revisions = [revision];
  for (const mutate of [
    () => { generation += 1; },
    () => { rxByteEpoch += 1; },
    () => { readEpoch += 1; },
    () => { validFrameEpoch += 1; },
    () => { phase = "stopped"; },
    () => { pendingAppend = true; },
    () => { quarantined = true; },
    () => { proofCompletedAtMs += 1; },
    () => { proof.action = "communal:ringing"; },
  ]) {
    mutate();
    const next = await coordinator.send(candidate, { mode: "preview", userId: "operator-7" });
    revisions.push(next.readinessRevision);
  }
  assert.equal(new Set(revisions.map((value) => String(value))).size, revisions.length, "each readiness input change must revise the server value");

  generation = 1;
  rxByteEpoch = 1;
  readEpoch = 1;
  validFrameEpoch = 1;
  phase = "running";
  pendingAppend = false;
  quarantined = false;
  proofCompletedAtMs = timer.nowMs() - 10;
  lastValidSevenFFrameAtMs = timer.nowMs() - 10;
  proof.action = "household:inactive";
  const door = { kind: "entrance", target: "household", state: "inactive" };
  const doorChallenge = coordinator.issueSpeculativeChallenge(door, {
    userId: "operator-7",
    confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE",
    schedule: "immediate",
  });
  proofCompletedAtMs = timer.nowMs() - 100_000;
  // A newly refreshed generic timestamp must not revive the older completed proof.
  lastValidSevenFFrameAtMs = timer.nowMs();
  const stalePreview = await coordinator.send(door, { mode: "preview", userId: "operator-7" });
  assert.equal(stalePreview.ready, false, "stale action-specific proof must fail preview readiness");
  assert.throws(
    () => coordinator.issueSpeculativeChallenge(door, {
      userId: "operator-7",
      confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE",
      schedule: "immediate",
    }),
    /proof|stale|revision|compatib/i,
  );
  const staleCommit = await coordinator.send(door, {
    mode: "live",
    userId: "operator-7",
    challengeId: doorChallenge.id,
    confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE",
    schedule: "immediate",
  });
  assert.match(JSON.stringify(staleCommit), /proof|stale|revision|challenge|rejected/i);
  assert.equal(transport.writes.length, 0);
});

function uiStatusPayload(overrides: AnyRecord = {}): AnyRecord {
  const now = 1_700_020_000;
  const freshness = (extra: AnyRecord = {}): AnyRecord => ({
    lastSeenAtMs: now - 25,
    generation: 9,
    stale: false,
    ...extra,
  });
  return {
    serverNowMs: now,
    phase: "running",
    state: "running",
    generation: 9,
    lastValidFrameAtMs: now - 25,
    lastValidFrameGeneration: 9,
    validFrameEpoch: 3,
    csrfToken: "csrf-ui",
    bounds: { idle_timeout_ms: 30_000 },
    tx: {
      enabled: true,
      speculativeEnabled: true,
      unsafeEnabled: true,
      authorized: true,
      connected: true,
      inFlight: false,
      quarantined: false,
      pendingAppend: false,
      quiet: true,
      currentGenerationRx: true,
      fresh: true,
      sevenFProof: true,
      observationTimeoutMs: 10_000,
      readinessRevision: "r1",
    },
    debug: {
      staleAfterMs: 30_000,
      frames: [{ rawHex: "f70d011904401000020102b5ee", atMs: now - 25, generation: 9 }],
      unknown: [{ cluster: "0x7e", rawHex: "7f620000ee", atMs: now - 20, generation: 9, stale: false }],
      ambiguous: [{ cluster: "0x2a", rawHex: `7f2a${"aa".repeat(300)}ee`, atMs: now - 30, generation: 9, stale: true }],
      queries: { outlet: 2, ventilation: 3 },
      devices: {
        lights: { 1: freshness({ state: "off" }), 2: freshness({ state: "on" }), 3: freshness({ state: "off" }) },
        gas: freshness({ state: "closed" }),
        heating: {
          1: freshness({ state: "on", currentC: 21, targetC: 22 }),
          2: freshness({ state: "off", currentC: 23, targetC: 24 }),
          3: freshness({ state: "on", currentC: 25, targetC: 26 }),
          4: freshness({ state: "off", currentC: 27, targetC: 28 }),
        },
        elevator: freshness({ floor: 4, floorLabel: "4", motion: "idle", call: "arrival", direction: "arrival" }),
        entrances: {
          household: freshness({ doorOpenObserved: true, evidence: "unsafe_candidate" }),
          communal: freshness({ evidence: "not_decoded" }),
        },
        outlet: freshness({ queryOnly: true }),
        ventilation: freshness({ queryOnly: true }),
        vehicle: freshness({ evidence: "unidentified" }),
        cctv: freshness({ evidence: "not_observed_this_generation" }),
      },
    },
    ...overrides,
  };
}

type UiVmFixture = {
  nodes: Map<string, AnyRecord>;
  fetchCalls: AnyRecord[];
  timers: Map<number, (...args: unknown[]) => unknown>;
  timerDelays: Map<number, number>;
  flush(): Promise<void>;
  click(id: string): void;
  advanceTime(ms: number): void;
  fireTimer(id?: number): void;
};

async function createUiVmFixture(
  payload: AnyRecord,
  fetchImpl?: (url: string, init: AnyRecord | undefined, calls: AnyRecord[]) => unknown,
): Promise<UiVmFixture> {
  const uiModule = await import(pathToFileURL(path(paths.uiSource)).href) as AnyRecord;
  const html = String(uiModule.renderAppHtml());
  const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  assert.equal(typeof script, "string");
  if (typeof script !== "string") throw new Error("UI script missing");
  const nodes = new Map<string, AnyRecord>();
  let serial = 0;
  const makeNode = (id: string): AnyRecord => {
    const attributes: Record<string, string> = {};
    const children: AnyRecord[] = [];
    const listeners: Record<string, (...args: unknown[]) => unknown> = {};
    const node: AnyRecord = {
      id, textContent: "", value: "", disabled: false, firstChild: null, focused: false,
      classList: { toggle() {} },
      setAttribute(name: string, value: string) { attributes[name] = value; },
      getAttribute(name: string) { return attributes[name]; },
      addEventListener(name: string, listener: (...args: unknown[]) => unknown) { listeners[name] = listener; },
      focus() { node.focused = true; },
      reportValidity() { return attributes["aria-invalid"] !== "true"; },
      appendChild(child: AnyRecord) { children.push(child); node.firstChild = children[0] ?? null; return child; },
      removeChild(child: AnyRecord) { const index = children.indexOf(child); if (index >= 0) children.splice(index, 1); node.firstChild = children[0] ?? null; return child; },
      children, listeners, attributes,
    };
    nodes.set(id, node);
    return node;
  };
  for (const match of html.matchAll(/<[^>]*\bid=["']([^"']+)["'][^>]*>/g)) {
    const node = makeNode(match[1]);
    for (const attribute of ["role", "aria-live"]) {
      const value = match[0].match(new RegExp(`\\b${attribute}=["']([^"']*)["']`))?.[1];
      if (value !== undefined) node.attributes[attribute] = value;
    }
  }
  const timers = new Map<number, (...args: unknown[]) => unknown>();
  const timerDelays = new Map<number, number>();
  let nextTimer = 1;
  let nowMs = 1_700_020_000;
  const window = {
    __bestiumTx: {},
    setTimeout(callback: (...args: unknown[]) => unknown, delayMs: number) { const id = nextTimer++; timers.set(id, callback); timerDelays.set(id, delayMs); return id; },
    clearTimeout(id: number) { timers.delete(id); timerDelays.delete(id); },
    location: { assign() {} },
  };
  const fetchCalls: AnyRecord[] = [];
  const fetch = (url: string, init?: AnyRecord): unknown => {
    const call = { url, init };
    fetchCalls.push(call);
    const response = fetchImpl?.(url, init, fetchCalls) ?? { ok: true, async json() { return payload; } };
    return Promise.resolve(response);
  };
  class FakeAbortController {
    signal = { aborted: false };
    abort() { this.signal.aborted = true; }
  }
  const document = {
    getElementById(id: string) { return nodes.get(id) ?? null; },
    createElement(type: string) { serial += 1; return makeNode(`${type}-${serial}`); },
  };
  runInNewContext(script, {
    window, document, fetch, AbortController: FakeAbortController,
    Date: { now: () => nowMs },
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout, console,
  });
  return {
    nodes,
    fetchCalls,
    timers,
    timerDelays,
    async flush() { for (let index = 0; index < 16; index += 1) await Promise.resolve(); },
    click(id: string) { nodes.get(id)?.listeners.click?.({ currentTarget: nodes.get(id) }); },
    advanceTime(ms: number) { nowMs += ms; },
    fireTimer(id?: number) {
      const timerId = id ?? timers.keys().next().value as number | undefined;
      if (timerId === undefined) return;
      const callback = timers.get(timerId);
      if (!callback) return;
      timers.delete(timerId);
      timerDelays.delete(timerId);
      callback();
    },
  };
}

function uiJsonResponse(value: AnyRecord, ok = true): AnyRecord {
  return { ok, async json() { return value; } };
}

function withLight1State(
  payload: AnyRecord,
  state: "on" | "off",
  lastSeenAtMs: number,
  options: { generation?: number; entryGeneration?: number; stale?: boolean } = {},
): AnyRecord {
  const debug = payload.debug as AnyRecord;
  const devices = debug.devices as AnyRecord;
  const lights = devices.lights as AnyRecord;
  const generation = options.generation ?? payload.generation;
  return {
    ...payload,
    ...(options.generation === undefined ? {} : { generation, lastValidFrameGeneration: generation }),
    debug: {
      ...debug,
      devices: {
        ...devices,
        lights: {
          ...lights,
          1: {
            ...(lights[1] as AnyRecord),
            state,
            lastSeenAtMs,
            stale: options.stale ?? false,
            generation: options.entryGeneration ?? generation,
          },
        },
      },
    },
  };
}

test("RED-M4.2: ingress serializes challenge, capture, live action, cancel, and stop mutations", async () => {
  const m2 = await importM2();
  const events: string[] = [];
  let releaseIssue!: () => void;
  let releaseAction!: () => void;
  let rejectNextAction = false;
  const state = { ...validSettings(), state: "stopped" as const, phase: "stopped", startedAtMs: 0, elapsedMs: 0, limitMs: 5_000, byteCount: 0, recordCount: 0, file: null, preview: [] } as IngressState;
  const handler = (m2.createIngressHandler as unknown as (deps: AnyRecord) => (req: FakeReq, res: FakeRes) => Promise<void>)({
    getState: () => state,
    getAuthenticatedIngressUserId: () => "operator-7",
    getConfiguredTransmitUserId: () => "operator-7",
    csrfToken: "csrf-order",
    async issueSpeculativeChallenge() {
      events.push("issue");
        return new Promise((resolve) => { releaseIssue = () => { resolve({ id: VALID_CHALLENGE_ID, expiresAtMs: Date.now() + 30_000, readinessRevision: "r1" }); }; });
    },
    async cancelSpeculativeChallenge() { events.push("cancel"); return true; },
    async executeSemanticAction() {
      events.push("commit");
      if (rejectNextAction) {
        rejectNextAction = false;
        throw new Error("synthetic queued action rejection");
      }
      return new Promise((resolve) => { releaseAction = () => resolve({ outcome: "socket_written_unconfirmed" }); });
    },
    async startCapture() { events.push("start"); },
    async stopCapture() { events.push("stop"); return {}; },
  });
  const req = (url: string, body: AnyRecord): FakeReq => createReq({ method: "POST", url, socket: { remoteAddress: "172.30.32.2" }, headers: { "x-remote-user-id": "operator-7", "x-csrf-token": "csrf-order", "content-type": "application/json" }, body: JSON.stringify(body) });
  const action = { kind: "elevator", direction: "down" };
  const issue = handler(req("/api/action", { ...action, mode: "challenge", confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE", schedule: "immediate" }), createRes());
  await Promise.resolve();
  const blockedCapture = createRes();
  await handler(req("/api/capture", {}), blockedCapture);
  assert.equal(blockedCapture.statusCode, 409);
  assert.equal(events.includes("start"), false, "deferred issue must block capture");
  releaseIssue();
  await issue;
  const outstandingCapture = createRes();
  await handler(req("/api/capture", {}), outstandingCapture);
  assert.equal(outstandingCapture.statusCode, 409);
  const cancel = createRes();
  await handler(req("/api/action", { mode: "cancel", challengeId: VALID_CHALLENGE_ID }), cancel);
  assert.equal(cancel.statusCode, 200);
  const allowedCapture = createRes();
  await handler(req("/api/capture", {}), allowedCapture);
  assert.equal(allowedCapture.statusCode, 200);
  state.state = "stopped";
  const commit = handler(req("/api/action", { ...action, mode: "commit", schedule: "immediate" }), createRes());
  await Promise.resolve();
  const overlap = createRes();
  await handler(req("/api/capture", {}), overlap);
  assert.equal(overlap.statusCode, 409);
  releaseAction();
  await commit;
  const issueAgain = handler(req("/api/action", { ...action, mode: "challenge", confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE" }), createRes());
  await Promise.resolve();
  const stop = createRes();
  const pendingStop = handler(req("/api/stop", {}), stop);
  await Promise.resolve();
  assert.equal(events[events.length - 1], "issue", "stop must serialize behind a deferred issue");
  releaseIssue();
  await issueAgain;
  await pendingStop;
  assert.equal(events[events.length - 1], "stop");

  state.state = "running";
  rejectNextAction = true;
  const rejectedResponse = createRes();
  const rejectedCommit = handler(req("/api/action", { ...action, mode: "commit", schedule: "immediate" }), rejectedResponse);
  await Promise.resolve();
  const stopAfterRejectedResponse = createRes();
  const stopAfterRejected = handler(req("/api/stop", {}), stopAfterRejectedResponse);
  await rejectedCommit;
  await stopAfterRejected;
  assert.equal(rejectedResponse.statusCode, 422, "queued mutation rejection must be surfaced as a bounded action error");
  assert.equal(stopAfterRejectedResponse.statusCode, 200, "rejection-safe mutation tail must still run a later stop");
  assert.equal(events[events.length - 1], "stop", "later stop must execute after the rejected queued mutation");
});

test("RED-sixth: challenge outstanding state clears only on authoritative success or expiry", async () => {
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function");
  if (typeof createTxCoordinator !== "function") return;

  const timer = createFakeTimer();
  // The door macro sends three frames with a gap between them, and this test is about what a
  // challenge does, not what reaches the wire. Failing the write on the first frame ends the
  // send at once: the challenge is still consumed, which is the property under test, and
  // nothing waits on a timer this test never advances.
  const transport = createTxTestTransport();
  const rawWrite = transport.write.bind(transport);
  transport.write = ((chunk: Uint8Array, callback?: (error?: Error | null) => void) => {
    rawWrite(chunk, () => {});
    queueMicrotask(() => callback?.(new Error("write failed")));
    return true;
  }) as typeof transport.write;
  let randomCounter = 0;
  const randomBytes = (size: number): Uint8Array => {
    randomCounter += 1;
    return Uint8Array.from({ length: size }, (_, index) => (randomCounter + index) & 0xff);
  };
  const settings = validSettings({
    transmit_enabled: true,
    speculative_transmit_enabled: true,
    // The door macro is an unsafe candidate as well as a speculative one.
    unsafe_transmit_enabled: true,
    transmit_user_id: "operator-7",
    tx_write_timeout_ms: 100,
    tx_cooldown_ms: 0,
    tx_quiet_ms: 5,
    speculative_tx_cooldown_ms: 0,
    unsafe_tx_cooldown_ms: 0,
  });
  const state = {
    connected: true,
    pendingAppend: false,
    rxByteEpoch: 1,
    readEpoch: 1,
    validFrameEpoch: 1,
    validFrameGeneration: 1,
    lastRxByteAtMs: timer.nowMs() - 10,
    lastValidFrameAtMs: timer.nowMs() - 10,
    lastValidSevenFFrameAtMs: timer.nowMs() - 10,
    validSevenFFrameGeneration: 1,
    lastResumeAtMs: timer.nowMs() - 10,
    phase: "running",
    txByteEpoch: 0,
    tailHash: "",
    sevenFProof: {
      generation: 1,
      action: "household:inactive",
      frames: ["7fb90000ee", "7fb40000ee", "7fba0000ee"],
      completedAtMs: timer.nowMs() - 10,
    },
  };
  const coordinator = createTxCoordinator({
    settings,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    randomBytes,
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => 1,
    getRxState: () => state,
  });
  const action = { kind: "entrance", target: "household", state: "inactive" };
  const ingressState = {
    ...settings,
    state: "running" as const,
    phase: "running" as const,
    startedAtMs: timer.nowMs(),
    elapsedMs: 0,
    limitMs: 5_000,
    byteCount: 0,
    recordCount: 0,
    file: null,
    preview: [],
  } as IngressState;
  const request = (body: AnyRecord, url = "/api/action"): FakeReq => createReq({
    method: "POST",
    url,
    socket: { remoteAddress: "172.30.32.2" },
    headers: { "x-remote-user-id": "operator-7", "x-csrf-token": "csrf-sixth", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let starts = 0;
  const authoritative = m2.createIngressHandler({
    getState: () => ingressState,
    getAuthenticatedIngressUserId: () => "operator-7",
    getConfiguredTransmitUserId: () => "operator-7",
    csrfToken: "csrf-sixth",
    hasOutstandingSpeculativeChallenge: () => coordinator.hasOutstandingSpeculativeChallenge(),
    issueSpeculativeChallenge: (value, req) => coordinator.issueSpeculativeChallenge(value, {
      userId: String(req.userId),
      confirmationPhrase: String(req.confirmationPhrase),
      schedule: typeof req.schedule === "string" ? req.schedule : "immediate",
    }),
    cancelSpeculativeChallenge: (id, req) => coordinator.cancelSpeculativeChallenge(id, String(req.userId)),
    executeSemanticAction: (value, req) => coordinator.send(value, req),
    async startCapture() { starts += 1; },
    async stopCapture() { return {} as CoordinatorResult; },
  });
  // What used to run here drove the whole issue/commit/expire cycle through the ingress with
  // a one-frame candidate. The elevator was that candidate and measurement promoted it; the
  // door macro that replaces it sends three frames through this same path, and this test
  // never advances the timer between them. So the outstanding-state cycle moved to
  // "M5: the challenge path, exercised by the only candidate left", which drives the
  // coordinator directly, and what stays here is the ingress behaviour the fallback half
  // below is about: what the handler does when it cannot see the coordinator's state.
  assert.equal(coordinator.hasOutstandingSpeculativeChallenge(), false, "nothing is outstanding to begin with");
  const outstanding = coordinator.issueSpeculativeChallenge(action, {
    userId: "operator-7",
    confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE",
    schedule: "immediate",
  });
  assert.equal(coordinator.hasOutstandingSpeculativeChallenge(), true);
  assert.equal(coordinator.cancelSpeculativeChallenge(outstanding.id, "operator-7"), true);
  assert.equal(coordinator.hasOutstandingSpeculativeChallenge(), false, "a cancelled challenge is not outstanding");
  const expiring = coordinator.issueSpeculativeChallenge(action, {
    userId: "operator-7",
    confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE",
    schedule: "immediate",
  });
  assert.equal(coordinator.hasOutstandingSpeculativeChallenge(), true);
  timer.advance(30_001);
  assert.equal(coordinator.hasOutstandingSpeculativeChallenge(), false, "expired challenge must be purged");
  const captureWhileClear = createRes();
  await authoritative(request({}, "/api/capture"), captureWhileClear);
  assert.equal(captureWhileClear.statusCode, 200, "capture is allowed once nothing is outstanding");
  assert.equal(starts, 1);

  let fallbackMode: "wrong" | "throw" | "reject" | "success" = "wrong";
  let fallbackExpiry = timer.nowMs() + 100;
  const fallbackId = VALID_CHALLENGE_ID;
  const fallback = m2.createIngressHandler({
    getState: () => ingressState,
    getAuthenticatedIngressUserId: () => "operator-7",
    getConfiguredTransmitUserId: () => "operator-7",
    csrfToken: "csrf-sixth",
    nowMs: timer.nowMs,
    issueSpeculativeChallenge: () => ({ id: fallbackId, expiresAtMs: fallbackExpiry, readinessRevision: "r1" }),
    cancelSpeculativeChallenge: (id) => id === fallbackId,
    executeSemanticAction: async (_value, req) => {
      if (req?.challengeId !== fallbackId || fallbackMode === "wrong") throw new Error("challenge mismatch");
      if (fallbackMode === "throw") throw new Error("commit failed");
      if (fallbackMode === "reject") return { outcome: "rejected", reason: "commit rejected" };
      return { outcome: "socket_written_unconfirmed", deviceConfirmed: false };
    },
    async startCapture() {},
    async stopCapture() { return {} as CoordinatorResult; },
  });
  // The fallback handler stubs both the issue and the commit, so it never reaches a real
  // encoder and the macro's frame count is irrelevant here.
  const issueBody = { ...action, mode: "challenge", confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE", schedule: "immediate" };
  const fallbackIssue = createRes();
  await fallback(request(issueBody), fallbackIssue);
  assert.equal(fallbackIssue.statusCode, 200);
  for (const mode of ["wrong", "throw", "reject"] as const) {
    fallbackMode = mode;
    const commit = createRes();
    await fallback(request({ ...action, mode: "commit", challengeId: mode === "wrong" ? "other" : fallbackId, schedule: "immediate" }), commit);
    const blocked = createRes();
    await fallback(request({}, "/api/capture"), blocked);
    assert.equal(blocked.statusCode, 409, `${mode} matching commit must not clear fallback challenge`);
  }
  fallbackMode = "success";
  const successfulCommit = createRes();
  await fallback(request({ ...action, mode: "commit", challengeId: fallbackId, schedule: "immediate" }), successfulCommit);
  assert.equal(successfulCommit.statusCode, 200);
  const fallbackAfterCommit = createRes();
  await fallback(request({}, "/api/capture"), fallbackAfterCommit);
  assert.equal(fallbackAfterCommit.statusCode, 200, "successful fallback commit must clear local challenge state");

  const canceledIssue = createRes();
  fallbackExpiry = timer.nowMs() + 100;
  await fallback(request(issueBody), canceledIssue);
  const canceled = createRes();
  await fallback(request({ mode: "cancel", challengeId: fallbackId }), canceled);
  assert.equal(canceled.statusCode, 200);
  const afterCancel = createRes();
  await fallback(request({}, "/api/capture"), afterCancel);
  assert.equal(afterCancel.statusCode, 200);

  const expiringIssue = createRes();
  fallbackExpiry = timer.nowMs() + 100;
  await fallback(request(issueBody), expiringIssue);
  timer.advance(101);
  const fallbackAfterExpiry = createRes();
  await fallback(request({}, "/api/capture"), fallbackAfterExpiry);
  assert.equal(fallbackAfterExpiry.statusCode, 200, "fallback expiry must purge local challenge state");
});

test("RED-seventh: fallback ingress validates challenge IDs and preserves unknown outstanding guards", async () => {
  const m2 = await importM2();
  const problems: string[] = [];
  const check = (condition: unknown, message: string): void => { if (!condition) problems.push(message); };
  const state = (): IngressState => ({
    ...validSettings(), state: "stopped", phase: "stopped", startedAtMs: 0, elapsedMs: 0,
    limitMs: 5_000, byteCount: 0, recordCount: 0, file: null, preview: [],
  } as IngressState);
  const request = (body: AnyRecord, url = "/api/action"): FakeReq => createReq({
    method: "POST", url, socket: { remoteAddress: "172.30.32.2" },
    headers: { "x-remote-user-id": "operator-7", "x-csrf-token": "csrf-seventh", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const common = (current: IngressState, timer?: FakeTimer): Pick<Parameters<RuntimeExports["createIngressHandler"]>[0], "getState" | "startCapture" | "stopCapture" | "getAuthenticatedIngressUserId" | "getConfiguredTransmitUserId" | "csrfToken" | "nowMs" | "executeSemanticAction"> => ({
    getState: () => current,
    getAuthenticatedIngressUserId: () => "operator-7",
    getConfiguredTransmitUserId: () => "operator-7",
    csrfToken: "csrf-seventh",
    ...(timer ? { nowMs: timer.nowMs } : {}),
    async startCapture() {},
    async stopCapture() { return {} as CoordinatorResult; },
    async executeSemanticAction() { return { outcome: "socket_written_unconfirmed", deviceConfirmed: false }; },
  });

  const invalidState = state();
  const invalidHandler = m2.createIngressHandler({
    ...common(invalidState),
    cancelSpeculativeChallenge: async () => true,
  });
  for (const [label, id] of [["whitespace", " "], ["31-char", "a".repeat(31)], ["invalid-char", `${"a".repeat(31)}!`]] as const) {
    const response = createRes();
    await invalidHandler(request({ mode: "cancel", challengeId: id }), response);
    check(response.statusCode >= 400 && response.statusCode < 500, `${label} challenge ID must reject: ${response.statusCode}`);
  }

  const falseTimer = createFakeTimer();
  const falseHandler = m2.createIngressHandler({
    ...common(state(), falseTimer),
    issueSpeculativeChallenge: () => ({ id: VALID_CHALLENGE_ID, expiresAtMs: falseTimer.nowMs() + 30_000 }),
    cancelSpeculativeChallenge: async () => false,
  });
  const issueBody = { kind: "elevator", direction: "down", mode: "challenge", confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE", schedule: "immediate" };
  await falseHandler(request(issueBody), createRes());
  const falseCancel = createRes();
  await falseHandler(request({ mode: "cancel", challengeId: VALID_CHALLENGE_ID }), falseCancel);
  check(falseCancel.statusCode === 409, `{cancelled:false} must fail: ${falseCancel.statusCode}`);
  const blockedFalseCancel = createRes();
  await falseHandler(request({}, "/api/capture"), blockedFalseCancel);
  check(blockedFalseCancel.statusCode === 409, `{cancelled:false} must retain the capture block: ${blockedFalseCancel.statusCode}`);

  const runUnknownGuard = async (label: string, failure: "malformed" | "thrown", settle: "cancel" | "expiry"): Promise<void> => {
    const timer = createFakeTimer();
    const current = state();
    let issueCount = 0;
    const handler = m2.createIngressHandler({
      ...common(current, timer),
      issueSpeculativeChallenge: () => {
        issueCount += 1;
        if (issueCount === 1) return { id: VALID_CHALLENGE_ID, expiresAtMs: timer.nowMs() + 1_000 };
        if (failure === "thrown") throw new Error("challenge issue failed");
        return { id: "bad id", expiresAtMs: timer.nowMs() + 1_000 };
      },
      cancelSpeculativeChallenge: async () => true,
    });
    const knownIssue = createRes();
    await handler(request(issueBody), knownIssue);
    check(knownIssue.statusCode === 200, `${label} known challenge issue must succeed: ${knownIssue.statusCode}`);
    const guardStartedAt = timer.nowMs();
    await handler(request(issueBody), createRes());
    if (settle === "cancel") {
      const canceled = createRes();
      await handler(request({ mode: "cancel", challengeId: VALID_CHALLENGE_ID }), canceled);
      check(canceled.statusCode === 200, `${label} known challenge cancel must succeed: ${canceled.statusCode}`);
    }
    timer.advance(Math.max(0, guardStartedAt + 1_001 - timer.nowMs()));
    const afterKnown = createRes();
    await handler(request({}, "/api/capture"), afterKnown);
    check(afterKnown.statusCode === 409, `${label} unknown issue guard must survive known ${settle}: ${afterKnown.statusCode}`);
    timer.advance(Math.max(0, guardStartedAt + 29_999 - timer.nowMs()));
    const beforeExpiry = createRes();
    await handler(request({}, "/api/capture"), beforeExpiry);
    check(beforeExpiry.statusCode === 409, `${label} guard must remain for 30s: ${beforeExpiry.statusCode}`);
    timer.advance(1);
    const afterExpiry = createRes();
    await handler(request({}, "/api/capture"), afterExpiry);
    check(afterExpiry.statusCode === 200, `${label} guard may clear after 30s: ${afterExpiry.statusCode}`);
  };
  await runUnknownGuard("malformed issue", "malformed", "cancel");
  await runUnknownGuard("thrown issue", "thrown", "expiry");

  assert.deepStrictEqual(problems, []);
});

test("M4.6 RED: quarantine chip pins the gate and freshness survives an unparsed-byte line", async () => {
  const m2 = await importM2();
  const createTxCoordinator = (m2 as AnyRecord).createTxCoordinator;
  assert.equal(typeof createTxCoordinator, "function", "M2 must expose a bounded TX coordinator");
  if (typeof createTxCoordinator !== "function") return;

  const timer = createFakeTimer();
  const settings = validSettings({
    transmit_enabled: true,
    speculative_transmit_enabled: true,
    unsafe_transmit_enabled: true,
    transmit_user_id: "operator-7",
    tx_quiet_ms: 20,
    idle_timeout_ms: 30_000,
    tx_write_timeout_ms: 1_000,
  });
  const written: string[] = [];
  const transport = {
    on() {}, off() {}, once() {}, removeAllListeners() {}, destroy() {},
    write(chunk: Uint8Array, done?: () => void) {
      written.push([...chunk].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
      done?.();
      return true;
    },
  };
  const rxState = (overrides: AnyRecord): AnyRecord => ({
    connected: true,
    pendingAppend: false,
    rxByteEpoch: 5,
    readEpoch: 5,
    txByteEpoch: 0,
    tailHash: "tail-0",
    lastRxByteAtMs: timer.nowMs() - 100,
    lastValidFrameAtMs: timer.nowMs() - 100,
    lastResumeAtMs: timer.nowMs() - 100,
    validFrameEpoch: 3,
    validFrameGeneration: 1,
    phase: "running",
    ...overrides,
  });
  const lightOn = { kind: "light", target: 1, state: "on" };
  const request = { mode: "preview", userId: "operator-7" };
  const blocked = (result: AnyRecord, pattern: RegExp): boolean =>
    (result.reasons as string[] ?? []).some((reason) => pattern.test(reason));

  // 1. The status chip must report the same quarantine the readiness gate enforces.
  //    After a stop the old generation is quarantined; a new transport raises the
  //    generation, but until a valid frame arrives the gate still consults the old one.
  let generation = 1;
  const quarantined = createTxCoordinator({
    settings,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => generation,
    getRxState: () => rxState({ validFrameGeneration: 1 }),
  });
  quarantined.stop();
  generation = 2;
  const chip = quarantined.getTxStatus({ userId: "operator-7" }) as AnyRecord;
  const quarantinePreview = await quarantined.send(lightOn, request) as AnyRecord;
  assert.equal(chip.quarantined, true, "a stopped generation must be reported as quarantined");
  assert.equal(
    blocked(quarantinePreview, /quarantined/),
    true,
    "the readiness gate must refuse a quarantined transport generation",
  );
  assert.equal(
    chip.quarantined,
    blocked(quarantinePreview, /quarantined/),
    "the quarantine chip must report exactly what the readiness gate enforces",
  );

  // 2. Every action class keeps the freshness requirement, including observed.
  //    Transport idle recovery cannot substitute for it: recovery is armed on
  //    socket inactivity, while freshness measures valid-frame age. A line that
  //    keeps delivering bytes that never parse into a valid frame therefore never
  //    reconnects, so nothing else expires and only freshness can refuse the write.
  const unparsed = createTxCoordinator({
    settings,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => 1,
    getRxState: () => rxState({
      lastRxByteAtMs: timer.nowMs() - 100,
      lastValidFrameAtMs: timer.nowMs() - 2 * 60 * 60 * 1000,
      lastResumeAtMs: timer.nowMs() - 2 * 60 * 60 * 1000,
    }),
  });
  const unparsedStatus = unparsed.getTxStatus({ userId: "operator-7" }) as AnyRecord;
  assert.equal(unparsedStatus.fresh, false, "a two-hour-old valid frame is not fresh");
  assert.equal(unparsedStatus.quiet, true, "a 100 ms byte gap satisfies the minimum quiet interval");
  assert.equal(
    unparsedStatus.currentGenerationRx,
    true,
    "current-generation RX does not decay, so it cannot bound this line on its own",
  );
  const unparsedPreview = await unparsed.send(lightOn, request) as AnyRecord;
  assert.equal(
    blocked(unparsedPreview, /stale/),
    true,
    "an observed action must be refused when the last valid frame is stale",
  );
  written.length = 0;
  const unparsedLive = await unparsed.send(lightOn, { mode: "live", userId: "operator-7" }) as AnyRecord;
  assert.notEqual(
    unparsedLive.outcome,
    "socket_written_unconfirmed",
    "a stale line must not reach the socket",
  );
  assert.deepStrictEqual(written, [], "no byte may be written while the last valid frame is stale");

  // A fully silent bus is refused for the same reason, and RAW keeps the gate too.
  const quiet = createTxCoordinator({
    settings,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => 1,
    getRxState: () => rxState({
      lastRxByteAtMs: timer.nowMs() - 120_000,
      lastValidFrameAtMs: timer.nowMs() - 120_000,
      lastResumeAtMs: timer.nowMs() - 120_000,
    }),
  });
  const observedPreview = await quiet.send(lightOn, request) as AnyRecord;
  assert.equal(
    blocked(observedPreview, /stale/),
    true,
    "a silent bus must refuse an observed action on freshness, not only on reconnect",
  );
  // This used to send the same thing through `raw`, to show freshness applied to it too.
  // `raw` is gone; the door macro is the only action left that takes a different path
  // through the gates, and freshness has to hold for it as well.
  const macroPreview = await quiet.send({ kind: "entrance", target: "household", state: "ringing" }, request) as AnyRecord;
  assert.equal(
    blocked(macroPreview, /stale|candidate|challenge|proof/),
    true,
    "a silent bus must refuse the door macro too",
  );

  // 3. One coordinator lives for the whole process. startCapture calls stop()
  //    first, which quarantines the generation in force at that moment, and
  //    attachTransport then raises the generation while leaving
  //    validFrameGeneration at 0 until the first frame lands. That 0 means "not
  //    observed yet", not "generation zero", so it must not be a quarantine key.
  let lifecycleGeneration = 0;
  const lifecycle = createTxCoordinator({
    settings,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => lifecycleGeneration,
    getRxState: () => rxState({ validFrameGeneration: 0, validFrameEpoch: 0 }),
  });
  lifecycle.stop();
  lifecycleGeneration = 1;
  const beforeFirstFrame = await lifecycle.send(lightOn, request) as AnyRecord;
  assert.equal(
    blocked(beforeFirstFrame, /quarantined/),
    false,
    "a generation that has not yet observed a frame must not be reported as quarantined",
  );
  assert.equal(
    blocked(beforeFirstFrame, /valid RX frame/),
    true,
    "the honest blocker before the first frame is the missing current-generation RX frame",
  );
});

test("M5 RED: the observation window is sized to the poll it waits for", async () => {
  // This used to cap the window at 4,000 ms on the reasoning that state frames arrive about
  // every 1.6 s. That is the interval between frames on the whole bus, not between polls of
  // one device: measurement put the heating at 2.0–2.3 s, the lights at 2.2 s and batch-off
  // at 1.86 s. A window that fits one heating poll with 700 ms to spare closes early whenever
  // a poll runs late, which is a resend on a half-duplex line — and for batch-off, lights
  // going out in rooms the wallpad cannot reach. It is two polls wide now, which survives one
  // late poll and still bounds three attempts inside about fourteen seconds.
  const config = JSON.parse(readFileSync(new URL("../bestium-eco-foret/config.json", import.meta.url), "utf8")) as AnyRecord;
  const timeout = (config.options as AnyRecord).tx_observation_timeout_ms;
  assert.equal(typeof timeout, "number");
  assert.ok((timeout as number) >= 4_600, "two polls of the slowest device, which is the heating");
  assert.ok((timeout as number) <= 6_900, "and not so wide that three attempts strand the operator");
});
