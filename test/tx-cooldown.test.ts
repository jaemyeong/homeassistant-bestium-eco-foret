import assert from "node:assert/strict";
import test from "node:test";

import { createTxCoordinator } from "../bestium-eco-foret/src/m2.ts";
import { DEFAULTS } from "../bestium-eco-foret/src/settings.ts";

// This lives outside `m2.test.ts` on purpose. That file is past the size where Node's
// TypeScript stripping segfaults intermittently: adding roughly 3 KB of any test —
// a verbatim clone of a passing one included — makes the run crash about once in six.

type AnyRecord = Record<string, unknown>;

function createFixture(cooldownMs: number) {
  let now = 1_700_000_000;
  const writes: string[] = [];
  const transport = {
    on() {}, off() {}, removeAllListeners() {}, destroy() {},
    write(chunk: Uint8Array, callback?: (error?: Error | null) => void) {
      writes.push(Array.from(chunk, (byte) => byte.toString(16).padStart(2, "0")).join(""));
      callback?.(null);
      return true;
    },
  };
  const settings = {
    ...DEFAULTS,
    ew11_host: "gateway-1",
    ew11_port: 8899,
    transmit_enabled: true,
    transmit_user_id: "operator-7",
    tx_cooldown_ms: cooldownMs,
  } as AnyRecord;
  const coordinator = createTxCoordinator({
    settings,
    nowMs: () => now,
    setTimeout: () => 0,
    clearTimeout: () => {},
    randomBytes: (size: number) => Uint8Array.from({ length: size }, (_value, index) => index),
    getCurrentUserId: () => "operator-7",
    getTransport: () => transport,
    getGeneration: () => 1,
    getRxState: () => ({
      connected: true,
      pendingAppend: false,
      rxByteEpoch: 1,
      validFrameEpoch: 1,
      validFrameGeneration: 1,
      readEpoch: 1,
      txByteEpoch: 0,
      lastRxByteAtMs: now - 100,
      lastValidFrameAtMs: now - 100,
      lastResumeAtMs: now - 100,
    }),
  } as AnyRecord);
  return { coordinator, writes, advance: (ms: number) => { now += ms; } };
}

const request = {
  userId: "operator-7",
  confirmationPhrase: "I UNDERSTAND THIS IS AN INFERRED CANDIDATE",
  schedule: "immediate",
};
// Every control the page offers is measured now: heating went first, then the elevator, whose
// earlier shape had two bytes wrong. The one candidate left is the door macro, and it sends
// three frames with waits between them that this clock-less fixture cannot drive. So the gate
// is asserted against an observed control instead — which is also the one an operator meets
// every day, since the page offers no candidate at all.
const action = { kind: "light", target: 1, state: "on" };

test("M5 RED: one tap is rate limited, and it is the ordinary control that meets the gate", async () => {
  // The cooldown was asserted against a candidate because a candidate was the only thing that
  // took one tap without a typed phrase. Measurement removed every candidate the page offers,
  // so the gate that matters is the one an ordinary control meets: nothing but the cooldown
  // stands between a mashed button and a burst of frames on a half-duplex bus.
  const { coordinator, writes, advance } = createFixture(5_000);
  const preview = await coordinator.send(action, { ...request, mode: "preview" }) as AnyRecord;
  assert.equal(preview.evidence, "observed", "every control the page offers is measured");
  assert.equal(preview.ready, true, JSON.stringify(preview.reasons ?? []));

  const tap = async (): Promise<string> => {
    const result = await coordinator.send(action, { ...request, mode: "live" }) as AnyRecord;
    // A queued control reports its outcome and, when refused, why. The reason is the half
    // this test is about.
    return [result.outcome, result.reason].filter(Boolean).join(": ");
  };

  // An observed control goes through the queue, so what comes back names the confirmation
  // rather than the write. Either way the frame left the socket, which is what charges the
  // cooldown; whether the wallpad answered is a different test's subject.
  const firstTap = await tap();
  assert.match(firstTap, /written|confirmed|unconfirmed/, `the first tap reaches the bus, got ${firstTap}`);
  assert.equal(writes.length, 1);
  const secondTap = await tap();
  assert.match(secondTap, /TX cooldown active/, `a second tap inside the cooldown must be refused, got ${secondTap}`);
  assert.equal(writes.length, 1, "a refused tap must not put a frame on the bus");
  advance(4_999);
  assert.match(await tap(), /TX cooldown active/, "the cooldown runs to its full width");
  assert.equal(writes.length, 1);
  advance(2);
  const laterTap = await tap();
  assert.match(laterTap, /written|confirmed|unconfirmed/, `the tap is allowed once the cooldown expires, got ${laterTap}`);
  assert.equal(writes.length, 2);
});
