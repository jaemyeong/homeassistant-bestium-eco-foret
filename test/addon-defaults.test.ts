import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DEVICE_POLL_MS, OBSERVATION_TIMEOUT_MS } from "../bestium-eco-foret/src/tx-queue.ts";
import { DEFAULTS, parseM2Settings } from "../bestium-eco-foret/src/settings.ts";

// The shipped defaults had never been checked against anything. Every suite that touches these
// keys builds its own settings object, so `config.json` could drift from the measurements the
// code is written around and nothing would say so. It did drift: `tx_observation_timeout_ms`
// was 3,000 ms, which holds one 2,300 ms heating poll but not the two a command needs — the
// write lands, the next poll may still report the old state, and only the poll after that
// carries the effect. Same shape as the image allowlist in `addon-image.test.ts`: a value the
// add-on actually runs on, proved by nothing.
//
// Raising the shipped default did not reach the operator's install. Supervisor merges an
// add-on's defaults *under* whatever was saved on the 구성 panel and the saved side wins, so
// an install whose form has ever been submitted keeps its 3,000 ms — visible as the send
// banner's "최대 3.0초". The panel now offers only what an operator can actually know, and the
// timings are constants the parser reads from here rather than from the saved options.

const config = JSON.parse(
  readFileSync(new URL("../bestium-eco-foret/config.json", import.meta.url), "utf8"),
) as { options: Record<string, unknown>; schema: Record<string, string> };

/**
 * What no measurement can supply, so the operator must. Everything else is measured.
 *
 * `mqtt_commands_enabled` belongs here for a reason no bus reading settles: an MQTT PUBLISH
 * carries no caller identity and this add-on's authority check is configuration equality, so
 * whether to accept commands over the broker depends on who can reach that broker — which only
 * the operator knows.
 */
const OPERATOR_KEYS = ["ew11_host", "ew11_port", "transmit_enabled", "transmit_user_id", "mqtt_commands_enabled"];

// Measured, not derived. Deriving it from `DEVICE_POLL_MS` gave half the real figure: the
// bus also carries devices this add-on does not decode, and a frame averages 16.6 bytes
// rather than the eleven a light or heating frame occupies. Across the 34 captures under
// `tools/buslab/runs`, 6,415 s carried 685,772 bytes in 34,427 reads — 106.9 B/s and 5.37
// reads/s. Rounded up for headroom, since a busier minute is not the average one.
//
// The two figures are not equally solid. Those captures came from the buslab tool: the same
// physical line through the same gateway, so the byte rate is the add-on's byte rate. A read
// is whatever one client's socket handed up in one chunk, which is buslab's segmentation and
// only an estimate of the add-on's. The ceilings carry enough headroom to absorb the
// difference, and `maximum_records` is the limit that would need re-measuring first if a
// capture ever stopped early.
const BYTES_PER_SECOND = 120;
const READS_PER_SECOND = 6;

test("M5: the 구성 panel offers only what an operator can know", () => {
  assert.deepEqual(
    Object.keys(config.schema).sort(),
    [...OPERATOR_KEYS].sort(),
    "a knob nobody has grounds to turn is a way to break a working install; every timing here "
      + "came off the bus and belongs in the source next to the measurement that justifies it",
  );
});

test("M5: a value the panel no longer offers cannot reach the running add-on", () => {
  // Removing a key from the schema does not remove it from `/data/options.json` — Supervisor
  // keeps it and logs that it is not in the schema. The parser is what has to make it inert,
  // and this is the operator's own 3,000 ms: the value that made a confirmed command report
  // itself unconfirmed, and then retry.
  const settings = parseM2Settings({
    ew11_host: "10.0.0.5",
    ew11_port: 8899,
    transmit_enabled: true,
    transmit_user_id: "operator",
    tx_observation_timeout_ms: 3_000,
    capture_duration_ms: 5_000,
    maximum_bytes: 65_536,
    maximum_records: 1_000,
    tx_quiet_ms: 20,
    tx_max_attempts: 9,
    speculative_transmit_enabled: true,
    unsafe_transmit_enabled: true,
  });

  assert.equal(settings.tx_observation_timeout_ms, OBSERVATION_TIMEOUT_MS);
  assert.equal(settings.capture_duration_ms, DEFAULTS.capture_duration_ms);
  assert.equal(settings.maximum_bytes, DEFAULTS.maximum_bytes);
  assert.equal(settings.maximum_records, DEFAULTS.maximum_records);
  assert.equal(settings.tx_quiet_ms, DEFAULTS.tx_quiet_ms);
  assert.equal(settings.tx_max_attempts, DEFAULTS.tx_max_attempts);
  // The speculative path has no caller — `inferred()` in `protocol-debug.ts` is never invoked —
  // and the page offers none of the entrance macros the unsafe flag gates. A saved `true` for
  // either is a permission nothing asked for.
  assert.equal(settings.speculative_transmit_enabled, false);
  assert.equal(settings.unsafe_transmit_enabled, false);
});

test("M5: what the operator does set still reaches the add-on", () => {
  const settings = parseM2Settings({
    ew11_host: "10.0.0.5",
    ew11_port: 8899,
    transmit_enabled: true,
    transmit_user_id: "operator",
  });
  assert.equal(settings.ew11_host, "10.0.0.5");
  assert.equal(settings.ew11_port, 8899);
  assert.equal(settings.transmit_enabled, true);
  assert.equal(settings.transmit_user_id, "operator");
});

test("M5: every default sits inside its own schema bounds", () => {
  for (const [key, rule] of Object.entries(config.schema)) {
    const bound = /^int\((-?\d+),(-?\d+)\)\??$/.exec(rule);
    if (!bound) continue;
    const value = config.options[key];
    assert.equal(typeof value, "number", `${key} has an int schema but no numeric default`);
    assert.ok(
      (value as number) >= Number(bound[1]) && (value as number) <= Number(bound[2]),
      `${key} defaults to ${String(value)}, outside its schema range ${bound[1]}–${bound[2]}; `
        + "Supervisor rejects the add-on's own default",
    );
  }
});

test("M5: the observation window is the two polls the code derives", () => {
  // The constant is `max(DEVICE_POLL_MS) * 2` and carries the reasoning: a write lands, the
  // next poll may still carry the state from before the command, and only the poll after it
  // reports the effect. One poll is not enough and this is where that is enforced.
  assert.equal(DEFAULTS.tx_observation_timeout_ms, OBSERVATION_TIMEOUT_MS);
});

test("M5: a capture ends on its duration, not on a size limit reached first", () => {
  const durationMs = DEFAULTS.capture_duration_ms;
  const seconds = durationMs / 1_000;

  // Long enough to be worth starting: a capture has to outlast several polls of every device
  // or it cannot show a single device answering, let alone a pattern.
  const slowestPollMs = Math.max(...Object.values(DEVICE_POLL_MS));
  assert.ok(
    durationMs >= slowestPollMs * 100,
    `capture_duration_ms is ${durationMs} ms, under 100 polls of the slowest device `
      + `(${slowestPollMs} ms); the file closes before there is anything in it`,
  );

  // And the other two limits have to hold what that duration collects, or the duration is a
  // fiction and the capture stops early on a byte or record ceiling instead.
  assert.ok(
    DEFAULTS.maximum_bytes >= seconds * BYTES_PER_SECOND,
    `maximum_bytes is ${DEFAULTS.maximum_bytes}, under the `
      + `~${Math.round(seconds * BYTES_PER_SECOND)} bytes the bus carries in ${seconds} s`,
  );
  // A record is one TCP read, which the gateway's gap time ends at a quiet point on the line.
  assert.ok(
    DEFAULTS.maximum_records >= seconds * READS_PER_SECOND,
    `maximum_records is ${DEFAULTS.maximum_records}, under the `
      + `~${Math.round(seconds * READS_PER_SECOND)} reads the bus produces in ${seconds} s`,
  );
});

test("M5: the one default the panel still ships agrees with the parser", () => {
  // `transmit_enabled` is the only measured-irrelevant option left on the panel, and it is the
  // master safety switch: it ships off so an install that has never been configured cannot
  // write to the bus. If the two tables disagree, an operator who never opened the form runs
  // on a value the panel never showed.
  assert.equal(config.options.transmit_enabled, DEFAULTS.transmit_enabled);
  assert.equal(DEFAULTS.transmit_enabled, false);
  assert.equal(config.options.mqtt_commands_enabled, DEFAULTS.mqtt_commands_enabled);
  assert.equal(DEFAULTS.mqtt_commands_enabled, false);
});
