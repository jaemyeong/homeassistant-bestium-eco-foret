import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

import { encodeSemanticAction } from "../bestium-eco-foret/src/protocol-debug.ts";

const root = new URL("..", import.meta.url);
const APP_FOLDER = "bestium-eco-foret";
const EXPECTED_VERSION = "0.3.0";
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
    tx_observation_timeout_ms: 3_000,
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
    tx_observation_timeout_ms: 3_000,
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

test("RED: ingress peer normalization and sync status/last-result endpoint", async () => {
  const m2 = await importM2();
  const state: CaptureSummary & { state: "running" | "stopped"; lastResult?: CoordinatorResult } = {
    state: "stopped",
    startedAtMs: 0,
    elapsedMs: 0,
    limitMs: 86_400_000,
    byteCount: 0,
    recordCount: 0,
    file: null,
    preview: [],
    lastResult: {
      reason: "idle",
      startedAtMs: 0,
      elapsedMs: 0,
      limitMs: 86_400_000,
      byteCount: 0,
      recordCount: 0,
      stoppedAtMs: 1,
      file: null,
      preview: [],
    } as CoordinatorResult,
  };
  const handler = m2.createIngressHandler({
    getState: () => state,
    async startCapture() {
      state.state = "running";
    },
    async stopCapture() {
      state.state = "stopped";
      const stopped: CoordinatorResult = {
        reason: "closed",
        startedAtMs: 0,
        elapsedMs: 1,
        limitMs: 86_400_000,
        byteCount: 1,
        recordCount: 1,
        stoppedAtMs: 1,
        file: { name: "capture.ndjson", sizeBytes: 80, finalized: true },
        preview: [{ sequence: 0, receivedAtMs: COORDINATOR_RECORD_TS, byteLength: 1, hex: "aa" }],
      };
      state.lastResult = stopped;
      Object.assign(state, stopped);
      return stopped;
    },
  });

  assert.equal(m2.normalizeIngressPeer(undefined), null);
  assert.equal(m2.normalizeIngressPeer("172.30.32.20"), null);
  assert.equal(m2.normalizeIngressPeer("198.51.100.1"), null);
  assert.equal(m2.normalizeIngressPeer("::ffff:172.30.32.2/128"), null);
  assert.equal(m2.normalizeIngressPeer("172.30.32.2"), "172.30.32.2");
  assert.equal(m2.normalizeIngressPeer("::ffff:172.30.32.2"), "172.30.32.2");

  const denied = createRes();
  await handler(createReq({ socket: { remoteAddress: "127.0.0.1" } }), denied);
  assert.equal(denied.statusCode, 403);
  const nearMatch = createRes();
  await handler(createReq({ socket: { remoteAddress: "172.30.32.2/24" } }), nearMatch);
  assert.equal(nearMatch.statusCode, 403);
  const undefinedPeer = createRes();
  await handler(createReq({ socket: {} }), undefinedPeer);
  assert.equal(undefinedPeer.statusCode, 403);

  const status = createRes();
  await handler(createReq({ socket: { remoteAddress: "::ffff:172.30.32.2" }, url: "/api/status" }), status);
  assert.equal(status.statusCode, 200);
  const payload = parseJson<{ state: string; lastResult: CoordinatorResult }>(status.body);
  assert.equal(payload.state, state.state);
  assert.deepStrictEqual(payload.lastResult, state.lastResult);

  const capture = createRes();
  await handler(createReq({ socket: { remoteAddress: "::ffff:172.30.32.2" }, method: "POST", url: "/api/capture" }), capture);
  assert.equal(capture.statusCode, 200);
  assert.equal(state.state, "running");

  const home = createRes();
  await handler(createReq({ socket: { remoteAddress: "172.30.32.2" }, url: "/" }), home);
  assert.equal(home.statusCode, 200);
  assert.match(home.body, /Start/i);
  assert.match(home.body, /Stop/i);
  assert.match(home.body, /Download/i);
  assert.match(home.body, /<svg[\s\S]*<symbol/i);
  assert.match(home.body, /<meta[^>]+viewport/i);
  assert.match(home.body, /@media|prefers-color-scheme/i);
  assert.match(home.body, /:focus-visible/i);
  assert.match(home.body, /aria-label/i);
  assert.match(home.body, /<button[^>]+disabled[^>]*>[\s\S]*Download/i);
  for (const endpoint of ["./api/status", "./api/capture", "./api/stop", "./api/download"]) {
    assert.equal(home.body.includes(endpoint), true, `UI must use relative endpoint ${endpoint}`);
  }
  assert.doesNotMatch(home.body, /["']\/api\//i, "UI endpoints must not be root-absolute");
  assert.doesNotMatch(home.body, /https?:\/\/|<script[^>]+src=|<link[^>]+href=/i);
  assert.doesNotMatch(home.body, /["']records["']\s*:/i);
  assert.ok(/current|state|last/.test(home.body.toLowerCase()));

  const stop = createRes();
  await handler(createReq({ socket: { remoteAddress: "::ffff:172.30.32.2" }, method: "POST", url: "/api/stop" }), stop);
  assert.equal(stop.statusCode, 200);
  assert.equal(state.state, "stopped");
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
    assert.equal(transportCreations, 0);
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
    assert.equal(transportCreations, 0);
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
  assert.equal(connectorInputs.length, 0);
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
  assert.equal(coordinator.getState().phase, "starting");
  await assert.rejects(() => coordinator.start(), /phase|running|stopped/i);
  const stopping = coordinator.stop();
  releaseBegin?.();
  await starting;
  const stopped = await stopping;
  assert.equal(stopped.reason, "stopped");
  assert.equal(coordinator.getState().phase, "stopped");
  assert.equal(beginCalls, 1);
  assert.equal(finalizeCalls, 1);
  assert.equal(transportCreates, 0, "stop during begin must not create a transport");

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

test("RED: dashboard renders exact phases and derives actions from phase", () => {
  const ui = readText(paths.uiSource, "src/ui.ts");
  for (const phase of ["starting", "running", "finalizing", "stopped"]) {
    assert.match(ui, new RegExp(`[\\"']${phase}[\\"']`), `dashboard phase ${phase}`);
  }
  assert.match(ui, /statusText\.textContent[\s\S]{0,180}phase/);
  assert.match(ui, /startButton\.disabled[\s\S]{0,300}(?:runtimePhase|phaseLabels|source\.phase)/);
  assert.match(ui, /stopButton\.disabled[\s\S]{0,300}(?:runtimePhase|phaseLabels|source\.phase)/);
  assert.match(ui, /Idle timeout/);
  assert.match(ui, /id="idle-timeout"/);
  assert.match(ui, /configured\.idle_timeout_ms/);
  assert.doesNotMatch(ui, /const running = source\.state === [\\"']running[\\"']/);
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

test("RED-exception: actual status JSON drives the emitted UI monitor with 1-based device DTOs", async () => {
  const m2 = await importM2();
  const now = 1_700_000_500;
  const freshness = (extra: AnyRecord = {}): AnyRecord => ({
    lastSeenAtMs: now - 25,
    generation: 9,
    stale: false,
    ...extra,
  });
  const state = {
    ...validSettings({ ew11_host: "hidden-status-host", ew11_port: 9_099 }),
    state: "running" as const,
    phase: "running" as const,
    generation: 9,
    serverNowMs: now,
    lastRxByteAtMs: now - 20,
    lastValidFrameAtMs: now - 25,
    lastValidFrameGeneration: 9,
    validFrameEpoch: 3,
    startedAtMs: now - 1_000,
    elapsedMs: 1_000,
    limitMs: 5_000,
    byteCount: 100,
    recordCount: 3,
    file: null,
    preview: [],
    bounds: { ew11_host: "hidden-status-host", ew11_port: 9_099, idle_timeout_ms: 30_000 },
    protocol: {
      generation: 9,
      staleAfterMs: 100,
      frames: [{ rawHex: "f70b01190240110100b6ee", atMs: now - 25, generation: 9 }],
      unknown: [{ rawHex: "7f620000ee", atMs: now - 20, generation: 9 }],
      queries: { outlet: 2, ventilation: 3 },
      devices: {
        lights: {
          1: freshness({ state: "off" }),
          2: freshness({ state: "on" }),
          3: freshness({ state: "off" }),
        },
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
  } as IngressState;
  const handler = m2.createIngressHandler({
    getState: () => state,
    async startCapture() {},
    async stopCapture() { throw new Error("unused"); },
    getAuthenticatedIngressUserId: () => "operator-7",
    getConfiguredTransmitUserId: () => "operator-7",
    getTxStatus: () => ({
      enabled: false,
      speculativeEnabled: false,
      unsafeEnabled: false,
      connected: true,
      inFlight: false,
      quarantined: false,
      pendingAppend: false,
      quiet: true,
      currentGenerationRx: true,
      fresh: true,
      sevenFProof: false,
    }),
    csrfToken: "csrf-status",
  });
  const response = createRes();
  await handler(createReq({
    url: "/api/status",
    headers: { "x-remote-user-id": "operator-7" },
    socket: { remoteAddress: "172.30.32.2" },
  }), response);
  assert.equal(response.statusCode, 200);
  const payload = parseJson<AnyRecord>(response.body);
  assert.deepStrictEqual(payload.debug.devices.lights[1], freshness({ state: "off" }));
  assert.equal(payload.tx.observationTimeoutMs, 10_000, "status must expose the bounded observation timeout");

  const uiModule = await import(pathToFileURL(path(paths.uiSource)).href) as AnyRecord;
  const html = String(uiModule.renderAppHtml());
  const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  assert.equal(typeof script, "string", "renderAppHtml must emit an executable script");
  if (typeof script !== "string") return;
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  const nodes = new Map<string, AnyRecord>();
  const makeNode = (id: string): AnyRecord => {
    const attributes: Record<string, string> = {};
    const children: AnyRecord[] = [];
    const listeners: Record<string, (...args: unknown[]) => unknown> = {};
    const node: AnyRecord = {
      id,
      textContent: "",
      value: "",
      disabled: false,
      firstChild: null,
      classList: { toggle() {} },
      setAttribute(name: string, value: string) { attributes[name] = value; },
      getAttribute(name: string) { return attributes[name]; },
      addEventListener(name: string, listener: (...args: unknown[]) => unknown) { listeners[name] = listener; },
      focus() { node.focused = true; },
      reportValidity() { return attributes["aria-invalid"] !== "true"; },
      appendChild(child: AnyRecord) { children.push(child); node.firstChild = children[0] ?? null; return child; },
      removeChild(child: AnyRecord) { const index = children.indexOf(child); if (index >= 0) children.splice(index, 1); node.firstChild = children[0] ?? null; return child; },
      children,
      listeners,
      attributes,
    };
    nodes.set(id, node);
    return node;
  };
  for (const id of ids) makeNode(id);
  let created = 0;
  const document = {
    getElementById(id: string) { return nodes.get(id) ?? null; },
    createElement(type: string) { created += 1; return makeNode(`${type}-${created}`); },
  };
  const pollTimers: Array<(...args: unknown[]) => unknown> = [];
  const window = {
    __bestiumTx: {},
    setTimeout(callback: (...args: unknown[]) => unknown) { pollTimers.push(callback); return pollTimers.length; },
    clearTimeout() {},
    location: { assign() {} },
  };
  const fetchCalls: AnyRecord[] = [];
  const fetch = async (url: string, init?: AnyRecord): Promise<AnyRecord> => {
    fetchCalls.push({ url, init });
    return { ok: true, async json() { return payload; } };
  };
  runInNewContext(script, {
    window,
    document,
    fetch,
    Date: { now: () => now },
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    console,
  });
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
  assert.equal(fetchCalls[0]?.url, "./api/status");
  assert.match(nodes.get("light-state-1")?.textContent ?? "", /off/);
  assert.match(nodes.get("light-state-2")?.textContent ?? "", /on/);
  assert.match(nodes.get("light-state-3")?.textContent ?? "", /off/);
  for (const zone of [1, 2, 3, 4]) {
    assert.ok(nodes.has(`heating-current-${zone}`), `zone ${zone} current DTO row is required`);
    assert.ok(nodes.has(`heating-target-${zone}`), `zone ${zone} target DTO row is required`);
    assert.match(nodes.get(`heat-state-${zone}`)?.textContent ?? "", /on|off/);
  }
  // M4.6: monitor values must read label-first with a unit; the raw DTO key must not trail the value.
  // M4.8: the zone card reads as a measurement, so the current temperature is the numeral
  // alone and its unit and label are markup beside it. Freshness lives on the state line.
  assert.equal(nodes.get("heating-current-4")?.textContent, "27", "the current temperature is the numeral alone");
  assert.equal(nodes.get("heating-target-4")?.textContent, "28", "the target temperature is the numeral alone");
  assert.doesNotMatch(nodes.get("heating-current-4")?.textContent ?? "", /currentC|age|generation/, "no DTO key or freshness may trail the numeral");
  assert.doesNotMatch(nodes.get("heating-target-4")?.textContent ?? "", /targetC|age|generation/, "no DTO key or freshness may trail the numeral");
  assert.match(nodes.get("heat-state-4")?.textContent ?? "", /age|stale/, "the zone state line still carries freshness");
  assert.match(html, /id="heating-current-4"[\s\S]{0,200}°C[\s\S]{0,200}현재/, "the unit and the 현재 label sit beside the numeral");
  assert.match(nodes.get("elevator-floor")?.textContent ?? "", /4/);
  assert.match(nodes.get("elevator-direction")?.textContent ?? "", /idle/);
  // The standing call was hidden inside `direction` whenever the car was moving.
  assert.match(nodes.get("elevator-call")?.textContent ?? "", /arrival/);
  // The 0x1E 02 frame marks a door-open operation on the wallpad, never a call.
  assert.match(nodes.get("household-entrance")?.textContent ?? "", /문열기 조작 관측/);
  assert.match(nodes.get("common-entrance")?.textContent ?? "", /관측되지 않음/);
  assert.match(nodes.get("outlet-query-state")?.textContent ?? "", /2/);
  assert.match(nodes.get("ventilation-query-state")?.textContent ?? "", /3/);
  assert.match(nodes.get("vehicle-unidentified")?.textContent ?? "", /unidentified/);
  assert.match(nodes.get("cctv-observation")?.textContent ?? "", /not_observed_this_generation|not observed/i);
  assert.match(nodes.get("unknown-clusters")?.textContent ?? "", /1/);
  assert.equal(pollTimers.length, 1, "the UI must schedule one recursive poll");

  assert.equal(payload.serverNowMs, now, "status must expose safe server time");
  assert.equal(payload.generation, 9, "status must expose current generation");
  assert.equal(payload.lastValidFrameAtMs, now - 25, "status must expose last valid frame time");
  assert.equal(payload.lastValidFrameGeneration, 9, "status must expose valid frame generation");
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

test("RED-exception: UI keeps review/capture locks separate and exposes safe candidate accessibility", () => {
  const ui = readText(paths.uiSource, "src/ui.ts");
  const script = ui.match(/<script>([\s\S]*?)<\/script>/i)?.[1] ?? ui;
  assert.match(script, /reviewBusy|captureBusy|reviewEpoch|requestEpoch|AbortController/);
  assert.match(script, /indeterminate/);
  assert.match(script, /cancel[^\n]{0,160}challenge|challenge[^\n]{0,160}cancel/i);
  assert.match(script, /reviewPreview\.ready|preview\.ready|readiness|reasons/);
  assert.match(ui, /Zone [1-4] temperature[^<]{0,120}Set|Set[^<]{0,120}Zone [1-4] temperature/i);
  assert.match(ui, /overflow-wrap|word-break|min-width\s*:\s*0/);
  assert.match(script, /aria-invalid[\s\S]{0,500}(?:false|valid)/i);
  assert.match(ui, /aria-describedby=["'][^"']*(?:heat|temp)[^"']*["']/i);
  assert.match(ui, /--(?:danger|input-border|focus)[^:]*:/);
  assert.match(ui, /한국어|lang=["']en["']/);
  assert.match(script, /captureBusy|capture\s*=|polling/);
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

test("RED-final: emitted UI cancels late preview/challenge and blocks capture around challenge", async () => {
  const problems: string[] = [];
  const require = (condition: unknown, message: string): void => { if (!condition) problems.push(message); };
  let resolvePreview!: (value: AnyRecord) => void;
  const previewFixture = await createUiVmFixture(uiStatusPayload(), (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "./api/status") return uiJsonResponse(uiStatusPayload());
    if (body.mode === "preview") return new Promise((resolve) => { resolvePreview = resolve; });
    return uiJsonResponse({ cancelled: true });
  });
  await previewFixture.flush();
  previewFixture.click("elevator-down");
  await previewFixture.flush();
  previewFixture.click("review-cancel");
  resolvePreview(uiJsonResponse({ preview: true, evidence: "observed", ready: true, frameHex: "f70d011904401000020102b5ee" }));
  await previewFixture.flush();
  require(/idle/.test(previewFixture.nodes.get("review-phase")?.textContent ?? ""), "late preview must leave the review phase idle");
  require(previewFixture.nodes.get("review-commit")?.disabled === true, "late preview must not restore review controls");

  let resolveChallenge!: (value: AnyRecord) => void;
  const cancelCalls: AnyRecord[] = [];
  const challengeStatus = uiStatusPayload({ phase: "stopped", state: "stopped" });
  const challengeFixture = await createUiVmFixture(challengeStatus, (url, init, calls) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "./api/status") return uiJsonResponse(challengeStatus);
    if (body.mode === "preview") return uiJsonResponse({ preview: true, evidence: "inferred_candidate", ready: true, readiness: { ready: true }, frameHex: "f70c011802401102010000b2ee", framesHex: ["f70c011802401102010000b2ee"] });
    if (body.mode === "challenge") return new Promise((resolve) => { resolveChallenge = resolve; });
    if (body.mode === "cancel") { cancelCalls.push({ body, calls }); return uiJsonResponse({ cancelled: true }); }
    if (url === "./api/capture") return uiJsonResponse({}, true);
    return uiJsonResponse({});
  });
  await challengeFixture.flush();
  (challengeFixture.nodes.get("raw-burst") as AnyRecord).value = "f70b01180240110100b6ee";
  challengeFixture.click("raw-preview");
  await challengeFixture.flush();
  challengeFixture.nodes.get("confirmation-phrase")!.value = "I UNDERSTAND THIS IS AN INFERRED CANDIDATE";
  challengeFixture.click("issue-challenge");
  await challengeFixture.flush();
  challengeFixture.click("capture-start");
  require(challengeFixture.fetchCalls.some((call) => call.url === "./api/capture") === false, "capture must be blocked while issue request is in flight");
  challengeFixture.click("review-cancel");
  resolveChallenge(uiJsonResponse({ id: VALID_CHALLENGE_ID, expiresAtMs: 1_700_021_000, readinessRevision: "r1", frameHex: "f70c011802401102010000b2ee" }));
  await challengeFixture.flush();
  require(/idle/.test(challengeFixture.nodes.get("review-phase")?.textContent ?? ""), "late minted challenge must not restore challenged state");
  require(cancelCalls.length === 1, "late minted challenge must be canceled through the authenticated route");
  require(cancelCalls[0]?.body.challengeId === VALID_CHALLENGE_ID, "late cancel must target the minted challenge");

  const makeCandidateUi = async (opts: { deferChallenge: boolean; cancelFails: boolean }) => {
    let resolveLate!: (value: AnyRecord) => void;
    const calls: AnyRecord[] = [];
    const candidateStatus = uiStatusPayload({ phase: "stopped", state: "stopped" });
    const fixture = await createUiVmFixture(candidateStatus, (url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (url === "./api/status") return uiJsonResponse(candidateStatus);
      if (body.mode === "preview") return uiJsonResponse({ preview: true, evidence: "inferred_candidate", ready: true, readiness: { ready: true }, readinessRevision: "r1", frameHex: "f70c011802401102010000b2ee", framesHex: ["f70c011802401102010000b2ee"] });
      if (body.mode === "challenge") {
        if (opts.deferChallenge) return new Promise((resolve) => { resolveLate = resolve; });
        return uiJsonResponse({ id: VALID_CHALLENGE_ID, expiresAtMs: 1_700_021_000, readinessRevision: "r1", frameHex: "f70c011802401102010000b2ee" });
      }
      if (body.mode === "cancel") {
        calls.push({ kind: "cancel", body });
        return opts.cancelFails ? uiJsonResponse({}, false) : uiJsonResponse({ cancelled: true });
      }
      if (url === "./api/capture") { calls.push({ kind: "capture", body }); return uiJsonResponse({}, true); }
      return uiJsonResponse({});
    });
    return { fixture, calls, resolveLate: (value: AnyRecord): void => resolveLate(value) };
  };

  const lateFailure = await makeCandidateUi({ deferChallenge: true, cancelFails: true });
  await lateFailure.fixture.flush();
  (lateFailure.fixture.nodes.get("raw-burst") as AnyRecord).value = "f70b01180240110100b6ee";
  lateFailure.fixture.click("raw-preview");
  await lateFailure.fixture.flush();
  lateFailure.fixture.nodes.get("confirmation-phrase")!.value = "I UNDERSTAND THIS IS AN INFERRED CANDIDATE";
  lateFailure.fixture.click("issue-challenge");
  await lateFailure.fixture.flush();
  lateFailure.fixture.click("review-cancel");
  lateFailure.resolveLate(uiJsonResponse({ id: VALID_CHALLENGE_ID, expiresAtMs: 1_700_021_000, frameHex: "f70c011802401102010000b2ee" }));
  await lateFailure.fixture.flush();
  require(lateFailure.calls.length === 1, "late challenge cancellation failure must still reach the authenticated cancel route");
  require(/indeterminate|reconcile|재확인/i.test(lateFailure.fixture.nodes.get("outcome")?.textContent ?? "") || /indeterminate|reconcile|재확인/i.test(lateFailure.fixture.nodes.get("alert")?.textContent ?? ""), "cancel failure must be indeterminate");
  require(lateFailure.fixture.nodes.get("review-commit")?.disabled === true, "cancel failure must keep TX controls locked");

  const stable = await makeCandidateUi({ deferChallenge: false, cancelFails: false });
  await stable.fixture.flush();
  (stable.fixture.nodes.get("raw-burst") as AnyRecord).value = "f70b01180240110100b6ee";
  stable.fixture.click("raw-preview");
  await stable.fixture.flush();
  stable.fixture.nodes.get("confirmation-phrase")!.value = "I UNDERSTAND THIS IS AN INFERRED CANDIDATE";
  stable.fixture.click("issue-challenge");
  await stable.fixture.flush();
  stable.fixture.click("capture-start");
  await stable.fixture.flush();
  const stableOrder = stable.calls.map((entry) => entry.kind);
  require(stableOrder[0] === "cancel" && stableOrder[1] === "capture", "stable challenge capture must cancel successfully before capture POST");

  const stableFailure = await makeCandidateUi({ deferChallenge: false, cancelFails: true });
  await stableFailure.fixture.flush();
  (stableFailure.fixture.nodes.get("raw-burst") as AnyRecord).value = "f70b01180240110100b6ee";
  stableFailure.fixture.click("raw-preview");
  await stableFailure.fixture.flush();
  stableFailure.fixture.nodes.get("confirmation-phrase")!.value = "I UNDERSTAND THIS IS AN INFERRED CANDIDATE";
  stableFailure.fixture.click("issue-challenge");
  await stableFailure.fixture.flush();
  stableFailure.fixture.click("capture-start");
  await stableFailure.fixture.flush();
  require(stableFailure.calls.every((entry) => entry.kind !== "capture"), "failed challenge cancel must prevent capture POST");
  require(/indeterminate|reconcile|재확인/i.test(stableFailure.fixture.nodes.get("outcome")?.textContent ?? "") || /indeterminate|reconcile|재확인/i.test(stableFailure.fixture.nodes.get("alert")?.textContent ?? ""), "failed capture cancellation must be announced as indeterminate");

  let rejectIssue!: (error?: unknown) => void;
  const abortedCalls: string[] = [];
  const abortedIssue = await createUiVmFixture(uiStatusPayload(), (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "./api/status") return uiJsonResponse(uiStatusPayload());
    if (body.mode === "preview") return uiJsonResponse({ preview: true, evidence: "inferred_candidate", ready: true, readiness: { ready: true }, readinessRevision: "r1", frameHex: "f70d011802401102010000b2ee" });
    if (body.mode === "challenge") return new Promise((_resolve, reject) => { rejectIssue = reject; });
    if (body.mode === "cancel") return uiJsonResponse({ cancelled: true });
    if (url === "./api/capture" || url === "./api/stop") { abortedCalls.push(url); return uiJsonResponse({}); }
    return uiJsonResponse({});
  });
  await abortedIssue.flush();
  (abortedIssue.nodes.get("raw-burst") as AnyRecord).value = "f70b01180240110100b6ee";
  abortedIssue.click("raw-preview");
  await abortedIssue.flush();
  abortedIssue.nodes.get("confirmation-phrase")!.value = "I UNDERSTAND THIS IS AN INFERRED CANDIDATE";
  abortedIssue.click("issue-challenge");
  await abortedIssue.flush();
  abortedIssue.click("review-cancel");
  rejectIssue(new Error("challenge request aborted"));
  await abortedIssue.flush();
  assert.match(`${abortedIssue.nodes.get("outcome")?.textContent ?? ""} ${abortedIssue.nodes.get("alert")?.textContent ?? ""}`, /indeterminate|reconcile|재확인/i, "aborted challenge without an ID must lock indeterminate");
  abortedIssue.click("capture-start");
  abortedIssue.click("capture-stop");
  await abortedIssue.flush();
  assert.deepStrictEqual(abortedCalls, [], "aborted challenge must prevent later capture and stop POSTs");
  assert.equal(problems.length, 0, problems.join("\n"));
});

test("RED-final: emitted UI fails closed on readiness drift/poll failure, preserves debug detail, and never captures around a stable challenge", async () => {
  let status = uiStatusPayload();
  let rejectNextStatus = false;
  const fixture = await createUiVmFixture(status, (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "./api/status") {
      if (rejectNextStatus) { rejectNextStatus = false; return Promise.reject(new Error("status unavailable")); }
      return uiJsonResponse(status);
    }
    if (body.mode === "preview") return uiJsonResponse({ preview: true, evidence: "observed", ready: true, readiness: { ready: true }, readinessRevision: "r1", frameHex: "f70d011904401000020102b5ee" });
    if (url === "./api/capture") return uiJsonResponse({}, true);
    return uiJsonResponse({});
  });
  await fixture.flush();
  const problems: string[] = [];
  const require = (condition: unknown, message: string): void => { if (!condition) problems.push(message); };
  const query = fixture.nodes.get("outlet-query-state")?.textContent ?? "";
  require(/2/.test(query) && /age|stale/.test(query) && /generation/.test(query), "outlet query row must retain count, age/stale, and generation");
  const unknownDetail = fixture.nodes.get("unknown-lab")?.textContent ?? "";
  require(/7f620000ee|0x7e/.test(unknownDetail) && /0x2a/.test(unknownDetail) && /age|stale/.test(unknownDetail) && /generation/.test(unknownDetail), "ambiguous/unknown detail must render cluster/rawHex age and generation via textContent");
  require(unknownDetail.length <= 1_200, "ambiguous/unknown detail must remain bounded for long rawHex");

  // M4.8: an observed control is one tap, so failing closed means the tap issues no
  // request at all rather than leaving a Commit button greyed out.
  const actionCalls = (): number => fixture.fetchCalls.filter((call) => String(call.url).includes("/api/action")).length;
  const greenBefore = actionCalls();
  fixture.click("light-1-on");
  await fixture.flush();
  require(actionCalls() > greenBefore, "a green status must let one tap reach the server");
  status = { ...status, tx: { ...status.tx, readinessRevision: "r2" } };
  fixture.fireTimer();
  await fixture.flush();
  require(!/revision|stale|changed|재검토/i.test(fixture.nodes.get("alert")?.textContent ?? ""), "observed revision drift must clear the historical warning");
  status = { ...status, tx: { ...status.tx, readinessRevision: undefined } };
  fixture.fireTimer();
  await fixture.flush();
  const missingBefore = actionCalls();
  fixture.click("light-1-on");
  await fixture.flush();
  require(actionCalls() === missingBefore, "missing revision must fail closed");
  status = { ...status, tx: { ...status.tx, readinessRevision: "r3" } };
  rejectNextStatus = true;
  const beforeFailure = fixture.fetchCalls.length;
  fixture.fireTimer();
  await fixture.flush();
  require(fixture.fetchCalls.length > beforeFailure, "poll failure scenario must issue a status request");
  const failureBefore = actionCalls();
  fixture.click("light-1-on");
  await fixture.flush();
  require(actionCalls() === failureBefore, "poll failure must fail closed");
  require(/poll|status|stale|재확인/i.test(fixture.nodes.get("alert")?.textContent ?? ""), "poll failure must be announced");

  assert.equal(problems.length, 0, problems.join("\n"));
});

test("RED-final: partial indeterminate commit is explicit and locks page retry", async () => {
  const fixture = await createUiVmFixture(uiStatusPayload(), (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "./api/status") return uiJsonResponse(uiStatusPayload());
    if (body.mode === "preview") return uiJsonResponse({ preview: true, evidence: "observed", ready: true, readiness: { ready: true }, readinessRevision: "r1", frameHex: "f70d011904401000020102b5ee" });
    if (body.mode === "commit") return uiJsonResponse({ outcome: "partial_indeterminate", framesWritten: 1, quarantined: true, reason: "transport generation changed", deviceConfirmed: false });
    return uiJsonResponse({});
  });
  await fixture.flush();
  fixture.click("elevator-down");
  await fixture.flush();
  fixture.click("review-commit");
  await fixture.flush();
  const commitCalls = () => fixture.fetchCalls.filter((call) => JSON.parse(String(call.init?.body ?? "{}")).mode === "commit");
  const outcome = fixture.nodes.get("outcome")?.textContent ?? "";
  assert.match(outcome, /partial_indeterminate/);
  assert.match(outcome, /framesWritten|1/);
  assert.match(outcome, /quarantined|격리/);
  assert.match(outcome, /reconciliation required|재확인/);
  assert.match(outcome, /do not retry|retry 금지/);
  const count = commitCalls().length;
  fixture.click("review-commit");
  await fixture.flush();
  assert.equal(commitCalls().length, count, "partial indeterminate must lock a second transmit activation");

  const missingQuarantine = await createUiVmFixture(uiStatusPayload(), (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "./api/status") return uiJsonResponse(uiStatusPayload());
    if (body.mode === "preview") return uiJsonResponse({ preview: true, evidence: "observed", ready: true, readinessRevision: "r1", frameHex: "f70d011904401000020102b5ee" });
    if (body.mode === "commit") return uiJsonResponse({ outcome: "partial_indeterminate", framesWritten: 1, reason: "generation changed", deviceConfirmed: false });
    return uiJsonResponse({});
  });
  await missingQuarantine.flush();
  missingQuarantine.click("elevator-down");
  await missingQuarantine.flush();
  missingQuarantine.click("review-commit");
  await missingQuarantine.flush();
  assert.match(missingQuarantine.nodes.get("outcome")?.textContent ?? "", /quarantined[^\n]{0,80}(?:unknown|unavailable|미확인)/i, "missing quarantine must stay unknown, never false");
  assert.equal(missingQuarantine.nodes.get("review-commit")?.disabled, true);
});

test("RED-M4.2: deferred challenge cancellation gates capture and deferred commit disables cancel", async () => {
  let resolveIssue!: (value: AnyRecord) => void;
  let resolveCancel!: (value: AnyRecord) => void;
  let resolveCommit!: (value: AnyRecord) => void;
  const calls: string[] = [];
  let fixturePhase: "running" | "stopped" = "running";
  const fixtureStatus = () => uiStatusPayload({ phase: fixturePhase, state: fixturePhase });
  const fixture = await createUiVmFixture(fixtureStatus(), (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "./api/status") return uiJsonResponse(fixtureStatus());
    if (body.mode === "preview") return uiJsonResponse({ preview: true, evidence: body.kind === "elevator" ? "observed" : "inferred_candidate", ready: true, readinessRevision: "r1", frameHex: "f70c011802401102010000b2ee" });
    if (body.mode === "challenge") return new Promise((resolve) => { resolveIssue = resolve; });
    if (body.mode === "cancel") { calls.push("cancel"); return new Promise((resolve) => { resolveCancel = resolve; }); }
    if (body.mode === "commit") return new Promise((resolve) => { resolveCommit = resolve; });
    if (url === "./api/capture" || url === "./api/stop") { calls.push(url); if (url === "./api/stop") fixturePhase = "stopped"; return uiJsonResponse({}); }
    return uiJsonResponse({});
  });
  await fixture.flush();
  (fixture.nodes.get("raw-burst") as AnyRecord).value = "f70b01180240110100b6ee";
  fixture.click("raw-preview");
  await fixture.flush();
  fixture.nodes.get("confirmation-phrase")!.value = "I UNDERSTAND THIS IS AN INFERRED CANDIDATE";
  fixture.click("issue-challenge");
  await fixture.flush();
  fixture.nodes.get("capture-start")!.disabled = false;
  fixture.nodes.get("capture-stop")!.disabled = false;
  fixture.click("review-cancel");
  fixture.click("capture-stop");
  fixture.click("capture-start");
  assert.deepStrictEqual(calls, [], "capture controls must stay gated while a canceled issue can still mint");
  resolveIssue(uiJsonResponse({ id: VALID_CHALLENGE_ID, expiresAtMs: 1_700_021_000, readinessRevision: "wrong" }));
  await fixture.flush();
  assert.deepStrictEqual(calls, ["cancel"], "malformed/revision-mismatched issued IDs must be authenticated-canceled");
  resolveCancel(uiJsonResponse({ cancelled: true }));
  await fixture.flush();
  fixture.click("elevator-down");
  await fixture.flush();
  fixture.click("review-commit");
  await fixture.flush();
  assert.equal(fixture.nodes.get("review-cancel")?.disabled, true, "cancel must be disabled during commit");
  resolveCommit(uiJsonResponse({ outcome: "socket_written_unconfirmed", deviceConfirmed: false }));
  await fixture.flush();
});

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

test("RED-M4.2: protocol and UI never present aged or wrong-generation debug evidence as fresh", async () => {
  const protocol = await import("../bestium-eco-foret/src/protocol-debug.ts");
  let now = 1_700_030_000;
  const monitor = protocol.createProtocolDebugMonitor({ nowMs: () => now, staleAfterMs: 100, journalLimit: 8 });
  const toBytes = (value: string): Uint8Array => Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
  monitor.push(toBytes("7f620000ee"));
  monitor.push(toBytes("7f2a0000ee"));
  now += 200;
  const aged = monitor.snapshot();
  assert.ok([...aged.unknown, ...aged.ambiguous].length >= 2);
  assert.equal([...aged.unknown, ...aged.ambiguous].every((entry: AnyRecord) => entry.stale === true), true);
  monitor.resetGeneration();
  assert.equal([...monitor.snapshot().unknown, ...monitor.snapshot().ambiguous].every((entry: AnyRecord) => entry.stale === true), true);
  monitor.stop();
  assert.equal([...monitor.snapshot().unknown, ...monitor.snapshot().ambiguous].every((entry: AnyRecord) => entry.stale === true), true);

  const stalePayload = uiStatusPayload();
  stalePayload.debug.unknown = [{ cluster: "0x7e", rawHex: "7f620000ee", atMs: 1_700_029_999, generation: 8 }];
  stalePayload.debug.ambiguous = [{ cluster: "0x2a", rawHex: "7f2a0000ee", atMs: 1_700_029_999, generation: 8 }];
  const staleUi = await createUiVmFixture(stalePayload);
  await staleUi.flush();
  const detail = staleUi.nodes.get("unknown-lab")?.textContent ?? "";
  assert.match(detail, /stale|unknown/i);
  assert.doesNotMatch(detail, /fresh/i, "wrong-generation debug entries must not render fresh");

  let statusCalls = 0;
  let releaseLateStatus!: (value: AnyRecord) => void;
  const pollUi = await createUiVmFixture(uiStatusPayload(), (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "./api/status") {
      statusCalls += 1;
      return statusCalls === 1 ? uiJsonResponse(uiStatusPayload()) : new Promise((resolve) => { releaseLateStatus = resolve; });
    }
    if (body.mode === "preview") return uiJsonResponse({ preview: true, evidence: "observed", ready: true, readinessRevision: "r1", frameHex: "f70d011904401000020102b5ee" });
    return uiJsonResponse({});
  });
  await pollUi.flush();
  pollUi.click("light-1-on");
  await pollUi.flush();
  pollUi.fireTimer();
  await pollUi.flush();
  assert.ok(pollUi.timers.size > 0, "a never-settling status poll needs a bounded deadline");
  pollUi.fireTimer();
  await pollUi.flush();
  assert.equal(pollUi.nodes.get("review-commit")?.disabled, true);
  assert.match(pollUi.nodes.get("alert")?.textContent ?? "", /poll|stale|status|재확인/i);
  releaseLateStatus(uiJsonResponse(uiStatusPayload()));
  await pollUi.flush();
  assert.equal(pollUi.nodes.get("review-commit")?.disabled, true, "expired poll success must not restore readiness");
});

test("RED-sixth: UI accepts only bounded current-revision challenge results", async () => {
  const validChallenge = {
    id: VALID_CHALLENGE_ID,
    expiresAtMs: 1_700_020_001,
    readinessRevision: "r1",
    frameHex: "f70c011802401102010000b2ee",
  };
  const invalidChallenges: Array<[string, AnyRecord]> = [
    ["missing id", { ...validChallenge, id: undefined }],
    ["empty id", { ...validChallenge, id: "" }],
    ["oversize id", { ...validChallenge, id: "x".repeat(257) }],
    ["wrong id type", { ...validChallenge, id: 7 }],
    ["missing expiry", { ...validChallenge, expiresAtMs: undefined }],
    ["nonfinite NaN expiry", { ...validChallenge, expiresAtMs: Number.NaN }],
    ["nonfinite Infinity expiry", { ...validChallenge, expiresAtMs: Number.POSITIVE_INFINITY }],
    ["wrong expiry type", { ...validChallenge, expiresAtMs: "1700020001" }],
    ["past expiry", { ...validChallenge, expiresAtMs: 1_700_019_999 }],
    ["over-horizon expiry", { ...validChallenge, expiresAtMs: 1_700_050_001 }],
    ["wrong revision", { ...validChallenge, readinessRevision: "r2" }],
  ];
  const observed: string[] = [];
  for (const [label, issued] of invalidChallenges) {
    const calls: string[] = [];
    const fixture = await createUiVmFixture(uiStatusPayload(), (url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (url === "./api/status") return uiJsonResponse(uiStatusPayload());
      if (body.mode === "preview") return uiJsonResponse({
        preview: true,
        evidence: "inferred_candidate",
        ready: true,
        readiness: { ready: true },
        readinessRevision: "r1",
        frameHex: "f70c011802401102010000b2ee",
      });
      if (body.mode === "challenge") return uiJsonResponse(issued);
      if (body.mode === "cancel") return uiJsonResponse({ cancelled: true });
      if (url === "./api/capture" || url === "./api/stop") calls.push(url);
      return uiJsonResponse({});
    });
    await fixture.flush();
    (fixture.nodes.get("raw-burst") as AnyRecord).value = "f70b01180240110100b6ee";
    fixture.click("raw-preview");
    await fixture.flush();
    fixture.nodes.get("confirmation-phrase")!.value = "I UNDERSTAND THIS IS AN INFERRED CANDIDATE";
    fixture.click("issue-challenge");
    await fixture.flush();
    const message = `${fixture.nodes.get("outcome")?.textContent ?? ""} ${fixture.nodes.get("alert")?.textContent ?? ""}`;
    if (!/indeterminate|reconcile|재확인/i.test(message)) observed.push(`${label}: missing indeterminate lock (${message})`);
    if (fixture.nodes.get("review-commit")?.disabled !== true) observed.push(`${label}: commit was not disabled`);
    fixture.click("capture-start");
    fixture.click("capture-stop");
    await fixture.flush();
    if (calls.length !== 0) observed.push(`${label}: mutation calls ${JSON.stringify(calls)}`);
  }
  assert.deepStrictEqual(observed, []);
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

test("RED-sixth: protocol and UI freshness require typed current-generation valid evidence", async () => {
  const protocol = await import("../bestium-eco-foret/src/protocol-debug.ts");
  const problems: string[] = [];
  const require = (condition: unknown, message: string): void => { if (!condition) problems.push(message); };
  let now = 1_700_040_000;
  const monitor = protocol.createProtocolDebugMonitor({ nowMs: () => now, staleAfterMs: 100, journalLimit: 8 });
  const valid = Uint8Array.from("f70d011904401000020102b5ee".match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
  monitor.push(valid);
  let snapshot = monitor.snapshot();
  const cctv = snapshot.devices.cctv as AnyRecord | undefined;
  require(snapshot.staleAfterMs === 100, "protocol snapshot must expose staleAfterMs");
  require(/not.?observed/i.test(String(cctv?.evidence ?? "")), "CCTV must be explicit negative evidence");
  require(cctv?.lastSeenAtMs === now && cctv?.generation === snapshot.generation && cctv?.stale === false, "CCTV negative evidence must be backed by the latest valid frame");
  now += 100;
  snapshot = monitor.snapshot();
  require(snapshot.devices.cctv?.stale === false, "exact stale threshold must remain fresh");
  now += 1;
  require(monitor.snapshot().devices.cctv?.stale === true, "evidence over threshold must be stale");
  monitor.push(Uint8Array.from([0x55]));
  require(monitor.snapshot().devices.cctv?.stale === true, "noise must not refresh negative evidence");
  monitor.resetGeneration();
  require(monitor.snapshot().devices.cctv?.stale === true, "generation reset must stale negative evidence");
  monitor.push(valid);
  require(monitor.snapshot().devices.cctv?.stale === false, "a new valid frame must refresh current-generation evidence");
  monitor.stop();
  require(monitor.snapshot().devices.cctv?.stale === true, "stopped capture must not report fresh negative evidence");

  const baseNow = 1_700_020_000;
  const validPayload = uiStatusPayload();
  validPayload.debug.staleAfterMs = 100;
  const validUi = await createUiVmFixture(validPayload);
  await validUi.flush();
  const validRow = validUi.nodes.get("light-state-1")?.textContent ?? "";
  require(/fresh/.test(validRow) && !/stale/.test(validRow), "typed current-generation evidence should render fresh");
  require(/not observed.*(?:current|inspected).*(?:frame|generation)/i.test(validUi.nodes.get("cctv-observation")?.textContent ?? ""), "CCTV wording must identify the inspected current frame/generation");

  const uiCases: Array<[string, (payload: AnyRecord) => void]> = [
    ["serverNow string", (payload) => { payload.serverNowMs = String(baseNow); }],
    ["serverNow NaN", (payload) => { payload.serverNowMs = Number.NaN; }],
    ["serverNow Infinity", (payload) => { payload.serverNowMs = Number.POSITIVE_INFINITY; }],
    ["generation string", (payload) => { payload.generation = "9"; }],
    ["timestamp string", (payload) => { payload.debug.devices.lights[1].lastSeenAtMs = String(baseNow - 25); }],
    ["timestamp NaN", (payload) => { payload.debug.devices.lights[1].lastSeenAtMs = Number.NaN; }],
    ["timestamp Infinity", (payload) => { payload.debug.devices.lights[1].lastSeenAtMs = Number.POSITIVE_INFINITY; }],
    ["timestamp null", (payload) => { payload.debug.devices.lights[1].lastSeenAtMs = null; }],
    ["wrong generation", (payload) => { payload.debug.devices.lights[1].generation = 8; }],
    ["over threshold", (payload) => { payload.debug.devices.lights[1].lastSeenAtMs = baseNow - 101; }],
    ["staleAfter string", (payload) => { payload.debug.staleAfterMs = "100"; }],
    ["stopped", (payload) => { payload.phase = "stopped"; }],
    ["no valid frame", (payload) => { payload.lastValidFrameAtMs = 0; payload.debug.frames = []; }],
  ];
  for (const [label, mutate] of uiCases) {
    const payload = uiStatusPayload();
    payload.debug.staleAfterMs = 100;
    mutate(payload);
    const fixture = await createUiVmFixture(payload);
    await fixture.flush();
    const row = fixture.nodes.get("light-state-1")?.textContent ?? "";
    require(/stale|unknown/.test(row) && !/fresh/.test(row), `${label} must fail closed as stale/unknown: ${row}`);
    require(!/NaN|Infinity/.test(row), `${label} must not render malformed age: ${row}`);
  }
  assert.deepStrictEqual(problems, []);
});

test("RED-seventh: immediate duplicate capture/stop and indeterminate UI mutations are single-flight and locked", async () => {
  const problems: string[] = [];
  const check = (condition: unknown, message: string): void => { if (!condition) problems.push(message); };
  const payloadFor = (phase: "running" | "stopped"): AnyRecord => uiStatusPayload({ phase, state: phase });
  const makeMutationFixture = async (phase: "running" | "stopped"): Promise<UiVmFixture> => {
    const payload = payloadFor(phase);
    return createUiVmFixture(payload, (url) => url === "./api/status" ? uiJsonResponse(payload) : uiJsonResponse({}));
  };

  const capture = await makeMutationFixture("stopped");
  await capture.flush();
  capture.timers.clear();
  capture.click("capture-start");
  capture.click("capture-start");
  check(capture.fetchCalls.filter((call) => call.url === "./api/capture").length === 1, "double Capture must issue one POST");
  check(capture.nodes.get("capture-start")?.disabled === true && capture.nodes.get("capture-stop")?.disabled === true, "double Capture must synchronously disable both native controls");

  const stop = await makeMutationFixture("running");
  await stop.flush();
  stop.timers.clear();
  stop.click("capture-stop");
  stop.click("capture-stop");
  check(stop.fetchCalls.filter((call) => call.url === "./api/stop").length === 1, "double Stop must issue one POST");
  check(stop.nodes.get("capture-start")?.disabled === true && stop.nodes.get("capture-stop")?.disabled === true, "double Stop must synchronously disable both native controls");

  const invalidPayload = payloadFor("stopped");
  const invalidCalls: string[] = [];
  const invalid = await createUiVmFixture(invalidPayload, (url, init) => {
    if (url === "./api/status") return uiJsonResponse(invalidPayload);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.mode === "preview") return uiJsonResponse({ preview: true, evidence: "inferred_candidate", ready: true, readinessRevision: "r1", frameHex: "f70c011802401102010000b2ee" });
    if (body.mode === "challenge") return uiJsonResponse({ id: " ", expiresAtMs: 1_700_020_100, readinessRevision: "r1" });
    if (url === "./api/capture" || url === "./api/stop") invalidCalls.push(url);
    return uiJsonResponse({ cancelled: false });
  });
  await invalid.flush();
  invalid.timers.clear();
  (invalid.nodes.get("raw-burst") as AnyRecord).value = "f70b01180240110100b6ee";
  invalid.click("raw-preview");
  await invalid.flush();
  invalid.nodes.get("confirmation-phrase")!.value = "I UNDERSTAND THIS IS AN INFERRED CANDIDATE";
  invalid.click("issue-challenge");
  await invalid.flush();
  const invalidAlert = invalid.nodes.get("alert")?.textContent ?? "";
  check(/reconciliation|재확인/i.test(invalidAlert), "invalid challenge must announce reconciliation");
  check(invalid.nodes.get("capture-start")?.disabled === true && invalid.nodes.get("capture-stop")?.disabled === true, "invalid challenge must keep both capture controls disabled");
  invalid.click("capture-start");
  invalid.click("capture-stop");
  await invalid.flush();
  check(invalidCalls.length === 0, "programmatic clicks after invalid challenge must not mutate capture state");
  check(invalid.nodes.get("alert")?.textContent === invalidAlert, "programmatic clicks must not overwrite invalid-challenge reconciliation");

  const partialPayload = payloadFor("stopped");
  const partialCalls: string[] = [];
  const partial = await createUiVmFixture(partialPayload, (url, init) => {
    if (url === "./api/status") return uiJsonResponse(partialPayload);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.mode === "preview") return uiJsonResponse({ preview: true, evidence: "observed", ready: true, readinessRevision: "r1", frameHex: "f70d011904401000020102b5ee" });
    if (body.mode === "commit") return uiJsonResponse({ outcome: "partial_indeterminate", framesWritten: 1 });
    if (url === "./api/capture" || url === "./api/stop") partialCalls.push(url);
    return uiJsonResponse({});
  });
  await partial.flush();
  partial.timers.clear();
  partial.click("elevator-down");
  await partial.flush();
  partial.click("review-commit");
  await partial.flush();
  const partialAlert = partial.nodes.get("alert")?.textContent ?? "";
  check(/reconciliation|재확인/i.test(partialAlert), "partial_indeterminate must announce reconciliation");
  check(partial.nodes.get("capture-start")?.disabled === true && partial.nodes.get("capture-stop")?.disabled === true, "partial_indeterminate must keep both capture controls disabled");
  partial.click("capture-start");
  partial.click("capture-stop");
  await partial.flush();
  check(partialCalls.length === 0, "programmatic clicks after partial_indeterminate must not mutate capture state");
  check(partial.nodes.get("alert")?.textContent === partialAlert, "programmatic clicks must not overwrite partial reconciliation");

  assert.deepStrictEqual(problems, []);
});

test("RED-seventh: UI freshness requires global current-generation evidence and bounded retained debug", async () => {
  const problems: string[] = [];
  const check = (condition: unknown, message: string): void => { if (!condition) problems.push(message); };
  const baseNow = 1_700_020_000;
  const freshnessCases: Array<[string, (payload: AnyRecord) => void]> = [
    ["global generation mismatch", (payload) => { payload.lastValidFrameGeneration = 8; }],
    ["global frame age over threshold", (payload) => { payload.lastValidFrameAtMs = baseNow - 101; }],
    ["negative current generation", (payload) => { payload.generation = -1; payload.lastValidFrameGeneration = -1; payload.debug.devices.lights[1].generation = -1; }],
    ["negative global frame generation", (payload) => { payload.lastValidFrameGeneration = -1; }],
    ["negative entry generation", (payload) => { payload.debug.devices.lights[1].generation = -1; }],
    ["NaN generation", (payload) => { payload.generation = Number.NaN; payload.lastValidFrameGeneration = Number.NaN; payload.debug.devices.lights[1].generation = Number.NaN; }],
    ["Infinity generation", (payload) => { payload.generation = Number.POSITIVE_INFINITY; payload.lastValidFrameGeneration = Number.POSITIVE_INFINITY; payload.debug.devices.lights[1].generation = Number.POSITIVE_INFINITY; }],
  ];
  for (const [label, mutate] of freshnessCases) {
    const payload = uiStatusPayload();
    payload.debug.staleAfterMs = 100;
    mutate(payload);
    const fixture = await createUiVmFixture(payload);
    await fixture.flush();
    const row = fixture.nodes.get("light-state-1")?.textContent ?? "";
    check(/stale|unknown/i.test(row) && !/fresh/i.test(row), `${label} must render stale/unknown: ${row}`);
    check(!/NaN|Infinity/.test(row), `${label} must not render NaN/Infinity: ${row}`);
  }

  for (const [label, phase] of [["no frame", "running"], ["stopped", "stopped"]] as const) {
    const payload = uiStatusPayload({ phase, state: phase });
    payload.debug.staleAfterMs = 100;
    payload.lastValidFrameAtMs = 0;
    payload.lastValidFrameGeneration = 0;
    payload.debug.frames = [];
    const fixture = await createUiVmFixture(payload);
    await fixture.flush();
    const cctv = fixture.nodes.get("cctv-observation")?.textContent ?? "";
    check(/unknown|stale/i.test(cctv), `${label} CCTV must be unknown/stale: ${cctv}`);
    check(!/(?:current.*(?:observed|not observed)|(?:observed|not observed).*current)/i.test(cctv), `${label} CCTV must not claim current observed/not-observed: ${cctv}`);
  }

  const mixed = uiStatusPayload();
  mixed.debug.staleAfterMs = 100;
  mixed.debug.unknown = [
    { cluster: "0x7e", rawHex: "7f620000ee", atMs: baseNow - 20, generation: 9, stale: false },
    { cluster: "0x7d", rawHex: "7f610000ee", atMs: baseNow - 20, generation: 8, stale: false },
  ];
  const mixedFixture = await createUiVmFixture(mixed);
  await mixedFixture.flush();
  const unknownCount = mixedFixture.nodes.get("unknown-clusters")?.textContent ?? "";
  check(!/generation\s+9\b/i.test(unknownCount), `mixed retained unknown count must not claim current generation: ${unknownCount}`);

  assert.deepStrictEqual(problems, []);
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

test("RED-sixth: capture and stop mutation uncertainty lock the page after a bounded deadline", async () => {
  const scenarios: Array<[string, "./api/capture" | "./api/stop", "reject" | "untrusted" | "never"]> = [
    ["capture rejection", "./api/capture", "reject"],
    ["stop untrusted response", "./api/stop", "untrusted"],
    ["capture never settles", "./api/capture", "never"],
  ];
  const problems: string[] = [];
  for (const [label, endpoint, mode] of scenarios) {
    let settleMutation: ((value: AnyRecord) => void) | undefined;
    let mutationSettled = false;
    let mutationCalls = 0;
    let statusCalls = 0;
    const fixturePhase = endpoint === "./api/capture" ? "stopped" : "running";
    const fixtureStatus = uiStatusPayload({ phase: fixturePhase, state: fixturePhase });
    const fixture = await createUiVmFixture(fixtureStatus, (url) => {
      if (url === "./api/status") {
        statusCalls += 1;
        return uiJsonResponse(fixtureStatus);
      }
      if (url === endpoint) {
        mutationCalls += 1;
        if (mode === "reject") return Promise.reject(new Error("mutation network failure"));
        if (mode === "untrusted") return { ok: false, status: 599 };
        return new Promise((resolve) => {
          settleMutation = (value) => {
            if (mutationSettled) return;
            mutationSettled = true;
            resolve(value);
          };
        });
      }
      return uiJsonResponse({});
    });
    try {
      await fixture.flush();
      fixture.timers.clear();
      fixture.click(endpoint === "./api/capture" ? "capture-start" : "capture-stop");
      await fixture.flush();
      if (mutationCalls !== 1) problems.push(`${label}: expected one initial mutation, got ${mutationCalls}`);
      if (fixture.timers.size === 0) problems.push(`${label}: missing bounded mutation deadline`);
      fixture.fireTimer();
      await fixture.flush();
      if (fixture.nodes.get("capture-start")?.disabled !== true || fixture.nodes.get("capture-stop")?.disabled !== true) {
        problems.push(`${label}: native capture controls were not locked after deadline`);
      }
      if (statusCalls < 2) problems.push(`${label}: bounded status reconciliation did not start`);
      fixture.click("capture-start");
      fixture.click("capture-stop");
      await fixture.flush();
      if (mutationCalls !== 1) problems.push(`${label}: late response/second activation sent ${mutationCalls} mutations`);
      if (fixture.nodes.get("capture-start")?.disabled !== true || fixture.nodes.get("capture-stop")?.disabled !== true) {
        problems.push(`${label}: late response unlocked mutation controls`);
      }
    } finally {
      if (mode === "never") {
        settleMutation?.(uiJsonResponse({ ok: true }));
        await fixture.flush();
      }
    }
  }
  assert.deepStrictEqual(problems, []);
});

test("RED-eighth: emitted UI starts fail-closed and invalidates capture controls on status drift", async () => {
  const uiModule = await import(pathToFileURL(path(paths.uiSource)).href) as AnyRecord;
  const html = String(uiModule.renderAppHtml());
  assert.equal(/<button id="capture-start"[^>]*disabled/.test(html), true, "emitted Capture control must start disabled");
  assert.equal(/<button id="capture-stop"[^>]*disabled/.test(html), true, "emitted Stop control must start disabled");

  const initialPayload = uiStatusPayload({ phase: "stopped", state: "stopped" });
  let resolveInitial!: (value: AnyRecord) => void;
  let statusCall = 0;
  const fixture = await createUiVmFixture(initialPayload, (url) => {
    if (url !== "./api/status") return uiJsonResponse({});
    statusCall += 1;
    if (statusCall === 1) return new Promise((resolve) => { resolveInitial = resolve; });
    if (statusCall === 2) return uiJsonResponse({ ...initialPayload, phase: "corrupted", state: "corrupted" });
    return Promise.reject(new Error("background status unavailable"));
  });
  assert.equal(fixture.nodes.get("capture-start")?.disabled, true, "deferred initial status must disable Capture");
  assert.equal(fixture.nodes.get("capture-stop")?.disabled, true, "deferred initial status must disable Stop");
  fixture.click("capture-start");
  fixture.click("capture-stop");
  await fixture.flush();
  assert.equal(fixture.fetchCalls.filter((call) => call.url === "./api/capture" || call.url === "./api/stop").length, 0, "deferred initial status must block mutation POSTs");

  resolveInitial(uiJsonResponse(initialPayload));
  await fixture.flush();
  fixture.fireTimer();
  await fixture.flush();
  assert.equal(fixture.nodes.get("capture-start")?.disabled, true, "malformed background phase must disable Capture");
  assert.equal(fixture.nodes.get("capture-stop")?.disabled, true, "malformed background phase must disable Stop");
  fixture.fireTimer();
  await fixture.flush();
  assert.equal(fixture.nodes.get("capture-start")?.disabled, true, "failed background status must disable Capture");
  assert.equal(fixture.nodes.get("capture-stop")?.disabled, true, "failed background status must disable Stop");
});

test("RED-eighth: Capture and Stop retain the native busy lease through deferred status reconciliation", async () => {
  const scenarios: Array<["stopped" | "running", "./api/capture" | "./api/stop", "capture-start" | "capture-stop", "running" | "stopped"]> = [
    ["stopped", "./api/capture", "capture-start", "running"],
    ["running", "./api/stop", "capture-stop", "stopped"],
  ];
  for (const [initialPhase, endpoint, trigger, reconciledPhase] of scenarios) {
    const initialPayload = uiStatusPayload({ phase: initialPhase, state: initialPhase });
    let statusCall = 0;
    let resolveForced!: (value: AnyRecord) => void;
    const fixture = await createUiVmFixture(initialPayload, (url) => {
      if (url === "./api/status") {
        statusCall += 1;
        if (statusCall === 1) return uiJsonResponse(initialPayload);
        return new Promise((resolve) => { resolveForced = resolve; });
      }
      if (url === endpoint) return uiJsonResponse({});
      return uiJsonResponse({});
    });
    await fixture.flush();
    fixture.timers.clear();
    fixture.click(trigger);
    await fixture.flush();
    assert.equal(statusCall, 2, `${endpoint} must start deferred status reconciliation after HTTP 200`);
    assert.equal(fixture.nodes.get("capture-start")?.disabled, true, `${endpoint} must retain Capture disabled while status is deferred`);
    assert.equal(fixture.nodes.get("capture-stop")?.disabled, true, `${endpoint} must retain Stop disabled while status is deferred`);
    fixture.click(trigger);
    await fixture.flush();
    assert.equal(fixture.fetchCalls.filter((call) => call.url === endpoint).length, 1, `${endpoint} must reject a second activation while status is deferred`);

    resolveForced(uiJsonResponse(uiStatusPayload({ phase: reconciledPhase, state: reconciledPhase })));
    await fixture.flush();
    assert.equal(fixture.nodes.get("capture-start")?.disabled, reconciledPhase === "running", `${endpoint} must enable Capture only for stopped phase`);
    assert.equal(fixture.nodes.get("capture-stop")?.disabled, reconciledPhase !== "running", `${endpoint} must enable Stop only for running phase`);
  }
});

test("RED-eighth: malformed, failed, timed-out, and superseded reconciliation stay a sticky mutation lock", async () => {
  const scenarios: Array<[string, "malformed" | "failed" | "deadline"]> = [
    ["malformed", "malformed"],
    ["failed", "failed"],
    ["deadline", "deadline"],
  ];
  for (const [label, mode] of scenarios) {
    const initialPayload = uiStatusPayload({ phase: "stopped", state: "stopped" });
    let resolveForced!: (value: AnyRecord) => void;
    let statusCall = 0;
    let mutationCalls = 0;
    const fixture = await createUiVmFixture(initialPayload, (url) => {
      if (url === "./api/status") {
        statusCall += 1;
        if (statusCall === 1) return uiJsonResponse(initialPayload);
        if (mode === "malformed") return new Promise((resolve) => { resolveForced = resolve; });
        if (mode === "failed") return Promise.reject(new Error("forced status failed"));
        return new Promise((resolve) => { resolveForced = resolve; });
      }
      if (url === "./api/capture") {
        mutationCalls += 1;
        return uiJsonResponse({});
      }
      return uiJsonResponse({});
    });
    await fixture.flush();
    fixture.timers.clear();
    fixture.click("capture-start");
    await fixture.flush();
    if (mode === "malformed") resolveForced(uiJsonResponse({ ...initialPayload, phase: "invalid", state: "invalid" }));
    if (mode === "deadline") fixture.fireTimer();
    await fixture.flush();
    assert.equal(fixture.nodes.get("capture-start")?.disabled, true, `${label} reconciliation must disable Capture`);
    assert.equal(fixture.nodes.get("capture-stop")?.disabled, true, `${label} reconciliation must disable Stop`);
    fixture.click("capture-start");
    fixture.click("capture-stop");
    await fixture.flush();
    assert.equal(mutationCalls, 1, `${label} reconciliation lock must prevent later mutation POSTs`);
    assert.equal(fixture.nodes.get("capture-start")?.disabled, true, `${label} lock must remain on Capture`);
    assert.equal(fixture.nodes.get("capture-stop")?.disabled, true, `${label} lock must remain on Stop`);
    if (mode === "deadline") {
      resolveForced(uiJsonResponse(uiStatusPayload({ phase: "running", state: "running" })));
      await fixture.flush();
      assert.equal(fixture.nodes.get("capture-start")?.disabled, true, "late deadline status must not unlock Capture");
      assert.equal(fixture.nodes.get("capture-stop")?.disabled, true, "late deadline status must not unlock Stop");
    }
  }

  let resolveBackground!: (value: AnyRecord) => void;
  let resolveSuperseding!: (value: AnyRecord) => void;
  let statusCall = 0;
  const initialPayload = uiStatusPayload({ phase: "stopped", state: "stopped" });
  const superseded = await createUiVmFixture(initialPayload, (url) => {
    if (url === "./api/status") {
      statusCall += 1;
      if (statusCall === 1) return uiJsonResponse(initialPayload);
      if (statusCall === 2) return new Promise((resolve) => { resolveBackground = resolve; });
      return new Promise((resolve) => { resolveSuperseding = resolve; });
    }
    if (url === "./api/capture") return uiJsonResponse({});
    return uiJsonResponse({});
  });
  await superseded.flush();
  superseded.fireTimer();
  await superseded.flush();
  superseded.click("capture-start");
  await superseded.flush();
  resolveBackground(uiJsonResponse(uiStatusPayload({ phase: "stopped", state: "stopped" })));
  await superseded.flush();
  assert.equal(superseded.nodes.get("capture-start")?.disabled, true, "superseded background status must not unlock Capture");
  assert.equal(superseded.nodes.get("capture-stop")?.disabled, true, "superseded background status must not unlock Stop");
  resolveSuperseding(uiJsonResponse(uiStatusPayload({ phase: "running", state: "running" })));
  await superseded.flush();
  assert.equal(superseded.nodes.get("capture-start")?.disabled, true, "authoritative superseding status must keep Capture disabled while running");
  assert.equal(superseded.nodes.get("capture-stop")?.disabled, false, "authoritative superseding status must enable Stop while running");
});

test("RED-repair1: same-phase endpoint reconciliation is a sticky mutation lock", async () => {
  const scenarios: Array<["stopped" | "running", "./api/capture" | "./api/stop", "capture-start" | "capture-stop"]> = [
    ["stopped", "./api/capture", "capture-start"],
    ["running", "./api/stop", "capture-stop"],
  ];
  const problems: string[] = [];
  for (const [initialPhase, endpoint, trigger] of scenarios) {
    const initialPayload = uiStatusPayload({ phase: initialPhase, state: initialPhase });
    let statusCalls = 0;
    let mutationCalls = 0;
    const fixture = await createUiVmFixture(initialPayload, (url) => {
      if (url === "./api/status") {
        statusCalls += 1;
        return uiJsonResponse(initialPayload);
      }
      if (url === endpoint) {
        mutationCalls += 1;
        return uiJsonResponse({});
      }
      return uiJsonResponse({});
    });
    await fixture.flush();
    fixture.timers.clear();
    fixture.click(trigger);
    await fixture.flush();
    if (statusCalls < 2) problems.push(`${endpoint}: forced authoritative status did not settle`);
    if (mutationCalls !== 1) problems.push(`${endpoint}: expected one initial mutation, got ${mutationCalls}`);
    if (fixture.nodes.get("capture-start")?.disabled !== true || fixture.nodes.get("capture-stop")?.disabled !== true) {
      problems.push(`${endpoint}: same-phase reconciliation did not keep both native controls locked`);
    }
    fixture.click(trigger);
    await fixture.flush();
    if (mutationCalls !== 1) problems.push(`${endpoint}: second activation sent ${mutationCalls} mutation POSTs`);
  }
  assert.deepStrictEqual(problems, []);
});

test("RED-repair1: Capture and Stop mutation leases exclude all review mutations", async () => {
  const problems: string[] = [];
  const checkReviewLease = async (fixture: UiVmFixture, calls: Record<string, number>, label: string): Promise<void> => {
    const before = { ...calls };
    for (const id of ["issue-challenge", "review-commit", "review-cancel"]) {
      if (fixture.nodes.get(id)?.disabled !== true) problems.push(`${label}: ${id} was not natively disabled`);
    }
    fixture.click("issue-challenge");
    fixture.click("review-commit");
    fixture.click("review-cancel");
    // M4.8: an observed control is one tap, so the lease has to stop the control itself.
    fixture.click("light-1-on");
    await fixture.flush();
    if (calls.challenge !== before.challenge || calls.commit !== before.commit || calls.cancel !== before.cancel) {
      problems.push(`${label}: programmatic review activation overlapped the capture/stop lease`);
    }
  };

  {
    const initialPayload = uiStatusPayload({ phase: "stopped", state: "stopped" });
    let statusCalls = 0;
    let resolveCapture: ((value: AnyRecord) => void) | undefined;
    let resolveForced: ((value: AnyRecord) => void) | undefined;
    const calls = { capture: 0, challenge: 0, commit: 0, cancel: 0 };
    const fixture = await createUiVmFixture(initialPayload, (url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (url === "./api/status") {
        statusCalls += 1;
        if (statusCalls === 1) return uiJsonResponse(initialPayload);
        return new Promise((resolve) => { resolveForced = resolve; });
      }
      if (body.mode === "preview") {
        return uiJsonResponse({ preview: true, evidence: "observed", ready: true, readinessRevision: "r1", frameHex: "f70d011904401000020102b5ee" });
      }
      if (body.mode === "challenge") { calls.challenge += 1; return uiJsonResponse({}); }
      if (body.mode === "commit") { calls.commit += 1; return uiJsonResponse({ outcome: "socket_written_unconfirmed", deviceConfirmed: false }); }
      if (body.mode === "cancel") { calls.cancel += 1; return uiJsonResponse({ cancelled: true }); }
      if (url === "./api/capture") {
        calls.capture += 1;
        return new Promise((resolve) => { resolveCapture = resolve; });
      }
      return uiJsonResponse({});
    });
    await fixture.flush();
    fixture.click("capture-start");
    await fixture.flush();
    await checkReviewLease(fixture, calls, "observed Capture POST");
    resolveCapture?.(uiJsonResponse({}));
    await fixture.flush();
    await checkReviewLease(fixture, calls, "observed Capture reconciliation");
    resolveForced?.(uiJsonResponse(uiStatusPayload({ phase: "running", state: "running" })));
    await fixture.flush();
    if (calls.capture !== 1) problems.push(`observed Capture: expected one capture POST, got ${calls.capture}`);
  }

  {
    const initialPayload = uiStatusPayload({ phase: "running", state: "running" });
    let statusCalls = 0;
    let resolveCancel: ((value: AnyRecord) => void) | undefined;
    let resolveStop: ((value: AnyRecord) => void) | undefined;
    let resolveForced: ((value: AnyRecord) => void) | undefined;
    const calls = { stop: 0, challenge: 0, commit: 0, cancel: 0 };
    const fixture = await createUiVmFixture(initialPayload, (url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (url === "./api/status") {
        statusCalls += 1;
        if (statusCalls === 1) return uiJsonResponse(initialPayload);
        return new Promise((resolve) => { resolveForced = resolve; });
      }
      if (body.mode === "preview") {
        return uiJsonResponse({ preview: true, evidence: "inferred_candidate", ready: true, readiness: { ready: true }, readinessRevision: "r1", frameHex: "f70c011802401102010000b2ee" });
      }
      if (body.mode === "challenge") {
        calls.challenge += 1;
        return uiJsonResponse({ id: VALID_CHALLENGE_ID, expiresAtMs: 1_700_021_000, readinessRevision: "r1", frameHex: "f70c011802401102010000b2ee" });
      }
      if (body.mode === "commit") { calls.commit += 1; return uiJsonResponse({ outcome: "socket_written_unconfirmed", deviceConfirmed: false }); }
      if (body.mode === "cancel") {
        calls.cancel += 1;
        if (calls.cancel === 1) return new Promise((resolve) => { resolveCancel = resolve; });
        return uiJsonResponse({ cancelled: true });
      }
      if (url === "./api/stop") {
        calls.stop += 1;
        return new Promise((resolve) => { resolveStop = resolve; });
      }
      return uiJsonResponse({});
    });
    await fixture.flush();
    (fixture.nodes.get("raw-burst") as AnyRecord).value = "f70b01180240110100b6ee";
    fixture.click("raw-preview");
    await fixture.flush();
    fixture.nodes.get("confirmation-phrase")!.value = "I UNDERSTAND THIS IS AN INFERRED CANDIDATE";
    fixture.click("issue-challenge");
    await fixture.flush();
    if (calls.challenge !== 1) problems.push(`inferred Stop: expected one challenge setup POST, got ${calls.challenge}`);
    fixture.click("capture-stop");
    await fixture.flush();
    await checkReviewLease(fixture, calls, "inferred Stop cancellation");
    resolveCancel?.(uiJsonResponse({ cancelled: true }));
    await fixture.flush();
    await checkReviewLease(fixture, calls, "inferred Stop POST");
    resolveStop?.(uiJsonResponse({}));
    await fixture.flush();
    await checkReviewLease(fixture, calls, "inferred Stop reconciliation");
    resolveForced?.(uiJsonResponse(uiStatusPayload({ phase: "stopped", state: "stopped" })));
    await fixture.flush();
    if (calls.stop !== 1) problems.push(`inferred Stop: expected one stop POST, got ${calls.stop}`);
    if (calls.cancel !== 1) problems.push(`inferred Stop: challenge cancellation overlapped the lease (${calls.cancel} cancel POSTs)`);
  }

  assert.deepStrictEqual(problems, []);
});

test("RED-repair2: native Cancel remains available through preview and challenge cancellation", async () => {
  const problems: string[] = [];
  const nativeClick = (fixture: UiVmFixture, id: string): void => {
    if (fixture.nodes.get(id)?.disabled !== true) fixture.click(id);
  };

  let resolvePreview!: (value: AnyRecord) => void;
  const previewFixture = await createUiVmFixture(uiStatusPayload(), (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "./api/status") return uiJsonResponse(uiStatusPayload());
    if (body.mode === "preview") return new Promise((resolve) => { resolvePreview = resolve; });
    return uiJsonResponse({ cancelled: true });
  });
  await previewFixture.flush();
  previewFixture.click("elevator-down");
  await previewFixture.flush();
  if (previewFixture.nodes.get("review-cancel")?.disabled === true) problems.push("pending preview: Cancel was not natively enabled");
  nativeClick(previewFixture, "review-cancel");
  if (!/idle/.test(previewFixture.nodes.get("review-phase")?.textContent ?? "")) problems.push("pending preview: native Cancel did not return review to idle");
  const previewCancelOutcome = previewFixture.nodes.get("outcome")?.textContent ?? "";
  if (!/Review canceled/i.test(previewCancelOutcome) || !/취소/.test(previewCancelOutcome)) {
    problems.push(`pending preview cancellation outcome was not concise bilingual Review canceled: ${previewCancelOutcome}`);
  }
  resolvePreview(uiJsonResponse({ preview: true, evidence: "observed", ready: true, frameHex: "f70d011904401000020102b5ee" }));
  await previewFixture.flush();
  nativeClick(previewFixture, "review-cancel");
  await previewFixture.flush();

  let resolveChallenge!: (value: AnyRecord) => void;
  let resolveChallengeCancel: ((value: AnyRecord) => void) | undefined;
  const cancelCalls: AnyRecord[] = [];
  const challengeFixture = await createUiVmFixture(uiStatusPayload(), (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "./api/status") return uiJsonResponse(uiStatusPayload());
    if (body.mode === "preview") return uiJsonResponse({ preview: true, evidence: "inferred_candidate", ready: true, readiness: { ready: true }, readinessRevision: "r1", frameHex: "f70c011802401102010000b2ee" });
    if (body.mode === "challenge") return new Promise((resolve) => { resolveChallenge = resolve; });
    if (body.mode === "cancel") {
      cancelCalls.push(body);
      return new Promise((resolve) => { resolveChallengeCancel = resolve; });
    }
    return uiJsonResponse({});
  });
  await challengeFixture.flush();
  (challengeFixture.nodes.get("raw-burst") as AnyRecord).value = "f70b01180240110100b6ee";
  challengeFixture.click("raw-preview");
  await challengeFixture.flush();
  challengeFixture.nodes.get("confirmation-phrase")!.value = "I UNDERSTAND THIS IS AN INFERRED CANDIDATE";
  challengeFixture.click("issue-challenge");
  await challengeFixture.flush();
  if (challengeFixture.nodes.get("review-cancel")?.disabled === true) problems.push("pending challenge: Cancel was not natively enabled");
  nativeClick(challengeFixture, "review-cancel");
  if (challengeFixture.nodes.get("review-cancel")?.disabled !== true) problems.push("challenge cancellation wait: Cancel was not disabled");
  nativeClick(challengeFixture, "review-cancel");
  nativeClick(challengeFixture, "review-cancel");
  resolveChallenge(uiJsonResponse({ id: VALID_CHALLENGE_ID, expiresAtMs: 1_700_021_000, readinessRevision: "r1", frameHex: "f70c011802401102010000b2ee" }));
  await challengeFixture.flush();
  const pendingChallengeCancelOutcome = challengeFixture.nodes.get("outcome")?.textContent ?? "";
  if (!/Canceling challenge/i.test(pendingChallengeCancelOutcome) || !/취소/.test(pendingChallengeCancelOutcome)) {
    problems.push(`pending challenge cancellation outcome was not concise bilingual Canceling challenge: ${pendingChallengeCancelOutcome}`);
  }
  if (cancelCalls.length !== 1) problems.push(`late challenge cancellation: expected exactly one authenticated cancel, got ${cancelCalls.length}`);
  resolveChallengeCancel?.(uiJsonResponse({ cancelled: true }));
  await challengeFixture.flush();
  const challengeCanceledOutcome = challengeFixture.nodes.get("outcome")?.textContent ?? "";
  if (!/Challenge canceled/i.test(challengeCanceledOutcome) || !/취소/.test(challengeCanceledOutcome)) {
    problems.push(`pending challenge cancellation did not end with concise bilingual Challenge canceled: ${challengeCanceledOutcome}`);
  }
  nativeClick(challengeFixture, "review-cancel");
  await challengeFixture.flush();
  resolveChallengeCancel?.(uiJsonResponse({ cancelled: true }));
  await challengeFixture.flush();

  let resolveStableCancel: ((value: AnyRecord) => void) | undefined;
  const stableCancelCalls: AnyRecord[] = [];
  const stableChallengeFixture = await createUiVmFixture(uiStatusPayload(), (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "./api/status") return uiJsonResponse(uiStatusPayload());
    if (body.mode === "preview") return uiJsonResponse({ preview: true, evidence: "inferred_candidate", ready: true, readiness: { ready: true }, readinessRevision: "r1", frameHex: "f70c011802401102010000b2ee" });
    if (body.mode === "challenge") return uiJsonResponse({ id: VALID_CHALLENGE_ID, expiresAtMs: 1_700_021_000, readinessRevision: "r1", frameHex: "f70c011802401102010000b2ee" });
    if (body.mode === "cancel") {
      stableCancelCalls.push(body);
      return new Promise((resolve) => { resolveStableCancel = resolve; });
    }
    return uiJsonResponse({});
  });
  await stableChallengeFixture.flush();
  (stableChallengeFixture.nodes.get("raw-burst") as AnyRecord).value = "f70b01180240110100b6ee";
  stableChallengeFixture.click("raw-preview");
  await stableChallengeFixture.flush();
  stableChallengeFixture.nodes.get("confirmation-phrase")!.value = "I UNDERSTAND THIS IS AN INFERRED CANDIDATE";
  stableChallengeFixture.click("issue-challenge");
  await stableChallengeFixture.flush();
  nativeClick(stableChallengeFixture, "review-cancel");
  const stablePendingCancelOutcome = stableChallengeFixture.nodes.get("outcome")?.textContent ?? "";
  if (!/Canceling challenge/i.test(stablePendingCancelOutcome) || !/취소/.test(stablePendingCancelOutcome)) {
    problems.push(`stable challenge cancellation outcome was not concise bilingual Canceling challenge: ${stablePendingCancelOutcome}`);
  }
  if (stableChallengeFixture.nodes.get("review-cancel")?.disabled !== true) problems.push("stable challenge cancellation wait: Cancel was not disabled");
  nativeClick(stableChallengeFixture, "review-cancel");
  nativeClick(stableChallengeFixture, "review-cancel");
  if (stableCancelCalls.length !== 1) problems.push(`stable challenge cancellation duplicated: ${stableCancelCalls.length}`);
  resolveStableCancel?.(uiJsonResponse({ cancelled: true }));
  await stableChallengeFixture.flush();
  const stableChallengeCanceledOutcome = stableChallengeFixture.nodes.get("outcome")?.textContent ?? "";
  if (!/Challenge canceled/i.test(stableChallengeCanceledOutcome) || !/취소/.test(stableChallengeCanceledOutcome)) {
    problems.push(`stable challenge cancellation did not end with concise bilingual Challenge canceled: ${stableChallengeCanceledOutcome}`);
  }
  assert.deepStrictEqual(problems, []);
});

test("RED-repair2: live regions announce mutation reconciliation and challenge progress", async () => {
  const problems: string[] = [];
  const initialPayload = uiStatusPayload({ phase: "stopped", state: "stopped" });
  let statusCall = 0;
  let resolveForced: ((value: AnyRecord) => void) | undefined;
  const captureFixture = await createUiVmFixture(initialPayload, (url) => {
    if (url === "./api/status") {
      statusCall += 1;
      if (statusCall === 1) return uiJsonResponse(initialPayload);
      return new Promise((resolve) => { resolveForced = resolve; });
    }
    if (url === "./api/capture") return uiJsonResponse({});
    return uiJsonResponse({});
  });
  await captureFixture.flush();
  captureFixture.timers.clear();
  captureFixture.click("capture-start");
  await captureFixture.flush();
  const reconciliationStatus = captureFixture.nodes.get("status")?.textContent ?? "";
  if (!/reconcil|pending/i.test(reconciliationStatus) || !/(확인|대기|중)/.test(reconciliationStatus)) {
    problems.push(`capture reconciliation status was not concise bilingual progress: ${reconciliationStatus}`);
  }
  resolveForced?.(uiJsonResponse(uiStatusPayload({ phase: "running", state: "running" })));
  await captureFixture.flush();

  let resolveIssue!: (value: AnyRecord) => void;
  const challengeFixture = await createUiVmFixture(uiStatusPayload(), (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "./api/status") return uiJsonResponse(uiStatusPayload());
    if (body.mode === "preview") return uiJsonResponse({ preview: true, evidence: "inferred_candidate", ready: true, readiness: { ready: true }, readinessRevision: "r1", frameHex: "f70c011802401102010000b2ee" });
    if (body.mode === "challenge") return new Promise((resolve) => { resolveIssue = resolve; });
    return uiJsonResponse({});
  });
  await challengeFixture.flush();
  (challengeFixture.nodes.get("raw-burst") as AnyRecord).value = "f70b01180240110100b6ee";
  challengeFixture.click("raw-preview");
  await challengeFixture.flush();
  challengeFixture.nodes.get("confirmation-phrase")!.value = "I UNDERSTAND THIS IS AN INFERRED CANDIDATE";
  challengeFixture.click("issue-challenge");
  await challengeFixture.flush();
  const issuingOutcome = challengeFixture.nodes.get("outcome")?.textContent ?? "";
  if (!/issu|pending|challenge/i.test(issuingOutcome) || !/(발급|대기|중)/.test(issuingOutcome)) {
    problems.push(`challenge progress outcome was not concise bilingual progress: ${issuingOutcome}`);
  }
  resolveIssue(uiJsonResponse({ id: VALID_CHALLENGE_ID, expiresAtMs: 1_700_021_000, readinessRevision: "r1", frameHex: "f70c011802401102010000b2ee" }));
  await challengeFixture.flush();
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

test("M4.7 RED: the send banner names the blocker in consequences and points at the fix", async () => {
  const uiModule = await import(pathToFileURL(path(paths.uiSource)).href) as AnyRecord;
  const html = String(uiModule.renderAppHtml());
  assert.equal(html.includes('id="tx-gates"'), false, "the twelve-chip gate list must be replaced by one banner");
  assert.match(html, /id="gate-banner"[^>]*aria-live="polite"/, "the banner must be a polite live region");

  const state = (fixture: UiVmFixture): unknown => fixture.nodes.get("gate-banner")?.attributes?.["data-state"];
  const text = (fixture: UiVmFixture, id: string): string => String(fixture.nodes.get(id)?.textContent ?? "");
  const reasons = (fixture: UiVmFixture): string[] =>
    ((fixture.nodes.get("gate-banner-reasons")?.children as AnyRecord[]) ?? []).map((item) => String(item.textContent));

  // 1. Capture off is its own state. The design states the four consequences of having
  //    no collection rather than echoing gate names, and offers the control that fixes it.
  const offTx = { ...(uiStatusPayload().tx as AnyRecord), connected: false, currentGenerationRx: false, fresh: false, quiet: false };
  const off = await createUiVmFixture(uiStatusPayload({ phase: "stopped", state: "stopped", tx: offTx }));
  await off.flush();
  assert.equal(state(off), "off", "a stopped capture is the off state, not a generic block");
  assert.match(text(off, "gate-banner-title"), /수집이 꺼져 있어 제어할 수 없습니다/);
  assert.deepStrictEqual(reasons(off).length, 4, "the off state states exactly the four consequences");
  assert.equal(
    reasons(off).some((line) => line.includes("EW11") && line.includes("보낼 곳이 없습니다")),
    true,
    "the first consequence is that no socket is open to the gateway",
  );
  assert.equal(reasons(off).some((line) => line.includes("충돌")), true, "a silent bus cannot be confirmed, so collisions cannot be avoided");
  assert.equal(reasons(off).some((line) => line.includes("준비")), false, "a blocked banner must never claim readiness");
  assert.match(text(off, "gate-banner-fix"), /수집 시작하고 제어 열기/, "the off state must offer the control that unblocks it");

  // 2. A running capture whose only failing gate is freshness is the quiet-bus state, and
  //    it must say the collection is still on so the operator does not restart it needlessly.
  const quiet = await createUiVmFixture(uiStatusPayload({ tx: { ...(uiStatusPayload().tx as AnyRecord), fresh: false } }));
  await quiet.flush();
  assert.equal(state(quiet), "quiet", "a stale frame on a running capture is the quiet state");
  assert.match(text(quiet, "gate-banner-title"), /조용해 송신을 보류합니다/);
  assert.match(text(quiet, "gate-banner-lede"), /수집은 켜져 있습니다/, "the quiet state must not read as a stopped capture");

  // 3. Every gate green is ready.
  const ready = await createUiVmFixture(uiStatusPayload());
  await ready.flush();
  assert.equal(state(ready), "ready", "an all-green gate must render the ready banner");
  assert.match(text(ready, "gate-banner-title"), /제어 준비됨/);
  assert.deepStrictEqual(reasons(ready), [], "a ready banner lists no blocker");

  // 4. The banner must not become a second lying surface: a blocker the readiness gate
  //    enforces has to read as blocked here too, and be named.
  const blocked = await createUiVmFixture(uiStatusPayload({ tx: { ...(uiStatusPayload().tx as AnyRecord), quarantined: true } }));
  await blocked.flush();
  assert.equal(state(blocked), "blocked", "a quarantined generation must not be reported as ready");
  assert.equal(
    reasons(blocked).some((line) => line.includes("격리")),
    true,
    "the quarantined generation must be named as the blocker",
  );

  // 5. A live region that rewrites identical content on every poll re-announces it to a
  //    screen reader, so an unchanged status must leave the banner untouched.
  const sentinel = "SENTINEL";
  const titleNode = off.nodes.get("gate-banner-title") as AnyRecord;
  titleNode.textContent = sentinel;
  off.fireTimer();
  await off.flush();
  assert.equal(titleNode.textContent, sentinel, "an unchanged banner must not be rewritten, or it re-announces every poll");
});

test("M4.8 RED: an observed control sends on one tap and a candidate still asks for confirmation", async () => {
  const status = uiStatusPayload();
  const bodies: AnyRecord[] = [];
  const fixture = await createUiVmFixture(status, (url, init) => {
    if (!String(url).includes("/api/action")) return uiJsonResponse(status);
    const body = JSON.parse(String((init as AnyRecord)?.body ?? "{}")) as AnyRecord;
    bodies.push(body);
    const observed = body.kind === "light" || body.kind === "gas";
    if (body.mode === "preview") {
      return uiJsonResponse({
        preview: true,
        outcome: "preview",
        evidence: observed ? "observed" : "inferred_candidate",
        ready: true,
        reasons: [],
        readinessRevision: status.tx ? (status.tx as AnyRecord).readinessRevision : "r1",
        frameHex: "f70b01190240110100b6ee",
      });
    }
    return uiJsonResponse({ outcome: "socket_written_unconfirmed", deviceConfirmed: false });
  });
  await fixture.flush();

  // 1. One activation on an observed control must reach the socket. The operator never
  //    found the second button, so a control that only opens a preview reads as broken.
  fixture.click("light-1-on");
  await fixture.flush();
  const modes = bodies.map((b) => String(b.mode));
  assert.deepStrictEqual(
    modes,
    ["commit"],
    "a queued control sends on one tap, with no preview round trip between the tap and the bus",
  );
  assert.equal(bodies[0].kind, "light", "the committed action must be the one that was tapped");
  assert.equal(bodies[0].target, 1);
  assert.equal(bodies[0].state, "on");

  // 2. A second press must reach the server. The queue coalesces repeats by the control they
  //    address, and it can only do that if the page does not swallow the second press. This
  //    is the whole of what the operator asked for with on, off, on, off on one light.
  fixture.click("light-1-on");
  await fixture.flush();
  assert.equal(
    bodies.filter((b) => b.mode === "commit").length,
    2,
    "a second press must reach the queue rather than being refused by the page",
  );

  // 3. A candidate action carries no observed evidence, so it must stop and ask for the
  //    typed confirmation instead of transmitting on the first tap.
  const candidateBodies: AnyRecord[] = [];
  const candidate = await createUiVmFixture(status, (url, init) => {
    if (!String(url).includes("/api/action")) return uiJsonResponse(status);
    const body = JSON.parse(String((init as AnyRecord)?.body ?? "{}")) as AnyRecord;
    candidateBodies.push(body);
    if (body.mode === "preview") {
      return uiJsonResponse({
        preview: true, outcome: "preview", evidence: "inferred_candidate", ready: true, reasons: [],
        readinessRevision: status.tx ? (status.tx as AnyRecord).readinessRevision : "r1",
        frameHex: "f70b01180240110100b6ee",
      });
    }
    if (body.mode === "challenge") return uiJsonResponse({ id: "ch-1", expiresAtMs: 1_700_020_000 + 30_000, evidence: "inferred_candidate" });
    return uiJsonResponse({ outcome: "socket_written_unconfirmed", deviceConfirmed: false });
  });
  await candidate.flush();
  // Heating is observed now, so the elevator call is the control that still asks.
  candidate.click("elevator-down");
  await candidate.flush();
  // M4.9: a candidate is one tap too. The client supplies the confirmation the server
  // still demands, so the round trip is preview, challenge, commit for one activation.
  assert.deepStrictEqual(
    candidateBodies.map((b) => String(b.mode)),
    ["preview", "challenge", "commit"],
    "one tap on a candidate must classify, confirm, and send",
  );
  assert.equal(
    candidateBodies[1].confirmationPhrase,
    "I UNDERSTAND THIS IS AN INFERRED CANDIDATE",
    "the challenge must carry the exact phrase the server requires",
  );
  assert.equal(candidateBodies[2].challengeId, "ch-1", "the commit must consume the challenge just issued");
});

test("M4.9 RED: a live readiness revision never disables a control", async () => {
  // The readiness revision hashes rxByteEpoch, readEpoch, validFrameEpoch and tailHash,
  // so on a live bus it changes between the preview and the next poll. Comparing it in
  // the client left the candidate controls permanently disabled: measured on the running
  // add-on, the revision had already moved 2.5 s after the preview.
  const status = uiStatusPayload();
  const drifted = { ...status, tx: { ...(status.tx as AnyRecord), readinessRevision: "moved-on" } };
  const bodies: AnyRecord[] = [];
  let polls = 0;
  const fixture = await createUiVmFixture(status, (url, init) => {
    if (!String(url).includes("/api/action")) { polls += 1; return uiJsonResponse(polls === 1 ? status : drifted); }
    const body = JSON.parse(String((init as AnyRecord)?.body ?? "{}")) as AnyRecord;
    bodies.push(body);
    if (body.mode === "preview") {
      return uiJsonResponse({
        preview: true, outcome: "preview", evidence: "unsafe_candidate", ready: true, reasons: [],
        readinessRevision: (status.tx as AnyRecord).readinessRevision, frameHex: "f70d013401411000a5040b35ee",
      });
    }
    if (body.mode === "challenge") return uiJsonResponse({ id: "ch-2", expiresAtMs: 1_700_020_000 + 30_000, evidence: "unsafe_candidate" });
    return uiJsonResponse({ outcome: "socket_written_unconfirmed", deviceConfirmed: false });
  });
  await fixture.flush();
  fixture.fireTimer();
  await fixture.flush();
  fixture.click("elevator-up");
  await fixture.flush();
  assert.deepStrictEqual(
    bodies.map((b) => String(b.mode)),
    ["preview", "challenge", "commit"],
    "a revision that moved between poll and preview must not stop the send",
  );
});

test("M4.8 RED: a one-tap send fails closed on an untrustworthy status", async () => {
  // Replaces the three RED-next revalidation tests. Those pinned the two-activation
  // flow's rule that a reviewed observed preview had to wait for a later green status
  // before Commit could be pressed. One tap has no waiting preview: the commit round
  // trip is immediate and the server re-evaluates every gate. What still has to hold is
  // that an untrustworthy status stops the tap before anything reaches the bus.
  const invalid = uiStatusPayload();
  (invalid.tx as AnyRecord).readinessRevision = undefined;
  const invalidCalls: AnyRecord[] = [];
  const closed = await createUiVmFixture(invalid, (url, init) => {
    if (String(url).includes("/api/action")) invalidCalls.push(JSON.parse(String((init as AnyRecord)?.body ?? "{}")));
    return uiJsonResponse(invalid);
  });
  await closed.flush();
  closed.click("light-1-on");
  await closed.flush();
  assert.deepStrictEqual(invalidCalls, [], "a status without a usable revision must stop the tap before any request");
  assert.match(
    String(closed.nodes.get("outcome")?.textContent ?? ""),
    /보내지 못했습니다/,
    "the refusal must be stated, not silent",
  );

  // A trustworthy status sends exactly once for one activation and does not retry.
  const good = uiStatusPayload();
  const goodCalls: AnyRecord[] = [];
  const open = await createUiVmFixture(good, (url, init) => {
    if (!String(url).includes("/api/action")) return uiJsonResponse(good);
    const body = JSON.parse(String((init as AnyRecord)?.body ?? "{}")) as AnyRecord;
    goodCalls.push(body);
    if (body.mode === "preview") {
      return uiJsonResponse({
        preview: true, outcome: "preview", evidence: "observed", ready: true, reasons: [],
        readinessRevision: (good.tx as AnyRecord).readinessRevision, frameHex: "f70b01190240110100b6ee",
      });
    }
    return uiJsonResponse({ outcome: "socket_written_unconfirmed", deviceConfirmed: false });
  });
  await open.flush();
  open.click("light-1-on");
  await open.flush();
  assert.deepStrictEqual(goodCalls.map((b) => String(b.mode)), ["commit"]);
  open.fireTimer();
  await open.flush();
  assert.equal(
    goodCalls.filter((b) => b.mode === "commit").length,
    1,
    "a timer firing must never produce a second write",
  );
});

test("M4.8 RED: the banner ends every send at confirmed or unconfirmed, never silently", async () => {
  const base = uiStatusPayload();
  let outcome: AnyRecord = { outcome: "confirmed", confirmed: true, deviceConfirmed: true, attempts: 1, framesWritten: 1 };
  const state = (f: UiVmFixture): unknown => f.nodes.get("gate-banner")?.attributes?.["data-state"];
  const title = (f: UiVmFixture): string => String(f.nodes.get("gate-banner-title")?.textContent ?? "");
  const detail = (f: UiVmFixture): string => String(f.nodes.get("gate-banner-lede")?.textContent ?? "");

  const makeFixture = async (statusFor: (n: number) => AnyRecord): Promise<UiVmFixture> => {
    let polls = 0;
    return createUiVmFixture(base, (url, init) => {
      if (!String(url).includes("/api/action")) { polls += 1; return uiJsonResponse(statusFor(polls)); }
      const body = JSON.parse(String((init as AnyRecord)?.body ?? "{}")) as AnyRecord;
      if (body.mode === "preview") {
        return uiJsonResponse({
          preview: true, outcome: "preview", evidence: "observed", ready: true, reasons: [],
          readinessRevision: (base.tx as AnyRecord).readinessRevision, frameHex: "f70b01190240110100b6ee",
        });
      }
      return uiJsonResponse(outcome);
    });
  };

  // The server confirms now: it watches the addressed device reach the value asked for and
  // answers the commit with the verdict. The page's job is to end at that verdict and never
  // to leave a send unnarrated.
  outcome = { outcome: "confirmed", confirmed: true, deviceConfirmed: true, attempts: 1, framesWritten: 1 };
  const seen = await makeFixture(() => base);
  await seen.flush();
  seen.click("light-1-on");
  await seen.flush();
  assert.equal(state(seen), "confirmed", "an observed requested state must end the send as confirmed");
  assert.match(title(seen), /확인했습니다/);
  assert.match(detail(seen), /조명 1/, "the banner must name what was sent");

  // 2. Nothing arriving must still end the send, and must not be called a failure.
  outcome = { outcome: "unconfirmed", confirmed: false, deviceConfirmed: false, attempts: 3, framesWritten: 3 };
  const unseen = await makeFixture(() => base);
  await unseen.flush();
  unseen.click("light-1-on");
  await unseen.flush();
  assert.equal(state(unseen), "unconfirmed", "a send that observes nothing must still end, as unconfirmed");
  assert.match(title(unseen), /관측하지 못했습니다/);
  assert.doesNotMatch(title(unseen), /실패|failed|failure/i, "the headline must not call an unobserved write a failure");
  assert.match(detail(unseen), /실패로 기록하지 않습니다/, "the page must say plainly that this is not recorded as a failure");
});

test("0.3.0 RED: a queued send is narrated and leaves every other control usable", async () => {
  // The banner lost its only producer when the client observation lease was removed. A send
  // still has a moment worth narrating, and the point of the queue is that the rest of the
  // page keeps working while it runs — including a second press of the same control.
  const status = uiStatusPayload();
  let resolveCommit!: (value: AnyRecord) => void;
  const commits: AnyRecord[] = [];
  const fixture = await createUiVmFixture(status, (url, init) => {
    if (!String(url).includes("/api/action")) return uiJsonResponse(status);
    const body = JSON.parse(String((init as AnyRecord)?.body ?? "{}")) as AnyRecord;
    commits.push(body);
    return commits.length === 1
      ? new Promise((resolve) => { resolveCommit = resolve; })
      : uiJsonResponse({ outcome: "confirmed", confirmed: true, deviceConfirmed: true, attempts: 1, framesWritten: 1 });
  });
  await fixture.flush();

  fixture.click("light-1-on");
  await fixture.flush();
  assert.equal(fixture.nodes.get("gate-banner")?.attributes?.["data-state"], "sending", "an outstanding send must be narrated");
  assert.match(fixture.nodes.get("outcome")?.textContent ?? "", /보내는 중/);

  // A different control and the same control must both still reach the server.
  assert.notEqual(fixture.nodes.get("light-2-on")?.disabled, true, "another control must stay usable during a send");
  fixture.click("light-2-on");
  fixture.click("light-1-off");
  await fixture.flush();
  assert.deepStrictEqual(
    commits.map((b) => [String(b.kind), b.target, String(b.state)]),
    [["light", 1, "on"], ["light", 2, "on"], ["light", 1, "off"]],
    "every press must reach the queue; coalescing is the server's job, not the page's",
  );

  resolveCommit(uiJsonResponse({ outcome: "confirmed", confirmed: true, deviceConfirmed: true, attempts: 1, framesWritten: 1 }));
  await fixture.flush();
  assert.equal(fixture.nodes.get("gate-banner")?.attributes?.["data-state"], "confirmed");
});

test("M4.9 RED: the RAW review sits under the banner and only appears when it is needed", async () => {
  const uiModule = await import(pathToFileURL(path(paths.uiSource)).href) as AnyRecord;
  const html = String(uiModule.renderAppHtml());
  // Catalog controls are one tap, so the review card is now the raw lab's three-step
  // flow alone. It still has to sit where the banner points, not below every card.
  assert.ok(
    html.indexOf('id="review"') < html.indexOf('id="light-1-on"'),
    "the review card must precede the controls, not trail them",
  );
  assert.match(html, /id="review"[^>]*data-active="false"/, "the review starts hidden");

  const status = uiStatusPayload();
  const fixture = await createUiVmFixture(status, (url, init) => {
    if (!String(url).includes("/api/action")) return uiJsonResponse(status);
    const body = JSON.parse(String((init as AnyRecord)?.body ?? "{}")) as AnyRecord;
    if (body.mode === "preview") {
      return uiJsonResponse({
        preview: true, outcome: "preview", evidence: "unsafe_candidate", ready: true, reasons: [],
        readinessRevision: (status.tx as AnyRecord).readinessRevision, frameHex: "f70b01180240110100b6ee",
      });
    }
    if (body.mode === "challenge") return uiJsonResponse({ id: "ch-3", expiresAtMs: 1_700_020_000 + 30_000, evidence: "unsafe_candidate" });
    return uiJsonResponse({ outcome: "socket_written_unconfirmed", deviceConfirmed: false });
  });
  await fixture.flush();
  assert.equal(fixture.nodes.get("review")?.attributes?.["data-active"], "false", "nothing to review yet");
  (fixture.nodes.get("raw-burst") as AnyRecord).value = "f70b01180240110100b6ee";
  fixture.click("raw-preview");
  await fixture.flush();
  assert.equal(
    fixture.nodes.get("review")?.attributes?.["data-active"],
    "true",
    "a raw burst awaiting its typed confirmation must reveal the review card",
  );
});
test("M4.8 RED: an observed entrance call takes over the banner and offers no open frame", async () => {
  const base = uiStatusPayload();
  const debug = base.debug as AnyRecord;
  const devices = debug.devices as AnyRecord;
  const ringing = {
    ...base,
    debug: {
      ...debug,
      devices: {
        ...devices,
        entrances: {
          household: (devices.entrances as AnyRecord).household,
          communal: { lastSeenAtMs: 1_700_020_000 - 25, generation: 9, stale: false, state: "ringing", evidence: "unsafe_candidate" },
        },
      },
    },
  };
  // The call has to be a transition: a page that opens onto a standing ringing state has
  // no event to announce, so the first status only establishes the baseline.
  const quiet = {
    ...base,
    debug: { ...debug, devices: { ...devices, entrances: { household: (devices.entrances as AnyRecord).household,
      communal: { lastSeenAtMs: 1_700_020_000 - 900, generation: 9, stale: false, state: "inactive", evidence: "unsafe_candidate" } } } },
  };
  let polls = 0;
  const fixture = await createUiVmFixture(quiet, () => { polls += 1; return uiJsonResponse(polls === 1 ? quiet : ringing); });
  await fixture.flush();
  assert.notEqual(fixture.nodes.get("gate-banner")?.attributes?.["data-state"], "doorbell", "a standing state is not an event");
  fixture.fireTimer();
  await fixture.flush();
  assert.equal(
    fixture.nodes.get("gate-banner")?.attributes?.["data-state"],
    "doorbell",
    "an observed call must take over the banner, ahead of the ready state",
  );
  assert.match(String(fixture.nodes.get("gate-banner-title")?.textContent ?? ""), /현관 호출/);
  assert.match(
    String(fixture.nodes.get("gate-banner-lede")?.textContent ?? ""),
    /공동 현관/,
    "the banner must name which entrance called",
  );
  // There is no observed open frame, so the banner must not offer one. Saying so is the
  // same contract gas open already carries.
  assert.match(
    String(fixture.nodes.get("gate-banner-fix")?.textContent ?? ""),
    /열기는 제공하지 않습니다/,
    "no open control may be offered for a frame that was never observed",
  );

  fixture.click("doorbell-dismiss");
  await fixture.flush();
  assert.notEqual(
    fixture.nodes.get("gate-banner")?.attributes?.["data-state"],
    "doorbell",
    "dismissing the alarm must return the banner to the transport state",
  );
});


test("M4.9 RED: the observation window is short enough to work between frames", async () => {
  const config = JSON.parse(readFileSync(new URL("../bestium-eco-foret/config.json", import.meta.url), "utf8")) as AnyRecord;
  const timeout = (config.options as AnyRecord).tx_observation_timeout_ms;
  assert.equal(
    typeof timeout === "number" && timeout <= 4_000,
    true,
    "state frames arrive about every 1.6 s, so a default longer than a few seconds only stalls the operator",
  );
  assert.equal(
    typeof timeout === "number" && timeout >= 1_000,
    true,
    "the window must still outlast one frame interval",
  );
});
