/**
 * MQTT 3.1.1, hand-rolled, in three layers: codec, client, bridge.
 *
 * Hand-rolled because the image forbids a package manager and the two alternatives are worse.
 * Vendoring the one maintained zero-dependency client would put twenty-odd files under a path
 * `addon-image.test.ts`'s closure walker cannot see, so the coverage assertion would pass while
 * covering none of them — the exact green-suite-dead-add-on failure that killed 0.3.0. Taking
 * `mqtt` from npm would put sixteen transitive dependencies on a bus that can close a gas valve.
 * See `.agent/plan-mqtt-bridge.md` §5.2 for the full ranking.
 *
 * One file rather than three because each new module costs four coordinated edits: the Dockerfile
 * COPY, the `.dockerignore` re-include, and two allowlists in `test/m2.test.ts`.
 *
 * No `enum` anywhere in here. Node runs these files by type-stripping, and an enum — the most
 * natural thing to reach for in a packet codec — throws ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX at
 * import, which would take the whole add-on down rather than just this feature.
 */

// ── Codec ────────────────────────────────────────────────────────────────────────────────────

/** Control packet types, MQTT 3.1.1 §2.2.1. The value is the high nibble of byte one. */
export const PACKET = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  PUBACK: 4,
  SUBSCRIBE: 8,
  SUBACK: 9,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14,
} as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * The remaining-length field: seven bits per byte, high bit continues. §2.2.3.
 *
 * The four boundaries — 127, 16,383, 2,097,151, 268,435,455 — are where an off-by-one lands, and
 * a wrong length is not a parse error: it silently swallows the next packet's header.
 */
export function encodeLength(value: number): Uint8Array {
  const out: number[] = [];
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) byte |= 0x80;
    out.push(byte);
  } while (remaining > 0);
  return Uint8Array.from(out);
}

/**
 * `null` when the buffer ends mid-field, which is ordinary TCP segmentation rather than an error.
 * Throwing here would kill a healthy socket; the reader waits for more bytes instead.
 */
export function decodeLength(buffer: Uint8Array, offset: number): { value: number; bytes: number } | null {
  let multiplier = 1;
  let value = 0;
  let bytes = 0;
  for (;;) {
    if (offset + bytes >= buffer.length) return null;
    const byte = buffer[offset + bytes]!;
    bytes += 1;
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) return { value, bytes };
    if (bytes > 4) throw new Error("malformed remaining length");
    multiplier *= 128;
  }
}

/** A UTF-8 string with its two-byte **byte** length. The device name is Korean; characters lie. */
function encodeString(value: string): Uint8Array {
  const bytes = encoder.encode(value);
  const out = new Uint8Array(2 + bytes.length);
  out[0] = (bytes.length >> 8) & 0xff;
  out[1] = bytes.length & 0xff;
  out.set(bytes, 2);
  return out;
}

function packet(type: number, flags: number, body: Uint8Array): Uint8Array {
  return concat([Uint8Array.from([(type << 4) | flags]), encodeLength(body.length), body]);
}

export type ConnectOptions = {
  clientId: string;
  keepAliveSeconds: number;
  username?: string;
  password?: string;
  will: { topic: string; payload: string; retain: boolean };
};

export function encodeConnect(options: ConnectOptions): Uint8Array {
  // Presence, not truthiness. `username ?? ""` sets the flag and sends an empty string, which is
  // not what an anonymous broker expects, and an empty password is still a password.
  const hasUsername = options.username !== undefined;
  const hasPassword = options.password !== undefined;
  const flags =
    (hasUsername ? 0x80 : 0)
    | (hasPassword ? 0x40 : 0)
    | (options.will.retain ? 0x20 : 0)
    | 0x04                                   // will flag; QoS 0, so no bits 3-4
    | 0x02;                                  // clean session: no offline queue, so no replay
  const keepAlive = Uint8Array.from([(options.keepAliveSeconds >> 8) & 0xff, options.keepAliveSeconds & 0xff]);
  return packet(PACKET.CONNECT, 0, concat([
    encodeString("MQTT"),
    Uint8Array.from([4]),                    // protocol level 4 is 3.1.1
    Uint8Array.from([flags]),
    keepAlive,
    encodeString(options.clientId),
    // The will lives in the CONNECT payload and cannot be added afterwards. Without it a crash
    // leaves the retained `online` standing and every entity reads available and current.
    encodeString(options.will.topic),
    encodeString(options.will.payload),
    ...(hasUsername ? [encodeString(options.username!)] : []),
    ...(hasPassword ? [encodeString(options.password!)] : []),
  ]));
}

export function encodePublish(
  topic: string,
  payload: string,
  options: { retain: boolean; qos: 0 | 1; packetId?: number },
): Uint8Array {
  const flags = (options.qos << 1) | (options.retain ? 1 : 0);
  const id = options.qos > 0 && options.packetId !== undefined
    ? [Uint8Array.from([(options.packetId >> 8) & 0xff, options.packetId & 0xff])]
    : [];
  return packet(PACKET.PUBLISH, flags, concat([encodeString(topic), ...id, encoder.encode(payload)]));
}

export function encodeSubscribe(packetId: number, filters: Array<{ filter: string; qos: 0 | 1 }>): Uint8Array {
  const body = filters.flatMap((entry) => [encodeString(entry.filter), Uint8Array.from([entry.qos])]);
  // Flags 0010 are reserved and a broker must reject anything else. §3.8.1.
  return packet(PACKET.SUBSCRIBE, 0x02, concat([
    Uint8Array.from([(packetId >> 8) & 0xff, packetId & 0xff]),
    ...body,
  ]));
}

function encodePuback(packetId: number): Uint8Array {
  return packet(PACKET.PUBACK, 0, Uint8Array.from([(packetId >> 8) & 0xff, packetId & 0xff]));
}

export function encodePingreq(): Uint8Array {
  return packet(PACKET.PINGREQ, 0, new Uint8Array());
}

export function encodeDisconnect(): Uint8Array {
  return packet(PACKET.DISCONNECT, 0, new Uint8Array());
}

export type ParsedPacket = {
  type: number;
  consumed: number;
  topic?: string;
  payload?: string;
  retain?: boolean;
  qos?: number;
  packetId?: number;
  returnCode?: number;
};

/** One packet from `offset`, or `null` when the buffer does not yet hold a whole one. */
export function parsePacket(buffer: Uint8Array, offset: number): ParsedPacket | null {
  if (offset >= buffer.length) return null;
  const header = buffer[offset]!;
  const length = decodeLength(buffer, offset + 1);
  if (length === null) return null;
  const bodyAt = offset + 1 + length.bytes;
  const end = bodyAt + length.value;
  if (end > buffer.length) return null;

  const type = header >> 4;
  const base: ParsedPacket = { type, consumed: end - offset };

  if (type === PACKET.PUBLISH) {
    const qos = (header >> 1) & 0x03;
    const topicLength = (buffer[bodyAt]! << 8) | buffer[bodyAt + 1]!;
    let cursor = bodyAt + 2 + topicLength;
    const topic = decoder.decode(buffer.subarray(bodyAt + 2, cursor));
    let packetId: number | undefined;
    if (qos > 0) {
      packetId = (buffer[cursor]! << 8) | buffer[cursor + 1]!;
      cursor += 2;
    }
    return {
      ...base,
      topic,
      payload: decoder.decode(buffer.subarray(cursor, end)),
      // Set by a broker only when it replays a stored message to a new subscription, and it must
      // clear the bit on a live forward. That is what makes the dispatcher's retain guard exact.
      retain: (header & 0x01) !== 0,
      qos,
      ...(packetId === undefined ? {} : { packetId }),
    };
  }
  if (type === PACKET.CONNACK) return { ...base, returnCode: buffer[bodyAt + 1] ?? 0 };
  if (type === PACKET.PUBACK) return { ...base, packetId: (buffer[bodyAt]! << 8) | buffer[bodyAt + 1]! };
  return base;
}

export { encodePuback };

import { connect as connectTcp } from "node:net";

// ── Client ───────────────────────────────────────────────────────────────────────────────────

export type SocketLike = {
  write(chunk: Uint8Array): boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  destroy(): void;
  setNoDelay?(value: boolean): unknown;
};

const KEEP_ALIVE_SECONDS = 60;
/** Ping at half the keep-alive, and treat a ping that goes unanswered for as long again as dead. */
const PING_INTERVAL_MS = (KEEP_ALIVE_SECONDS / 2) * 1_000;
const RECONNECT_MS = 5_000;
/** Refetching credentials forever against a persistently wrong password is a Supervisor API poll. */
const MAX_CREDENTIAL_REFETCHES = 5;

export type MqttClientOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  clientId: string;
  will: { topic: string; payload: string; retain: boolean };
  createSocket(input: { host: string; port: number }): SocketLike;
  nowMs(): number;
  setTimeout(fn: () => void, delayMs: number): unknown;
  clearTimeout(id: unknown): void;
  onMessage(topic: string, payload: string, retain: boolean): void;
  onConnected(): void;
  onFatal(reason: string): void;
  onCredentialsRejected?(): Promise<{ username?: string; password?: string } | null>;
  log(line: string): void;
};

export function createMqttClient(options: MqttClientOptions) {
  let socket: SocketLike | null = null;
  let carry = new Uint8Array();
  let connected = false;
  let stopped = false;
  let pingTimer: unknown = null;
  let pingWatchdog: unknown = null;
  let reconnectTimer: unknown = null;
  let packetId = 1;
  let credentialRefetches = 0;
  let username = options.username;
  let password = options.password;

  const clearTimer = (id: unknown): null => { if (id !== null) options.clearTimeout(id); return null; };

  const write = (frame: Uint8Array): void => {
    if (!socket) return;
    try {
      socket.write(frame);
    } catch (error) {
      options.log(`write failed: ${String(error)}`);
      dropSocket();
    }
  };

  function dropSocket(): void {
    pingTimer = clearTimer(pingTimer);
    pingWatchdog = clearTimer(pingWatchdog);
    connected = false;
    carry = new Uint8Array();
    const doomed = socket;
    socket = null;
    try { doomed?.destroy(); } catch { /* a socket that will not close is already gone */ }
    scheduleReconnect();
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer !== null) return;
    reconnectTimer = options.setTimeout(() => { reconnectTimer = null; connect(); }, RECONNECT_MS);
  }

  function schedulePing(): void {
    pingTimer = options.setTimeout(() => {
      write(encodePingreq());
      // The watchdog is the only thing that notices a half-open socket. Node emits neither
      // `close` nor `error` when a NAT reaps the path or the host sleeps, so without this the
      // bridge publishes into the void while Home Assistant holds the retained tree and shows
      // every entity available and current, for as long as nobody looks.
      if (pingWatchdog === null) {
        pingWatchdog = options.setTimeout(() => {
          options.log("no PINGRESP within the keep-alive; the socket is half-open");
          dropSocket();
        }, PING_INTERVAL_MS);
      }
      schedulePing();
    }, PING_INTERVAL_MS);
  }

  function handle(parsed: ParsedPacket): void {
    if (parsed.type === PACKET.CONNACK) {
      const code = parsed.returnCode ?? 0;
      if (code === 0) {
        connected = true;
        credentialRefetches = 0;
        schedulePing();
        options.onConnected();
        return;
      }
      // 1 and 2 cannot succeed by retrying: neither the protocol level nor the client id changes
      // between attempts, so retrying is a log spinner rather than a recovery.
      if (code === 1 || code === 2) {
        stopped = true;
        options.onFatal(code === 1 ? "broker refused protocol level 4" : "broker rejected the client id");
        dropSocket();
        return;
      }
      if ((code === 4 || code === 5) && options.onCredentialsRejected) {
        if (credentialRefetches >= MAX_CREDENTIAL_REFETCHES) {
          options.log("credentials refused repeatedly; falling back to the reconnect timer");
          dropSocket();
          return;
        }
        credentialRefetches += 1;
        // Mosquitto regenerates its add-on account when reinstalled, so the password we hold can
        // simply be stale. One refetch is the whole recovery.
        void options.onCredentialsRejected().then((fresh) => {
          if (fresh) { username = fresh.username; password = fresh.password; }
          dropSocket();
        }, () => { dropSocket(); });
        return;
      }
      options.log(`broker refused the connection with code ${code}`);
      dropSocket();
      return;
    }
    if (parsed.type === PACKET.PINGRESP) {
      pingWatchdog = clearTimer(pingWatchdog);
      return;
    }
    if (parsed.type === PACKET.PUBLISH) {
      if (parsed.qos === 1 && parsed.packetId !== undefined) write(encodePuback(parsed.packetId));
      options.onMessage(parsed.topic ?? "", parsed.payload ?? "", parsed.retain === true);
    }
  }

  function onData(chunk: Uint8Array): void {
    const combined = new Uint8Array(carry.length + chunk.length);
    combined.set(carry);
    combined.set(chunk, carry.length);
    let offset = 0;
    for (;;) {
      let parsed: ParsedPacket | null;
      try {
        parsed = parsePacket(combined, offset);
      } catch (error) {
        options.log(`malformed packet: ${String(error)}`);
        dropSocket();
        return;
      }
      if (parsed === null) break;
      offset += parsed.consumed;
      handle(parsed);
      if (socket === null) return;   // a handler dropped us
    }
    carry = combined.subarray(offset).slice();
  }

  function connect(): void {
    if (stopped || socket !== null) return;
    carry = new Uint8Array();
    let opened: SocketLike;
    try {
      opened = options.createSocket({ host: options.host, port: options.port });
    } catch (error) {
      options.log(`connect failed: ${String(error)}`);
      scheduleReconnect();
      return;
    }
    socket = opened;
    opened.setNoDelay?.(true);
    opened.on("connect", () => {
      write(encodeConnect({
        clientId: options.clientId,
        keepAliveSeconds: KEEP_ALIVE_SECONDS,
        ...(username === undefined ? {} : { username }),
        ...(password === undefined ? {} : { password }),
        will: options.will,
      }));
    });
    opened.on("data", (chunk: Uint8Array) => { if (socket === opened) onData(chunk); });
    opened.on("error", (error: unknown) => {
      if (socket !== opened) return;
      options.log(`socket error: ${String(error)}`);
      dropSocket();
    });
    opened.on("close", () => { if (socket === opened) dropSocket(); });
  }

  return {
    start(): void { stopped = false; connect(); },
    isConnected: (): boolean => connected,
    publish(topic: string, payload: string, opts: { retain: boolean }): void {
      if (!connected) return;
      write(encodePublish(topic, payload, { retain: opts.retain, qos: 0 }));
    },
    subscribe(filters: Array<{ filter: string; qos: 0 | 1 }>): void {
      if (!connected) return;
      packetId = packetId >= 0xffff ? 1 : packetId + 1;
      write(encodeSubscribe(packetId, filters));
    },
    /**
     * A clean DISCONNECT suppresses the will, so the `offline` has to be published explicitly.
     * Never publish an empty discovery config here: that deletes the Home Assistant device and
     * takes entity renames, area assignments, dashboard references and history with it, on every
     * restart.
     */
    stop(offline?: { topic: string; payload: string }): void {
      stopped = true;
      pingTimer = clearTimer(pingTimer);
      pingWatchdog = clearTimer(pingWatchdog);
      reconnectTimer = clearTimer(reconnectTimer);
      if (connected && offline) write(encodePublish(offline.topic, offline.payload, { retain: true, qos: 0 }));
      if (connected) write(encodeDisconnect());
      connected = false;
      const doomed = socket;
      socket = null;
      try { doomed?.destroy(); } catch { /* already gone */ }
    },
  };
}

// ── Bridge ───────────────────────────────────────────────────────────────────────────────────

/**
 * Load-bearing identifiers. Home Assistant builds `discovery_hash = (platform, "<BASE> <key>")`
 * from the topic's object id and each component key, so renaming any of them orphans the entity
 * and leaves a ghost that nothing removes. The hyphen here and the underscore in `identifiers`
 * are not a tidiness bug; whoever aligns them orphans sixteen entities.
 */
const BASE = "bestium-eco-foret";
const DEVICE_ID = "bestium_eco_foret";
const DISCOVERY_TOPIC = `homeassistant/device/${BASE}/config`;
const STATUS_TOPIC = `${BASE}/status`;
const STATE_TOPIC = `${BASE}/state`;
const EVENT_TOPIC = `${BASE}/event/entrance`;
const HA_STATUS_TOPIC = "homeassistant/status";

/** Three missed polls of the device in question, from the measured cadence rather than a knob. */
const STALE_AFTER = {
  lights: 2_200 * 3,
  heating: 2_300 * 3,
  gas: 2_100 * 3,
  batchOff: 1_860 * 3,
  elevator: 2_000 * 3,
} as const;

const AVAILABILITY_TOPIC = {
  lights: `${BASE}/avail/lights`,
  heating: `${BASE}/avail/heating`,
  gas: `${BASE}/avail/gas`,
  batchOff: `${BASE}/avail/batchoff`,
  elevator: `${BASE}/avail/elevator`,
} as const;

/**
 * The string Home Assistant reads as "not known". `mqtt/const.py` sets `PAYLOAD_NONE = "None"`,
 * and sensor, light and climate all check it before any other interpretation — so it reaches
 * `unknown` on a plain sensor and an enum sensor alike, without listing None in `options`.
 * Publish the string inside the JSON, never a JSON null.
 */
const NONE = "None";

type PolledEntry = { polled?: Record<string, any> } | undefined;

/** The same predicate `staleDevice()` uses, read off the poll's copy rather than the entry. */
function stalePolled(entry: PolledEntry, nowMs: number, generation: number, windowMs: number): boolean {
  const polled = entry?.polled;
  return !polled
    || polled.generation !== generation
    || !(polled.lastSeenAtMs > 0)
    || nowMs - polled.lastSeenAtMs > windowMs;
}

function livePolled(entry: PolledEntry, nowMs: number, generation: number, windowMs: number): Record<string, any> | null {
  return stalePolled(entry, nowMs, generation, windowMs) ? null : (entry!.polled as Record<string, any>);
}

export function buildAvailability(
  devices: Record<string, any>,
  clock: { nowMs: number; generation: number },
): Record<string, "online" | "offline"> {
  const live = (entry: PolledEntry, windowMs: number): "online" | "offline" =>
    stalePolled(entry, clock.nowMs, clock.generation, windowMs) ? "offline" : "online";
  // A group is available when any of its members is: one lamp answering means the bus is up.
  const anyOf = (entries: PolledEntry[], windowMs: number): "online" | "offline" =>
    entries.some((entry) => !stalePolled(entry, clock.nowMs, clock.generation, windowMs)) ? "online" : "offline";
  return {
    lights: anyOf([1, 2, 3].map((n) => devices.lights?.[n]), STALE_AFTER.lights),
    heating: anyOf([1, 2, 3, 4].map((n) => devices.heating?.[n]), STALE_AFTER.heating),
    gas: live(devices.gas, STALE_AFTER.gas),
    batchOff: live(devices.batchOff, STALE_AFTER.batchOff),
    // Idle 0x34 frames arrive every 1.2-2.0 s and decode, so this device is fresh whenever the
    // bus is up. An absence of frames is a fault, not the car standing still.
    elevator: live(devices.elevator, STALE_AFTER.elevator),
  };
}

export function buildStateTree(
  devices: Record<string, any>,
  clock: { nowMs: number; generation: number },
): Record<string, any> {
  const onOff = (entry: PolledEntry, windowMs: number): string => {
    const polled = livePolled(entry, clock.nowMs, clock.generation, windowMs);
    return polled?.state === "on" ? "ON" : polled?.state === "off" ? "OFF" : NONE;
  };
  const lights: Record<string, string> = {};
  for (const index of [1, 2, 3]) lights[String(index)] = onOff(devices.lights?.[index], STALE_AFTER.lights);

  const heating: Record<string, Record<string, any>> = {};
  for (const zone of [1, 2, 3, 4]) {
    const polled = livePolled(devices.heating?.[zone], clock.nowMs, clock.generation, STALE_AFTER.heating);
    heating[String(zone)] = {
      // `heat`/`off` because those are the two modes the discovery declares.
      mode: polled?.state === "on" ? "heat" : polled?.state === "off" ? "off" : NONE,
      current: typeof polled?.currentC === "number" ? polled.currentC : NONE,
      target: typeof polled?.targetC === "number" ? polled.targetC : NONE,
    };
  }

  const gasPolled = livePolled(devices.gas, clock.nowMs, clock.generation, STALE_AFTER.gas);
  const elevatorPolled = livePolled(devices.elevator, clock.nowMs, clock.generation, STALE_AFTER.elevator);
  return {
    lights,
    heating,
    // Verbatim, because `state_open`/`state_closed` default to exactly these.
    gas: gasPolled?.state === "open" ? "open" : gasPolled?.state === "closed" ? "closed" : NONE,
    batch_off: onOff(devices.batchOff, STALE_AFTER.batchOff),
    elevator: {
      // `floorLabel` is null while the car is standing, because the frame carries 00 and the
      // position is genuinely not knowable. That is a different fact from `heading: "none"`,
      // which is a measured state, and the two must not collapse into one another.
      floor: typeof elevatorPolled?.floorLabel === "string" ? elevatorPolled.floorLabel : NONE,
      heading: typeof elevatorPolled?.heading === "string" ? elevatorPolled.heading : NONE,
      call: typeof elevatorPolled?.call === "string" ? elevatorPolled.call : NONE,
    },
  };
}

/**
 * Built literally, never spread: `encodeSemanticAction`'s `allowedFields` table is an exact match,
 * so one extra key rejects the whole action.
 */
export function parseCommand(topic: string, payload: string): Record<string, any> | null {
  const prefix = `${BASE}/cmd/`;
  if (!topic.startsWith(prefix)) return null;
  const parts = topic.slice(prefix.length).split("/");
  const value = payload.trim();
  // The clears this bridge publishes are zero-length, and `Number("")` is 0 — so an empty
  // payload on a temperature topic parsed into a real `temperatureC: 0`, caught only by the
  // encoder's 5-40 range check well downstream. Nothing carries meaning here.
  if (value === "") return null;

  if (parts[0] === "light" && parts.length === 2) {
    const target = Number(parts[1]);
    if (!Number.isInteger(target) || target < 1 || target > 3) return null;
    if (value !== "ON" && value !== "OFF") return null;
    return { kind: "light", target, state: value === "ON" ? "on" : "off" };
  }
  if (parts[0] === "heating" && parts.length === 3) {
    const zone = Number(parts[1]);
    if (!Number.isInteger(zone) || zone < 1 || zone > 4) return null;
    if (parts[2] === "mode") {
      if (value !== "heat" && value !== "off") return null;
      return { kind: "heat", zone, state: value === "heat" ? "on" : "off" };
    }
    if (parts[2] === "temperature") {
      // Home Assistant renders setpoints as floats and the encoder rejects a non-integer. The
      // discovery's `{{ value | int }}` handles it there; this is the belt. NaN falls through
      // to the encoder's own range check, which refuses anything under 5 anyway.
      const temperatureC = Math.round(Number(value));
      if (!Number.isInteger(temperatureC)) return null;
      return { kind: "heat", zone, temperatureC };
    }
    return null;
  }
  if (parts[0] === "gas" && parts.length === 1) {
    // The only direction that exists. An OPEN here is not a typo to be helpful about.
    return value === "CLOSE" ? { kind: "gas", state: "close" } : null;
  }
  if (parts[0] === "batch_off" && parts.length === 1) {
    if (value !== "ON" && value !== "OFF") return null;
    return { kind: "batchoff", state: value === "ON" ? "on" : "off" };
  }
  if (parts[0] === "elevator" && parts.length === 1) {
    if (value !== "UP" && value !== "DOWN") return null;
    return { kind: "elevator", direction: value === "UP" ? "up" : "down" };
  }
  return null;
}

const availabilityFor = (device: keyof typeof AVAILABILITY_TOPIC): Record<string, any> => ({
  availability: [{ topic: STATUS_TOPIC }, { topic: AVAILABILITY_TOPIC[device] }],
  availability_mode: "all",
});

export function buildDiscovery(options: { version: string; commandsLive: boolean }): Record<string, any> {
  const live = options.commandsLive;
  /** Included only when commands are live, so a control that would silently do nothing is absent. */
  const cmd = <T extends Record<string, any>>(keys: T): T | Record<string, never> => (live ? keys : {});

  const components: Record<string, any> = {};

  for (const index of [1, 2, 3]) {
    components[`light_${index}`] = {
      platform: "light",
      unique_id: `${DEVICE_ID}_light_${index}`,
      name: `등 ${index}`,
      state_topic: STATE_TOPIC,
      state_value_template: `{{ value_json.lights['${index}'] }}`,
      // MQTT light has no `state_on`/`state_off`: `payload_on` is both the command sent and the
      // state compared, so a lowercase state would give a light that never reports on.
      payload_on: "ON",
      payload_off: "OFF",
      ...cmd({ command_topic: `${BASE}/cmd/light/${index}`, retain: false }),
      ...availabilityFor("lights"),
    };
  }

  for (const zone of [1, 2, 3, 4]) {
    components[`heat_${zone}`] = {
      platform: "climate",
      unique_id: `${DEVICE_ID}_heat_${zone}`,
      name: `난방 ${zone}`,
      modes: ["off", "heat"],
      mode_state_topic: STATE_TOPIC,
      mode_state_template: `{{ value_json.heating['${zone}'].mode }}`,
      current_temperature_topic: STATE_TOPIC,
      current_temperature_template: `{{ value_json.heating['${zone}'].current }}`,
      temperature_state_topic: STATE_TOPIC,
      temperature_state_template: `{{ value_json.heating['${zone}'].target }}`,
      temperature_unit: "C",
      // The device enforces 5-40 itself: 4 was echoed by the reply and not adopted by the zone.
      min_temp: 5,
      max_temp: 40,
      temp_step: 1,
      precision: 1.0,
      ...cmd({
        mode_command_topic: `${BASE}/cmd/heating/${zone}/mode`,
        temperature_command_topic: `${BASE}/cmd/heating/${zone}/temperature`,
        temperature_command_template: "{{ value | int }}",
        retain: false,
      }),
      ...availabilityFor("heating"),
    };
  }

  components.gas = {
    platform: "valve",
    unique_id: `${DEVICE_ID}_gas`,
    name: "가스 밸브",
    device_class: "gas",
    state_topic: STATE_TOPIC,
    value_template: "{{ value_json.gas }}",
    state_open: "open",
    state_closed: "closed",
    reports_position: false,
    optimistic: false,
    // `payload_open: null` is what removes OPEN from the entity: `mqtt/valve.py` builds
    // supported_features from each payload's presence, and a missing key is filled with the
    // default "OPEN". So the null must be present and literal. `payload_stop` is omitted because
    // this bus reports no transitional state for an `is_closing` to clear.
    ...cmd({ command_topic: `${BASE}/cmd/gas`, payload_open: null, payload_close: "CLOSE", retain: false }),
    ...availabilityFor("gas"),
  };

  components.batch_off = {
    platform: "switch",
    unique_id: `${DEVICE_ID}_batch_off`,
    name: "일괄소등 (집 전체 소등)",
    // `mdi:home-lightbulb-off` was here and has never existed in Material Design Icons — absent
    // from @mdi/svg 4.9.95 through 7.4.47, which is the newest release and the one Home Assistant
    // pins. An unknown name fails silently by design: the frontend fetches the icon chunk, finds
    // nothing, and renders an empty 24px <svg> with no error anywhere. `lightbulb-group-off` is
    // what Home Assistant core itself uses for a light group's off state.
    icon: "mdi:lightbulb-group-off",
    // `switch` is in DEFAULT_EXPOSED_DOMAINS and falls through to switch.turn_on, so with no
    // operator action "turn on everything in <area>" reaches this with ON — and ON darkens the
    // whole home, including rooms the wallpad cannot otherwise address. Every "turn everything
    // on" reflex in Home Assistant does the opposite of what the operator means.
    enabled_by_default: false,
    state_topic: STATE_TOPIC,
    value_template: "{{ value_json.batch_off }}",
    state_on: "ON",
    state_off: "OFF",
    ...cmd({ command_topic: `${BASE}/cmd/batch_off`, payload_on: "ON", payload_off: "OFF", retain: false }),
    ...availabilityFor("batchOff"),
  };

  components.elevator_floor = {
    platform: "sensor",
    unique_id: `${DEVICE_ID}_elevator_floor`,
    name: "승강기 층",
    icon: "mdi:elevator",
    state_topic: STATE_TOPIC,
    value_template: "{{ value_json.elevator.floor }}",
    // No state_class, device_class or unit: the floor field skips floors (1, 1, 3, 4 with the
    // car faster than the 1.3-2.0 s frames) and carries B1, so it is a label with gaps rather
    // than a position that can be graphed.
    ...availabilityFor("elevator"),
  };
  components.elevator_heading = {
    platform: "sensor",
    unique_id: `${DEVICE_ID}_elevator_heading`,
    name: "승강기 진행 방향",
    device_class: "enum",
    options: ["none", "up", "down"],
    state_topic: STATE_TOPIC,
    value_template: "{{ value_json.elevator.heading }}",
    ...availabilityFor("elevator"),
  };
  components.elevator_call = {
    platform: "sensor",
    unique_id: `${DEVICE_ID}_elevator_call`,
    name: "승강기 호출 상태",
    device_class: "enum",
    options: ["none", "arrival", "up", "down"],
    state_topic: STATE_TOPIC,
    value_template: "{{ value_json.elevator.call }}",
    ...availabilityFor("elevator"),
  };

  for (const [key, label, press, icon] of [
    ["elevator_call_up", "승강기 상행 호출", "UP", "mdi:elevator-up"],
    ["elevator_call_down", "승강기 하행 호출", "DOWN", "mdi:elevator-down"],
  ] as Array<[string, string, string, string]>) {
    // The doc-prescribed removal form when commands are off: an empty config plus the platform
    // key. On a fresh install it is a no-op; on a live-to-not-live transition it removes cleanly.
    components[key] = live
      ? {
          platform: "button",
          unique_id: `${DEVICE_ID}_${key}`,
          name: label,
          icon,
          // Enabled, by the operator's decision. A call brings a shared car the neighbours see,
          // the building offers no cancel, and a button gives Home Assistant no failure
          // feedback — so the auto-generated Overview renders two bare PRESS tiles beside the
          // light toggles. The confirmation for that belongs on a dashboard tile, which MQTT
          // discovery cannot express. See the decisions table in `.agent/plan-mqtt-bridge.md`.
          command_topic: `${BASE}/cmd/elevator`,
          payload_press: press,
          retain: false,
          ...availabilityFor("elevator"),
        }
      : { platform: "button" };
  }

  components.entrance_door = {
    platform: "event",
    unique_id: `${DEVICE_ID}_entrance_door`,
    // Named for what it actually is: nothing measured says a keypad or a key puts anything on
    // this line, and the bell, intercom and video are all on the subphone line.
    name: "세대현관 문열림 (월패드 조작)",
    icon: "mdi:door-open",
    state_topic: EVENT_TOPIC,
    event_types: ["opened"],
    // LWT only: its state is the timestamp of a past event, which stays true whether or not the
    // bus is up. Marking a historical timestamp unavailable asserts nothing anyone acts on.
    availability: [{ topic: STATUS_TOPIC }],
  };

  return {
    device: {
      identifiers: [DEVICE_ID],
      name: "BESTIUM 월패드",
      manufacturer: "Bestium",
      model: "Eco-Foret Wallpad",
      sw_version: options.version,
    },
    origin: { name: BASE, sw_version: options.version },
    // Valid at root and in SHARED_OPTIONS, so it inherits into every component. The root is
    // validated PREVENT_EXTRA: one unrecognised key rejects all sixteen entities with nothing
    // but a warning in the log.
    qos: 1,
    components,
  };
}

export type ServiceData = { host: string; port: number; username?: string; password?: string; ssl?: boolean };

/**
 * `/services/mqtt` is on Supervisor's token-bypass list, so a plain add-on token reaches it and
 * `hassio_api: true` is neither needed nor wanted — the flag would additionally open every
 * default-role path. `supervisor` is an unconditional /etc/hosts entry rather than a permission.
 * The unversioned path is indifferent to the addon-to-app field rename.
 */
async function fetchMqttService(): Promise<ServiceData> {
  const response = await fetch("http://supervisor/services/mqtt", {
    headers: { Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN ?? ""}` },
  });
  if (!response.ok) throw new Error(`supervisor answered ${response.status}`);
  const body = await response.json() as { data?: Record<string, unknown> };
  const data = body?.data ?? {};
  // Validated defensively: this endpoint is not in the public Supervisor documentation, so the
  // source is the only authority and it can change without a doc-visible announcement.
  if (typeof data.host !== "string" || !Number.isInteger(data.port)) throw new Error("unexpected service payload");
  return {
    host: data.host,
    port: data.port as number,
    // Presence, not truthiness: an anonymous broker sends neither.
    ...(typeof data.username === "string" ? { username: data.username } : {}),
    ...(typeof data.password === "string" ? { password: data.password } : {}),
    ...(typeof data.ssl === "boolean" ? { ssl: data.ssl } : {}),
  };
}

const COMMAND_TOPICS = [
  `${BASE}/cmd/light/1`, `${BASE}/cmd/light/2`, `${BASE}/cmd/light/3`,
  `${BASE}/cmd/heating/1/mode`, `${BASE}/cmd/heating/2/mode`,
  `${BASE}/cmd/heating/3/mode`, `${BASE}/cmd/heating/4/mode`,
  `${BASE}/cmd/heating/1/temperature`, `${BASE}/cmd/heating/2/temperature`,
  `${BASE}/cmd/heating/3/temperature`, `${BASE}/cmd/heating/4/temperature`,
  `${BASE}/cmd/gas`, `${BASE}/cmd/batch_off`, `${BASE}/cmd/elevator`,
];

const SERVICE_RETRY_MS = 60_000;
const TICK_MS = 1_000;
/** The docs recommend jitter against the IO spike of every integration republishing at once. */
const REPUBLISH_JITTER_MS = 2_000;

export type MqttBridgeOptions = {
  version: string;
  commandsLive: boolean;
  getDevices(): { devices: Record<string, any>; generation: number };
  send(action: Record<string, any>): Promise<Record<string, any>>;
  log(line: string): void;
  fetchService?(): Promise<ServiceData>;
  createSocket?(input: { host: string; port: number }): SocketLike;
  nowMs?(): number;
  setTimeout?(fn: () => void, delayMs: number): unknown;
  clearTimeout?(id: unknown): void;
  random?(): number;
};

export function createMqttBridge(options: MqttBridgeOptions) {
  const nowMs = options.nowMs ?? (() => Date.now());
  const setTimer = options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimeout ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const random = options.random ?? Math.random;
  const fetchService = options.fetchService ?? fetchMqttService;

  let client: ReturnType<typeof createMqttClient> | null = null;
  let tickTimer: unknown = null;
  let serviceTimer: unknown = null;
  let republishTimer: unknown = null;
  let stopped = false;
  let lastTree: string | null = null;
  let lastAvailability: Record<string, string> = {};
  /** `null` until the first tick, so a press from before we connected is a baseline, not an event. */
  let doorSeen: number | null = null;
  let retainedCommandLogged = false;

  const publish = (topic: string, payload: string, retain: boolean): void => {
    client?.publish(topic, payload, { retain });
  };

  function publishStateAndAvailability(): void {
    const { devices, generation } = options.getDevices();
    const at = nowMs();
    const availability = buildAvailability(devices, { nowMs: at, generation });
    for (const [device, value] of Object.entries(availability)) {
      if (lastAvailability[device] === value) continue;
      lastAvailability[device] = value;
      publish(AVAILABILITY_TOPIC[device as keyof typeof AVAILABILITY_TOPIC], value, true);
    }
    const tree = JSON.stringify(buildStateTree(devices, { nowMs: at, generation }));
    if (tree !== lastTree) {
      lastTree = tree;
      publish(STATE_TOPIC, tree, true);
    }
  }

  /**
   * Order is load-bearing. A crash leaves the will's `offline` on the global topic while the
   * per-device topics and the state tree keep their retained pre-crash values, so publishing
   * `online` before them opens a window where Home Assistant reads available beside a frozen
   * `gas: open` presented as current — a lie about a safety device.
   */
  function announce(opts: { clearCommands: boolean }): void {
    // Nothing ever deletes a retained message, so a single publish with the retain box ticked
    // would sit on a command topic forever, waiting for the dispatcher's guard to regress.
    //
    // Only on connect, and only before subscribing, so the bridge does not receive its own
    // clears. Home Assistant's birth message runs the rest of this sequence again while the
    // subscription is live, and doing it there put one "dropped an unrecognised command" line
    // in the log per command topic on every Home Assistant restart.
    if (opts.clearCommands) for (const topic of COMMAND_TOPICS) publish(topic, "", true);
    client?.subscribe([
      // Subscribed even when commands are off, so the dispatcher's guard is the single place
      // that decision lives.
      { filter: `${BASE}/cmd/#`, qos: 1 },
      { filter: HA_STATUS_TOPIC, qos: 0 },
    ]);
    // Force a full republish: a broker restarted without persistence has an empty state topic,
    // and every entity would sit at unknown until the next real change on the bus.
    lastTree = null;
    lastAvailability = {};
    publishStateAndAvailability();
    publish(DISCOVERY_TOPIC, JSON.stringify(buildDiscovery({ version: options.version, commandsLive: options.commandsLive })), true);
    publish(STATUS_TOPIC, "online", true);
  }

  function tick(): void {
    if (stopped) return;
    publishStateAndAvailability();
    const { devices } = options.getDevices();
    const count = (devices.entrances?.household?.doorOpenCount as number | undefined) ?? 0;
    // The counter, never `doorOpenObserved`: that flag is cleared by the snapshot's staleness
    // pass and never set true by the decoder, so diffing it yields a spurious falling edge.
    if (doorSeen !== null && count > doorSeen) publish(EVENT_TOPIC, JSON.stringify({ event_type: "opened" }), false);
    doorSeen = count;
    tickTimer = setTimer(tick, TICK_MS);
  }

  function dispatch(topic: string, payload: string, retain: boolean): void {
    if (topic === HA_STATUS_TOPIC) {
      if (payload !== "online") return;
      if (republishTimer !== null) return;
      republishTimer = setTimer(() => { republishTimer = null; announce({ clearCommands: false }); }, Math.floor(random() * REPUBLISH_JITTER_MS));
      return;
    }
    if (!topic.startsWith(`${BASE}/cmd/`)) return;
    if (!options.commandsLive) return;
    // A broker sets RETAIN only when replaying a stored message to a new subscription and must
    // clear it on a live forward, so this never drops a real command. It does stop a retained
    // CLOSE on the gas topic from re-executing on every reconnect, permanently closing a valve
    // a person has to walk to and reopen.
    if (retain) {
      if (!retainedCommandLogged) {
        retainedCommandLogged = true;
        options.log(`ignoring a retained command on ${topic}; retained commands are never executed`);
      }
      return;
    }
    const action = parseCommand(topic, payload);
    if (!action) {
      options.log(`dropped an unrecognised command: ${topic} ${payload.slice(0, 32)}`);
      return;
    }
    // Never retried here: `tx_max_attempts` is already the retry policy, and stacking a second
    // one multiplies frames on a half-duplex bus. The outcome is logged and nothing else — an
    // entity's state comes from the poll.
    void options.send(action).then(
      (result) => {
        // `unconfirmed` already means at least one frame reached the bus, but only the frame
        // count separates "written three times and never observed" from "superseded before it
        // was written". A `button` entity gives Home Assistant no failure feedback at all, so
        // for the two elevator calls this line is the only place either can be read.
        const detail = [
          result?.framesWritten === undefined ? null : `${String(result.framesWritten)} frame(s)`,
          result?.reason === undefined ? null : String(result.reason),
        ].filter(Boolean).join(", ");
        options.log(`${topic} ${payload} -> ${String(result?.outcome ?? "sent")}${detail === "" ? "" : ` (${detail})`}`);
      },
      (error) => options.log(`${topic} ${payload} failed: ${String(error)}`),
    );
  }

  async function connect(): Promise<void> {
    if (stopped) return;
    let service: ServiceData;
    try {
      service = await fetchService();
    } catch (error) {
      options.log(`no broker yet (${String(error)}); retrying in ${SERVICE_RETRY_MS / 1_000}s`);
      // Supervisor does not restart an add-on when a service later becomes available, so without
      // this an operator who installs Mosquitto second stays dark until they restart by hand.
      if (!stopped) serviceTimer = setTimer(() => { serviceTimer = null; void connect(); }, SERVICE_RETRY_MS);
      return;
    }
    if (service.ssl === true) {
      // node:tls is stdlib and the swap is small, but a broker publishing ssl:true almost
      // certainly has a self-signed certificate, and `rejectUnauthorized: false` is worse than
      // not connecting. Mosquitto hard-codes ssl false in what it publishes, so this is
      // theoretical today.
      // ponytail: no TLS, add node:tls with a real CA path if anyone actually has one
      options.log("the broker advertises TLS, which this add-on does not implement; staying dark");
      return;
    }
    client = createMqttClient({
      host: service.host,
      port: service.port,
      ...(service.username === undefined ? {} : { username: service.username }),
      ...(service.password === undefined ? {} : { password: service.password }),
      clientId: BASE,
      will: { topic: STATUS_TOPIC, payload: "offline", retain: true },
      createSocket: options.createSocket ?? ((input) => connectTcp(input)),
      nowMs,
      setTimeout: setTimer,
      clearTimeout: clearTimer,
      onMessage: dispatch,
      onConnected: () => {
        announce({ clearCommands: true });
        if (tickTimer === null) tickTimer = setTimer(tick, TICK_MS);
      },
      onFatal: (reason) => { options.log(`fatal: ${reason}`); },
      onCredentialsRejected: async () => {
        try {
          const fresh = await fetchService();
          return { username: fresh.username, password: fresh.password };
        } catch {
          return null;
        }
      },
      log: options.log,
    });
    client.start();
  }

  const started = connect();

  return {
    started,
    stop(): void {
      stopped = true;
      tickTimer = tickTimer === null ? null : (clearTimer(tickTimer), null);
      serviceTimer = serviceTimer === null ? null : (clearTimer(serviceTimer), null);
      republishTimer = republishTimer === null ? null : (clearTimer(republishTimer), null);
      // A clean DISCONNECT suppresses the will, so the offline has to go out explicitly. Never
      // an empty discovery config: that deletes the device and takes entity renames, areas,
      // dashboard references and history with it, on every restart.
      client?.stop({ topic: STATUS_TOPIC, payload: "offline" });
      client = null;
    },
  };
}
