import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DEVICE_POLL_MS, OBSERVATION_TIMEOUT_MS } from "../bestium-eco-foret/src/tx-queue.ts";
import { DEFAULTS } from "../bestium-eco-foret/src/settings.ts";

// The shipped defaults had never been checked against anything. Every suite that touches these
// keys builds its own settings object, so `config.json` could drift from the measurements the
// code is written around and nothing would say so. It did drift: `tx_observation_timeout_ms`
// was 3,000 ms, which holds one 2,300 ms heating poll but not the two a command needs — the
// write lands, the next poll may still report the old state, and only the poll after that
// carries the effect. Same shape as the image allowlist in `addon-image.test.ts`: a value the
// add-on actually runs on, proved by nothing.

const config = JSON.parse(
  readFileSync(new URL("../bestium-eco-foret/config.json", import.meta.url), "utf8"),
) as { options: Record<string, unknown>; schema: Record<string, string> };

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

test("M5: the observation window ships as the two polls the code derives", () => {
  // The constant is `max(DEVICE_POLL_MS) * 2` and carries the reasoning. If the default drifts
  // from it, operators wait on a window the source no longer justifies.
  assert.equal(config.options.tx_observation_timeout_ms, OBSERVATION_TIMEOUT_MS);
});

test("M5: a capture ends on its duration, not on a size limit reached first", () => {
  const durationMs = config.options.capture_duration_ms as number;
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
    (config.options.maximum_bytes as number) >= seconds * BYTES_PER_SECOND,
    `maximum_bytes is ${String(config.options.maximum_bytes)}, under the `
      + `~${Math.round(seconds * BYTES_PER_SECOND)} bytes the bus carries in ${seconds} s`,
  );
  // A record is one TCP read, which the gateway's gap time ends at a quiet point on the line.
  assert.ok(
    (config.options.maximum_records as number) >= seconds * READS_PER_SECOND,
    `maximum_records is ${String(config.options.maximum_records)}, under the `
      + `~${Math.round(seconds * READS_PER_SECOND)} reads the bus produces in ${seconds} s`,
  );
});

test("M5: the parser's fallbacks agree with what the add-on ships", () => {
  // Two default tables, and nothing compared them. Supervisor normally writes every option
  // into `/data/options.json`, so a divergence stays invisible until an option is absent —
  // and then the add-on quietly runs on a value no operator ever saw on the 구성 panel.
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    assert.equal(
      config.options[key],
      fallback,
      `${key}: config.json ships ${String(config.options[key])}, the parser falls back to ${String(fallback)}`,
    );
  }
});
