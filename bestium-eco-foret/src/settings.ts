export const DEFAULT_OPTIONS_PATH = "/data/options.json";

export type ParsedSettings = {
  ew11_host: string;
  ew11_port: number;
  connect_timeout_ms: number;
  capture_duration_ms: number;
  maximum_bytes: number;
  maximum_records: number;
};

export type BoundedStopReason =
  | "connect_timeout"
  | "duration"
  | "maximum_bytes"
  | "maximum_records"
  | "closed"
  | "error";

type ParseNumericResult = {
  key: keyof Omit<ParsedSettings, "ew11_host" | "ew11_port">;
};

const DEFAULTS: Omit<ParsedSettings, "ew11_host" | "ew11_port"> = {
  connect_timeout_ms: 3000,
  capture_duration_ms: 5000,
  maximum_bytes: 65_536,
  maximum_records: 1_000,
};

function parseHost(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new TypeError("ew11_host must be a string");
  }

  const host = raw.trim();
  if (host.length < 1 || host.length > 253) {
    throw new TypeError("ew11_host must be between 1 and 253 characters after trim");
  }
  if (/\s/.test(host)) {
    throw new TypeError("ew11_host must not contain whitespace");
  }
  if (/[\\\/]/.test(host)) {
    throw new TypeError("ew11_host must not contain path separators");
  }
  if (host.includes("://")) {
    throw new TypeError("ew11_host must not be URL-like");
  }
  for (const char of host) {
    const code = char.codePointAt(0);
    if (code !== undefined && (code <= 0x1f || code === 0x7f)) {
      throw new TypeError("ew11_host must not contain control characters");
    }
  }
  return host;
}

function parsePort(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw)) {
    throw new TypeError("ew11_port must be a safe integer");
  }
  if (raw < 1 || raw > 65_535) {
    throw new TypeError("ew11_port must be in [1,65535]");
  }
  return raw;
}

function parseNumeric(key: ParseNumericResult["key"], raw: unknown): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw)) {
    throw new TypeError(`${key} must be a safe integer`);
  }
  if (raw < 0) {
    throw new TypeError(`${key} must be a non-negative integer`);
  }

  switch (key) {
    case "connect_timeout_ms":
      if (raw < 100 || raw > 30_000) {
        throw new TypeError("connect_timeout_ms must be in [100,30000]");
      }
      return raw;
    case "capture_duration_ms":
      if (raw < 100 || raw > 300_000) {
        throw new TypeError("capture_duration_ms must be in [100,300000]");
      }
      return raw;
    case "maximum_bytes":
      if (raw < 1 || raw > 1_048_576) {
        throw new TypeError("maximum_bytes must be in [1,1048576]");
      }
      return raw;
    case "maximum_records":
      if (raw < 1 || raw > 10_000) {
        throw new TypeError("maximum_records must be in [1,10000]");
      }
      return raw;
    default:
      throw new TypeError(`Unsupported numeric setting: ${key}`);
  }
}

export function parseM2Settings(raw: unknown): ParsedSettings {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    throw new TypeError("settings must be an object");
  }

  if (Array.isArray(raw)) {
    throw new TypeError("settings must be an object");
  }

  const rawRecord = raw as Record<string, unknown>;

  const ew11_host = parseHost(rawRecord.ew11_host);
  const ew11_port = parsePort(rawRecord.ew11_port);

  const readNumeric = (key: ParseNumericResult["key"]): number => {
    if (Object.prototype.hasOwnProperty.call(rawRecord, key)) {
      return parseNumeric(key, rawRecord[key]);
    }
    return parseNumeric(key, DEFAULTS[key]);
  };

  const connect_timeout_ms = readNumeric("connect_timeout_ms");
  const capture_duration_ms = readNumeric("capture_duration_ms");
  const maximum_bytes = readNumeric("maximum_bytes");
  const maximum_records = readNumeric("maximum_records");

  return {
    ew11_host,
    ew11_port,
    connect_timeout_ms,
    capture_duration_ms,
    maximum_bytes,
    maximum_records,
  };
}
