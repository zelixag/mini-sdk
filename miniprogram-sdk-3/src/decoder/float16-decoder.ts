/**
 * float16/float32 解码器
 *
 * 将服务端 scaled int16 字节流还原为 float32 数组
 * 服务端流程：floats -> scaled int16 bytes -> 传输
 * 客户端流程：bytes -> int16 -> / 0x7FFF -> float32
 *
 * 同时提供 Uint8Array -> Float32Array 解析（用于 joint rotate 等字段）
 */

const SCALE_FACTOR = 0x7fff // 32767

/**
 * Base64 -> Uint8Array（兼容 Web / 小程序）
 */
function base64ToUint8Array(base64Str: string): Uint8Array {
  if (!base64Str || typeof base64Str !== 'string') return new Uint8Array(0)
  const trimmed = base64Str.trim()
  if (trimmed === '') return new Uint8Array(0)

  // 小程序环境
  if (typeof wx !== 'undefined' && typeof wx.base64ToArrayBuffer === 'function') {
    try {
      const buf = wx.base64ToArrayBuffer(trimmed)
      return new Uint8Array(buf)
    } catch {
      // fallthrough
    }
  }

  // Web 环境
  if (typeof atob !== 'undefined') {
    try {
      const binary = atob(trimmed)
      const arr = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        arr[i] = binary.charCodeAt(i)
      }
      return arr
    } catch {
      return new Uint8Array(0)
    }
  }

  return new Uint8Array(0)
}

/**
 * 2 字节小端序 -> int16（兼容服务端 np.clip 范围 -32767~32767）
 */
function twoByteToInt16(byte0: number, byte1: number): number {
  const uint16 = byte0 | (byte1 << 8)
  let int16Value = uint16 > 32767 ? uint16 - 65536 : uint16
  return Math.max(-32767, Math.min(32767, int16Value))
}

/**
 * 将 scaled int16 bytes 解码为 float32 数组
 * 输入可以是 Base64 字符串或已解码的 Uint8Array
 *
 * @param input Base64 字符串或 Uint8Array
 * @returns float32 数组
 */
export function scaledInt16BytesToFloat32(input: string | Uint8Array): number[] {
  const uint8Array = typeof input === 'string' ? base64ToUint8Array(input) : input

  if (!uint8Array || uint8Array.length === 0 || uint8Array.length % 2 !== 0) {
    return []
  }

  const count = uint8Array.length / 2
  const buffer = new ArrayBuffer(4 * count)
  const float32View = new Float32Array(buffer)

  for (let i = 0; i < count; i++) {
    const byteIndex = i * 2
    const byte0 = uint8Array[byteIndex]
    const byte1 = uint8Array[byteIndex + 1]
    const int16Value = twoByteToInt16(byte0, byte1)
    float32View[i] = int16Value / SCALE_FACTOR
  }

  return Array.from(float32View)
}

/**
 * 带平滑滤波的版本（解决渲染闪烁问题）
 *
 * @param input Base64 字符串或 Uint8Array
 * @param lastData 上一帧数据
 * @param alpha 平滑系数（0~1，默认0.2）
 * @returns 平滑后的 float32 数组
 */
export function scaledInt16BytesToSmoothFloat32(
  input: string | Uint8Array,
  lastData: number[] = [],
  alpha = 0.2
): number[] {
  const rawData = scaledInt16BytesToFloat32(input)
  if (lastData.length !== rawData.length) return rawData
  return rawData.map((val, idx) => alpha * val + (1 - alpha) * lastData[idx])
}

/**
 * 将 Uint8Array 原始字节解析为 float32 数组
 * 用于解析 joint rotate、translate 等直接以 float32 传输的字段
 *
 * @param bytes Uint8Array 原始字节（长度需为 4 的倍数）
 * @returns float32 数组
 */
export function parseUint8ToFloat32(bytes: Uint8Array): number[] {
  if (!bytes || bytes.length === 0) return []
  if (bytes.length % 4 !== 0) return []

  // 创建对齐的 ArrayBuffer（避免 byteOffset 不对齐问题）
  const alignedBuffer = new ArrayBuffer(bytes.length)
  new Uint8Array(alignedBuffer).set(bytes)
  return Array.from(new Float32Array(alignedBuffer))
}
