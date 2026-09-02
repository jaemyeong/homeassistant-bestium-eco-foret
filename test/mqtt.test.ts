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
  buildDiscovery,
  buildStateTree,
  buildAvailability,
  parseCommand,
  createMqttBridge,
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

// ── Bridge ───────────────────────────────────────────────────────────────────────────────────

const BASE = "bestium-eco-foret";

test("M6 RED: the discovery payload's identifiers are frozen", () => {
  // Home Assistant builds `discovery_hash = (platform, "bestium-eco-foret <key>")` from these.
  // Renaming one orphans its entity and leaves a ghost nothing removes — including the standing
  // invitation to tidy the hyphen in the topic against the underscore in `identifiers`.
  const payload = buildDiscovery({ version: "0.5.0", commandsLive: true }) as AnyRecord;
  assert.deepEqual(payload.device.identifiers, ["bestium_eco_foret"]);
  assert.deepEqual(Object.keys(payload).sort(), ["components", "device", "origin", "qos"]);
  assert.deepEqual(Object.keys(payload.components).sort(), [
    "batch_off", "elevator_call", "elevator_call_down", "elevator_call_up", "elevator_floor",
    "elevator_heading", "entrance_door", "gas", "heat_1", "heat_2", "heat_3", "heat_4",
    "light_1", "light_2", "light_3",
  ]);
  for (const [key, component] of Object.entries(payload.components as AnyRecord)) {
    assert.equal((component as AnyRecord).unique_id, `bestium_eco_foret_${key}`, key);
  }
  assert.equal(payload.device.sw_version, "0.5.0");
});

test("M6 RED: the gas valve declares no open payload, and declares it explicitly", () => {
  // `mqtt/valve.py` builds supported_features from the presence of each payload, and
  // `_validate_and_add_defaults` fills a missing `payload_open` with "OPEN". So omitting the key
  // grants the unsafe direction, and `""` grants it too — `"" is not None` is True in Python.
  // Only a literal null removes the feature from the entity.
  const gas = (buildDiscovery({ version: "0.5.0", commandsLive: true }) as AnyRecord).components.gas;
  assert.equal(Object.prototype.hasOwnProperty.call(gas, "payload_open"), true, "the key must be present");
  assert.equal(gas.payload_open, null, "and literally null");
  assert.equal(gas.payload_close, "CLOSE");
  assert.equal(gas.reports_position, false, "or payload_close and the state strings are not consulted");
  assert.equal(Object.prototype.hasOwnProperty.call(gas, "payload_stop"), false);
  assert.equal(JSON.stringify(gas).includes('"payload_open":null'), true, "and it survives serialisation");
});

test("M6 RED: batch-off arrives disabled, and it is the only one", () => {
  // `switch` is in DEFAULT_EXPOSED_DOMAINS and falls through to switch.turn_on, so with no
  // operator action "turn on everything" reaches batch_off with ON — and ON darkens the whole
  // home, including rooms the wallpad cannot otherwise address. Every "turn everything on"
  // reflex in Home Assistant does the opposite of what the operator means.
  const components = (buildDiscovery({ version: "0.5.0", commandsLive: true }) as AnyRecord).components;
  assert.equal(components.batch_off.enabled_by_default, false);
  // The elevator buttons ship enabled by the operator's own decision, made knowing that a call
  // brings a shared car the neighbours see, that the building offers no cancel, and that a
  // button gives Home Assistant no failure feedback. The confirmation belongs on a dashboard
  // tile, which MQTT discovery cannot express.
  assert.equal(components.elevator_call_up.enabled_by_default, undefined);
  assert.equal(components.elevator_call_down.enabled_by_default, undefined);
  assert.equal(components.gas.enabled_by_default, undefined, "the valve's readout is the safety-useful half");
});

test("M6 RED: with commands off, no command topic ships and the buttons are removal-shaped", () => {
  const off = buildDiscovery({ version: "0.5.0", commandsLive: false }) as AnyRecord;
  const serialised = JSON.stringify(off);
  assert.equal(serialised.includes("command_topic"), false, "nothing may accept a command");
  assert.equal(serialised.includes("payload_press"), false);
  assert.equal(serialised.includes("payload_close"), false);
  // The doc-prescribed removal form: an empty config plus the platform key.
  assert.deepEqual(off.components.elevator_call_up, { platform: "button" });
  assert.deepEqual(off.components.elevator_call_down, { platform: "button" });
  // Everything readable still ships.
  assert.equal(off.components.gas.state_topic, `${BASE}/state`);
  assert.equal(off.components.light_1.state_topic, `${BASE}/state`);
});

test("M6 RED: the state tree reads the poll's copy and nothing else", () => {
  const now = 10_000;
  const fresh = (extra: AnyRecord) => ({ lastSeenAtMs: now - 100, generation: 3, ...extra });
  const devices = {
    lights: {
      1: { state: "off", polled: fresh({ state: "on" }) },      // a reply said off; the poll said on
      2: { state: "off", polled: fresh({ state: "off" }) },
      3: { state: "on" },                                        // never polled
    },
    heating: {
      1: { polled: fresh({ state: "on", currentC: 24, targetC: 23 }) },
      2: { polled: fresh({ state: "off", currentC: 25, targetC: 21 }) },
      3: {},
      4: { polled: fresh({ state: "off", currentC: 24, targetC: 21 }) },
    },
    gas: { state: "closed", polled: fresh({ state: "open" }) },  // the reply lies; the poll does not
    batchOff: { polled: fresh({ state: "off" }) },
    elevator: { polled: fresh({ floorLabel: null, heading: "none", call: "none" }) },
  };

  const tree = buildStateTree(devices as never, { nowMs: now, generation: 3 }) as AnyRecord;
  assert.equal(tree.lights["1"], "ON", "the poll wins over the reply");
  assert.equal(tree.lights["3"], "None", "and a device never polled is not guessed at");
  assert.equal(tree.gas, "open", "a valve nobody has seen close is open");
  assert.equal(tree.heating["1"].mode, "heat");
  assert.equal(tree.heating["1"].current, 24);
  assert.equal(tree.heating["3"].mode, "None");
  assert.equal(tree.batch_off, "OFF");
  // The whole point of the elevator design: "the frame carries no floor" and "the car is
  // standing" are different facts and stay distinguishable.
  assert.equal(tree.elevator.floor, "None");
  assert.equal(tree.elevator.heading, "none");
});

test("M6 RED: a stale poll is not a current reading", () => {
  const now = 100_000;
  const devices = {
    lights: { 1: { polled: { state: "on", lastSeenAtMs: now - 60_000, generation: 3 } }, 2: {}, 3: {} },
    heating: { 1: {}, 2: {}, 3: {}, 4: {} },
    gas: { polled: { state: "open", lastSeenAtMs: now - 100, generation: 2 } },   // wrong generation
    batchOff: {},
    elevator: {},
  };
  const tree = buildStateTree(devices as never, { nowMs: now, generation: 3 }) as AnyRecord;
  assert.equal(tree.lights["1"], "None", "a minute past its poll is not a reading");
  assert.equal(tree.gas, "None", "and neither is a value from a link generation that has ended");
});

test("M6 RED: availability follows the same staleness the tree does", () => {
  const now = 10_000;
  const devices = {
    lights: { 1: { polled: { state: "on", lastSeenAtMs: now - 100, generation: 1 } }, 2: {}, 3: {} },
    heating: { 1: {}, 2: {}, 3: {}, 4: {} },
    gas: {}, batchOff: {}, elevator: {},
  };
  const availability = buildAvailability(devices as never, { nowMs: now, generation: 1 }) as AnyRecord;
  assert.equal(availability.lights, "online");
  assert.equal(availability.heating, "offline");
  assert.equal(availability.elevator, "offline", "an elevator that is not answering is a fault, not idle");
});

test("M6 RED: every command topic the discovery advertises parses back to an action", () => {
  const cases: Array<[string, string, AnyRecord]> = [
    [`${BASE}/cmd/light/1`, "ON", { kind: "light", target: 1, state: "on" }],
    [`${BASE}/cmd/light/3`, "OFF", { kind: "light", target: 3, state: "off" }],
    [`${BASE}/cmd/heating/2/mode`, "heat", { kind: "heat", zone: 2, state: "on" }],
    [`${BASE}/cmd/heating/4/mode`, "off", { kind: "heat", zone: 4, state: "off" }],
    [`${BASE}/cmd/heating/1/temperature`, "23", { kind: "heat", zone: 1, temperatureC: 23 }],
    // Home Assistant renders setpoints as floats; the encoder rejects a non-integer.
    [`${BASE}/cmd/heating/1/temperature`, "22.6", { kind: "heat", zone: 1, temperatureC: 23 }],
    [`${BASE}/cmd/gas`, "CLOSE", { kind: "gas", state: "close" }],
    [`${BASE}/cmd/batch_off`, "ON", { kind: "batchoff", state: "on" }],
    [`${BASE}/cmd/elevator`, "DOWN", { kind: "elevator", direction: "down" }],
  ];
  for (const [topic, payload, expected] of cases) {
    assert.deepEqual(parseCommand(topic, payload), expected, `${topic} ${payload}`);
  }

  // Anything else is dropped rather than guessed at.
  for (const [topic, payload] of [
    [`${BASE}/cmd/gas`, "OPEN"],                    // the direction that does not exist
    [`${BASE}/cmd/light/4`, "ON"],
    [`${BASE}/cmd/heating/5/mode`, "heat"],
    [`${BASE}/cmd/heating/1/temperature`, "abc"],
    [`${BASE}/cmd/elevator`, "CANCEL"],             // the building offers none
    [`${BASE}/cmd/unknown`, "ON"],
    [`${BASE}/state`, "ON"],
  ] as Array<[string, string]>) {
    assert.equal(parseCommand(topic, payload), null, `${topic} ${payload}`);
  }
});

function bridgeFixture(overrides: AnyRecord = {}) {
  const socket = createFakeSocket();
  const timer = createTimerHarness();
  const sent: AnyRecord[] = [];
  let generation = 1;
  let devices: AnyRecord = {
    lights: { 1: {}, 2: {}, 3: {} },
    heating: { 1: {}, 2: {}, 3: {}, 4: {} },
    gas: {}, batchOff: {}, elevator: {},
    entrances: { household: {} },
  };
  const bridge = createMqttBridge({
    version: "0.5.0",
    commandsLive: true,
    getDevices: () => ({ devices, generation }),
    send: async (action: AnyRecord) => { sent.push(action); return { outcome: "confirmed" }; },
    fetchService: async () => ({ host: "core-mosquitto", port: 1883, username: "addons", password: "x" }),
    createSocket: () => socket as never,
    nowMs: timer.nowMs,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    random: () => 0,
    log: () => {},
    ...overrides,
  } as never);
  const published = () => socket.written
    .map((frame) => parsePacket(frame, 0))
    .filter((packet): packet is AnyRecord => packet !== null && packet.type === PACKET.PUBLISH)
    .map((packet) => ({ topic: packet.topic as string, payload: packet.payload as string, retain: packet.retain as boolean }));
  return {
    bridge, socket, timer, sent, published,
    setDevices: (next: AnyRecord) => { devices = next; },
    setGeneration: (next: number) => { generation = next; },
    async connect() {
      await bridge.started;
      socket.emit("connect");
      socket.deliver(connack(0));
      await timer.advance(0);
      await Promise.resolve();
    },
  };
}

test("M6 RED: the connect sequence publishes online last", async () => {
  // A crash leaves the will's `offline` on the global topic while the per-device topics and the
  // state tree keep their retained pre-crash values. Publishing `online` first would open a
  // window where Home Assistant reads available plus a frozen `gas: open` as current.
  const fixture = bridgeFixture();
  await fixture.connect();
  const topics = fixture.published().map((entry) => entry.topic);
  const online = topics.lastIndexOf(`${BASE}/status`);
  assert.ok(online >= 0, `status must be published: ${JSON.stringify(topics)}`);
  assert.equal(online, topics.length - 1, "and it must be the last thing published");
  assert.ok(topics.indexOf(`homeassistant/device/${BASE}/config`) < online, "discovery before online");
  assert.ok(topics.indexOf(`${BASE}/state`) < online, "state before online");
  const status = fixture.published().at(-1)!;
  assert.equal(status.payload, "online");
  assert.equal(status.retain, true);
});

test("M6 RED: a retained command is never executed", async () => {
  // A broker replays retained messages to every new subscriber. One Node-RED publish with the
  // retain box ticked would otherwise close the gas valve on every reconnect, forever, and a
  // person has to walk to the valve each time.
  const fixture = bridgeFixture();
  await fixture.connect();
  fixture.socket.deliver(encodePublish(`${BASE}/cmd/gas`, "CLOSE", { retain: true, qos: 0 }));
  await Promise.resolve();
  assert.deepEqual(fixture.sent, [], "a replayed command is not a command");

  fixture.socket.deliver(encodePublish(`${BASE}/cmd/gas`, "CLOSE", { retain: false, qos: 0 }));
  await Promise.resolve();
  assert.deepEqual(fixture.sent, [{ kind: "gas", state: "close" }], "a live one is");
});

test("M6 RED: the poisoned retained command topics are cleared on connect", async () => {
  // The guard stops execution but nothing deletes a retained message, so it sits there invisible
  // waiting for the guard to regress or a second consumer to appear.
  const fixture = bridgeFixture();
  await fixture.connect();
  const clears = fixture.published().filter((entry) => entry.topic.startsWith(`${BASE}/cmd/`));
  assert.ok(clears.length >= 6, `every command topic must be cleared: ${clears.length}`);
  for (const clear of clears) {
    assert.equal(clear.payload, "", "with a zero-length payload");
    assert.equal(clear.retain, true, "retained, or it deletes nothing");
  }
});

test("M6 RED: with commands off nothing reaches the bus", async () => {
  const fixture = bridgeFixture({ commandsLive: false });
  await fixture.connect();
  fixture.socket.deliver(encodePublish(`${BASE}/cmd/light/1`, "ON", { retain: false, qos: 0 }));
  await Promise.resolve();
  assert.deepEqual(fixture.sent, []);
});

test("M6 RED: the state tree is republished only when it changes", async () => {
  const fixture = bridgeFixture();
  await fixture.connect();
  const before = fixture.published().filter((entry) => entry.topic === `${BASE}/state`).length;

  await fixture.timer.advance(3_000);
  assert.equal(
    fixture.published().filter((entry) => entry.topic === `${BASE}/state`).length, before,
    "an unchanged tree is not republished three times a second",
  );

  fixture.setDevices({
    lights: { 1: { polled: { state: "on", lastSeenAtMs: fixture.timer.nowMs(), generation: 1 } }, 2: {}, 3: {} },
    heating: { 1: {}, 2: {}, 3: {}, 4: {} },
    gas: {}, batchOff: {}, elevator: {}, entrances: { household: {} },
  });
  await fixture.timer.advance(1_100);
  const after = fixture.published().filter((entry) => entry.topic === `${BASE}/state`);
  assert.equal(after.length, before + 1, "and a change is");
  assert.ok(after.at(-1)!.payload.includes('"1":"ON"'));
});

test("M6 RED: the first door count is a baseline, not an event", async () => {
  // `createDevices()` builds the household entrance without a counter at all, so the first frame
  // creates it. Comparing `1 > undefined` is false, which ate the first door event after every
  // restart — and comparing against a seeded 0 would publish an event for a press that happened
  // before the add-on started.
  const fixture = bridgeFixture();
  await fixture.connect();
  const doorEvents = () => fixture.published().filter((entry) => entry.topic === `${BASE}/event/entrance`);

  fixture.setDevices({
    lights: { 1: {}, 2: {}, 3: {} }, heating: { 1: {}, 2: {}, 3: {}, 4: {} },
    gas: {}, batchOff: {}, elevator: {},
    entrances: { household: { doorOpenCount: 4 } },     // four presses before we connected
  });
  await fixture.timer.advance(1_100);
  assert.equal(doorEvents().length, 0, "history is not replayed on start");

  fixture.setDevices({
    lights: { 1: {}, 2: {}, 3: {} }, heating: { 1: {}, 2: {}, 3: {}, 4: {} },
    gas: {}, batchOff: {}, elevator: {},
    entrances: { household: { doorOpenCount: 5 } },
  });
  await fixture.timer.advance(1_100);
  assert.equal(doorEvents().length, 1, "and the next press is an event");
  assert.equal(doorEvents()[0]!.payload, '{"event_type":"opened"}');
  assert.equal(doorEvents()[0]!.retain, false, "an event is not a state");
});

test("M6 RED: Home Assistant coming back online triggers a republish", async () => {
  const fixture = bridgeFixture();
  await fixture.connect();
  const before = fixture.published().length;

  fixture.socket.deliver(encodePublish("homeassistant/status", "online", { retain: false, qos: 0 }));
  await fixture.timer.advance(2_100);
  assert.ok(fixture.published().length > before, "the whole sequence runs again");
  assert.equal(fixture.published().at(-1)!.topic, `${BASE}/status`, "ending with online, as before");
});

test("M6 RED: a broker with no MQTT service does not take the add-on down", async () => {
  let attempts = 0;
  const fixture = bridgeFixture({
    fetchService: async () => { attempts += 1; throw new Error("Service not enabled"); },
  });
  await fixture.bridge.started;
  assert.equal(attempts, 1);
  assert.equal(fixture.socket.written.length, 0, "nothing was connected");
  // Supervisor does not restart an add-on when a service later appears, so without this the
  // operator installs Mosquitto second and stays dark until they restart by hand.
  await fixture.timer.advance(61_000);
  assert.equal(attempts, 2, "and it tries again a minute later");
});

test("M6 RED: a target for a zone that is off goes through, and powers the zone on", async () => {
  // Writing a target powers its zone on — eight of eight, all four zones. 0.5.2 had the MQTT
  // dispatcher refuse that, which made the same device answer differently on the two surfaces
  // and refuse silently, since MQTT has no channel for declining a command. The operator chose
  // to have MQTT behave like the page and like the wallpad instead: the side effect is real, it
  // is documented, and it is the bus's behaviour rather than this add-on's policy.
  //
  // The refusal that remains is the encoder's, and it is about values rather than state: below
  // 5 °C or above 40 the frame is never built, whatever the zone is doing.
  // Driven through the dispatcher rather than through `parseCommand`, which is asserted above
  // already. The fixture's zones are empty objects, so the 0.5.2 guard would have refused this
  // exact publish — which is what makes this the test that would fail if it came back.
  const fixture = bridgeFixture();
  await fixture.connect();
  fixture.socket.deliver(encodePublish(`${BASE}/cmd/heating/2/temperature`, "18", { retain: false, qos: 0 }));
  await Promise.resolve();
  assert.deepEqual(fixture.sent, [{ kind: "heat", zone: 2, temperatureC: 18 }]);
});

// Every `mdi:` name the payload ships, checked against the set Home Assistant pins (@mdi/svg
// 7.4.47, which is also the newest MDI has published). An unknown name is an error nowhere: the
// frontend fetches its chunk, finds nothing, and renders an empty 24px <svg>. That is how
// `mdi:home-lightbulb-off` — a name that has never existed in MDI — shipped as the batch-off
// icon and showed as a blank space. Adding a name here means checking it first at
// pictogrammers.com/library/mdi.
const VERIFIED_MDI = new Set([
  "mdi:lightbulb-group-off", "mdi:elevator", "mdi:elevator-up", "mdi:elevator-down", "mdi:door-open",
]);

test("M6 RED: every icon in the discovery payload is a real MDI name", () => {
  const payload = buildDiscovery({ version: "0.5.3", commandsLive: true }) as AnyRecord;
  for (const [key, component] of Object.entries(payload.components as AnyRecord)) {
    const icon = (component as AnyRecord).icon;
    if (icon === undefined) continue;
    assert.ok(VERIFIED_MDI.has(icon as string), `${key}: ${String(icon)} is not a verified MDI name`);
  }
});

test("M6 RED: a command's log line says how many frames reached the bus", async () => {
  // The two elevator calls are `button` entities with no state topic, so Home Assistant is told
  // nothing at all about a press. This line is the only place an operator can tell "written
  // three times and never observed" from "superseded before it was written" — and for a call
  // that the building answers with `arrival`, unconfirmed is the permanent honest verdict.
  const lines: string[] = [];
  const fixture = bridgeFixture({
    log: (line: string) => lines.push(line),
    send: async () => ({ outcome: "unconfirmed", framesWritten: 3, attempts: 3 }),
  });
  await fixture.connect();
  fixture.socket.deliver(encodePublish(`${BASE}/cmd/elevator`, "DOWN", { retain: false, qos: 0 }));
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(
    lines.some((line) => line === `${BASE}/cmd/elevator DOWN -> unconfirmed (3 frame(s))`),
    JSON.stringify(lines),
  );
});

test("M6 RED: an empty payload is never a command", () => {
  // The bridge clears every command topic on connect with a zero-length retained payload, and
  // those clears came back to it and were parsed. `Number("")` is 0, so an empty payload on a
  // temperature topic became `temperatureC: 0` — a real action object, refused only by the
  // encoder's 5-40 range check further down. Nothing else about it was wrong.
  for (const topic of [
    `${BASE}/cmd/light/1`, `${BASE}/cmd/heating/1/mode`, `${BASE}/cmd/heating/1/temperature`,
    `${BASE}/cmd/gas`, `${BASE}/cmd/batch_off`, `${BASE}/cmd/elevator`,
  ]) {
    assert.equal(parseCommand(topic, ""), null, topic);
    assert.equal(parseCommand(topic, "   "), null, `${topic} (whitespace)`);
  }
});

test("M6 RED: a republish does not clear the command topics again", async () => {
  // The clears are published before subscribing, so the bridge never receives its own. But Home
  // Assistant's birth message triggers the same sequence while the subscription is live, and
  // then it does — which is where the "dropped an unrecognised command" lines in the operator's
  // log came from, one per command topic, on every Home Assistant restart.
  const fixture = bridgeFixture();
  await fixture.connect();
  const clearsAfterConnect = fixture.published().filter((entry) => entry.topic.startsWith(`${BASE}/cmd/`)).length;
  assert.ok(clearsAfterConnect >= 6, "connect clears them");

  fixture.socket.deliver(encodePublish("homeassistant/status", "online", { retain: false, qos: 0 }));
  await fixture.timer.advance(2_100);
  const clearsAfterRepublish = fixture.published().filter((entry) => entry.topic.startsWith(`${BASE}/cmd/`)).length;
  assert.equal(clearsAfterRepublish, clearsAfterConnect, "and a republish leaves them alone");
  // The rest of the sequence still runs.
  assert.equal(fixture.published().at(-1)!.topic, `${BASE}/status`);
});

test("M6 RED: a command this bridge refuses is answered with the state, not only a log line", async () => {
  // A controller that asks for something this bridge refuses keeps its optimistic value until
  // something else on the bus happens to move. HomeKit's gas valve is where it shows: the Home
  // app writes Active=1, the tile says "opening", and nothing ever tells it otherwise.
  const fixture = bridgeFixture();
  await fixture.connect();
  const states = () => fixture.published().filter((entry) => entry.topic === `${BASE}/state`).length;
  const before = states();
  fixture.socket.deliver(encodePublish(`${BASE}/cmd/gas`, "OPEN", { retain: false, qos: 0 }));
  await fixture.timer.advance(0);
  assert.equal(states(), before + 1, "the refusal is answered with the state as it actually is");
});

test("M6 RED: the state is republished on a heartbeat even when nothing on the bus moves", async () => {
  // The dedupe means a house where nothing changes publishes nothing, so a controller that has
  // drifted stays drifted. mqttthing's own answer to this class is to send the status
  // periodically; that is the floor, and answering a refusal is what makes it prompt.
  const fixture = bridgeFixture();
  await fixture.connect();
  const states = () => fixture.published().filter((entry) => entry.topic === `${BASE}/state`).length;
  const before = states();
  await fixture.timer.advance(2_000);
  assert.equal(states(), before, "nothing moved, so the fast path stays quiet");
  await fixture.timer.advance(4_000);
  assert.ok(states() > before, `the heartbeat must republish: ${states()} vs ${before}`);
});
