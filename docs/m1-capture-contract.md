# M1.0 Synthetic capture contract

Each call to the capture recorder represents one observed transport read chunk.
A chunk is treated only as raw bytes and is not a protocol frame.

## Inputs

- `chunk: Uint8Array` — must be non-empty.
- `receivedAtMs: number` — must be a non-negative safe integer (milliseconds).

## Output

`createCaptureRecorder()` returns a recorder function that records chunks and returns
an object with:

- `sequence`: zero-based monotonically increasing integer.
- `receivedAtMs`: the provided timestamp.
- `byteLength`: `chunk.byteLength`.
- `hex`: lowercase hexadecimal representation of all bytes.

## Failures and invariants

- Empty `chunk` or invalid `receivedAtMs` must throw.
- Sequence must not advance on failed recordings.
- No parsing, framing, socket/network I/O, persistence, filesystem writes, or
  Home Assistant packaging is performed.

## Scope

- No package installation or dependency additions.
- Native TypeScript stripping and `node:test` only.
- Test file: `test/capture.test.ts`.
- Runtime artifact: `src/capture.ts`.
