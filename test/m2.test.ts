import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url);
const APP_FOLDER = "bestium-eco-foret";
const EXPECTED_VERSION = "0.1.0";
const appRoot = new URL(`${APP_FOLDER}/`, root);
const layoutPaths = {
  repository: new URL("repository.yaml", root),
  appRoot,
  config: new URL("config.json", appRoot),
  dockerfile: new URL("Dockerfile", appRoot),
  dockerIgnore: new URL(".dockerignore", appRoot),
  package: new URL("package.json", appRoot),
  captureSource: new URL("src/capture.ts", appRoot),
  settingsSource: new URL("src/settings.ts", appRoot),
  m2Source: new URL("src/m2.ts", appRoot),
};
const paths = {
  config: layoutPaths.config,
  dockerfile: layoutPaths.dockerfile,
  dockerIgnore: layoutPaths.dockerIgnore,
  captureSource: layoutPaths.captureSource,
  settingsSource: layoutPaths.settingsSource,
  m2Source: layoutPaths.m2Source,
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
  "options",
  "schema",
] as const;
const CONFIG_STRING_KEYS = ["name", "slug", "description"] as const;
const CONFIG_OPTION_DEFAULT_KEYS = [
  "connect_timeout_ms",
  "capture_duration_ms",
  "maximum_bytes",
  "maximum_records",
] as const;
const CONFIG_SCHEMA_KEYS = [
  "ew11_host",
  "ew11_port",
  "connect_timeout_ms",
  "capture_duration_ms",
  "maximum_bytes",
  "maximum_records",
] as const;
const REQUIRED_RUNTIME_INPUT_KEYS = ["ew11_host", "ew11_port"] as const;
const EXACT_ARCH = ["aarch64", "amd64"] as const;
const DOCKERFILE_COPY_ALLOWLIST = [
  "package.json",
  "src/capture.ts",
  "src/settings.ts",
  "src/m2.ts",
] as const;
const DOCKERIGNORE_INCLUDES = [
  "!package.json",
  "!src/",
  "!src/capture.ts",
  "!src/settings.ts",
  "!src/m2.ts",
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
  destroy(): void;
  emit(event: string, ...args: unknown[]): void;
  listenerCount(): number;
  isDestroyed(): boolean;
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
  setHeader(name: string, value: string): FakeRes;
  writeHead(code: number): void;
  end(chunk?: string): void;
};

const COORDINATOR_RECORD_TS = 1_700_000_000;

type CaptureRecord = { sequence: number; receivedAtMs: number; byteLength: number; hex: string };
type CoordinatorResult = {
  reason: string;
  byteCount: number;
  recordCount: number;
  stoppedAtMs: number;
  records?: CaptureRecord[];
};
type RuntimeCoordinator = {
  start(): Promise<void>;
  stop(): Promise<CoordinatorResult>;
  getState(): { state: "running" | "stopped"; lastResult?: CoordinatorResult };
};
type M2Settings = {
  ew11_host: string;
  ew11_port: number;
  connect_timeout_ms: number;
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
  }): RuntimeCoordinator;
  normalizeIngressPeer(remoteAddress: string | undefined): string | null;
  createIngressHandler(deps: {
    getState(): { state: "running" | "stopped"; lastResult?: CoordinatorResult };
    startCapture(): Promise<void>;
    stopCapture(): Promise<CoordinatorResult>;
  }): (req: FakeReq, res: FakeRes) => Promise<void> | void;
  startM2Runtime(opts: {
    readOptions(path: string): Promise<unknown>;
    createTransport(input: { host: string; port: number }): FakeTransport;
    createServer(
      handler: (req: FakeReq, res: FakeRes) => Promise<void> | void,
    ): { listen(port: number, cb?: () => void): void; close(): void };
  }): Promise<{
    requestHandler(req: FakeReq, res: FakeRes): Promise<void> | void;
    stop(): Promise<void>;
  }>;
};

type NumericBound = {
  name: keyof Pick<
    M2Settings,
    "connect_timeout_ms" | "capture_duration_ms" | "maximum_bytes" | "maximum_records"
  >;
  min: number;
  max: number;
};

const numericBounds: readonly NumericBound[] = [
  { name: "connect_timeout_ms", min: 100, max: 30_000 },
  { name: "capture_duration_ms", min: 100, max: 300_000 },
  { name: "maximum_bytes", min: 1, max: 1_048_576 },
  { name: "maximum_records", min: 1, max: 10_000 },
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

function createFakeTransport(): FakeTransport {
  const listeners = new Map<string, Set<Listener>>();
  let destroyed = false;
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
    destroy() {
      destroyed = true;
    },
    emit(event, ...args: unknown[]) {
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
  };
}

function createFakeTimer(): FakeTimer {
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
      const id = nextId++;
      pending.set(id, { due: now + delayMs, cb });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id as number);
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
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(chunk) {
      if (typeof chunk === "string") chunks.push(chunk);
      this.body = chunks.join("");
    },
  };
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
    "src/settings.ts": layoutPaths.settingsSource,
    "src/m2.ts": layoutPaths.m2Source,
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

test("RED: required M2 artifacts must exist", () => {
  requireFile(paths.config, "config.json");
  requireFile(paths.dockerfile, "Dockerfile");
  requireFile(paths.dockerIgnore, ".dockerignore");
  requireFile(paths.captureSource, "src/capture.ts");
  requireFile(paths.settingsSource, "src/settings.ts");
  requireFile(paths.m2Source, "src/m2.ts");
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

  if (!Array.isArray(config.arch)) throw new TypeError("config.arch must be array");
  assert.equal(config.arch.length, 2);
  assertExactSet(config.arch as string[], EXACT_ARCH, "config.arch");

  const options = parseJson<AnyRecord>(JSON.stringify(config.options));
  assertExactSet(Object.keys(options), CONFIG_OPTION_DEFAULT_KEYS, "config.options defaults");
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
  assert.equal(schema.capture_duration_ms, "int(100,300000)");
  assert.equal(schema.maximum_bytes, "int(1,1048576)");
  assert.equal(schema.maximum_records, "int(1,10000)");
});

test("RED: Dockerfile allowlist and pinned production constraints", () => {
  const dockerfile = readText(paths.dockerfile, "Dockerfile");
  assert.match(dockerfile, /^FROM\s+node:24\.19\.0-bookworm-slim/im);
  assert.match(dockerfile, /^LABEL\b/im);
  const versionLabel = /^LABEL\s+io\.hass\.version\s*=\s*["']([^"']+)["']\s*$/im.exec(dockerfile);
  assert.ok(versionLabel, "Dockerfile must declare io.hass.version");
  assert.equal(versionLabel[1], EXPECTED_VERSION);
  assert.match(dockerfile, /io\.hass\.type\s*=\s*["']app["']/i);
  assert.match(dockerfile, /io\.hass\.arch\s*=\s*["']aarch64\|amd64["']/i);
  assert.match(dockerfile, /^\s*USER\s+node/im);
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
      expect: { reason: "connect_timeout", byteCount: 0, recordCount: 0, records: [] as CaptureRecord[] },
    },
    {
      name: "duration",
      settings: base,
      trigger(transport: FakeTransport, timer: FakeTimer) {
        transport.emit("connect");
        timer.advance(base.capture_duration_ms + 1);
      },
      expect: { reason: "duration", byteCount: 0, recordCount: 0, records: [] as CaptureRecord[] },
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
        records: [
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
        records: [
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
      expect: { reason: "closed", byteCount: 0, recordCount: 0, records: [] as CaptureRecord[] },
    },
    {
      name: "error",
      settings: base,
      trigger(transport: FakeTransport) {
        transport.emit("connect");
        transport.emit("error", new Error("boom"));
      },
      expect: { reason: "error", byteCount: 0, recordCount: 0, records: [] as CaptureRecord[] },
    },
  ] as const;

  for (const tc of cases) {
    const transport = createFakeTransport();
    const timer = createFakeTimer();
    const coordinator = makeCoordinator({
      settings: tc.settings,
      createTransport: () => transport,
      nowMs: timer.nowMs,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
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
    assert.ok(Array.isArray(result.records), `${tc.name} must return records`);
    assert.deepStrictEqual(result.records, tc.expect.records);
    assert.equal(transport.isDestroyed(), true);
    assert.equal(transport.listenerCount(), 0);
    assert.equal(timer.pendingCount(), 0);
  }
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
  assert.equal(firstResult.records?.[0]?.sequence, 0);
  assert.equal(firstTransport.isDestroyed(), true);
  assert.equal(firstTransport.listenerCount(), 0);
  assert.equal(timer.pendingCount(), 0);

  await coordinator.start();
  secondTransport.emit("connect");
  secondTransport.emit("data", new Uint8Array([0x02]));
  const secondResult = await coordinator.stop();
  assert.equal(secondResult.records?.[0]?.sequence, 0);
  assert.equal(secondTransport.isDestroyed(), true);
  assert.equal(secondTransport.listenerCount(), 0);
  assert.equal(timer.pendingCount(), 0);
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
  const state: { state: "running" | "stopped"; lastResult: CoordinatorResult } = {
    state: "stopped",
    lastResult: {
      reason: "idle",
      byteCount: 0,
      recordCount: 0,
      stoppedAtMs: 1,
    } as CoordinatorResult,
  };
  const handler = m2.createIngressHandler({
    getState: () => ({ state: state.state, lastResult: state.lastResult }),
    async startCapture() {
      state.state = "running";
    },
    async stopCapture() {
      state.state = "stopped";
      const stopped: CoordinatorResult = {
        reason: "closed",
        byteCount: 1,
        recordCount: 1,
        stoppedAtMs: 1,
        records: [{ sequence: 0, receivedAtMs: COORDINATOR_RECORD_TS, byteLength: 1, hex: "aa" }],
      };
      state.lastResult = stopped;
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
  assert.ok(/current|state|last/.test(home.body.toLowerCase()));

  const stop = createRes();
  await handler(createReq({ socket: { remoteAddress: "::ffff:172.30.32.2" }, method: "POST", url: "/api/stop" }), stop);
  assert.equal(stop.statusCode, 200);
  assert.equal(state.state, "stopped");
});

test("RED: ingress dependency failures return bounded 500 responses", async () => {
  const m2 = await importM2();
  const handler = m2.createIngressHandler({
    getState: () => ({ state: "stopped" as const }),
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
