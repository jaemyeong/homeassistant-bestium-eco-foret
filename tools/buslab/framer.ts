// An independent framer. It knows a length byte, an XOR over every byte but the last two, and
// the terminator `EE`. That is the whole rule. It imports nothing from the add-on, so when the
// two agree the agreement is evidence rather than a tautology — which is exactly what
// `.agent/spec-device-protocol.md` §3.1 says has been missing.
//
// It carries across reads. A TCP boundary is not a frame boundary: the gateway flushes on a
// 50 ms serial gap and the network may split what it sends. In the 54.6-minute capture exactly
// one frame straddles two reads, and a framer that did not carry called those fourteen bytes
// garbage.

export type ReadMeta = {
  seq: number;
  wallMs: number;
  monoNs: bigint;
};

export type BusFrame = {
  kind: "f7" | "7f";
  hex: string;
  bytes: Uint8Array;
  /** The read the last byte arrived in. That is when the gateway finished handing it over. */
  seq: number;
  wallMs: number;
  monoNs: bigint;
  startSeq: number;
  endSeq: number;
  spansReads: boolean;
};

export type Unparsed = {
  hex: string;
  seq: number;
  offset: number;
  reason: string;
};

export type FramerOutput = {
  frames: BusFrame[];
  unparsed: Unparsed[];
};

/** A frame declares its own length in one byte, so nothing legitimate can need more than this. */
const MAX_PENDING = 512;
const MIN_FRAME = 4;
const SEVEN_F_LENGTH = 5;

const toHex = (value: Uint8Array): string =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.byteLength === 0) return b;
  if (b.byteLength === 0) return a;
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

function checksumOk(frame: Uint8Array): boolean {
  let x = 0;
  for (let i = 0; i < frame.length - 2; i += 1) x ^= frame[i];
  return x === frame[frame.length - 2] && frame[frame.length - 1] === 0xee;
}

export type Framer = ReturnType<typeof createFramer>;

export function createFramer() {
  let pending = new Uint8Array(0);
  let pendingMeta: ReadMeta | null = null;
  let pendingOffset = 0;
  let frames = 0;
  let unparsedBytes = 0;
  let spanning = 0;

  const drain = (data: Uint8Array, current: ReadMeta, atEnd: boolean): FramerOutput => {
    const out: FramerOutput = { frames: [], unparsed: [] };
    const carried = pending.byteLength;
    const startMetaOf = (index: number): { meta: ReadMeta; offset: number } =>
      index < carried && pendingMeta
        ? { meta: pendingMeta, offset: pendingOffset + index }
        : { meta: current, offset: index - carried };

    let i = 0;
    const dropOne = (reason: string): void => {
      const where = startMetaOf(i);
      out.unparsed.push({ hex: toHex(data.subarray(i, i + 1)), seq: where.meta.seq, offset: where.offset, reason });
      unparsedBytes += 1;
      i += 1;
    };

    while (i < data.length) {
      const byte = data[i];

      if (byte === 0xf7) {
        if (i + 1 >= data.length) break;                       // need the length byte
        const length = data[i + 1];
        if (length < MIN_FRAME) { dropOne("declared length cannot be a frame"); continue; }
        if (i + length > data.length) break;                   // wait for the rest
        const frame = data.subarray(i, i + length);
        if (!checksumOk(frame)) { dropOne("checksum or terminator mismatch"); continue; }
        const where = startMetaOf(i);
        out.frames.push({
          kind: "f7",
          hex: toHex(frame),
          bytes: frame.slice(),
          seq: current.seq,
          wallMs: current.wallMs,
          monoNs: current.monoNs,
          startSeq: where.meta.seq,
          endSeq: current.seq,
          spansReads: where.meta.seq !== current.seq,
        });
        frames += 1;
        if (where.meta.seq !== current.seq) spanning += 1;
        i += length;
        continue;
      }

      if (byte === 0x7f) {
        if (i + SEVEN_F_LENGTH > data.length) break;           // wait for the rest
        const frame = data.subarray(i, i + SEVEN_F_LENGTH);
        const where = startMetaOf(i);
        out.frames.push({
          kind: "7f",
          hex: toHex(frame),
          bytes: frame.slice(),
          seq: current.seq,
          wallMs: current.wallMs,
          monoNs: current.monoNs,
          startSeq: where.meta.seq,
          endSeq: current.seq,
          spansReads: where.meta.seq !== current.seq,
        });
        frames += 1;
        if (where.meta.seq !== current.seq) spanning += 1;
        i += SEVEN_F_LENGTH;
        continue;
      }

      dropOne("byte begins no known frame");
    }

    let rest = data.subarray(i);
    // A corrupt length byte would otherwise stall the framer for the rest of the run, so once
    // the wait grows past anything a one-byte length could justify, give up one byte and resync.
    while (rest.byteLength > MAX_PENDING) {
      const where = startMetaOf(i);
      out.unparsed.push({
        hex: toHex(rest.subarray(0, 1)),
        seq: where.meta.seq,
        offset: where.offset,
        reason: "held too long without completing a frame",
      });
      unparsedBytes += 1;
      i += 1;
      rest = data.subarray(i);
    }

    if (atEnd) {
      if (rest.byteLength > 0) {
        const where = startMetaOf(i);
        out.unparsed.push({
          hex: toHex(rest),
          seq: where.meta.seq,
          offset: where.offset,
          reason: "incomplete at end of run",
        });
        unparsedBytes += rest.byteLength;
      }
      pending = new Uint8Array(0);
      pendingMeta = null;
      pendingOffset = 0;
      return out;
    }

    if (rest.byteLength > 0) {
      const where = startMetaOf(i);
      pendingMeta = where.meta;
      pendingOffset = where.offset;
      pending = rest.slice();
    } else {
      pending = new Uint8Array(0);
      pendingMeta = null;
      pendingOffset = 0;
    }
    return out;
  };

  return {
    push: (bytes: Uint8Array, current: ReadMeta): FramerOutput => drain(concat(pending, bytes), current, false),
    flush: (): FramerOutput => {
      const last = pendingMeta ?? { seq: -1, wallMs: 0, monoNs: 0n };
      return drain(pending, last, true);
    },
    stats: (): { frames: number; unparsedBytes: number; spanning: number } =>
      ({ frames, unparsedBytes, spanning }),
  };
}
