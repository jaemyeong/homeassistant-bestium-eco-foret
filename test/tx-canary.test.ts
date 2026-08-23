import assert from "node:assert/strict";
import test from "node:test";

import { encodeSingleLightOffCanary } from "../bestium-eco-foret/src/tx-canary.ts";

const expected = [
  [0x11, "f70b01190240110200b5ee"],
  [0x12, "f70b01190240120200b6ee"],
  [0x13, "f70b01190240130200b7ee"],
] as const;

test("encodes the three allowlisted single-light OFF canaries", () => {
  for (const [target, hex] of expected) {
    const frame = encodeSingleLightOffCanary(target);
    assert.equal(Array.from(frame, (byte) => byte.toString(16).padStart(2, "0")).join(""), hex);

    assert.equal(frame.byteLength, 11);
    assert.equal(frame[0], 0xf7);
    assert.equal(frame[1], frame.byteLength);
    assert.equal(frame[10], 0xee);
    let checksum = 0;
    for (let i = 0; i <= 8; i += 1) checksum ^= frame[i];
    assert.equal(checksum, frame[9]);
  }
});

test("rejects non-allowlisted and invalid targets", () => {
  const nonNumber = "0x11" as unknown as number;
  for (const target of [0x10, 0x14, 1.5, nonNumber]) {
    assert.throws(() => encodeSingleLightOffCanary(target));
  }
});
