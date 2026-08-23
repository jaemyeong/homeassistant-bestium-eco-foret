export function encodeSingleLightOffCanary(target: number): Uint8Array {
  if (typeof target !== "number") throw new TypeError("target must be a number");
  if (!Number.isInteger(target) || (target !== 0x11 && target !== 0x12 && target !== 0x13)) {
    throw new RangeError(`unsupported single-light OFF target: ${String(target)}`);
  }

  const frame = new Uint8Array([0xf7, 0x0b, 0x01, 0x19, 0x02, 0x40, target, 0x02, 0x00, 0x00, 0xee]);
  for (let index = 0; index <= 8; index += 1) frame[9] ^= frame[index];
  return frame;
}
