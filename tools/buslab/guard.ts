// The only place in this tool where bytes can reach a real bus.
//
// Two lists govern it, and they are not the same kind of thing. The allowlist is what the
// current phase permits and it will widen with approval. The refusal list is not a phase:
// nothing opens it, because those frames open a door, or their meaning is still undecided, or
// they are the safe direction's opposite.
//
// The allowlist is an exact byte match rather than a pattern. A mistyped XOR that satisfied a
// pattern would leave the wallpad ignoring the frame, and recording that silence as "no
// response" is a false finding on the very first send.

/** Light 1-3, on and off. Physically verified, reversible, and byte-identical to the wallpad's own. */
export const PHASE1_ALLOWED: readonly string[] = [
  "f70b01190240110100b6ee",
  "f70b01190240110200b5ee",
  "f70b01190240120100b5ee",
  "f70b01190240120200b6ee",
  "f70b01190240130100b4ee",
  "f70b01190240130200b7ee",
];

export type Verdict =
  | { ok: true; write: boolean; bytes: Uint8Array; hex: string }
  | { ok: false; reason: string; bytes?: Uint8Array; hex?: string; write?: false };

function parseHex(hex: string): Uint8Array | null {
  if (typeof hex !== "string" || hex.length < 8 || hex.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function checksumOk(frame: Uint8Array): boolean {
  let x = 0;
  for (let i = 0; i < frame.length - 2; i += 1) x ^= frame[i];
  return x === frame[frame.length - 2] && frame[frame.length - 1] === 0xee;
}

/** Refusals no flag opens. Each names why, because a refusal without a reason invites a retry. */
function refusalReason(b: Uint8Array): string | null {
  if (b[0] === 0x7f) {
    return "0x7F is a subphone macro and opens a door; this tool never sends one";
  }
  if (b[0] !== 0xf7) return "a frame must begin with F7 or 7F";
  const device = b[3];
  const kind = b[4];
  if (device === 0x1e && kind === 0x02) {
    return "the 0x1E 02 frame's meaning is undecided and may be a door-open command";
  }
  if (device === 0x1b && kind === 0x02) {
    // 03 locks the valve. Anything else on this device is an opening, or an unknown, and gas
    // is the one device where the unsafe direction is not recoverable by pressing again.
    if (b[7] !== 0x03) return "gas may be closed and never opened";
  }
  return null;
}

export function checkOutgoing(opts: {
  hex: string;
  armed: boolean;
  /** Widens the allowlist for a phase that has its own approval. It does not touch the refusals. */
  allowAll?: boolean;
}): Verdict {
  const hex = typeof opts.hex === "string" ? opts.hex.trim().toLowerCase() : "";
  const bytes = parseHex(hex);
  if (!bytes) return { ok: false, reason: "not an even-length hex string of at least four bytes" };

  const refusal = refusalReason(bytes);
  if (refusal) return { ok: false, reason: refusal, bytes, hex };

  if (bytes[0] === 0xf7) {
    if (bytes[1] !== bytes.length) {
      return { ok: false, reason: `the frame declares ${bytes[1]} bytes but is ${bytes.length}`, bytes, hex };
    }
    if (!checksumOk(bytes)) {
      return { ok: false, reason: "the frame's own XOR checksum or its EE terminator is wrong", bytes, hex };
    }
  }

  if (!opts.allowAll && !PHASE1_ALLOWED.includes(hex)) {
    return {
      ok: false,
      reason: "not on the phase-one allowlist, which is the six light frames matched exactly",
      bytes,
      hex,
    };
  }

  return { ok: true, write: opts.armed === true, bytes, hex };
}

export type Mask = (number | null)[];

/**
 * `--expect` masks. Byte pairs, `??` for any byte, compared as a prefix anchored at offset 0.
 * Nibble-level matching is deliberately unsupported: a rule that is only almost understood
 * produces findings that are only almost true.
 */
export function parseMask(text: string): { ok: true; mask: Mask } | { ok: false; reason: string } {
  const clean = typeof text === "string" ? text.trim().toLowerCase() : "";
  if (clean.length === 0) return { ok: false, reason: "an empty mask matches everything; say so explicitly" };
  if (clean.length % 2 !== 0) return { ok: false, reason: "a mask is whole byte pairs" };
  const mask: Mask = [];
  for (let i = 0; i < clean.length; i += 2) {
    const pair = clean.slice(i, i + 2);
    if (pair === "??") { mask.push(null); continue; }
    if (!/^[0-9a-f]{2}$/.test(pair)) return { ok: false, reason: `"${pair}" is neither a byte nor ??` };
    mask.push(Number.parseInt(pair, 16));
  }
  return { ok: true, mask };
}

export function matchesMask(frame: Uint8Array, mask: Mask): boolean {
  if (frame.length < mask.length) return false;
  for (let i = 0; i < mask.length; i += 1) {
    const expected = mask[i];
    if (expected !== null && frame[i] !== expected) return false;
  }
  return true;
}
