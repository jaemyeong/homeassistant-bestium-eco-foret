// Analysis of a finished run. Frames are grouped by the tuple that says what a frame is about
// — device, kind, sub-command, address — and nothing here assigns meaning beyond that. Naming a
// tuple is a separate, declarative step, because the discovery has to work before any name
// exists. That separation is what keeps the tool from confirming what it already believed.

import type { BusFrame } from "./framer.ts";

export type ReadRecord = {
  seq: number;
  wallMs: number;
  monoNs: bigint;
  byteLength: number;
  hex: string;
};

export type MarkRecord = {
  label: string;
  wallMs: number;
  monoNs: bigint;
};

export type LoadedRun = {
  reads: ReadRecord[];
  marks: MarkRecord[];
  other: Record<string, unknown>[];
};

/**
 * Reads either shape: a buslab run (`t`, `monoNs`) or an add-on capture (`sequence`,
 * `receivedAtMs`). A capture has no monotonic clock, so its wall clock stands in; differences
 * within one file are still meaningful, they are just coarser.
 */
export function loadRecords(text: string): LoadedRun {
  const run: LoadedRun = { reads: [], marks: [], other: [] };
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof record.hex === "string" && record.t === undefined && typeof record.receivedAtMs === "number") {
      run.reads.push({
        seq: Number(record.sequence ?? run.reads.length),
        wallMs: record.receivedAtMs,
        monoNs: BigInt(record.receivedAtMs) * 1_000_000n,
        byteLength: Number(record.byteLength ?? record.hex.length / 2),
        hex: record.hex,
      });
      continue;
    }
    const monoNs = typeof record.monoNs === "string" ? BigInt(record.monoNs) : 0n;
    const wallMs = Number(record.wallMs ?? 0);
    if (record.t === "rx" && typeof record.hex === "string") {
      run.reads.push({
        seq: Number(record.seq ?? run.reads.length),
        wallMs,
        monoNs,
        byteLength: Number(record.byteLength ?? record.hex.length / 2),
        hex: record.hex,
      });
    } else if (record.t === "mark" && typeof record.label === "string") {
      run.marks.push({ label: record.label, wallMs, monoNs });
    } else {
      run.other.push(record);
    }
  }
  return run;
}

const hex2 = (byte: number): string => byte.toString(16).padStart(2, "0");

/** device/kind/sub/address for an `F7` frame; the subphone line has no such fields. */
export function frameKey(frame: BusFrame): string {
  const b = frame.bytes;
  if (frame.kind === "7f") return `7f/${hex2(b[1] ?? 0)}`;
  if (b.length < 8) return `f7/short/${b.length}`;
  return `${hex2(b[3])}/${hex2(b[4])}/${hex2(b[5])}/${hex2(b[6])}`;
}

/** Every interval this tool reports is measured on the monotonic clock; the wall clock steps. */
function msBetween(fromNs: bigint, toNs: bigint): number {
  return Math.round(Number(toNs - fromNs) / 1_000) / 1_000;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export type InventoryRow = {
  key: string;
  count: number;
  periodMedianMs: number;
  firstWallMs: number;
  lastWallMs: number;
  lengths: number[];
  /**
   * Byte analysis, grouped by frame length. Positions only line up within one length: the gas
   * tuple arrives as both an eleven- and a thirteen-byte frame, and comparing them by position
   * puts a payload byte against a checksum byte and calls the difference a change.
   */
  byLength: LengthGroup[];
  sampleHex: string;
};

export type LengthGroup = {
  length: number;
  count: number;
  /** Distinct values seen at each byte position, in order of first sighting, trimmed for reading. */
  byteValues: string[][];
  /** How many distinct values there really were, which the trimmed list may understate. */
  byteValueCounts: number[];
  sampleHex: string;
};

/** A checksum position can take every value there is; listing them all buries the finding. */
const MAX_LISTED_VALUES = 16;

export function inventory(frames: BusFrame[]): InventoryRow[] {
  const groups = new Map<string, BusFrame[]>();
  for (const frame of frames) {
    const key = frameKey(frame);
    const bucket = groups.get(key);
    if (bucket) bucket.push(frame);
    else groups.set(key, [frame]);
  }

  const rows: InventoryRow[] = [];
  for (const [key, group] of groups) {
    const gaps: number[] = [];
    for (let i = 1; i < group.length; i += 1) gaps.push(msBetween(group[i - 1].monoNs, group[i].monoNs));
    const lengthBuckets = new Map<number, BusFrame[]>();
    for (const frame of group) {
      const bucket = lengthBuckets.get(frame.bytes.length);
      if (bucket) bucket.push(frame);
      else lengthBuckets.set(frame.bytes.length, [frame]);
    }
    const byLength: LengthGroup[] = [];
    for (const [length, sameLength] of lengthBuckets) {
      const distinct: Set<string>[] = [];
      for (const frame of sameLength) {
        for (let i = 0; i < frame.bytes.length; i += 1) {
          (distinct[i] ?? (distinct[i] = new Set())).add(hex2(frame.bytes[i]));
        }
      }
      byLength.push({
        length,
        count: sameLength.length,
        byteValues: distinct.map((values) => [...values].slice(0, MAX_LISTED_VALUES)),
        byteValueCounts: distinct.map((values) => values.size),
        sampleHex: sameLength[0].hex,
      });
    }
    byLength.sort((a, b) => (b.count - a.count) || (a.length - b.length));
    rows.push({
      key,
      count: group.length,
      periodMedianMs: median(gaps),
      firstWallMs: group[0].wallMs,
      lastWallMs: group[group.length - 1].wallMs,
      lengths: [...new Set(group.map((frame) => frame.bytes.length))].sort((a, b) => a - b),
      byLength,
      sampleHex: group[0].hex,
    });
  }
  rows.sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key));
  return rows;
}

export type GapSummary = {
  count: number;
  minMs: number;
  medianMs: number;
  maxMs: number;
  /** Percentage of gaps at least this long. This is the room a write has to fit into. */
  atLeast(ms: number): number;
};

export function gapSummary(reads: Pick<ReadRecord, "monoNs">[]): GapSummary {
  const gaps: number[] = [];
  for (let i = 1; i < reads.length; i += 1) gaps.push(msBetween(reads[i - 1].monoNs, reads[i].monoNs));
  return {
    count: gaps.length,
    minMs: gaps.length ? Math.min(...gaps) : 0,
    medianMs: median(gaps),
    maxMs: gaps.length ? Math.max(...gaps) : 0,
    atLeast: (ms) => (gaps.length === 0 ? 0 : Math.round((100 * gaps.filter((g) => g >= ms).length) / gaps.length)),
  };
}

export type Change = {
  key: string;
  /** Frames are compared within one length. A tuple can arrive in several shapes. */
  length: number;
  before: string;
  after: string;
  /** Payload positions only. The checksum is derived, so it moves whenever anything does. */
  changedByteIndexes: number[];
  checksumChanged: boolean;
  atWallMs: number;
};

export type Appearance = {
  key: string;
  length: number;
  hex: string;
  atWallMs: number;
};

export type AroundResult = {
  framesInWindow: number;
  changed: Change[];
  appeared: Appearance[];
};

function differingIndexes(before: Uint8Array, after: Uint8Array): { payload: number[]; checksum: boolean } {
  const out: number[] = [];
  const length = Math.max(before.length, after.length);
  // The last two bytes of an F7 frame are the XOR and the terminator. The XOR changes whenever
  // any payload byte does, so listing it in every finding buries the byte that carries meaning.
  const derivedFrom = Math.max(0, Math.min(before.length, after.length) - 2);
  let checksum = false;
  for (let i = 0; i < length; i += 1) {
    if (before[i] === after[i]) continue;
    if (i >= derivedFrom) checksum = true;
    else out.push(i);
  }
  return { payload: out, checksum };
}

/**
 * What moved around a moment. `baselineMs` is how far back to look for the state a tuple was
 * holding before the window opened; a tuple with no baseline is new rather than changed, which
 * is a different kind of finding and is reported separately.
 */
export function around(opts: {
  frames: BusFrame[];
  atMonoNs: bigint;
  windowMs: number;
  baselineMs: number;
}): AroundResult {
  const windowNs = BigInt(Math.max(0, Math.round(opts.windowMs))) * 1_000_000n;
  const baselineNs = BigInt(Math.max(0, Math.round(opts.baselineMs))) * 1_000_000n;
  const windowEnd = opts.atMonoNs + windowNs;
  const baselineStart = opts.atMonoNs - baselineNs;

  // Keyed by tuple AND length. The light group tuple arrives both as an eleven-byte direct
  // reply and as a thirteen-byte status frame; comparing one against the other reports a change
  // that is only a change of shape, and its byte indexes mean nothing.
  const shapeOf = (frame: BusFrame): string => `${frameKey(frame)}#${frame.bytes.length}`;
  const baseline = new Map<string, BusFrame>();
  const inWindow = new Map<string, BusFrame>();
  const firstDifferent = new Map<string, BusFrame>();
  let framesInWindow = 0;

  for (const frame of opts.frames) {
    const shape = shapeOf(frame);
    if (frame.monoNs < opts.atMonoNs) {
      if (frame.monoNs >= baselineStart) baseline.set(shape, frame);
      continue;
    }
    if (frame.monoNs > windowEnd) continue;
    framesInWindow += 1;
    // Keep the first frame of each shape, and also the first that differs from the baseline.
    // The wallpad polls every couple of seconds, so the poll immediately after a write often
    // still carries the old state and the change appears one poll later. Comparing only the
    // first frame in the window misses every change slower than one polling period.
    if (!inWindow.has(shape)) inWindow.set(shape, frame);
    if (!firstDifferent.has(shape)) {
      const before = baseline.get(shape);
      if (before && before.hex !== frame.hex) firstDifferent.set(shape, frame);
    }
  }

  const changed: Change[] = [];
  const appeared: Appearance[] = [];
  for (const [shape, first] of inWindow) {
    const key = frameKey(first);
    const length = first.bytes.length;
    const before = baseline.get(shape);
    if (!before) {
      appeared.push({ key, length, hex: first.hex, atWallMs: first.wallMs });
      continue;
    }
    const frame = firstDifferent.get(shape);
    if (!frame) continue;
    const diff = differingIndexes(before.bytes, frame.bytes);
    changed.push({
      key,
      length,
      before: before.hex,
      after: frame.hex,
      changedByteIndexes: diff.payload,
      checksumChanged: diff.checksum,
      atWallMs: frame.wallMs,
    });
  }
  return { framesInWindow, changed, appeared };
}
