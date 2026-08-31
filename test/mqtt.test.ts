import assert from "node:assert/strict";
import test from "node:test";

import {
  PACKET,
  encodeLength,
  decodeLength,
  encodeConnect,
  encodePublish,
  encodeSubscribe,
  encodePingreq,
  encodeDisconnect,
  parsePacket,
  createMqttClient,
} from "../bestium-eco-foret/src/mqtt.ts";

type AnyRecord = Record<string, any>;

const hex = (value: Uint8Array): string =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");

test("M6 RED: the variable-length integer covers every boundary the spec names", () => {
  // MQTT 3.1.1 §2.2.3. One byte to 127, two to 16,383, three to 2,097,151, four to 268,435,455.
  // These four boundaries are where an off-by-one lands, and a wrong length is not a parse error
  // — it silently consumes the next packet's header.
  const cases: Array<[number, string]> = [
    [0, "00"],
    [127, "7f"],
    [128, "8001"],
    [16_383, "ff7f"],
    [16_384, "808001"],
    [2_097_151, "ffff7f"],
    [2_097_152, "80808001"],
    [268_435_455, "ffffff7f"],
  ];
  for (const [value, expected] of cases) {
    assert.equal(hex(encodeLength(value)), expected, `encode ${value}`);
    const decoded = decodeLength(encodeLength(value), 0);
    assert.deepEqual(decoded, { value, bytes: expected.length / 2 }, `decode ${value}`);
  }
});

test("M6 RED: a length that ends mid-varint is incomplete, not an error", () => {
  // A packet can split anywhere, the length field included. Throwing here would kill the socket
  // on a perfectly ordinary TCP segmentation; returning null lets the reader wait for more.
  assert.equal(decodeLength(Uint8Array.from([0x80]), 0), null);
  assert.equal(decodeLength(Uint8Array.from([0x80, 0x80]), 0), null);
  assert.equal(decodeLength(Uint8Array.from([]), 0), null);
  // Five continuation bytes is malformed rather than incomplete.
  assert.throws(() => decodeLength(Uint8Array.from([0x80, 0x80, 0x80, 0x80, 0x80]), 0), /length/i);
});

test("M6 RED: CONNECT carries the will, and the credential flags follow presence", () => {
  // `username ?? ""` would break an anonymous broker: the flag would be set and an empty string
  // sent, which is not the same as sending no credentials at all.
  const anonymous = encodeConnect({
    clientId: "bestium-eco-foret",
    keepAliveSeconds: 60,
    will: { topic: "bestium-eco-foret/status", payload: "offline", retain: true },
  });
  // fixed header, then protocol name `MQTT`, level 4
  assert.equal(anonymous[0], PACKET.CONNECT << 4);
  assert.equal(hex(anonymous.slice(2, 9)), "00044d515454" + "04", 'protocol name then level 4');
  // byte 0 fixed header, byte 1 remaining length (this packet is under 127), bytes 2-7 the
  // protocol name, byte 8 the level, byte 9 the connect flags.
  const anonymousFlags = anonymous[9];
  assert.equal((anonymousFlags & 0x80) !== 0, false, "no username flag");
  assert.equal((anonymousFlags & 0x40) !== 0, false, "no password flag");
  assert.equal((anonymousFlags & 0x04) !== 0, true, "will flag");
  assert.equal((anonymousFlags & 0x20) !== 0, true, "will retain");
  assert.equal((anonymousFlags & 0x02) !== 0, true, "clean session");

  const authenticated = encodeConnect({
    clientId: "bestium-eco-foret",
    keepAliveSeconds: 60,
    username: "addons",
    password: "secret",
    will: { topic: "bestium-eco-foret/status", payload: "offline", retain: true },
  });
  assert.equal((authenticated[9] & 0xc0) === 0xc0, true, "both credential flags");
  // An empty password is a password: the flag must still be set.
  const emptyPassword = encodeConnect({
    clientId: "x", keepAliveSeconds: 60, username: "addons", password: "",
    will: { topic: "t", payload: "offline", retain: true },
  });
  assert.equal((emptyPassword[9] & 0x40) !== 0, true, "an empty password is still a password");
});

test("M6 RED: PUBLISH round-trips through the parser with its retain bit intact", () => {
  // The retain bit is the sharpest line in the bridge: a broker sets it only when replaying a
  // stored message to a new subscriber, and the dispatcher refuses those. A codec that swallowed
  // the flag would make a retained `CLOSE` on the gas topic execute on every reconnect.
  const frame = encodePublish("bestium-eco-foret/state", '{"gas":"open"}', { retain: true, qos: 0 });
  const parsed = parsePacket(frame, 0) as AnyRecord;
  assert.equal(parsed.type, PACKET.PUBLISH);
  assert.equal(parsed.topic, "bestium-eco-foret/state");
  assert.equal(parsed.payload, '{"gas":"open"}');
  assert.equal(parsed.retain, true);
  assert.equal(parsed.qos, 0);
  assert.equal(parsed.consumed, frame.length);

  const live = encodePublish("bestium-eco-foret/cmd/gas", "CLOSE", { retain: false, qos: 0 });
  assert.equal((parsePacket(live, 0) as AnyRecord).retain, false);

  // QoS 1 inbound carries a packet identifier the dispatcher must acknowledge.
  const qos1 = encodePublish("t", "x", { retain: false, qos: 1, packetId: 0x1234 });
  const parsedQos1 = parsePacket(qos1, 0) as AnyRecord;
  assert.equal(parsedQos1.qos, 1);
  assert.equal(parsedQos1.packetId, 0x1234);
});

test("M6 RED: a payload past 127 bytes still round-trips, length field and all", () => {
  // The one case where the length field is itself two bytes. The state tree is ~400 bytes, so
  // this is the normal path rather than an edge.
  const big = "x".repeat(1_000);
  const frame = encodePublish("bestium-eco-foret/state", big, { retain: true, qos: 0 });
  const parsed = parsePacket(frame, 0) as AnyRecord;
  assert.equal(parsed.payload, big);
  assert.equal(parsed.consumed, frame.length);
});

test("M6 RED: a packet split anywhere is incomplete until its last byte arrives", () => {
  // Fed one byte at a time, which is what a stub can do and a real broker sometimes does.
  const frame = encodePublish("bestium-eco-foret/state", "y".repeat(300), { retain: true, qos: 0 });
  for (let cut = 0; cut < frame.length; cut += 1) {
    assert.equal(parsePacket(frame.slice(0, cut), 0), null, `${cut} of ${frame.length} bytes`);
  }
  assert.notEqual(parsePacket(frame, 0), null, "and complete at the last byte");
});

test("M6 RED: two packets in one read are parsed one after the other", () => {
  const first = encodePublish("a", "1", { retain: false, qos: 0 });
  const second = encodePublish("b", "2", { retain: false, qos: 0 });
  const joined = new Uint8Array(first.length + second.length);
  joined.set(first);
  joined.set(second, first.length);

  const one = parsePacket(joined, 0) as AnyRecord;
  assert.equal(one.topic, "a");
  assert.equal(one.consumed, first.length);
  const two = parsePacket(joined, one.consumed) as AnyRecord;
  assert.equal(two.topic, "b");
});

test("M6 RED: CONNACK, SUBACK, PINGRESP and PUBACK parse", () => {
  const connack = Uint8Array.from([PACKET.CONNACK << 4, 2, 0, 5]);
  const parsedConnack = parsePacket(connack, 0) as AnyRecord;
  assert.equal(parsedConnack.type, PACKET.CONNACK);
  assert.equal(parsedConnack.returnCode, 5, "not authorised, which has its own recovery path");

  const suback = Uint8Array.from([PACKET.SUBACK << 4, 3, 0, 1, 0]);
  assert.equal((parsePacket(suback, 0) as AnyRecord).type, PACKET.SUBACK);

  const pingresp = Uint8Array.from([PACKET.PINGRESP << 4, 0]);
  assert.equal((parsePacket(pingresp, 0) as AnyRecord).type, PACKET.PINGRESP);

  const puback = Uint8Array.from([PACKET.PUBACK << 4, 2, 0x12, 0x34]);
  const parsedPuback = parsePacket(puback, 0) as AnyRecord;
  assert.equal(parsedPuback.type, PACKET.PUBACK);
  assert.equal(parsedPuback.packetId, 0x1234);
});

test("M6 RED: SUBSCRIBE carries its filters and their QoS", () => {
  const frame = encodeSubscribe(1, [
    { filter: "bestium-eco-foret/cmd/#", qos: 1 },
    { filter: "homeassistant/status", qos: 0 },
  ]);
  assert.equal(frame[0], (PACKET.SUBSCRIBE << 4) | 0x02, "SUBSCRIBE reserves flags 0010");
  const body = hex(frame);
  assert.ok(body.includes(Buffer.from("bestium-eco-foret/cmd/#").toString("hex")));
  assert.ok(body.includes(Buffer.from("homeassistant/status").toString("hex")));
});

test("M6 RED: PINGREQ and DISCONNECT are two bytes each", () => {
  assert.equal(hex(encodePingreq()), "c000");
  assert.equal(hex(encodeDisconnect()), "e000");
});

test("M6 RED: a topic or payload with multibyte characters keeps its byte length", () => {
  // The device name is Korean and the length prefix counts bytes, not characters. Getting this
  // wrong truncates every packet after it.
  const frame = encodePublish("bestium-eco-foret/state", '{"name":"등 1"}', { retain: true, qos: 0 });
  const parsed = parsePacket(frame, 0) as AnyRecord;
  assert.equal(parsed.payload, '{"name":"등 1"}');
  assert.equal(parsed.consumed, frame.length);
});

// ── Client ───────────────────────────────────────────────────────────────────────────────────

function createFakeSocket() {
  const listeners = new Map<string, Array<(...args: any[]) => void>>();
  const written: Uint8Array[] = [];
  let destroyed = false;
  return {
    written,
    isDestroyed: () => destroyed,
    write(chunk: Uint8Array) { written.push(chunk); return true; },
    on(event: string, fn: (...args: any[]) => void) {
      const list = listeners.get(event) ?? [];
      list.push(fn);
      listeners.set(event, list);
      return this;
    },
    destroy() { destroyed = true; },
    setNoDelay() {},
    emit(event: string, ...args: any[]) { for (const fn of listeners.get(event) ?? []) fn(...args); },
    /** Feed bytes the way a socket does, optionally one at a time. */
    deliver(bytes: Uint8Array, oneAtATime = false) {
      if (!oneAtATime) { this.emit("data", bytes); return; }
      for (const byte of bytes) this.emit("data", Uint8Array.from([byte]));
    },
  };
}

function createTimerHarness() {
  let now = 1_000_000;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let next = 1;
  return {
    nowMs: () => now,
    setTimeout: (fn: () => void, ms: number) => { const id = next++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (id: unknown) => { timers.delete(id as number); },
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        let due: { id: number; at: number; fn: () => void } | undefined;
        for (const [id, timer] of timers) if (timer.at <= target && (!due || timer.at < due.at)) due = { id, ...timer };
        if (!due) break;
        now = due.at;
        timers.delete(due.id);
        due.fn();
        await Promise.resolve();
      }
      now = target;
    },
  };
}

function connectFixture(overrides: AnyRecord = {}) {
  const socket = createFakeSocket();
  const timer = createTimerHarness();
  const messages: Array<{ topic: string; payload: string; retain: boolean }> = [];
  const events: string[] = [];
  const client = createMqttClient({
    host: "core-mosquitto", port: 1883, clientId: "bestium-eco-foret",
    will: { topic: "bestium-eco-foret/status", payload: "offline", retain: true },
    createSocket: () => socket as never,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    onMessage: (topic: string, payload: string, retain: boolean) => { messages.push({ topic, payload, retain }); },
    onConnected: () => { events.push("connected"); },
    onFatal: (reason: string) => { events.push(`fatal:${reason}`); },
    log: () => {},
    ...overrides,
  } as never);
  return { client, socket, timer, messages, events };
}

const connack = (code: number): Uint8Array => Uint8Array.from([PACKET.CONNACK << 4, 2, 0, code]);

test("M6 RED: the client connects, and a CONNACK of zero opens it for business", async () => {
  const fixture = connectFixture();
  fixture.client.start();
  fixture.socket.emit("connect");
  assert.equal(fixture.socket.written.length, 1, "CONNECT goes out on the socket's connect");
  assert.equal(fixture.socket.written[0]![0], PACKET.CONNECT << 4);

  fixture.socket.deliver(connack(0));
  await Promise.resolve();
  assert.deepEqual(fixture.events, ["connected"]);
});

test("M6 RED: a packet delivered one byte at a time is still one packet", async () => {
  // A broker is free to segment anywhere and a 400-byte state tree spans several TCP frames.
  const fixture = connectFixture();
  fixture.client.start();
  fixture.socket.emit("connect");
  fixture.socket.deliver(connack(0));

  const big = "z".repeat(500);
  fixture.socket.deliver(encodePublish("bestium-eco-foret/cmd/gas", big, { retain: false, qos: 0 }), true);
  await Promise.resolve();
  assert.equal(fixture.messages.length, 1);
  assert.equal(fixture.messages[0]!.payload, big);
});

test("M6 RED: the retain bit reaches the dispatcher", async () => {
  const fixture = connectFixture();
  fixture.client.start();
  fixture.socket.emit("connect");
  fixture.socket.deliver(connack(0));

  fixture.socket.deliver(encodePublish("bestium-eco-foret/cmd/gas", "CLOSE", { retain: true, qos: 0 }));
  await Promise.resolve();
  assert.equal(fixture.messages[0]!.retain, true, "a replayed command must be distinguishable");
});

test("M6 RED: an inbound QoS 1 publish is acknowledged", async () => {
  const fixture = connectFixture();
  fixture.client.start();
  fixture.socket.emit("connect");
  fixture.socket.deliver(connack(0));
  const before = fixture.socket.written.length;

  fixture.socket.deliver(encodePublish("bestium-eco-foret/cmd/light/1", "ON", { retain: false, qos: 1, packetId: 7 }));
  await Promise.resolve();
  const puback = fixture.socket.written[before];
  assert.ok(puback, "a QoS 1 publish must be acknowledged or the broker redelivers it forever");
  assert.equal(puback![0] >> 4, PACKET.PUBACK);
  assert.equal((puback![2]! << 8) | puback![3]!, 7);
});

test("M6 RED: a broker that stops answering PINGREQ loses the socket", async () => {
  // The failure this exists for: a silently dropped TCP path emits no close and no error, so
  // without this the bridge publishes into the void while Home Assistant holds the retained tree
  // and shows every entity available and current, indefinitely.
  const fixture = connectFixture();
  fixture.client.start();
  fixture.socket.emit("connect");
  fixture.socket.deliver(connack(0));

  await fixture.timer.advance(31_000);           // keep-alive is 60 s, so a ping at half that
  const pinged = fixture.socket.written.some((frame) => frame[0] === PACKET.PINGREQ << 4);
  assert.equal(pinged, true, "a ping goes out at half the keep-alive");
  assert.equal(fixture.socket.isDestroyed(), false, "and the socket is still fine");

  await fixture.timer.advance(31_000);           // no PINGRESP ever arrives
  assert.equal(fixture.socket.isDestroyed(), true, "an unanswered ping kills the socket");
});

test("M6 RED: a PINGRESP clears the watchdog", async () => {
  const fixture = connectFixture();
  fixture.client.start();
  fixture.socket.emit("connect");
  fixture.socket.deliver(connack(0));

  await fixture.timer.advance(31_000);
  fixture.socket.deliver(Uint8Array.from([PACKET.PINGRESP << 4, 0]));
  await fixture.timer.advance(31_000);
  assert.equal(fixture.socket.isDestroyed(), false, "an answered ping is not a fault");
});

test("M6 RED: CONNACK codes are split, or a refusing broker becomes a log spinner", async () => {
  // 0x01 and 0x02 can never succeed by retrying: the protocol level and the client id do not
  // change between attempts.
  for (const code of [1, 2]) {
    const fixture = connectFixture();
    fixture.client.start();
    fixture.socket.emit("connect");
    fixture.socket.deliver(connack(code));
    await Promise.resolve();
    assert.equal(fixture.events.some((e) => e.startsWith("fatal:")), true, `code ${code} is fatal`);
  }

  // 0x03 is ordinary: the broker is starting up.
  const unavailable = connectFixture();
  unavailable.client.start();
  unavailable.socket.emit("connect");
  unavailable.socket.deliver(connack(3));
  await Promise.resolve();
  assert.equal(unavailable.events.some((e) => e.startsWith("fatal:")), false, "server unavailable is retryable");

  // 0x04 and 0x05 mean the credentials moved, which happens when Mosquitto is reinstalled.
  let refetches = 0;
  const rejected = connectFixture({ onCredentialsRejected: async () => { refetches += 1; return null; } });
  rejected.client.start();
  rejected.socket.emit("connect");
  rejected.socket.deliver(connack(5));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(refetches, 1, "not authorised re-fetches the service data before retrying");
});

test("M6 RED: publishing before the connection is up does not throw", async () => {
  // The bridge's tick runs on its own timer and does not know the socket's state.
  const fixture = connectFixture();
  fixture.client.start();
  assert.doesNotThrow(() => fixture.client.publish("bestium-eco-foret/state", "{}", { retain: true }));
});
