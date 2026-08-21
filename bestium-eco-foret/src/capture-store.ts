import {
  createReadStream as nodeCreateReadStream,
  createWriteStream as nodeCreateWriteStream,
} from "node:fs";
import {
  mkdir as nodeMkdir,
  readdir as nodeReaddir,
  rename as nodeRename,
  stat as nodeStat,
} from "node:fs/promises";
import { basename, join } from "node:path";

export type CaptureFileMetadata = {
  name: string;
  sizeBytes: number;
  finalized: boolean;
};

export type StoreFileMetadata = CaptureFileMetadata & {
  filename: string;
  path: string;
  reason: string;
  downloadable: boolean;
};

export type CaptureStoreFs = {
  readdir(path: string): Promise<string[]>;
  rename(from: string, to: string): Promise<void>;
  createReadStream(path: string): AsyncIterable<string | Uint8Array>;
  mkdir?(path: string, options: { recursive: boolean }): Promise<void>;
  createWriteStream?(path: string, options: { flags: string; flush: boolean }): WriteStream;
  stat?(path: string): Promise<{ size: number }>;
};

export type CaptureStore = {
  begin(startedAtMs: number): Promise<void>;
  append(line: string): Promise<void>;
  finalize(summary: Record<string, unknown>): Promise<CaptureFileMetadata>;
  recover?(): Promise<StoreFileMetadata | null>;
  createReadStream?(): AsyncIterable<string | Uint8Array>;
};

type WriteStream = {
  write(
    chunk: string,
    encoding: string,
    callback: (error?: Error | null) => void,
  ): boolean;
  once(event: string, listener: (...args: unknown[]) => void): unknown;
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
  end(): void;
  destroy?(error?: Error): void;
};

const DATA_DIR = "/data/captures";
const PARTIAL_SUFFIX = ".partial.ndjson";
const FINAL_SUFFIX = ".ndjson";
const PARTIAL_NAME = /^capture-(\d+)(?:-(\d+))?\.partial\.ndjson$/;
const FINAL_NAME = /^capture-(\d+)(?:-(\d+))?\.ndjson$/;
const textEncoder = new TextEncoder();

const diskFs: CaptureStoreFs = {
  readdir: (path) => nodeReaddir(path) as Promise<string[]>,
  rename: (from, to) => nodeRename(from, to),
  createReadStream: (path) => nodeCreateReadStream(path),
  mkdir: (path, options) => nodeMkdir(path, options).then(() => undefined),
  createWriteStream: (path, options) =>
    nodeCreateWriteStream(path, options) as unknown as WriteStream,
  stat: async (path) => ({ size: (await nodeStat(path)).size }),
};

function emptyStream(): AsyncIterable<string | Uint8Array> {
  return (async function* () {})();
}

function safeGeneratedName(startedAtMs: number, serial: number): string {
  const suffix = serial === 0 ? String(startedAtMs) : `${startedAtMs}-${serial}`;
  return `capture-${suffix}`;
}

type CaptureNameKey = {
  timestamp: number;
  serial: number;
};

type CaptureCandidate = {
  name: string;
  partial: boolean;
  key: CaptureNameKey;
};

function captureNameKey(name: string, partial: boolean): CaptureNameKey | null {
  const match = (partial ? PARTIAL_NAME : FINAL_NAME).exec(name);
  if (!match) return null;
  const timestamp = Number(match[1]);
  const serial = Number(match[2] ?? 0);
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    !Number.isSafeInteger(serial) ||
    serial < 0
  ) {
    return null;
  }
  return { timestamp, serial };
}

function isFinalName(name: string): boolean {
  return captureNameKey(name, false) !== null;
}

function compareCandidates(a: CaptureCandidate, b: CaptureCandidate): number {
  if (a.key.timestamp !== b.key.timestamp) return a.key.timestamp < b.key.timestamp ? -1 : 1;
  if (a.key.serial !== b.key.serial) return a.key.serial < b.key.serial ? -1 : 1;
  if (a.partial !== b.partial) return a.partial ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function isMissingDirectory(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function fileMetadata(path: string, sizeBytes: number, reason: string): StoreFileMetadata {
  const filename = basename(path);
  if (!isFinalName(filename) || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new Error("invalid internal capture file metadata");
  }
  return {
    name: filename,
    filename,
    path,
    sizeBytes,
    finalized: true,
    reason,
    downloadable: true,
  };
}

function writeChunk(writer: WriteStream, chunk: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let acceptedKnown = false;
    let accepted = true;
    let callbackCalled = false;
    let callbackError: Error | null = null;
    let drainSeen = false;
    let drained = true;
    let settled = false;

    const cleanup = (): void => {
      writer.off?.("error", onError);
      writer.off?.("drain", onDrain);
    };
    const finish = (): void => {
      if (
        settled ||
        !acceptedKnown ||
        !callbackCalled ||
        !drained ||
        callbackError !== null
      ) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (error: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error("capture write failed"));
    };
    const onDrain = (): void => {
      drainSeen = true;
      drained = true;
      finish();
    };

    writer.once("error", onError);
    writer.once("drain", onDrain);
    try {
      accepted = writer.write(chunk, "utf8", (error) => {
        callbackCalled = true;
        callbackError = error ?? null;
        if (callbackError !== null) {
          onError(callbackError);
          return;
        }
        finish();
      });
      acceptedKnown = true;
      drained = accepted || drainSeen;
      finish();
    } catch (error) {
      onError(error);
    }
  });
}

function endWriter(writer: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      writer.off?.("error", onError);
      writer.off?.("close", onClose);
    };
    const onError = (error: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error("capture finalize failed"));
    };
    const onClose = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    writer.once("error", onError);
    writer.once("close", onClose);
    try {
      writer.end();
    } catch (error) {
      onError(error);
    }
  });
}

async function fileSize(fs: CaptureStoreFs, path: string, fallback: number): Promise<number> {
  if (!fs.stat) return fallback;
  try {
    const size = (await fs.stat(path)).size;
    return Number.isSafeInteger(size) && size >= 0 ? size : fallback;
  } catch {
    return fallback;
  }
}

function closeFailedWriter(writer: WriteStream | null): void {
  if (!writer) return;
  try {
    if (writer.destroy) {
      writer.destroy();
    } else {
      writer.end();
    }
  } catch {
    // The original write/finalize error is the one propagated to the caller.
  }
}

function observeRejection<T>(promise: Promise<T>): Promise<T> {
  void promise.catch(() => undefined);
  return promise;
}

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

type WriterReadyWatch = {
  ready: Promise<void>;
  dispose(): void;
};

function watchWriterReady(
  writer: WriteStream,
  onIdleError: (error: Error) => void,
): WriterReadyWatch {
  let disposed = false;
  let readySettled = false;
  let errorListener: ((error: unknown) => void) | null = null;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const onReady = (): void => {
    if (disposed || readySettled) return;
    readySettled = true;
    writer.off?.("ready", onReady);
    resolveReady();
  };
  const armError = (): void => {
    if (disposed) return;
    const onError = (error: unknown): void => {
      if (disposed) return;
      errorListener = null;
      if (!readySettled) {
        readySettled = true;
        writer.off?.("ready", onReady);
        rejectReady(asError(error, "capture store could not open"));
        return;
      }
      onIdleError(asError(error, "capture store write failed"));
      armError();
    };
    errorListener = onError;
    writer.once("error", onError);
  };
  writer.once("ready", onReady);
  armError();
  return {
    ready: readyPromise,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      writer.off?.("ready", onReady);
      if (errorListener) writer.off?.("error", errorListener);
      errorListener = null;
    },
  };
}

export function createCaptureStore(opts: {
  fs?: CaptureStoreFs;
  nowMs?: () => number;
  directory?: string;
} = {}): CaptureStore & {
  recover(): Promise<StoreFileMetadata | null>;
  createReadStream(): AsyncIterable<string | Uint8Array>;
} {
  const fs = opts.fs ?? diskFs;
  const directory = opts.directory ?? DATA_DIR;
  let writer: WriteStream | null = null;
  let partialPath: string | null = null;
  let finalPath: string | null = null;
  let lastMetadata: StoreFileMetadata | null = null;
  let appendQueue = Promise.resolve();
  let bytesWritten = 0;
  let serial = 0;
  let active = false;
  let failure: Error | null = null;
  let writerWatch: WriterReadyWatch | null = null;

  const store: CaptureStore & {
    recover(): Promise<StoreFileMetadata | null>;
    createReadStream(): AsyncIterable<string | Uint8Array>;
  } = {
    async begin(startedAtMs: number): Promise<void> {
      if (active || writer !== null) throw new Error("capture store already active");
      if (!Number.isSafeInteger(startedAtMs) || startedAtMs < 0) {
        throw new TypeError("startedAtMs must be a non-negative safe integer");
      }
      if (fs.mkdir) await fs.mkdir(directory, { recursive: true });
      if (!fs.createWriteStream) throw new Error("capture store is read-only");

      active = true;
      failure = null;
      const stem = safeGeneratedName(startedAtMs, serial++);
      const nextPartialPath = join(directory, `${stem}${PARTIAL_SUFFIX}`);
      const nextFinalPath = join(directory, `${stem}${FINAL_SUFFIX}`);
      partialPath = nextPartialPath;
      finalPath = nextFinalPath;
      let nextWriter: WriteStream | null = null;
      try {
        nextWriter = fs.createWriteStream(nextPartialPath, { flags: "wx", flush: true });
        writer = nextWriter;
        writerWatch = watchWriterReady(nextWriter, (error) => {
          if (writer !== nextWriter) return;
          writerWatch?.dispose();
          writerWatch = null;
          closeFailedWriter(nextWriter);
          writer = null;
          active = false;
          failure = error;
          appendQueue = Promise.resolve();
        });
        await writerWatch.ready;
      } catch (error) {
        writerWatch?.dispose();
        writerWatch = null;
        closeFailedWriter(nextWriter);
        writer = null;
        active = false;
        failure = asError(error, "capture store could not open");
        partialPath = null;
        finalPath = null;
        appendQueue = Promise.resolve();
        bytesWritten = 0;
        throw error;
      }
      appendQueue = Promise.resolve();
      bytesWritten = 0;
    },

    append(line: string): Promise<void> {
      if (typeof line !== "string") {
        return observeRejection(
          Promise.reject(new TypeError("capture store line must be a string")),
        );
      }
      if (writer === null) {
        return observeRejection(Promise.reject(new Error("capture store is not active")));
      }
      const normalized = line.endsWith("\n") ? line : `${line}\n`;
      const current = writer;
      const writePromise = appendQueue.then(async () => {
        if (writer !== current) throw new Error("capture store is not active");
        await writeChunk(current, normalized);
        bytesWritten += textEncoder.encode(normalized).byteLength;
      });
      appendQueue = writePromise;
      void writePromise.catch((error) => {
        if (writer === current) {
          writerWatch?.dispose();
          writerWatch = null;
          closeFailedWriter(current);
          writer = null;
          active = false;
          failure = asError(error, "capture write failed");
          partialPath = null;
          finalPath = null;
          appendQueue = Promise.resolve();
          bytesWritten = 0;
        }
        return error;
      });
      return writePromise;
    },

    finalize(summary: Record<string, unknown>): Promise<CaptureFileMetadata> {
      const finalizePromise = (async (): Promise<CaptureFileMetadata> => {
        if (!active && failure !== null) throw failure;
        if (lastMetadata && writer === null && partialPath === null) return lastMetadata;
        if (writer === null || partialPath === null || finalPath === null) {
          throw new Error("capture store has no active capture");
        }

        try {
          await appendQueue;
          const current = writer;
          await endWriter(current);
          writerWatch?.dispose();
          writerWatch = null;
          writer = null;
          await fs.rename(partialPath, finalPath);
          const reason = typeof summary.reason === "string" ? summary.reason : "completed";
          const result = fileMetadata(finalPath, bytesWritten, reason);
          lastMetadata = result;
          active = false;
          failure = null;
          partialPath = null;
          finalPath = null;
          return result;
        } catch (error) {
          writerWatch?.dispose();
          writerWatch = null;
          closeFailedWriter(writer);
          writer = null;
          active = false;
          failure = asError(error, "capture finalization failed");
          partialPath = null;
          finalPath = null;
          appendQueue = Promise.resolve();
          bytesWritten = 0;
          throw error;
        }
      })();
      return observeRejection(finalizePromise);
    },

    async recover(): Promise<StoreFileMetadata | null> {
      if (active || writer !== null) throw new Error("cannot recover an active capture store");

      let files: string[];
      try {
        files = await fs.readdir(directory);
      } catch (error) {
        if (!isMissingDirectory(error)) throw error;
        await fs.mkdir?.(directory, { recursive: true });
        return null;
      }

      const candidates: CaptureCandidate[] = [];
      for (const name of files) {
        const partialKey = captureNameKey(name, true);
        if (partialKey) candidates.push({ name, partial: true, key: partialKey });
        const finalKey = captureNameKey(name, false);
        if (finalKey) candidates.push({ name, partial: false, key: finalKey });
      }
      candidates.sort(compareCandidates);
      const candidate = candidates[candidates.length - 1];
      if (!candidate) return null;
      if (candidate.partial) {
        const from = join(directory, candidate.name);
        const to = join(
          directory,
          candidate.name.slice(0, -PARTIAL_SUFFIX.length) + FINAL_SUFFIX,
        );
        await fs.rename(from, to);
        const recovered = fileMetadata(to, await fileSize(fs, to, 0), "interrupted");
        lastMetadata = recovered;
        active = false;
        failure = null;
        partialPath = null;
        finalPath = null;
        return recovered;
      }
      const finalFilePath = join(directory, candidate.name);
      const recovered = fileMetadata(
        finalFilePath,
        await fileSize(fs, finalFilePath, 0),
        "recovered",
      );
      lastMetadata = recovered;
      active = false;
      failure = null;
      return recovered;
    },

    createReadStream(): AsyncIterable<string | Uint8Array> {
      return lastMetadata ? fs.createReadStream(lastMetadata.path) : emptyStream();
    },
  };

  void opts.nowMs;
  return store;
}
