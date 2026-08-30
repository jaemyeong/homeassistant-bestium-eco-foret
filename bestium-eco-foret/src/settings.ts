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

  const rawTransmitEnabled = Object.prototype.hasOwnProperty.call(rawRecord, "transmit_enabled")
    ? rawRecord.transmit_enabled
    : DEFAULTS.transmit_enabled;
  if (typeof rawTransmitEnabled !== "boolean") throw new TypeError("transmit_enabled must be a boolean");

  const transmit_user_id = rawRecord.transmit_user_id;
  if (transmit_user_id !== undefined && (typeof transmit_user_id !== "string" || transmit_user_id.length < 1 || transmit_user_id.length > 128)) {
    throw new TypeError("transmit_user_id must be a non-empty string of at most 128 characters");
  }

  // Everything except the four values above comes from `DEFAULTS` and never from the saved
  // options, which is the point rather than a shortcut. The 구성 panel used to offer the
  // timings, and Supervisor merges an add-on's defaults *under* whatever the operator saved
  // with the saved side winning — so shipping a better number never reached an install whose
  // form had ever been submitted. One such install kept `tx_observation_timeout_ms: 3000`,
  // which holds a single 2,300 ms heating poll: the write landed, the poll that would have
  // shown the effect fell outside the window, and the page reported a command the device had
  // obeyed as unconfirmed and sent it again 250 ms later. The keys are gone from the schema
  // and ignored here, so a stored value is inert rather than authoritative.
  return {
    ...DEFAULTS,
    ew11_host,
    ew11_port,
    // Sending is addressed to a named operator: the ingress compares the caller against this
    // id and refuses when they differ, so without one the master switch stays off however it
    // was saved.
    transmit_enabled: transmit_user_id === undefined ? false : rawTransmitEnabled,
    ...(transmit_user_id === undefined ? {} : { transmit_user_id }),
  };
}
