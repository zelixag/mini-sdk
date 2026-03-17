// translate numpy.float16 tobytes() to Float32Array
const halfToFloat = (h: number) => {
  const s = (h & 0x8000) >> 15;
  let e = (h & 0x7C00) >> 10;
  let f = h & 0x03FF;

  if (e === 0) {
    // subnormal
    return ((-1) ** s) * (f / 0x400) * 2 ** (-14);
  } else if (e === 0x1F) {
    // ±Inf or NaN
    return f ? NaN : ((-1) ** s) * Infinity;
  } else {
    // normal
    return ((-1) ** s) * (1 + f / 0x400) * 2 ** (e - 15);
  }
}

export const translateBufferToFloatArray = (buf: any) => {
  const count = buf.byteLength / 2;
  const floats = new Float32Array(count);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  for (let i = 0; i < count; i++) {
    const h = dv.getUint16(i * 2, true);  // true = little‑endian
    floats[i] = halfToFloat(h);
  }
  return Array.from(floats)
}