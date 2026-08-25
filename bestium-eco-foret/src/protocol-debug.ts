export type Evidence = "observed" | "inferred_candidate" | "unsafe_candidate" | "rejected";

type JournalEntry = {
  kind: "noise" | "partial" | "invalid" | "frame" | "unknown";
  atMs: number;
  generation: number;
  rawHex?: string;
};

type ParsedFrame = { raw: Uint8Array; atMs: number; generation: number };

type DeviceFreshness = {
  lastSeenAtMs: number;
  generation: number;
  stale: boolean;
};

type DeviceState = DeviceFreshness & Record<string, unknown>;

const hexOf = (value: Uint8Array, maxBytes = 256): string =>
  [...value.slice(0, maxBytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

function bytesFromHex(value: string): Uint8Array {
  if (!/^[0-9a-f]*$/i.test(value) || value.length % 2 !== 0) throw new Error("invalid hexadecimal frame");
  return Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function xorChecksum(value: Uint8Array, end = value.length - 2): number {
  let checksum = 0;
  for (let index = 0; index < end; index += 1) checksum ^= value[index];
  return checksum;
}

function validChecksum(value: Uint8Array): boolean {
  if (value.length < 5 || value[0] !== 0xf7 || value[value.length - 1] !== 0xee) return false;
  const standard = xorChecksum(value);
  if (value[value.length - 2] === standard) return true;
  // The supplied 0x19 group canary omits its final group-state byte from XOR.
  return value[3] === 0x19 && value[value.length - 2] === xorChecksum(value, value.length - 3);
}

function makeF7(payload: number[]): Uint8Array {
  // The length byte counts the whole frame: F7, itself, the payload, the checksum and EE.
  const value = Uint8Array.from([0xf7, payload.length + 4, ...payload, 0, 0xee]);
  value[value.length - 2] = xorChecksum(value);
  return value;
}

function cloneBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

/**
 * The floor byte was rendered raw, so a car in the basement read as 177 on the page.
 * `0xB1` is read as B1 by inference: it is the only basement sample this bus has produced,
 * and the byte carries no second example to confirm the nibble means what it looks like.
 * The bus reports `0x00` once the car settles, which is an absence rather than a floor.
 */
function floorLabel(value: unknown): string | null {
  if (!Number.isInteger(value)) return null;
  const byte = value as number;
  if (byte === 0) return null;
  if (byte >= 1 && byte <= 0x63) return String(byte);
  if ((byte & 0xf0) === 0xb0 && (byte & 0x0f) >= 1) return `B${byte & 0x0f}`;
  return `0x${byte.toString(16).padStart(2, "0")}`;
}

function freshness(nowMs: number, generation: number): DeviceFreshness {
  return { lastSeenAtMs: nowMs, generation, stale: false };
}

function initialFreshness(): DeviceFreshness {
  return { lastSeenAtMs: 0, generation: 0, stale: true };
}

function staleDevice<T extends DeviceState>(device: T, nowMs: number, generation: number, staleAfterMs: number, stopped: boolean): T {
  return {
    ...device,
    stale: stopped || device.generation !== generation || device.lastSeenAtMs <= 0 || nowMs - device.lastSeenAtMs > staleAfterMs,
  };
}

function decodeState(frame: ParsedFrame, devices: AnyDevices, queries: Record<string, number>, ambiguous: AnyRecord[], unknown: AnyRecord[]): void {
  const raw = frame.raw;
  if (raw[0] === 0x7f) {
    const cluster = raw.length > 1 ? raw[1].toString(16).padStart(2, "0") : "unknown";
    unknown.push({ cluster: `0x${cluster}`, rawHex: hexOf(raw), atMs: frame.atMs, generation: frame.generation });
    return;
  }
  const payload = raw.slice(2, -2);
  const command = payload[1];
  if (payload.length < 2 || command === undefined) {
    unknown.push({ cluster: "invalid", rawHex: hexOf(raw), atMs: frame.atMs, generation: frame.generation });
    return;
  }
  const at = frame.atMs;
  const generation = frame.generation;
  const markUnknown = (cluster: string): void => {
    unknown.push({ cluster, rawHex: hexOf(raw), atMs: at, generation, evidence: "ambiguous" });
  };
  const mark = (key: keyof AnyDevices, value: Record<string, unknown>): void => {
    const existing = devices[key] as DeviceState;
    devices[key] = { ...existing, ...value, ...freshness(at, generation) } as never;
  };

  if (command === 0x19 && payload[2] === 0x04 && payload.length >= 6) {
    const lights = devices.lights as Record<number, DeviceState>;
    // The address byte decides the shape. 0x10 is the periodic reply covering all three;
    // 0x11-0x13 is the reply that answers one command and arrives in the same read as the
    // write, which is what lets a send confirm in milliseconds instead of a poll cycle.
    if (payload[4] === 0x10) {
      if (payload.length < 9) {
        markUnknown("0x19");
        return;
      }
      for (let index = 0; index < 3; index += 1) {
        const state = payload[6 + index];
        if (state !== 1 && state !== 2) {
          markUnknown("0x19");
          continue;
        }
        lights[index + 1] = { ...lights[index + 1], state: state === 1 ? "on" : "off", ...freshness(at, generation) };
      }
      return;
    }
    const target = payload[4] - 0x10;
    const state = payload[5];
    if (target < 1 || target > 3 || (state !== 1 && state !== 2)) {
      markUnknown("0x19");
      return;
    }
    lights[target] = { ...lights[target], state: state === 1 ? "on" : "off", ...freshness(at, generation) };
    return;
  }
  if (command === 0x19 && payload[2] === 0x02 && payload.length >= 7) {
    const target = payload[4] - 0x10;
    if (target >= 1 && target <= 3) {
      const lights = devices.lights as Record<number, DeviceState>;
      // Targeted replies carry the light address at payload[4] and state at payload[5].
      if (payload[5] !== 1 && payload[5] !== 2) {
        markUnknown("0x19");
        return;
      }
      lights[target] = { ...lights[target], state: payload[5] === 1 ? "on" : "off", ...freshness(at, generation) };
    }
    return;
  }
  if (command === 0x1b && payload.length >= 7) {
    if (payload[2] !== 0x04) {
      unknown.push({ cluster: "0x1b", rawHex: hexOf(raw), atMs: at, generation });
      return;
    }
    if (payload[6] !== 3 && payload[6] !== 4) {
      markUnknown("0x1b");
      return;
    }
    mark("gas", { state: payload[6] === 4 ? "open" : "closed", evidence: "observed" });
    return;
  }
  if (command === 0x18 && payload[2] === 0x04 && payload.length >= 9) {
    const heating = devices.heating as Record<number, DeviceState>;
    // Address 0x10 is the periodic reply carrying every zone in eight-byte slots;
    // 0x11-0x14 is the reply that answers one command, in the same read as the write.
    const addressed = payload[4] & 0x0f;
    if (addressed === 0) {
      if (payload.length < 38) {
        markUnknown("0x18");
        return;
      }
      for (let zone = 1; zone <= 4; zone += 1) {
        const offset = 6 + (zone - 1) * 8;
        if (payload[offset] !== 1 && payload[offset] !== 4) {
          markUnknown("0x18");
          continue;
        }
        heating[zone] = {
          ...heating[zone],
          state: payload[offset] === 1 ? "on" : "off",
          currentC: payload[offset + 1],
          targetC: payload[offset + 2],
          ...freshness(at, generation),
        };
      }
      return;
    }
    if (addressed > 4 || (payload[6] !== 1 && payload[6] !== 4)) {
      markUnknown("0x18");
      return;
    }
    heating[addressed] = {
      ...heating[addressed],
      state: payload[6] === 1 ? "on" : "off",
      currentC: payload[7],
      targetC: payload[8],
      ...freshness(at, generation),
    };
    return;
  }
  if (command === 0x34 && payload.length >= 8) {
    // The high nibble is movement and the low nibble is the standing call. Collapsing both
    // into one `direction` hid the call whenever the car was moving: 0xA5 is "ascending
    // with an up call waiting" and read as plain "up". The two are reported separately now,
    // which is also the only signal that can tell us whether a call frame of ours worked.
    const code = payload[6];
    const moving = code >> 4;
    const callCode = code & 0x0f;
    const direction = moving === 0x0a ? "up"
      : moving === 0x0b ? "down"
      : moving !== 0 ? undefined
      : callCode === 1 ? "arrival"
      : callCode === 0 ? "idle"
      : callCode === 5 ? "up"
      : callCode === 6 ? "down"
      : undefined;
    if (direction === undefined) {
      markUnknown("0x34");
      return;
    }
    const motion = moving === 0x0a ? "up" : moving === 0x0b ? "down" : "idle";
    const call = callCode === 0 ? "none"
      : callCode === 1 ? "arrival"
      : callCode === 5 ? "up"
      : callCode === 6 ? "down"
      : undefined;
    mark("elevator", { floor: payload[7], floorLabel: floorLabel(payload[7]), motion, call, direction, evidence: "observed" });
    return;
  }
  if (command === 0x1e && payload.length >= 5) {
    // The `02` frame is not a call. It appears three times in a row at the instant the
    // operator presses the wallpad's door-open button, and nothing on this line moves when
    // the bell is actually rung. Whether it is the door-open command itself or the notice
    // that the call ended because the door opened is still undecided, so it is reported as
    // the observation it is and never as a call in progress.
    if (payload[2] === 0x02) mark("entrances", { household: { ...devices.entrances.household, doorOpenObserved: true, ...freshness(at, generation) } });
    // Every one of the poll frames is byte-identical, on this capture and the last, and none
    // changed while a call was ringing. There is nothing in them to read yet.
    else mark("entrances", { communal: { ...devices.entrances.communal, evidence: "not_decoded", ...freshness(at, generation) } });
    return;
  }
  if (command === 0x1f) {
    queries.outlet = (queries.outlet ?? 0) + 1;
    devices.outlet = { ...devices.outlet, queryOnly: true, ...freshness(at, generation) };
    return;
  }
  if (command === 0x2b) {
    queries.ventilation = (queries.ventilation ?? 0) + 1;
    devices.ventilation = { ...devices.ventilation, queryOnly: true, ...freshness(at, generation) };
    return;
  }
  if (command === 0x2a) {
    ambiguous.push({ cluster: "0x2a", rawHex: hexOf(raw), atMs: at, generation });
    return;
  }
  unknown.push({ cluster: `0x${command.toString(16).padStart(2, "0")}`, rawHex: hexOf(raw), atMs: at, generation });
}

type AnyRecord = Record<string, any>;
type AnyDevices = {
  lights: Record<number, DeviceState>;
  gas: DeviceState;
  heating: Record<number, DeviceState>;
  elevator: DeviceState;
  entrances: { household: DeviceState; communal: DeviceState };
  outlet: DeviceState;
  ventilation: DeviceState;
  vehicle: DeviceState;
  cctv: DeviceState;
};

function createDevices(): AnyDevices {
  const base = initialFreshness();
  return {
    lights: { 1: { ...base }, 2: { ...base }, 3: { ...base } },
    gas: { ...base },
    heating: { 1: { ...base }, 2: { ...base }, 3: { ...base }, 4: { ...base } },
    elevator: { ...base },
    entrances: { household: { ...base }, communal: { ...base, evidence: "not_decoded" } },
    outlet: { ...base },
    ventilation: { ...base },
    vehicle: { ...base, evidence: "unidentified" },
    cctv: { ...base, observed: false, evidence: "not_observed_current_protocol_frame" },
  };
}

function parseFrames(chunk: Uint8Array, nowMs: number, generation: number, journal: JournalEntry[], pending: Uint8Array): { frames: ParsedFrame[]; carry: Uint8Array } {
  let data = concatBytes(pending, chunk);
  const frames: ParsedFrame[] = [];
  while (data.length > 0) {
    const start = data.findIndex((byte) => byte === 0xf7 || byte === 0x7f);
    if (start < 0) {
      journal.push({ kind: "noise", atMs: nowMs, generation, rawHex: hexOf(data) });
      data = new Uint8Array();
      break;
    }
    if (start > 0) {
      journal.push({ kind: "noise", atMs: nowMs, generation, rawHex: hexOf(data.slice(0, start)) });
      data = data.slice(start);
    }
    let size = 0;
    if (data[0] === 0x7f) {
      const end = data.indexOf(0xee, 1);
      if (end !== 4) {
        if (end < 0) {
          journal.push({ kind: "partial", atMs: nowMs, generation, rawHex: hexOf(data) });
          return { frames, carry: data.slice(0, 4) };
        }
        journal.push({ kind: "invalid", atMs: nowMs, generation, rawHex: hexOf(data.slice(0, Math.min(data.length, 5))) });
        data = data.slice(1);
        continue;
      }
      size = end + 1;
      const raw = data.slice(0, size);
      frames.push({ raw, atMs: nowMs, generation });
      journal.push({ kind: "frame", atMs: nowMs, generation, rawHex: hexOf(raw) });
      data = data.slice(size);
      continue;
    }
    if (data.length === 1) {
      journal.push({ kind: "partial", atMs: nowMs, generation, rawHex: hexOf(data) });
      return { frames, carry: data };
    }
    const declared = data[1];
    if (!Number.isSafeInteger(declared) || declared < 5 || declared > 257) {
      journal.push({ kind: "invalid", atMs: nowMs, generation, rawHex: hexOf(data.slice(0, Math.min(data.length, 2))) });
      data = data.slice(1);
      continue;
    }
    const candidates = [declared];
    const complete = candidates.find((candidate) => data.length >= candidate && data[candidate - 1] === 0xee);
    if (complete === undefined) {
      const hasAmbiguousExtendedLength = candidates.length > 1;
      if (data.length < declared || (hasAmbiguousExtendedLength && data.length === declared)) {
        journal.push({ kind: "partial", atMs: nowMs, generation, rawHex: hexOf(data) });
        return { frames, carry: data };
      }
      journal.push({ kind: "invalid", atMs: nowMs, generation, rawHex: hexOf(data.slice(0, Math.min(data.length, declared))) });
      data = data.slice(1);
      continue;
    }
    const raw = data.slice(0, complete);
    if (raw.length < 6 || !validChecksum(raw)) {
      journal.push({ kind: "invalid", atMs: nowMs, generation, rawHex: hexOf(raw) });
      data = data.slice(1);
      continue;
    }
    frames.push({ raw, atMs: nowMs, generation });
    journal.push({ kind: "frame", atMs: nowMs, generation, rawHex: hexOf(raw) });
    data = data.slice(complete);
  }
  return { frames, carry: data };
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}

export function createProtocolDebugMonitor(opts: { journalLimit?: number; staleAfterMs?: number; nowMs?: () => number } = {}) {
  const journalLimit = Math.max(1, Math.min(256, opts.journalLimit ?? 64));
  const staleAfterMs = Math.max(1, opts.staleAfterMs ?? 30_000);
  const nowMs = opts.nowMs ?? (() => Date.now());
  let generation = 0;
  let stopped = false;
  let carry: Uint8Array<ArrayBufferLike> = new Uint8Array();
  let frames: ParsedFrame[] = [];
  let validFrameCount = 0;
  let journal: JournalEntry[] = [];
  let devices = createDevices();
  let queries: Record<string, number> = { outlet: 0, ventilation: 0 };
  let ambiguous: AnyRecord[] = [];
  let unknown: AnyRecord[] = [];
  let sevenFProof: AnyRecord | undefined;
  let sevenFNext: { action: string; frames: string[]; index: number; generation: number } | undefined;
  const sevenFProofByStart: Record<string, { action: string; frames: string[] }> = {
    "7fb90000ee": { action: "household:inactive", frames: ["7fb90000ee", "7fb40000ee", "7fba0000ee"] },
    "7f5f0000ee": { action: "communal:ringing", frames: ["7f5f0000ee", "7f610000ee", "7f600000ee"] },
  };
  const trim = <T>(entries: T[]): T[] => entries.slice(-journalLimit);
  const push = (chunk: Uint8Array): void => {
    if (!(chunk instanceof Uint8Array) || chunk.length === 0) return;
    const events: JournalEntry[] = [];
    const parsed = parseFrames(chunk, nowMs(), generation, events, carry);
    carry = parsed.carry;
    frames = trim(frames.concat(parsed.frames));
    validFrameCount += parsed.frames.length;
    journal = trim(journal.concat(events));
    let frameIndex = 0;
    for (const event of events) {
      if (event.kind === "noise" || event.kind === "invalid") {
        sevenFNext = undefined;
        continue;
      }
      if (event.kind !== "frame") continue;
      const frame = parsed.frames[frameIndex++];
      if (!frame) continue;
      decodeState(frame, devices, queries, ambiguous, unknown);
      devices.cctv = {
        ...devices.cctv,
        observed: false,
        evidence: "not_observed_current_protocol_frame",
        ...freshness(frame.atMs, generation),
      };
      const rawHex = hexOf(frame.raw);
      const current = sevenFNext;
      if (current && current.generation === generation && rawHex === current.frames[current.index]) {
        current.index += 1;
        if (current.index === current.frames.length) {
          sevenFProof = { action: current.action, frames: [...current.frames], generation, completedAtMs: frame.atMs };
          sevenFNext = undefined;
        }
      } else {
        const proof = sevenFProofByStart[rawHex];
        sevenFNext = proof ? { ...proof, index: 1, generation } : undefined;
      }
    }
    ambiguous = trim(ambiguous);
    unknown = trim(unknown);
  };
  const snapshot = (): any => {
    const now = nowMs();
    const clone = JSON.parse(JSON.stringify(devices)) as AnyDevices;
    const staleEvidence = (entry: AnyRecord): AnyRecord => ({
      ...entry,
      stale: stopped || entry.generation !== generation || entry.atMs <= 0 || now - entry.atMs > staleAfterMs,
    });
    for (const key of ["gas", "elevator", "outlet", "ventilation", "vehicle", "cctv"] as const) clone[key] = staleDevice(clone[key], now, generation, staleAfterMs, stopped);
    for (const key of [1, 2, 3] as const) clone.lights[key] = staleDevice(clone.lights[key], now, generation, staleAfterMs, stopped);
    for (const key of [1, 2, 3, 4] as const) clone.heating[key] = staleDevice(clone.heating[key], now, generation, staleAfterMs, stopped);
    clone.entrances.household = staleDevice(clone.entrances.household, now, generation, staleAfterMs, stopped);
    // The observation lives exactly as long as the frame that raised it stays fresh.
    if (clone.entrances.household.stale) clone.entrances.household = { ...clone.entrances.household, doorOpenObserved: false };
    clone.entrances.communal = staleDevice(clone.entrances.communal, now, generation, staleAfterMs, stopped);
    return {
      generation,
      stopped,
      staleAfterMs,
      parser: { pendingHex: hexOf(carry) },
      frames: frames.map((entry) => ({ rawHex: hexOf(entry.raw), atMs: entry.atMs, generation: entry.generation })),
      validFrameCount,
      journal: [...journal],
      devices: clone,
      queries: { ...queries },
      ambiguous: ambiguous.map(staleEvidence),
      unknown: unknown.map(staleEvidence),
      sevenFProof: sevenFProof && sevenFProof.generation === generation ? { ...sevenFProof } : undefined,
    };
  };
  return {
    push,
    snapshot,
    // The live decoded state, without the snapshot's clone and staleness pass. The send
    // path polls this while waiting for a command to be confirmed, so it must be cheap and
    // must carry `lastSeenAtMs` and `generation` unmodified. Read only.
    deviceState(): AnyDevices { return devices; },
    currentGeneration(): number { return generation; },
    resetGeneration(): void { generation += 1; validFrameCount = 0; carry = new Uint8Array(); sevenFProof = undefined; sevenFNext = undefined; },
    stop(): void { stopped = true; carry = new Uint8Array(); sevenFProof = undefined; sevenFNext = undefined; },
    start(): void { stopped = false; },
  };
}

function rejectedResult(reason = "rejected"): AnyRecord {
  return { frame: undefined, evidence: "rejected", sendable: false, confirmed: false, reason };
}

function observed(frame: Uint8Array, context: AnyRecord): AnyRecord {
  const copy = cloneBytes(frame);
  return { frame: copy, frameHex: hexOf(copy), framesHex: [hexOf(copy)], evidence: "observed", sendable: context.transmitEnabled === true && context.authorizedUser === true, confirmed: false };
}

function inferred(frame: Uint8Array, transportEvidence = "unverified"): AnyRecord {
  const copy = cloneBytes(frame);
  return { frame: copy, frameHex: hexOf(copy), framesHex: [hexOf(copy)], evidence: "inferred_candidate", transportEvidence, sendable: false, confirmed: false, requiresSpeculativeConfirmation: true };
}

const knownObserved = new Set([
  "f70d011904401000020102b5ee",
  "f70b01190240110100b6ee", "f70b01190240110200b5ee",
  "f70b01190240120100b5ee", "f70b01190240120200b6ee",
  "f70b01190240130100b4ee", "f70b01190240130200b7ee",
  "f70b011b0243110300b5ee", "f70b011f0140100000b3ee", "f70b012b014011000086ee",
  "f70d01340141100001040b91ee",
]);

const knownDoorFrames = new Set([
  "7fb90000ee", "7fb40000ee", "7fba0000ee", "7fb70000ee", "7fb80000ee",
  "7f5f0000ee", "7f610000ee", "7f600000ee",
]);

function isRecognizedFrame(value: string): boolean {
  if (value.startsWith("7f") && value.length === 10 && value.endsWith("ee")) return true;
  if (knownObserved.has(value) || knownDoorFrames.has(value)) return true;
  if (!value.startsWith("f7") || value.length < 10 || !value.endsWith("ee")) return false;
  const bytes = Uint8Array.from(value.match(/../g) ?? [], (entry) => Number.parseInt(entry, 16));
  // These command families are recognized even when a new state/temperature
  // variant has not yet been catalogued; RAW must not bypass semantic safety.
  return [0x18, 0x19, 0x1b, 0x1e, 0x1f, 0x2a, 0x2b, 0x34, 0x7e].includes(bytes[3] ?? -1);
}

export function encodeSemanticAction(value: any, context: AnyRecord = {}): AnyRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return rejectedResult("action must be an object");
  const forbiddenFields = ["host", "port", "delayMs", "repeat", "retry", "queue", "batch", "address", "rawHex"];
  if (Object.keys(value).some((key) => forbiddenFields.includes(key))) return rejectedResult("transport controls are not semantic actions");
  const kind = value.kind;
  const allowedFields: Record<string, string[]> = {
    light: ["kind", "target", "state", "confirmation"],
    gas: ["kind", "state", "confirmation"],
    heat: ["kind", "zone", "target", "state", "temperatureC", "confirmation"],
    elevator: ["kind", "direction", "confirmation"],
    outlet: ["kind", "action"],
    ventilation: ["kind", "action"],
    entrance: ["kind", "target", "state", "confirmation"],
  };
  if (typeof kind === "string" && allowedFields[kind] && Object.keys(value).some((key) => !allowedFields[kind]!.includes(key))) {
    return rejectedResult("action fields are exact");
  }
  if (kind === "light" && Number.isInteger(value.target) && value.target >= 1 && value.target <= 3 && (value.state === "on" || value.state === "off")) {
    const frame = {
      "1:on": "f70b01190240110100b6ee", "1:off": "f70b01190240110200b5ee",
      "2:on": "f70b01190240120100b5ee", "2:off": "f70b01190240120200b6ee",
      "3:on": "f70b01190240130100b4ee", "3:off": "f70b01190240130200b7ee",
    }[`${value.target}:${value.state}`];
    return observed(bytesFromHex(frame), context);
  }
  if (kind === "gas") {
    // Confirmed by the operator on the live bus after the quiet window was widened. Closing
    // is the safe direction and opening stays refused, so one tap is the right cost.
    if (value.state === "close") return observed(bytesFromHex("f70b011b0243110300b5ee"), context);
    return rejectedResult("gas open is not authorized");
  }
  if (kind === "heat" && Number.isInteger(value.zone) && value.zone >= 1 && value.zone <= 4) {
    // Read off the bus while the operator worked the wallpad by hand: 0x46 carries On/Off
    // and 0x45 carries the target temperature, both at address 0x10 + zone. The frames
    // this used to build were shaped like a status reply, declared a length one short, and
    // the wallpad ignored every one of them. See `.agent/spec-device-protocol.md`.
    const address = 0x10 + value.zone;
    // Promoted after the operator drove all four zones from the page on the live bus. The
    // frames were already byte-identical to the wallpad's own; what was missing until now
    // was our sending one and watching real heating move.
    if (value.temperatureC !== undefined) {
      if (!Number.isInteger(value.temperatureC) || value.temperatureC < 5 || value.temperatureC > 40) return rejectedResult("temperature is unsupported");
      return observed(makeF7([1, 0x18, 2, 0x45, address, value.temperatureC, 0]), context);
    }
    if (value.state === "on") return observed(makeF7([1, 0x18, 2, 0x46, address, 1, 0]), context);
    if (value.state === "off") return observed(makeF7([1, 0x18, 2, 0x46, address, 4, 0]), context);
    return rejectedResult("unsupported heating state");
  }
  if (kind === "heat" && value.target === "all" && value.state === "off") {
    // Neither the bus nor the legacy implementation has a batch heating command. The send
    // path expands this into four independent per-zone intents, each queued, retried and
    // confirmed on its own; these frames are what the preview shows.
    const frames = [1, 2, 3, 4].map((zone) => makeF7([1, 0x18, 2, 0x46, 0x10 + zone, 4, 0]));
    return {
      frames, frameHex: hexOf(frames[0] as Uint8Array), framesHex: frames.map((entry) => hexOf(entry)),
      evidence: "observed", sendable: context.transmitEnabled === true && context.authorizedUser === true,
      confirmed: false,
    };
  }
  if (kind === "elevator" && (value.direction === "up" || value.direction === "down")) {
    // Pressing the wallpad's own call button put no 0x34 set frame on this line, and a
    // byte-level diff of every device across that moment found nothing else moving either,
    // so this shape is the legacy add-on's claim with a negative observation against it.
    // The verdict comes from the call nibble, which now has its own field: a call that
    // registers turns `call` from "none" into the direction that was asked for. The legacy's
    // second shape (`01 34 04 41 10 00 <05|06>`) is not sent, because a frame nothing in the
    // send path can reach is dead weight; it stays documented in the protocol spec.
    return inferred(makeF7([1, 0x34, 2, 0x41, 0x10, value.direction === "up" ? 5 : 6, 0]));
  }
  if (kind === "outlet" && value.action === "query") return observed(bytesFromHex("f70b011f0140100000b3ee"), context);
  if (kind === "ventilation" && value.action === "query") return observed(bytesFromHex("f70b012b014011000086ee"), context);
  if (kind === "entrance" && (value.target === "household" || value.target === "communal")) {
    const table: Record<string, string[]> = {
      "household:inactive": ["7fb90000ee", "7fb40000ee", "7fba0000ee"],
      "household:ringing": ["7fb70000ee", "7fb40000ee", "7fb80000ee"],
      "communal:ringing": ["7f5f0000ee", "7f610000ee", "7f600000ee"],
    };
    const sequence = table[`${value.target}:${value.state}`];
    if (sequence) {
      const frames = sequence.map((entry) => bytesFromHex(entry));
      return { frames, frameHex: hexOf(frames[0] as Uint8Array), framesHex: frames.map((entry) => hexOf(entry)), evidence: "unsafe_candidate", transportEvidence: "unverified", sendable: false, confirmed: false, requiresSpeculativeConfirmation: true };
    }
  }
  if (kind === "raw") {
    if (Object.keys(value).some((key) => key !== "kind" && key !== "hex")) throw new Error("raw action fields are exact");
    if (typeof value.hex !== "string" || value.hex.length < 2 || value.hex.length > 512 || value.hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value.hex)) throw new Error("raw hex is invalid");
    const normalized = value.hex.toLowerCase();
    if (isRecognizedFrame(normalized)) throw new Error("recognized frame cannot use raw");
    const frame = bytesFromHex(normalized);
    return { frame, frameHex: hexOf(frame), framesHex: [hexOf(frame)], evidence: "unsafe_candidate", transportEvidence: "unverified", sendable: false, confirmed: false, requiresSpeculativeConfirmation: true };
  }
  if (kind === "door" || kind === "vehicle" || kind === "cctv" || kind === "batch") throw new Error("unsupported unsafe action");
  return rejectedResult("unsupported action");
}
