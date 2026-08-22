import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url);
const APP_FOLDER = "bestium-eco-foret";
const EXPECTED_VERSION = "0.1.3";
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
] as const;
const CONFIG_SCHEMA_KEYS = [
  "ew11_host",
  "ew11_port",
  "connect_timeout_ms",
  "idle_timeout_ms",
  "capture_duration_ms",
  "maximum_bytes",
  "maximum_records",
] as const;
const REQUIRED_RUNTIME_INPUT_KEYS = ["ew11_host", "ew11_port"] as const;
const EXACT_ARCH = ["aarch64", "amd64"] as const;
const DOCKERFILE_COPY_ALLOWLIST = [
  "package.json",
  "src/capture.ts",
  "src/capture-store.ts",
  "src/settings.ts",
  "src/m2.ts",
  "src/ui.ts",
] as const;
const DOCKERIGNORE_INCLUDES = [
  "!package.json",
  "!src/",
  "!src/capture.ts",
  "!src/capture-store.ts",
  "!src/settings.ts",
  "!src/m2.ts",
  "!src/ui.ts",
] as const;
const DOCKERIGNORE_FORBIDDEN = [".env", ".env*", ".git", ".agent", ".codex", ".serena", ".codegraph", "graphify-out"] as const;
const EXPECTED_REPOSITORY_LINES = [
  "name: BESTIUM Eco-Foret Home Assistant App",
  "url: https://github.com/jaemyeong/homeassistant-bestium-eco-foret",
  "maintainer: jaemyeong",
] as const;

type AnyRecord = Record<string, unknown>;
type Listener = (...args: unknown[]) => unknown;
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
  assert.equal(config.boot, "manual_only");
  assert.equal(config.stage, "experimental");
  assert.equal(config.panel_admin, true);
  assert.equal(config.ingress, true);
  assert.equal(config.ingress_port, 8099);
  assert.equal(config.panel_icon, "mdi:radio-tower");
  assert.equal(config.panel_title, "BESTIUM Capture");

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
  });
  for (const key of CONFIG_OPTION_DEFAULT_KEYS) {
    assert.equal(typeof options[key], "number");
    assert.equal(Number.isSafeInteger(options[key]), true);
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

  assert.deepStrictEqual(parse({ ew11_host: "gateway-1", ew11_port: 9001 }), {
    ew11_host: "gateway-1",
    ew11_port: 9001,
    connect_timeout_ms: 3_000,
    idle_timeout_ms: 30_000,
    capture_duration_ms: 5_000,
    maximum_bytes: 65_536,
    maximum_records: 1_000,
  });

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

  const startCapture = createRes();
  await app.requestHandler(
    createReq({ socket: { remoteAddress: "::ffff:172.30.32.2" }, method: "POST", url: "/api/capture" }),
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
  assert.deepStrictEqual(start.summary.bounds, bounds);
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
  const capture = createRes();
  await normal.requestHandler(
    createReq({ socket: { remoteAddress: "172.30.32.2" }, method: "POST", url: "/api/capture" }),
    capture,
  );
  transport.emit("connect");
  transport.emit("data", new Uint8Array([0xaa]));
  const stop = createRes();
  await normal.requestHandler(
    createReq({ socket: { remoteAddress: "172.30.32.2" }, method: "POST", url: "/api/stop" }),
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
  assert.match(ui, /startButton\.disabled[\s\S]{0,180}phase/);
  assert.match(ui, /stopButton\.disabled[\s\S]{0,180}phase/);
  assert.match(ui, /Idle timeout/);
  assert.match(ui, /id="idle-timeout"/);
  assert.match(ui, /configured\.idle_timeout_ms/);
  assert.doesNotMatch(ui, /const running = source\.state === [\\"']running[\\"']/);
});
