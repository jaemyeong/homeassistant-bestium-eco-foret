import assert from "node:assert/strict";
import test from "node:test";

import { buildFrame, compareWithProduct } from "../tools/buslab/encode.ts";

// Two encoders, side by side. This one builds from the frame rule alone; the other is the
// add-on's `encodeSemanticAction`. Neither is the authority — the bus is — so when they differ
// the tool records both and calls it a finding rather than picking a winner.

test("E3 RED: the light frames are built from the rule, not looked up", () => {
  // `F7 0B 01 19 02 40 1<n> <01 on | 02 off> 00 <XOR> EE`, with the XOR computed here.
  assert.equal(buildFrame({ kind: "light", target: 1, state: "on" }).hex, "f70b01190240110100b6ee");
  assert.equal(buildFrame({ kind: "light", target: 2, state: "off" }).hex, "f70b01190240120200b6ee");
  assert.equal(buildFrame({ kind: "light", target: 3, state: "on" }).hex, "f70b01190240130100b4ee");
});

test("E3 RED: every built frame declares its own length and carries its own checksum", () => {
  for (const target of [1, 2, 3]) {
    for (const state of ["on", "off"]) {
      const built = buildFrame({ kind: "light", target, state });
      const bytes = Uint8Array.from(Buffer.from(built.hex!, "hex"));
      assert.equal(bytes[1], bytes.length, built.hex);
      let x = 0;
      for (let i = 0; i < bytes.length - 2; i += 1) x ^= bytes[i];
      assert.equal(x, bytes[bytes.length - 2], built.hex);
      assert.equal(bytes[bytes.length - 1], 0xee, built.hex);
    }
  }
});

test("E3 RED: the group frames the capture revealed can be built too", () => {
  // Address 0x10 is the group, not a zone. Both were watched on the bus in
  // `capture-1788009200284` and confirmed by the state replies that followed.
  assert.equal(buildFrame({ kind: "light", target: "all", state: "off" }).hex, "f70b01190240100200b4ee");
  assert.equal(buildFrame({ kind: "heat", target: "all", state: "off" }).hex, "f70b01180246100400b5ee");
});

test("E3 RED: the heating and gas frames are built from the same rule", () => {
  assert.equal(buildFrame({ kind: "heat", zone: 1, state: "on" }).hex, "f70b01180246110100b1ee");
  assert.equal(buildFrame({ kind: "heat", zone: 4, state: "off" }).hex, "f70b01180246140400b1ee");
  assert.equal(buildFrame({ kind: "heat", zone: 1, temperatureC: 23 }).hex, "f70b01180245111700a4ee");
  assert.equal(buildFrame({ kind: "gas", state: "close" }).hex, "f70b011b0243110300b5ee");
});

test("E3 RED: an action nobody has watched on the bus is refused, not guessed at", () => {
  // The two group frames that used to sit in this list have been sent and confirmed since,
  // and they moved to the agreement test above. What is left is what the bus still has not
  // shown: a fourth light, an opening gas valve, a door this line can open, and an elevator
  // cancel the installation does not have.
  for (const action of [
    { kind: "light", target: 4, state: "on" },
    { kind: "heat", zone: 5, state: "on" },
    { kind: "gas", state: "open" },
    { kind: "entrance", target: "household", state: "open" },
    { kind: "elevator", direction: "cancel" },
    { kind: "batchoff", state: "toggle" },
    { kind: "nonsense" },
  ]) {
    const built = buildFrame(action);
    assert.equal(built.hex, undefined, JSON.stringify(action));
    assert.equal(typeof built.reason, "string", JSON.stringify(action));
  }
});

test("E3 RED: where the two encoders agree, the comparison says so and names the bytes", () => {
  const result = compareWithProduct({ kind: "light", target: 1, state: "on" });
  assert.equal(result.agree, true);
  assert.equal(result.ours, "f70b01190240110100b6ee");
  assert.deepEqual(result.product, ["f70b01190240110100b6ee"]);
});

test("M5 RED: the disagreements this file recorded are settled, and both encoders agree", () => {
  // Two findings stood here. The product expanded all-zones-off into four per-zone frames
  // because the specification said no group command existed, and it had no all-lights-off at
  // all. The bus decided both: the wallpad sends one group frame per family, at address 0x10,
  // and we sent them ourselves and watched them take. Neither disagreement survives.
  for (const action of [
    { kind: "heat", target: "all", state: "off" }, { kind: "heat", target: "all", state: "on" },
    { kind: "light", target: "all", state: "off" }, { kind: "light", target: "all", state: "on" },
    { kind: "batchoff", state: "on" }, { kind: "batchoff", state: "off" },
    { kind: "elevator", direction: "up" }, { kind: "elevator", direction: "down" },
  ]) {
    const result = compareWithProduct(action);
    assert.equal(result.agree, true, `${JSON.stringify(action)}: ${result.ours} vs ${result.product.join(",")}`);
    assert.equal(result.productEvidence, "observed", JSON.stringify(action));
    assert.equal(result.note, undefined, JSON.stringify(action));
  }
});

test("M5 RED: a comparison neither encoder will make is recorded as such", () => {
  // An action with no observed frame on either side. The note has to say the two encoders
  // both declined rather than let two empty answers read as agreement.
  const result = compareWithProduct({ kind: "gas", state: "open" });
  assert.equal(result.ours, null);
  assert.deepEqual(result.product, []);
  assert.equal(result.agree, false);
  assert.match(String(result.note), /neither/i);
});

test("M5 RED: the door macros are a disagreement, not a match", () => {
  // buslab builds only what it has watched the wallpad do, and it has never watched a door
  // open from this line. The add-on keeps the macro as a candidate for the subphone work.
  // Three frames against none is a difference, and the comparison must say so.
  const result = compareWithProduct({ kind: "entrance", target: "household", state: "ringing" });
  assert.equal(result.ours, null);
  assert.equal(result.product.length, 3);
  assert.equal(result.productEvidence, "unsafe_candidate");
  assert.equal(result.agree, false);
  assert.match(String(result.note), /differ|finding/i);
});
