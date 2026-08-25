import assert from "node:assert/strict";
import test from "node:test";

import { createTxCoordinator, parseM2Settings } from "../bestium-eco-foret/src/m2.ts";

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
  const settings = parseM2Settings({
    ew11_host: "gateway-1",
    ew11_port: 8899,
    transmit_enabled: true,
    speculative_transmit_enabled: true,
    transmit_user_id: "operator-7",
    speculative_tx_cooldown_ms: cooldownMs,
  } as AnyRecord);
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
const action = { kind: "heat", zone: 2, state: "on" };

test("M4.9 RED: candidate one-tap is still rate limited by the speculative cooldown", async () => {
  // One tap now issues the challenge and commits in a single gesture, so the operator no
  // longer types the confirmation phrase. The phrase was never the rate limit: the cooldown
  // is charged at challenge issuance, and `send` skips its own check for an accepted
  // challenge precisely because issuance already charged it. Nothing else stops repeated
  // taps, so that one gate is asserted here.
  const { coordinator, writes, advance } = createFixture(5_000);
  const preview = await coordinator.send(action, { ...request, mode: "preview" }) as AnyRecord;
  assert.equal(preview.evidence, "inferred_candidate", "zone 2 heat is a candidate, not an observed control");
  assert.equal(preview.ready, true, JSON.stringify(preview.reasons ?? []));

  const tap = async (): Promise<string> => {
    let challenge: AnyRecord;
    try {
      challenge = coordinator.issueSpeculativeChallenge(action, request) as AnyRecord;
    } catch (error) {
      return String((error as Error).message);
    }
    const result = await coordinator.send(action, { ...request, mode: "live", challengeId: challenge.id }) as AnyRecord;
    return String(result.outcome ?? result.reason);
  };

  assert.equal(await tap(), "socket_written_unconfirmed");
  assert.equal(writes.length, 1);
  assert.match(await tap(), /TX cooldown active/, "a second tap inside the cooldown must be refused");
  assert.equal(writes.length, 1, "a refused tap must not put a frame on the bus");
  advance(4_999);
  assert.match(await tap(), /TX cooldown active/, "the cooldown runs to its full width");
  assert.equal(writes.length, 1);
  advance(2);
  assert.equal(await tap(), "socket_written_unconfirmed", "the tap is allowed once the cooldown expires");
  assert.equal(writes.length, 2);
});
