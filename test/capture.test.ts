import assert from "node:assert/strict";
import test from "node:test";

import { createCaptureRecorder } from "../src/capture.ts";

test("records synthetic chunks as byte stream entries", () => {
  const record = createCaptureRecorder();

  const first = record(new Uint8Array([0x00, 0xFF, 0x0a]), 1_699_999);
  const second = record(new Uint8Array([0x7f]), 1_700_000);

  assert.equal(first.sequence, 0);
  assert.equal(first.receivedAtMs, 1_699_999);
  assert.equal(first.byteLength, 3);
  assert.equal(first.hex, "00ff0a");

  assert.equal(second.sequence, 1);
  assert.equal(second.receivedAtMs, 1_700_000);
  assert.equal(second.byteLength, 1);
  assert.equal(second.hex, "7f");
});

test("rejects invalid inputs and does not consume sequence", () => {
  const record = createCaptureRecorder();

  assert.throws(() => {
    record(new Uint8Array([]), 1_700_000);
  }, /non-empty/);

  assert.throws(() => {
    record(1 as unknown as Uint8Array, 1_700_000);
  }, /non-empty/);

  assert.throws(() => {
    record(new Uint8Array([0x01]), -1);
  }, /non-negative/);

  assert.throws(() => {
    record(new Uint8Array([0x01]), Number.NaN);
  }, /safe integer/);

  assert.throws(() => {
    record(new Uint8Array([0x01]), Number.MAX_SAFE_INTEGER + 1);
  }, /safe integer/);

  const ok = record(new Uint8Array([0x02]), 1_700_001);
  assert.equal(ok.sequence, 0);
});
