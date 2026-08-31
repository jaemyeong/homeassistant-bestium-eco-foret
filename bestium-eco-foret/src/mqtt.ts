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
