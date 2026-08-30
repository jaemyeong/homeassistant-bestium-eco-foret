// The send path used to be one write with no memory: a second press while the first was
// still resolving was dropped without a word, and a frame lost to a bus collision was never
// sent again. This module holds the two pieces that fix both — which settable an action
// addresses, and what counts as that action having succeeded.

type AnyRecord = Record<string, any>;

export type QueueEntry = { key: string; value: AnyRecord; seq: number };

const isZone = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 4;

const isLight = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 3;

/**
 * The key a semantic action addresses, or null when the action must never be queued.
 *
 * Power and target temperature are separate keys on the same zone on purpose. The wallpad
 * answers `0x45` and `0x46` alike with the whole zone — state, current and target — so one
 * shared key would let a target command confirm itself off a power reply.
 */
export function intentKey(action: unknown): string | null {
  if (!action || typeof action !== "object" || Array.isArray(action)) return null;
  const value = action as AnyRecord;
  if (value.kind === "light" && isLight(value.target) && (value.state === "on" || value.state === "off")) {
    return `light:${value.target}`;
  }
  if (value.kind === "heat" && isZone(value.zone)) {
    if (value.temperatureC !== undefined) return `heat:${value.zone}:target`;
    if (value.state === "on" || value.state === "off") return `heat:${value.zone}:power`;
    return null;
  }
  if (value.kind === "gas" && value.state === "close") return "gas";
  if (value.kind === "elevator" && (value.direction === "up" || value.direction === "down")) return "elevator";
  if (value.kind === "batchoff" && (value.state === "on" || value.state === "off")) return "batchoff";
  // The group commands address the group settable at 0x10, which is a different settable from
  // any of the individual ones. Giving them their own keys means a group press and a single
  // press queue separately and neither overtakes the other, and it means a group press is
  // retried and confirmed like everything else rather than going out once and unwatched.
  if (value.kind === "light" && value.target === "all" && (value.state === "on" || value.state === "off")) {
    return "light:all";
  }
  if (value.kind === "heat" && value.target === "all" && (value.state === "on" || value.state === "off")) {
    return "heat:all";
  }
  // Entrance macros have no reply on this line, so they can be neither confirmed nor safely
  // retried. They keep the single-shot path.
  return null;
}

/**
 * Nothing expands any more.
 *
 * All-zones off used to become four per-zone commands here, on the reasoning that the wallpad
 * had no group command and sent them one at a time. It has one, at address 0x10, and it sends
 * that. Four commands where the wallpad sends one is four chances to half-succeed, and the
 * preview showed four frames while a single frame went out. The group is now its own settable
 * with its own key, retried and confirmed like any other (M4-E139).
 */
export function expandAction(action: unknown): AnyRecord[] {
  if (!action || typeof action !== "object" || Array.isArray(action)) return [];
  return [action as AnyRecord];
}

function observedAfter(entry: unknown, writeAtMs: number, generation: number): entry is AnyRecord {
  if (!entry || typeof entry !== "object") return false;
  const device = entry as AnyRecord;
  return device.generation === generation
    && Number.isSafeInteger(device.lastSeenAtMs)
    && device.lastSeenAtMs >= writeAtMs;
}

/**
 * Success is the addressed field holding the intended value in an observation stamped after
 * the write — a match, never a change.
 *
 * Both heating commands of ours that reached the bus in capture A were no-ops against the
 * state the zone already held, and the wallpad answered both. Requiring the state to change
 * would mark those failed and retry until the budget ran out. Requiring the observation to
 * be newer than the write is what still catches a frame lost to a collision.
 */
export function isConfirmed(
  action: unknown,
  devices: unknown,
  writeAtMs: number,
  generation: number,
  before?: unknown,
): boolean {
  if (!action || typeof action !== "object" || !devices || typeof devices !== "object") return false;
  const value = action as AnyRecord;
  const state = devices as AnyRecord;

  if (value.kind === "light" && isLight(value.target)) {
    const entry = state.lights?.[value.target];
    return observedAfter(entry, writeAtMs, generation) && entry.state === value.state;
  }
  if (value.kind === "heat" && isZone(value.zone)) {
    const entry = state.heating?.[value.zone];
    if (!observedAfter(entry, writeAtMs, generation)) return false;
    if (value.temperatureC !== undefined) return entry.targetC === value.temperatureC;
    return entry.state === value.state;
  }
  if (value.kind === "gas" && value.state === "close") {
    const entry = state.gas;
    return observedAfter(entry, writeAtMs, generation) && entry.state === "closed";
  }
  if (value.kind === "elevator") {
    // The standing call is a shared building state, not ours. A call already waiting in the
    // direction we asked for — a neighbour's, or one still standing from before — would
    // satisfy a plain match and be read as proof that our frame worked. For this one control
    // the right predicate is a change, because the whole point of sending it is the verdict.
    const entry = state.elevator;
    if (!observedAfter(entry, writeAtMs, generation) || entry.call !== value.direction) return false;
    const previous = (before as AnyRecord | undefined)?.elevator?.call;
    return previous !== undefined && previous !== value.direction;
  }
  // A group command draws no reply of its own: the wallpad answers with each member's next
  // poll instead, about 161 ms later. So the whole group has to be holding the requested
  // state, each member observed after the write, before this counts as confirmed.
  if (value.kind === "light" && value.target === "all") {
    return [1, 2, 3].every((index) => {
      const entry = state.lights?.[index];
      return observedAfter(entry, writeAtMs, generation) && entry.state === value.state;
    });
  }
  if (value.kind === "heat" && value.target === "all") {
    return [1, 2, 3, 4].every((zone) => {
      const entry = state.heating?.[zone];
      return observedAfter(entry, writeAtMs, generation) && entry.state === value.state;
    });
  }
  if (value.kind === "batchoff" && (value.state === "on" || value.state === "off")) {
    const entry = state.batchOff;
    return observedAfter(entry, writeAtMs, generation) && entry.state === value.state;
  }
  return false;
}

// A busy line and a transmitter that spoke between our decision and our write both clear on
// their own; a disabled flag or a mismatched user does not, so retrying those only wastes
// the budget and delays the operator's answer.
const RETRYABLE_REFUSALS = [
  "line busy: quiet interval not met",
  "transport/RX race before write",
];

export function isRetryableRefusal(reason: unknown): boolean {
  return typeof reason === "string" && RETRYABLE_REFUSALS.includes(reason);
}

/**
 * True when every part this action expands into addresses a settable, so the send path can
 * queue it and the ingress must not serialise it ahead of the queue.
 */
export function isQueueable(action: unknown): boolean {
  const parts = expandAction(action);
  return parts.length > 0 && parts.every((part) => intentKey(part) !== null);
}

/**
 * A queue keyed by settable. Re-enqueuing a key replaces its value and keeps its place, so
 * a mashed button collapses to one execution carrying the last requested state while a
 * different device queued behind it never gets overtaken.
 *
 * The key space bounds the queue: three lights, four zones times two settables, gas, the
 * elevator and two queries. No length limit is needed because none can be exceeded.
 */
export function createIntentQueue() {
  const pending = new Map<string, QueueEntry>();
  let seq = 0;
  return {
    /** `superseded` is the entry this one replaced, so the caller can resolve its waiter. */
    enqueue(key: string, value: AnyRecord): { entry: QueueEntry; superseded?: QueueEntry } {
      const superseded = pending.get(key);
      seq += 1;
      const entry: QueueEntry = { key, value, seq };
      pending.set(key, entry);
      return superseded ? { entry, superseded } : { entry };
    },
    take(): QueueEntry | undefined {
      const next = pending.entries().next();
      if (next.done) return undefined;
      const [key, entry] = next.value;
      pending.delete(key);
      return entry;
    },
    has(key: string): boolean {
      return pending.has(key);
    },
    size(): number {
      return pending.size;
    },
    list(): QueueEntry[] {
      return [...pending.values()];
    },
    clear(): QueueEntry[] {
      const dropped = [...pending.values()];
      pending.clear();
      return dropped;
    },
  };
}
