import assert from "node:assert/strict";
import test from "node:test";

import {
  createIntentQueue,
  expandAction,
  intentKey,
  isConfirmed,
  isRetryableRefusal,
} from "../bestium-eco-foret/src/tx-queue.ts";

type AnyRecord = Record<string, any>;

const GENERATION = 7;
const WRITE_AT = 1_700_000_000;

function devices(overrides: AnyRecord = {}): AnyRecord {
  const fresh = { lastSeenAtMs: WRITE_AT + 40, generation: GENERATION, stale: false };
  return {
    lights: { 1: { ...fresh, state: "off" }, 2: { ...fresh, state: "off" }, 3: { ...fresh, state: "off" } },
    heating: {
      1: { ...fresh, state: "off", currentC: 23, targetC: 23 },
      2: { ...fresh, state: "off", currentC: 26, targetC: 23 },
      3: { ...fresh, state: "off", currentC: 26, targetC: 23 },
      4: { ...fresh, state: "off", currentC: 27, targetC: 23 },
    },
    gas: { ...fresh, state: "open" },
    elevator: { ...fresh, motion: "idle", call: "none" },
    outlet: { ...fresh },
    ventilation: { ...fresh },
    ...overrides,
  };
}

test("0.3.0 RED: the queue key names the settable, not the device family", () => {
  assert.equal(intentKey({ kind: "light", target: 2, state: "on" }), "light:2");
  // Power and target temperature are different settables on the same zone. The wallpad
  // answers both with the whole zone, so sharing one key would let each confirm off the
  // other's reply.
  assert.equal(intentKey({ kind: "heat", zone: 3, state: "on" }), "heat:3:power");
  assert.equal(intentKey({ kind: "heat", zone: 3, temperatureC: 24 }), "heat:3:target");
  assert.equal(intentKey({ kind: "gas", state: "close" }), "gas");
  assert.equal(intentKey({ kind: "elevator", direction: "down" }), "elevator");
  assert.equal(intentKey({ kind: "outlet", action: "query" }), "query:outlet");
});

test("0.3.0 RED: an action with no confirmable state is never queued", () => {
  // A door macro has no reply on this line, so it can neither be confirmed nor retried.
  assert.equal(intentKey({ kind: "entrance", target: "household", state: "ringing" }), null);
  assert.equal(intentKey({ kind: "raw", hex: "f70b0199024010010000aaee" }), null);
  assert.equal(intentKey({ kind: "nonsense" }), null);
});

test("0.3.0 RED: all-zones off becomes four independent per-zone intents", () => {
  const expanded = expandAction({ kind: "heat", target: "all", state: "off" });
  assert.deepEqual(expanded, [
    { kind: "heat", zone: 1, state: "off" },
    { kind: "heat", zone: 2, state: "off" },
    { kind: "heat", zone: 3, state: "off" },
    { kind: "heat", zone: 4, state: "off" },
  ]);
  const single = { kind: "light", target: 1, state: "on" };
  assert.deepEqual(expandAction(single), [single]);
});

test("0.3.0 RED: the same key keeps its place and carries the last requested state", () => {
  const queue = createIntentQueue();
  queue.enqueue("light:1", { kind: "light", target: 1, state: "on" });
  queue.enqueue("light:2", { kind: "light", target: 2, state: "on" });
  const replaced = queue.enqueue("light:1", { kind: "light", target: 1, state: "off" });

  assert.equal(replaced.superseded?.value.state, "on", "the replaced intent is handed back so it can be reported");
  assert.equal(replaced.entry.value.state, "off");
  assert.equal(queue.size(), 2, "a repeat of the same key must not add a second entry");

  const first = queue.take();
  assert.equal(first?.key, "light:1", "the key holds its original place in the queue");
  assert.equal(first?.value.state, "off", "the last requested state is the one that runs");
  assert.equal(queue.take()?.key, "light:2");
  assert.equal(queue.take(), undefined);
});

test("0.3.0 RED: a mashed button collapses to one execution", () => {
  const queue = createIntentQueue();
  for (const state of ["on", "off", "on", "off"]) {
    queue.enqueue("light:1", { kind: "light", target: 1, state });
  }
  assert.equal(queue.size(), 1);
  assert.equal(queue.take()?.value.state, "off");
});

test("0.3.0 RED: success is the intended value matching, not the state changing", () => {
  // Both heating commands that reached the bus in capture A were no-ops against the state
  // the zone already held, and the wallpad answered them. Requiring a change would mark
  // those failed and retry for ever.
  const already = devices();
  assert.equal(
    isConfirmed({ kind: "heat", zone: 2, state: "off" }, already, WRITE_AT, GENERATION),
    true,
    "commanding the state a zone already holds confirms once the reply lands",
  );
  assert.equal(
    isConfirmed({ kind: "heat", zone: 2, state: "on" }, already, WRITE_AT, GENERATION),
    false,
  );
});

test("0.3.0 RED: an observation older than the write does not confirm it", () => {
  const stale = devices();
  stale.heating[2] = { ...stale.heating[2], lastSeenAtMs: WRITE_AT - 1 };
  assert.equal(isConfirmed({ kind: "heat", zone: 2, state: "off" }, stale, WRITE_AT, GENERATION), false);

  const otherGeneration = devices();
  otherGeneration.heating[2] = { ...otherGeneration.heating[2], generation: GENERATION - 1 };
  assert.equal(isConfirmed({ kind: "heat", zone: 2, state: "off" }, otherGeneration, WRITE_AT, GENERATION), false);
});

test("0.3.0 RED: each intent reads only the field it owns", () => {
  // The reply to a 0x45 target command also carries power, and the reply to a 0x46 power
  // command also carries the target. Reading the whole zone would let one confirm the other.
  const zone = devices();
  zone.heating[1] = { ...zone.heating[1], state: "on", targetC: 23 };
  assert.equal(isConfirmed({ kind: "heat", zone: 1, state: "on" }, zone, WRITE_AT, GENERATION), true);
  assert.equal(isConfirmed({ kind: "heat", zone: 1, temperatureC: 24 }, zone, WRITE_AT, GENERATION), false);
  zone.heating[1] = { ...zone.heating[1], targetC: 24 };
  assert.equal(isConfirmed({ kind: "heat", zone: 1, temperatureC: 24 }, zone, WRITE_AT, GENERATION), true);
});

test("0.3.0 RED: lights, gas and the elevator call each have their own predicate", () => {
  const state = devices();
  state.lights[3] = { ...state.lights[3], state: "on" };
  state.gas = { ...state.gas, state: "closed" };
  state.elevator = { ...state.elevator, call: "down" };
  assert.equal(isConfirmed({ kind: "light", target: 3, state: "on" }, state, WRITE_AT, GENERATION), true);
  assert.equal(isConfirmed({ kind: "light", target: 3, state: "off" }, state, WRITE_AT, GENERATION), false);
  assert.equal(isConfirmed({ kind: "gas", state: "close" }, state, WRITE_AT, GENERATION), true);

  // The standing call is a shared building state. A match alone would let a neighbour's call
  // in the same direction stand in as proof that our frame worked, which is exactly the
  // verdict this control exists to obtain.
  const noCallBefore = { elevator: { call: "none" } };
  assert.equal(isConfirmed({ kind: "elevator", direction: "down" }, state, WRITE_AT, GENERATION, noCallBefore), true);
  assert.equal(isConfirmed({ kind: "elevator", direction: "up" }, state, WRITE_AT, GENERATION, noCallBefore), false);
  const alreadyStanding = { elevator: { call: "down" } };
  assert.equal(
    isConfirmed({ kind: "elevator", direction: "down" }, state, WRITE_AT, GENERATION, alreadyStanding),
    false,
    "a call that was already standing before the write proves nothing about our frame",
  );
  assert.equal(
    isConfirmed({ kind: "elevator", direction: "down" }, state, WRITE_AT, GENERATION),
    false,
    "with no before-value there is nothing to compare, so nothing is claimed",
  );
});

test("0.3.0 RED: only a refusal that a later attempt could clear is retried", () => {
  assert.equal(isRetryableRefusal("line busy: quiet interval not met"), true);
  assert.equal(isRetryableRefusal("transport/RX race before write"), true);
  assert.equal(isRetryableRefusal("TX disabled"), false);
  assert.equal(isRetryableRefusal("authorized user mismatch"), false);
  assert.equal(isRetryableRefusal("transport generation quarantined; speculative challenge unavailable"), false);
});

test("0.3.0 RED: clearing the queue hands back every dropped entry", () => {
  const queue = createIntentQueue();
  queue.enqueue("light:1", { kind: "light", target: 1, state: "on" });
  queue.enqueue("gas", { kind: "gas", state: "close" });
  const dropped = queue.clear();
  assert.deepEqual(dropped.map((entry) => entry.key), ["light:1", "gas"]);
  assert.equal(queue.size(), 0);
});
