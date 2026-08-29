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

/**
 * Phase two adds the two light group frames. The off frame was watched on the bus twice in
 * `capture-1788009200284`; the on frame has never been observed anywhere and is an inferred
 * candidate, permitted only because a light is reversible and harmless. A phase is a list, never
 * a bypass: heating, the elevator and an invented light value stay outside it.
 */
export const PHASE2_ALLOWED: readonly string[] = [
  ...PHASE1_ALLOWED,
  "f70b01190240100200b4ee",
  "f70b01190240100100b7ee",
];

/**
 * Phase three adds heating, which arrives with better evidence than the lights ever had. All four
 * zone-on frames sit in `capture-1788009200284` byte for byte, and the 0.2.8 field report records
 * zone 1's off frame and a zone 1 target frame from an earlier capture. Zones 2 to 4 off are
 * inferred, from the rule that produced all four on frames correctly.
 *
 * The two target frames move zone 1 down to 21 °C and put it back to 23 °C, which is what every
 * zone already holds. Every room on this bus reads 24 °C or warmer, so no frame on this list can
 * call for heat. The heating group frames are deliberately absent: the off frame was watched
 * twice but nobody has asked for it, and the on frame has never been observed anywhere.
 */
export const PHASE3_ALLOWED: readonly string[] = [
  ...PHASE2_ALLOWED,
  "f70b01180246110100b1ee",
  "f70b01180246120100b2ee",
  "f70b01180246130100b3ee",
  "f70b01180246140100b4ee",
  "f70b01180246110400b4ee",
  "f70b01180246120400b7ee",
  "f70b01180246130400b6ee",
  "f70b01180246140400b1ee",
  "f70b01180245111500a6ee",
  "f70b01180245111700a4ee",
];

/**
 * Phase four adds the heating group, `0x18 02 46 10`, which addresses all four zones at once.
 *
 * The off frame was watched twice in `capture-1788009200284`. The **on** frame has never been
 * observed anywhere, in either capture or the legacy source, and comes from the address rule
 * alone. That rule has since produced eight per-zone frames the wallpad answered and the poll
 * confirmed, and group-off at this very address is observed, so group-on is one value byte from a
 * confirmed frame rather than an invention. The ledger grades the two apart regardless.
 *
 * Neither can call for heat while every room is warmer than its target, and the observed off frame
 * undoes the inferred on frame, so the direction that costs money has a confirmed way back. The
 * caller still has to read the temperatures first; see the refusal below for why the guard cannot.
 */
export const PHASE4_ALLOWED: readonly string[] = [
  ...PHASE3_ALLOWED,
  "f70b01180246100400b5ee",
  "f70b01180246100100b0ee",
];

/**
 * Phase five finishes the heating targets and opens the batch-off device.
 *
 * The targets extend `0x45` to zones 2, 3 and 4 at the two values zone 1 used. 23 is what every
 * zone already holds and 21 is below it, and every room on this bus reads 24 °C or warmer, so
 * nothing here can call for heat. The ceiling refusal still governs them by value, not by address.
 *
 * `0x2A` is a different kind of entry. **Nothing has ever been seen commanding it**: two captures
 * and every run, 34,686 records, carry no set frame addressed to that device. Absence is not
 * proof, and this project holds a counter-example against itself — the heating group-on frame was
 * equally absent and worked the first time we sent it. These two come from the device's own reply,
 * `F7 0E 01 2A 04 40 10 00 19 <state> 1B 03 <XOR> EE`, whose sub-command and address drop into the
 * same set-frame skeleton the lights use, with the reply's own state byte as the value.
 *
 * The device is the entrance batch-off switch, which is a separate unit by the front door rather
 * than part of the wallpad. Engaging it turns the lights off and releasing turns light 1 on; the
 * operator has worked it by hand four times, so the effect is known and reversible.
 */
export const PHASE5_ALLOWED: readonly string[] = [
  ...PHASE4_ALLOWED,
  "f70b01180245121500a5ee",
  "f70b01180245121700a7ee",
  "f70b01180245131500a4ee",
  "f70b01180245131700a6ee",
  "f70b01180245141500a3ee",
  "f70b01180245141700a1ee",
  "f70b012a024010010084ee",
  "f70b012a024010020087ee",
];

const PHASES: Record<number, readonly string[]> = {
  1: PHASE1_ALLOWED,
  2: PHASE2_ALLOWED,
  3: PHASE3_ALLOWED,
  4: PHASE4_ALLOWED,
  5: PHASE5_ALLOWED,
};

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

/** The warmest heating target this tool will ever send. See the refusal below for why. */
const HEATING_TARGET_CEILING_C = 23;

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
  if (device === 0x18 && kind === 0x02 && b[5] === 0x45 && b[7] > HEATING_TARGET_CEILING_C) {
    // The allowlist blocks these already; this refusal is here for `allowAll`, which exists so a
    // later phase can be tried and would otherwise let through a frame that makes a room hotter
    // and burns gas for as long as nobody notices. Same shape as the gas rule: name the unsafe
    // direction rather than rely on a list. The ceiling is the target every zone already holds,
    // so no frame from here can set a zone warmer than the household chose.
    //
    // It does not follow that nothing here can call for heat. A zone turned on at the existing
    // 23 C target will heat a room that has since fallen below it, and this rule cannot see the
    // room. That is the caller's job: read the current temperatures before arming and stop if
    // any zone is at or under the target.
    //
    // The constant is a deliberate limit and not a fact about the protocol; raising it is a
    // decision, and it needs the same approval that widening a phase does.
    return `this tool never raises a heating target above ${HEATING_TARGET_CEILING_C} C`;
  }
  return null;
}

export function checkOutgoing(opts: {
  hex: string;
  armed: boolean;
  /** Which allowlist applies. A phase widens what is permitted; it never touches the refusals. */
  phase?: number;
  /** Escape hatch for tests of a hypothetical later phase. It never touches the refusals either. */
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

  const phase = Number(opts.phase ?? 1);
  const allowed = PHASES[phase];
  if (!opts.allowAll) {
    if (!allowed) return { ok: false, reason: `there is no phase ${phase}`, bytes, hex };
    if (!allowed.includes(hex)) {
      return {
        ok: false,
        reason: `not on the phase-${phase} allowlist, which is ${allowed.length} frames matched exactly`,
        bytes,
        hex,
      };
    }
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
