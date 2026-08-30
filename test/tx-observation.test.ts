import assert from "node:assert/strict";
import test from "node:test";

import { DEVICE_POLL_MS, OBSERVATION_TIMEOUT_MS } from "../bestium-eco-foret/src/tx-queue.ts";
import { DEFAULTS } from "../bestium-eco-foret/src/settings.ts";

// Kept out of `m2.test.ts`: that file is past the size where Node's TypeScript stripping
// segfaults intermittently. See M4-E104 in `.agent/progress.md`.

// Measured on the live bus over one capture and thirty runs, 2026-08-30. The wallpad polls
// each device on its own cadence, and a command's effect is visible on the next poll of the
// device it addressed — for a group command, that poll is the only evidence there is, since
// the group draws no reply of its own (M4-E139, M4-E145).
test("M5 RED: every measured poll interval is named, with its device", () => {
  assert.deepEqual(Object.keys(DEVICE_POLL_MS).sort(), ["batchOff", "elevator", "gas", "heating", "lights"]);
  assert.equal(DEVICE_POLL_MS.heating, 2_300, "2.0–2.3 s; the slowest is what the window has to cover");
  assert.equal(DEVICE_POLL_MS.lights, 2_200);
  assert.equal(DEVICE_POLL_MS.gas, 2_100);
  assert.equal(DEVICE_POLL_MS.batchOff, 1_860);
  assert.equal(DEVICE_POLL_MS.elevator, 2_000, "1.2–2.0 s");
});

test("M5 RED: the observation window covers two polls of the slowest device", () => {
  // Two, not three: confirmation returns as soon as it arrives, so the window is only ever
  // spent on a failure — but `tx_max_attempts` multiplies it, and three attempts at three
  // polls each is over twenty seconds of a button that has not answered.
  const slowest = Math.max(...Object.values(DEVICE_POLL_MS));
  assert.equal(slowest, 2_300);
  assert.equal(OBSERVATION_TIMEOUT_MS, slowest * 2);
  assert.equal(DEFAULTS.tx_observation_timeout_ms, OBSERVATION_TIMEOUT_MS);
  assert.ok(OBSERVATION_TIMEOUT_MS * DEFAULTS.tx_max_attempts <= 15_000, "the worst case stays inside fifteen seconds");
});

// The old default was 3,000 ms against a 2,300 ms poll: one poll fits, with 700 ms to spare.
// A poll arriving late meant the window closed first, the attempt was called unconfirmed, and
// the frame went out again — on a half-duplex bus, where a needless repeat is a collision
// waiting to happen and, for batch-off, kills lights in rooms the wallpad cannot reach.
test("M5 RED: the window is wide enough that a late poll does not cause a resend", () => {
  assert.ok(
    OBSERVATION_TIMEOUT_MS >= DEVICE_POLL_MS.heating * 2,
    "one missed poll must not close the window",
  );
  assert.ok(OBSERVATION_TIMEOUT_MS < DEVICE_POLL_MS.heating * 3, "but no wider than it needs to be");
  assert.ok(OBSERVATION_TIMEOUT_MS > 3_000, "wider than the default it replaces");
  assert.ok(OBSERVATION_TIMEOUT_MS <= 30_000, "and inside the range the settings schema allows");
});

// A direct reply is not evidence of an effect. Three measurements say so: the gas valve
// answered byte-identically whether or not the state changed, a heating zone echoed a target
// temperature it did not adopt, and a group command draws no direct reply at all. So the one
// thing confirmation may never do is read a reply as proof.
test("M5 RED: a gas reply is not proof the valve moved", async () => {
  const { isConfirmed } = await import("../bestium-eco-foret/src/tx-queue.ts");
  const writeAtMs = 1_000;
  const close = { kind: "gas", state: "close" };

  // The wallpad's reply to our close arrives, and the valve is still reported open. This is
  // the case measurement found: the same bytes come back either way.
  const stillOpen = { gas: { state: "open", lastSeenAtMs: 1_200, generation: 1 } };
  assert.equal(isConfirmed(close, stillOpen, writeAtMs, 1), false,
    "a reply that still reads open must never confirm a close");

  // Nothing at all yet — the device has not been seen since the write.
  const beforeWrite = { gas: { state: "closed", lastSeenAtMs: 900, generation: 1 } };
  assert.equal(isConfirmed(close, beforeWrite, writeAtMs, 1), false,
    "an observation older than the write proves nothing about it");

  // A different generation is a different transport, and its evidence does not carry over.
  const otherGeneration = { gas: { state: "closed", lastSeenAtMs: 1_200, generation: 2 } };
  assert.equal(isConfirmed(close, otherGeneration, writeAtMs, 1), false,
    "evidence from another generation does not confirm this write");

  // Only a state frame that says closed, stamped after the write, in this generation.
  const closed = { gas: { state: "closed", lastSeenAtMs: 1_200, generation: 1 } };
  assert.equal(isConfirmed(close, closed, writeAtMs, 1), true);
});

test("M5 RED: a heating target confirms on the target field, not on the power reply", async () => {
  const { isConfirmed } = await import("../bestium-eco-foret/src/tx-queue.ts");
  // 4°C was echoed back by a zone that did not adopt it — the device clamps to 5–40 and the
  // reply carried the value we asked for anyway. What confirms a target is the target field
  // holding it, in an observation newer than the write.
  const action = { kind: "heat", zone: 1, temperatureC: 24 };
  const echoedButUnchanged = { heating: { 1: { targetC: 23, state: "on", lastSeenAtMs: 1_200, generation: 1 } } };
  assert.equal(isConfirmed(action, echoedButUnchanged, 1_000, 1), false);
  const adopted = { heating: { 1: { targetC: 24, state: "on", lastSeenAtMs: 1_200, generation: 1 } } };
  assert.equal(isConfirmed(action, adopted, 1_000, 1), true);
});
