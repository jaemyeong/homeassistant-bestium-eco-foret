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
    // Address 0x10 is the group. Both directions have now been sent and confirmed, so the
    // note about only having watched the off value no longer holds.
    if (value.target === "all" && (value.state === "on" || value.state === "off")) {
      return { ...frame([1, 0x19, 2, 0x40, 0x10, value.state === "on" ? 1 : 2, 0]),
        observedIn: "capture-1788009200284, and ten sends of our own, all confirmed" };
    }
    return { reason: "only lights 1-3 and the group address take on/off" };
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
    if (value.target === "all" && (value.state === "on" || value.state === "off")) {
      return { ...frame([1, 0x18, 2, 0x46, 0x10, value.state === "on" ? 1 : 4, 0]),
        observedIn: "capture-1788009200284, and two sends confirmed by polling" };
    }
    return { reason: "only zones 1-4 and the group address take on/off" };
  }

  if (value.kind === "gas") {
    if (value.state === "close") return { ...frame([1, 0x1b, 2, 0x43, 0x11, 3, 0]), observedIn: "capture-1788009200284" };
    return { reason: "gas may be closed and never opened" };
  }

  // Length 0x0C and a `19 00` payload after the value, which no other family on this bus
  // uses. Setting address 0x11, not the 0x10 the query rides on — reading the query address
  // back as the setting address is what made every derived candidate miss.
  if (value.kind === "batchoff") {
    if (value.state === "on" || value.state === "off") {
      return { ...frame([1, 0x2a, 2, 0x40, 0x11, value.state === "on" ? 1 : 2, 0x19, 0]),
        observedIn: "the legacy source, then two sends of our own, both confirmed" };
    }
    return { reason: "batch-off is set or released, nothing else" };
  }

  // Kind byte 0x04 and the direction last, behind a `00`. The 0x02 shape went out twice and
  // registered nothing.
  if (value.kind === "elevator") {
    if (value.direction === "up" || value.direction === "down") {
      return { ...frame([1, 0x34, 4, 0x41, 0x10, 0, value.direction === "up" ? 5 : 6]),
        observedIn: "five sends, judged off the status stream rather than the reply" };
    }
    return { reason: "the elevator is called up or down; there is no cancel" };
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
