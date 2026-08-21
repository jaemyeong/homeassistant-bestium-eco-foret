export type CaptureRecord = Readonly<{
  sequence: number;
  receivedAtMs: number;
  byteLength: number;
  hex: string;
}>;

export function createCaptureRecorder(): (chunk: Uint8Array, receivedAtMs: number) => CaptureRecord {
  let sequence = 0;

  return (chunk, receivedAtMs) => {
    if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0) {
      throw new TypeError("chunk must be a non-empty Uint8Array");
    }

    if (!Number.isSafeInteger(receivedAtMs) || receivedAtMs < 0) {
      throw new TypeError("receivedAtMs must be a non-negative safe integer");
    }

    const record: CaptureRecord = {
      sequence,
      receivedAtMs,
      byteLength: chunk.byteLength,
      hex: [...chunk].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    };

    sequence += 1;
    return record;
  };
}
