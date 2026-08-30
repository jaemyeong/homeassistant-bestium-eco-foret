import { OBSERVATION_TIMEOUT_MS } from "./tx-queue.ts";

export const DEFAULT_OPTIONS_PATH = "/data/options.json";

export type ParsedSettings = {
  ew11_host: string;
  ew11_port: number;
  connect_timeout_ms: number;
  idle_timeout_ms: number;
  capture_duration_ms: number;
  maximum_bytes: number;
  maximum_records: number;
  transmit_enabled: boolean;
  speculative_transmit_enabled: boolean;
  unsafe_transmit_enabled: boolean;
  transmit_user_id?: string;
  tx_write_timeout_ms: number;
  tx_observation_timeout_ms: number;
  tx_cooldown_ms: number;
  tx_quiet_ms: number;
  tx_max_attempts: number;
  speculative_tx_cooldown_ms: number;
  unsafe_tx_cooldown_ms: number;
};

export type BoundedStopReason =
  | "stopped"
  | "connect_timeout"
  | "duration"
  | "maximum_bytes"
  | "maximum_records"
  | "closed"
  | "error";

type ParseNumericResult = {
  key: keyof Pick<ParsedSettings,
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
};

export const DEFAULTS: Omit<ParsedSettings, "ew11_host" | "ew11_port" | "transmit_user_id"> = {
  connect_timeout_ms: 3000,
  idle_timeout_ms: 30_000,
  // Ten minutes, with the byte and record ceilings sized to hold what the bus carries in that
  // time so a capture ends on its duration rather than stopping early on a limit. 5,000 ms
  // closed the file after two polls of any one device. See `addon-defaults.test.ts`.
  capture_duration_ms: 600_000,
  maximum_bytes: 1_048_576,
  maximum_records: 20_000,
  transmit_enabled: false,
  speculative_transmit_enabled: false,
  unsafe_transmit_enabled: false,
  tx_write_timeout_ms: 1_000,
  // Two polls of the slowest device: a write lands, the next poll may still carry the old
  // state, and only the one after it reports the effect. 3,000 ms held exactly one 2,300 ms
  // heating poll, so that second poll fell outside and the frame went out again. See
  // `DEVICE_POLL_MS`.
  tx_observation_timeout_ms: OBSERVATION_TIMEOUT_MS,
  tx_cooldown_ms: 250,
  // 20 ms was shorter than the ~12 ms an eleven-byte frame occupies at 9600 baud plus any
  // margin, so a send could start into the wallpad's next frame. 60 ms was measured on the
  // live bus by the operator and removed the bulk of the losses.
  tx_quiet_ms: 60,
  tx_max_attempts: 3,
  speculative_tx_cooldown_ms: 1_000,
  unsafe_tx_cooldown_ms: 5_000,
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
    case "idle_timeout_ms":
      if (raw < 5_000 || raw > 3_600_000) {
        throw new TypeError("idle_timeout_ms must be in [5000,3600000]");
      }
      return raw;
    case "capture_duration_ms":
      if (raw < 100 || raw > 86_400_000) {
        throw new TypeError("capture_duration_ms must be in [100,86400000]");
      }
      return raw;
    case "maximum_bytes":
      if (raw < 1 || raw > 67_108_864) {
        throw new TypeError("maximum_bytes must be in [1,67108864]");
      }
      return raw;
    case "maximum_records":
      if (raw < 1 || raw > 1_000_000) {
        throw new TypeError("maximum_records must be in [1,1000000]");
      }
      return raw;
    case "tx_write_timeout_ms":
      if (raw < 100 || raw > 10_000) throw new TypeError("tx_write_timeout_ms must be in [100,10000]");
      return raw;
    case "tx_observation_timeout_ms":
      if (raw < 1_000 || raw > 30_000) throw new TypeError("tx_observation_timeout_ms must be in [1000,30000]");
      return raw;
    case "tx_cooldown_ms":
      if (raw < 0 || raw > 10_000) throw new TypeError("tx_cooldown_ms must be in [0,10000]");
      return raw;
    case "tx_max_attempts":
      if (raw < 1 || raw > 10) throw new TypeError("tx_max_attempts must be in [1,10]");
      return raw;
    case "tx_quiet_ms":
      if (raw < 5 || raw > 1_000) throw new TypeError("tx_quiet_ms must be in [5,1000]");
      return raw;
    case "speculative_tx_cooldown_ms":
      if (raw < 1_000 || raw > 60_000) throw new TypeError("speculative_tx_cooldown_ms must be in [1000,60000]");
      return raw;
    case "unsafe_tx_cooldown_ms":
      if (raw < 1_000 || raw > 60_000) throw new TypeError("unsafe_tx_cooldown_ms must be in [1000,60000]");
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
  const idle_timeout_ms = readNumeric("idle_timeout_ms");
  const capture_duration_ms = readNumeric("capture_duration_ms");
  const maximum_bytes = readNumeric("maximum_bytes");
  const maximum_records = readNumeric("maximum_records");
  const parseFlag = (key: "transmit_enabled" | "speculative_transmit_enabled" | "unsafe_transmit_enabled"): boolean => {
    const value = Object.prototype.hasOwnProperty.call(rawRecord, key) ? rawRecord[key] : DEFAULTS[key];
    if (typeof value !== "boolean") throw new TypeError(`${key} must be a boolean`);
    return value;
  };
  const transmit_enabled = parseFlag("transmit_enabled");
  const speculative_transmit_enabled = parseFlag("speculative_transmit_enabled");
  const unsafe_transmit_enabled = parseFlag("unsafe_transmit_enabled");
  const transmit_user_id = rawRecord.transmit_user_id;
  if (transmit_user_id !== undefined && (typeof transmit_user_id !== "string" || transmit_user_id.length < 1 || transmit_user_id.length > 128)) {
    throw new TypeError("transmit_user_id must be a non-empty string of at most 128 characters");
  }
  const effectiveTransmitEnabled = transmit_user_id === undefined ? false : transmit_enabled;
  const effectiveSpeculativeTransmitEnabled = transmit_user_id === undefined ? false : speculative_transmit_enabled;
  const effectiveUnsafeTransmitEnabled = transmit_user_id === undefined ? false : unsafe_transmit_enabled;
  const tx_write_timeout_ms = readNumeric("tx_write_timeout_ms");
  const tx_observation_timeout_ms = readNumeric("tx_observation_timeout_ms");
  const tx_cooldown_ms = readNumeric("tx_cooldown_ms");
  const tx_quiet_ms = readNumeric("tx_quiet_ms");
  const tx_max_attempts = readNumeric("tx_max_attempts");
  const speculative_tx_cooldown_ms = readNumeric("speculative_tx_cooldown_ms");
  const unsafe_tx_cooldown_ms = readNumeric("unsafe_tx_cooldown_ms");

  return {
    ew11_host,
    ew11_port,
    connect_timeout_ms,
    idle_timeout_ms,
    capture_duration_ms,
    maximum_bytes,
    maximum_records,
    transmit_enabled: effectiveTransmitEnabled,
    speculative_transmit_enabled: effectiveSpeculativeTransmitEnabled,
    unsafe_transmit_enabled: effectiveUnsafeTransmitEnabled,
    ...(transmit_user_id === undefined ? {} : { transmit_user_id }),
    tx_write_timeout_ms,
    tx_observation_timeout_ms,
    tx_cooldown_ms,
    tx_quiet_ms,
    tx_max_attempts,
    speculative_tx_cooldown_ms,
    unsafe_tx_cooldown_ms,
  };
}
