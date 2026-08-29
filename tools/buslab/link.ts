// The TCP link to the gateway. It hands every read straight through, exactly as it arrived,
// and it stamps everything itself.
//
// Both of those are deliberate. A TCP read boundary is not a frame boundary — the gateway
// flushes on a 50 ms serial gap and the network may still split or merge what it sends — so
// reassembly belongs to the framer, downstream, where the raw bytes are still on record. And
// every timestamp is taken in this process because `process.hrtime.bigint()` counts from an
// arbitrary origin per process: a stamp taken in the CLI and a stamp taken here cannot be
// subtracted from each other.

import type { BuslabConfig } from "./config.ts";

type SocketLike = {
  setNoDelay(noDelay?: boolean): unknown;
  on(event: string, listener: (...args: unknown[]) => unknown): unknown;
  off(event: string, listener: (...args: unknown[]) => unknown): unknown;
  removeAllListeners(): unknown;
  destroy(): unknown;
  write(bytes: Uint8Array, callback?: (error?: Error | null) => void): boolean;
};

export type WriteStamps = {
  requestedMonoNs: bigint;
  returnedMonoNs: bigint;
  flushedMonoNs: bigint;
  requestedWallMs: number;
};

export type LinkDeps = {
  nowMs(): number;
  monoNs(): bigint;
  setTimeout(fn: () => void, delayMs: number): unknown;
  clearTimeout(id: unknown): void;
};

export type Link = ReturnType<typeof createLink>;

export function createLink(opts: {
  config: BuslabConfig;
  connect(input: { host: string; port: number }): SocketLike;
  connectTimeoutMs: number;
  deps: LinkDeps;
  onChunk(bytes: Uint8Array, wallMs: number, monoNs: bigint): void;
  onEvent(kind: string, fields: Record<string, unknown>): void;
}) {
  let socket: SocketLike | null = null;
  let lastRx: bigint | null = null;
  let open = false;
  const listeners: [string, (...args: unknown[]) => unknown][] = [];

  const detach = (): void => {
    if (!socket) return;
    for (const [event, listener] of listeners) socket.off(event, listener);
    listeners.length = 0;
    socket.removeAllListeners();
    socket.destroy();
    socket = null;
    open = false;
  };

  const listen = (target: SocketLike, event: string, listener: (...args: unknown[]) => unknown): void => {
    target.on(event, listener);
    listeners.push([event, listener]);
  };

  return {
    open(): Promise<void> {
      if (socket) throw new Error("buslab link is already open");
      const target = opts.connect({ host: opts.config.host, port: opts.config.port });
      socket = target;
      target.setNoDelay(true);
      return new Promise<void>((resolve, reject) => {
        let settled = false;
        const timer = opts.deps.setTimeout(() => {
          if (settled) return;
          settled = true;
          detach();
          // The address is deliberately absent: this message is written to an artifact.
          reject(new Error(`buslab could not reach the gateway within ${opts.connectTimeoutMs} ms`));
        }, opts.connectTimeoutMs);

        listen(target, "connect", () => {
          if (settled) return;
          settled = true;
          opts.deps.clearTimeout(timer);
          open = true;
          opts.onEvent("open", {});
          resolve();
        });
        listen(target, "data", (chunk: unknown) => {
          if (!open) return;
          const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(0);
          if (bytes.byteLength === 0) return;
          const monoNs = opts.deps.monoNs();
          lastRx = monoNs;
          opts.onChunk(bytes, opts.deps.nowMs(), monoNs);
        });
        listen(target, "error", (error: unknown) => {
          const message = error instanceof Error ? error.message : "socket error";
          opts.onEvent("error", { message });
          if (settled) return;
          settled = true;
          opts.deps.clearTimeout(timer);
          detach();
          reject(new Error(message));
        });
        listen(target, "close", () => {
          if (!open) return;
          open = false;
          opts.onEvent("closed", { reason: "peer" });
        });
      });
    },

    lastRxMonoNs: (): bigint | null => lastRx,
    isOpen: (): boolean => open,

    write(bytes: Uint8Array): Promise<WriteStamps> {
      const target = socket;
      if (!target || !open) return Promise.reject(new Error("buslab link is not open"));
      const requestedWallMs = opts.deps.nowMs();
      const requestedMonoNs = opts.deps.monoNs();
      let returnedMonoNs: bigint | null = null;
      let resolveWrite!: (value: WriteStamps) => void;
      let rejectWrite!: (error: Error) => void;
      const pending = new Promise<WriteStamps>((resolve, reject) => {
        resolveWrite = resolve;
        rejectWrite = reject;
      });
      target.write(bytes, (error) => {
        if (error) {
          rejectWrite(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        resolveWrite({
          requestedMonoNs,
          // Node never calls a write callback synchronously, but if one ever did the return
          // stamp would not exist yet. Fall back to the request stamp rather than to nothing.
          returnedMonoNs: returnedMonoNs ?? requestedMonoNs,
          flushedMonoNs: opts.deps.monoNs(),
          requestedWallMs,
        });
      });
      returnedMonoNs = opts.deps.monoNs();
      return pending;
    },

    close(): void {
      detach();
    },
  };
}
