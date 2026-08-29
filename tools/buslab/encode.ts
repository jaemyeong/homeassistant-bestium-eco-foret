// Two encoders, side by side.
//
// This one builds from the frame rule alone — `F7 <length> 01 <device> <kind> <sub> <address>
// <value> 00 <XOR> EE`, with the length and the XOR computed here. The other is the add-on's
// `encodeSemanticAction`, imported only for comparison. Neither is the authority; the bus is.
// When they differ the tool keeps both and calls it a finding, because picking a winner without
// having sent either is how `.agent/spec-device-protocol.md` §3.1's self-confirming loop starts.
//
// Only actions somebody has watched the wallpad perform can be built. Everything else is
// refused rather than guessed at, which is the rule the heating frames were invented against.

import { encodeSemanticAction } from "../../bestium-eco-foret/src/protocol-debug.ts";

export type Built = { hex?: string; bytes?: Uint8Array; reason?: string; observedIn?: string };

const toHex = (value: Uint8Array): string =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** Length includes `F7`; the XOR covers every byte but the last two. */
function frame(payload: number[]): { hex: string; bytes: Uint8Array } {
  const bytes = new Uint8Array(payload.length + 4);
  bytes[0] = 0xf7;
  bytes[1] = bytes.length;
  bytes.set(payload, 2);
  let x = 0;
  for (let i = 0; i < bytes.length - 2; i += 1) x ^= bytes[i];
  bytes[bytes.length - 2] = x;
  bytes[bytes.length - 1] = 0xee;
  return { hex: toHex(bytes), bytes };
}

const isZone = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 4;
const isLight = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 3;

export function buildFrame(action: unknown): Built {
  if (!action || typeof action !== "object" || Array.isArray(action)) return { reason: "an action is an object" };
  const value = action as Record<string, unknown>;

  if (value.kind === "light") {
    if (isLight(value.target) && (value.state === "on" || value.state === "off")) {
      return { ...frame([1, 0x19, 2, 0x40, 0x10 + value.target, value.state === "on" ? 1 : 2, 0]),
        observedIn: "capture-1788009200284 and the operator's own presses" };
    }
    // Address 0x10 is the group. Only the off value has been watched; a group on has not.
    if (value.target === "all" && value.state === "off") {
      return { ...frame([1, 0x19, 2, 0x40, 0x10, 2, 0]), observedIn: "capture-1788009200284, twice" };
    }
    return { reason: "only lights 1-3 on/off and the all-off group frame have been observed" };
  }

  if (value.kind === "heat") {
    if (isZone(value.zone) && value.temperatureC !== undefined) {
      const t = value.temperatureC;
      if (!Number.isInteger(t) || (t as number) < 5 || (t as number) > 40) return { reason: "temperature is out of range" };
      return { ...frame([1, 0x18, 2, 0x45, 0x10 + value.zone, t as number, 0]), observedIn: "capture-1787635354221, zone 1" };
    }
    if (isZone(value.zone) && (value.state === "on" || value.state === "off")) {
      return { ...frame([1, 0x18, 2, 0x46, 0x10 + value.zone, value.state === "on" ? 1 : 4, 0]),
        observedIn: "capture-1788009200284, all four zones" };
    }
    // `target: "all"` rather than `zone: "all"`, because `compareWithProduct` hands the very
    // same object to both encoders and the add-on spells it this way.
    if (value.target === "all" && value.state === "off") {
      return { ...frame([1, 0x18, 2, 0x46, 0x10, 4, 0]), observedIn: "capture-1788009200284, twice" };
    }
    return { reason: "only zones 1-4 and the all-off group frame have been observed" };
  }

  if (value.kind === "gas") {
    if (value.state === "close") return { ...frame([1, 0x1b, 2, 0x43, 0x11, 3, 0]), observedIn: "capture-1788009200284" };
    return { reason: "gas may be closed and never opened" };
  }

  return { reason: `no observed frame for ${JSON.stringify(value.kind ?? null)}` };
}

export type Comparison = {
  action: unknown;
  ours: string | null;
  oursReason?: string;
  product: string[];
  productEvidence?: string;
  agree: boolean;
  note?: string;
};

/**
 * The add-on's encoder, asked the same question. Its gates are opened here on purpose: what is
 * wanted is the bytes it would emit, not whether it would be allowed to emit them.
 */
export function compareWithProduct(action: unknown): Comparison {
  const ours = buildFrame(action);
  const context = {
    transmitEnabled: true,
    speculativeTransmitEnabled: true,
    unsafeTransmitEnabled: true,
    authorizedUser: true,
  };
  const encoded = encodeSemanticAction(action, context) as Record<string, unknown>;
  const product = Array.isArray(encoded.framesHex)
    ? (encoded.framesHex as string[])
    : typeof encoded.frameHex === "string"
      ? [encoded.frameHex]
      : [];

  const agree = ours.hex !== undefined && product.length === 1 && product[0] === ours.hex;
  const note = agree
    ? undefined
    : ours.hex === undefined && product.length === 0
      ? "neither encoder produces a frame for this action"
      : "the two encoders differ; that is a finding, and the bus decides it";

  return {
    action,
    ours: ours.hex ?? null,
    oursReason: ours.reason,
    product,
    productEvidence: typeof encoded.evidence === "string" ? encoded.evidence : undefined,
    agree,
    note,
  };
}
