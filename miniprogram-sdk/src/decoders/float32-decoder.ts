/**
 * float32 解码器（熵减：单一职责）
 *
 * 说明：将服务端 scaled int16 字节流还原为 float32 数组。
 * 服务端：floats → scaled int16 bytes → Base64；客户端：Base64 → int16 → ÷0x7FFF → float32
 *
 * 设计原则：
 * 1. 信息密度：仅负责「字节 → 浮点」的确定性转换
 * 2. 边界清晰：不依赖业务逻辑，可单独测试
 * 3. 平台兼容：支持 Web atob 与小程序 wx.base64ToArrayBuffer
 */

const SCALE_FACTOR = 0x7fff;

/** Base64 → Uint8Array（兼容 Web / 小程序） */
function base64ToUint8Array(base64Str: string): Uint8Array {
  if (!base64Str || typeof base64Str !== 'string') {
    return new Uint8Array(0);
  }
  const trimmed = base64Str.trim();
  if (trimmed === '') {
    return new Uint8Array(0);
  }

  if (typeof atob !== 'undefined') {
    const binary = atob(trimmed);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      arr[i] = binary.charCodeAt(i);
    }
    return arr;
  }

  const g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : (window as any));
  const wx = g?.wx;
  if (wx && typeof wx.base64ToArrayBuffer === 'function') {
    const buf = wx.base64ToArrayBuffer(trimmed);
    return new Uint8Array(buf);
  }

  return new Uint8Array(0);
}

/** 2 字节小端序 → int16（兼容服务端 np.clip 范围 -32767~32767） */
function twoByteToInt16(byte0: number, byte1: number): number {
  const uint16 = (byte0 << 0) | (byte1 << 8);
  const int16Value = uint16 > 32767 ? uint16 - 65536 : uint16;
  return Math.max(-32767, Math.min(32767, int16Value));
}

/**
 * 服务端 floats_to_scaled_int16_bytes 反向函数
 * @param input Base64 字符串或已解码的 Uint8Array
 * @returns float32 数组
 */
export function scaledInt16BytesToFloat32(input: string | Uint8Array): number[] {
  const uint8Array =
    typeof input === 'string' ? base64ToUint8Array(input) : input;
  if (uint8Array.length === 0 || uint8Array.length % 2 !== 0) {
    return [];
  }

  const length = uint8Array.length / 2;
  const buffer = new ArrayBuffer(4 * length);
  const float32View = new Float32Array(buffer);

  for (let i = 0; i < length; i++) {
    const byteIndex = i * 2;
    const byte0 = uint8Array[byteIndex];
    const byte1 = uint8Array[byteIndex + 1];
    const int16Value = twoByteToInt16(byte0, byte1);
    float32View[i] = int16Value / SCALE_FACTOR;
  }

  return Array.from(float32View);
}
