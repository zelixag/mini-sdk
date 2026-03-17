/**
 * 轻量 msgpack 编解码器（小程序环境专用）
 *
 * 支持完整的 msgpack 规范：
 * - nil, true, false
 * - positive/negative fixint, uint8/16/32, int8/16/32
 * - float32, float64
 * - fixstr, str8/16/32
 * - bin8/16/32
 * - fixarray, array16/32
 * - fixmap, map16/32
 * - ext (fixext1/2/4/8/16, ext8/16/32)
 *
 * 输入：ArrayBuffer 或 Uint8Array（来自 wx.connectSocket 二进制消息）
 */

// ============================================================================
// Decoder
// ============================================================================

class MsgpackDecoder {
  private view: DataView
  private bytes: Uint8Array
  private offset = 0

  constructor(buffer: ArrayBuffer | Uint8Array) {
    if (buffer instanceof Uint8Array) {
      // 确保基于完整的 ArrayBuffer
      this.bytes = buffer
      this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    } else {
      this.bytes = new Uint8Array(buffer)
      this.view = new DataView(buffer)
    }
  }

  decode(): any {
    if (this.offset >= this.bytes.length) {
      throw new Error('msgpack: unexpected end of buffer')
    }

    const byte = this.bytes[this.offset++]

    // positive fixint (0x00 - 0x7f)
    if (byte <= 0x7f) return byte

    // fixmap (0x80 - 0x8f)
    if (byte >= 0x80 && byte <= 0x8f) return this.readMap(byte & 0x0f)

    // fixarray (0x90 - 0x9f)
    if (byte >= 0x90 && byte <= 0x9f) return this.readArray(byte & 0x0f)

    // fixstr (0xa0 - 0xbf)
    if (byte >= 0xa0 && byte <= 0xbf) return this.readStr(byte & 0x1f)

    // negative fixint (0xe0 - 0xff)
    if (byte >= 0xe0) return byte - 256

    switch (byte) {
      // nil
      case 0xc0:
        return null
      // (never used) 0xc1
      case 0xc1:
        throw new Error('msgpack: 0xc1 is never used')
      // false
      case 0xc2:
        return false
      // true
      case 0xc3:
        return true

      // bin 8/16/32
      case 0xc4:
        return this.readBin(this.readU8())
      case 0xc5:
        return this.readBin(this.readU16())
      case 0xc6:
        return this.readBin(this.readU32())

      // ext 8/16/32
      case 0xc7:
        return this.readExt(this.readU8())
      case 0xc8:
        return this.readExt(this.readU16())
      case 0xc9:
        return this.readExt(this.readU32())

      // float 32
      case 0xca: {
        const val = this.view.getFloat32(this.offset)
        this.offset += 4
        return val
      }
      // float 64
      case 0xcb: {
        const val = this.view.getFloat64(this.offset)
        this.offset += 8
        return val
      }

      // uint 8/16/32
      case 0xcc:
        return this.readU8()
      case 0xcd:
        return this.readU16()
      case 0xce:
        return this.readU32()
      // uint 64 (read as number, may lose precision for very large values)
      case 0xcf:
        return this.readU64()

      // int 8/16/32
      case 0xd0:
        return this.readI8()
      case 0xd1:
        return this.readI16()
      case 0xd2:
        return this.readI32()
      // int 64
      case 0xd3:
        return this.readI64()

      // fixext 1/2/4/8/16
      case 0xd4:
        return this.readExt(1)
      case 0xd5:
        return this.readExt(2)
      case 0xd6:
        return this.readExt(4)
      case 0xd7:
        return this.readExt(8)
      case 0xd8:
        return this.readExt(16)

      // str 8/16/32
      case 0xd9:
        return this.readStr(this.readU8())
      case 0xda:
        return this.readStr(this.readU16())
      case 0xdb:
        return this.readStr(this.readU32())

      // array 16/32
      case 0xdc:
        return this.readArray(this.readU16())
      case 0xdd:
        return this.readArray(this.readU32())

      // map 16/32
      case 0xde:
        return this.readMap(this.readU16())
      case 0xdf:
        return this.readMap(this.readU32())

      default:
        throw new Error(`msgpack: unknown byte 0x${byte.toString(16)}`)
    }
  }

  private readU8(): number {
    return this.bytes[this.offset++]
  }

  private readU16(): number {
    const val = this.view.getUint16(this.offset)
    this.offset += 2
    return val
  }

  private readU32(): number {
    const val = this.view.getUint32(this.offset)
    this.offset += 4
    return val
  }

  private readU64(): number {
    const hi = this.view.getUint32(this.offset)
    const lo = this.view.getUint32(this.offset + 4)
    this.offset += 8
    return hi * 0x100000000 + lo
  }

  private readI8(): number {
    const val = this.view.getInt8(this.offset)
    this.offset += 1
    return val
  }

  private readI16(): number {
    const val = this.view.getInt16(this.offset)
    this.offset += 2
    return val
  }

  private readI32(): number {
    const val = this.view.getInt32(this.offset)
    this.offset += 4
    return val
  }

  private readI64(): number {
    const hi = this.view.getInt32(this.offset)
    const lo = this.view.getUint32(this.offset + 4)
    this.offset += 8
    return hi * 0x100000000 + lo
  }

  private readStr(length: number): string {
    const end = this.offset + length
    let str = ''
    let i = this.offset
    while (i < end) {
      const byte1 = this.bytes[i++]
      if (byte1 < 0x80) {
        str += String.fromCharCode(byte1)
      } else if (byte1 < 0xe0) {
        const byte2 = this.bytes[i++] & 0x3f
        str += String.fromCharCode(((byte1 & 0x1f) << 6) | byte2)
      } else if (byte1 < 0xf0) {
        const byte2 = this.bytes[i++] & 0x3f
        const byte3 = this.bytes[i++] & 0x3f
        str += String.fromCharCode(((byte1 & 0x0f) << 12) | (byte2 << 6) | byte3)
      } else {
        const byte2 = this.bytes[i++] & 0x3f
        const byte3 = this.bytes[i++] & 0x3f
        const byte4 = this.bytes[i++] & 0x3f
        const cp = ((byte1 & 0x07) << 18) | (byte2 << 12) | (byte3 << 6) | byte4
        // 转为 surrogate pair
        str += String.fromCharCode(
          0xd800 + ((cp - 0x10000) >> 10),
          0xdc00 + ((cp - 0x10000) & 0x3ff)
        )
      }
    }
    this.offset = end
    return str
  }

  private readBin(length: number): Uint8Array {
    const slice = this.bytes.slice(this.offset, this.offset + length)
    this.offset += length
    return slice
  }

  private readArray(length: number): any[] {
    const arr: any[] = new Array(length)
    for (let i = 0; i < length; i++) {
      arr[i] = this.decode()
    }
    return arr
  }

  private readMap(length: number): Record<string, any> {
    const map: Record<string, any> = {}
    for (let i = 0; i < length; i++) {
      const key = this.decode()
      const value = this.decode()
      map[String(key)] = value
    }
    return map
  }

  private readExt(length: number): { type: number; data: Uint8Array } {
    const type = this.readI8()
    const data = this.readBin(length)
    return { type, data }
  }
}

// ============================================================================
// Encoder
// ============================================================================

class MsgpackEncoder {
  private chunks: number[] = []

  encode(value: any): ArrayBuffer {
    this.chunks = []
    this.writeValue(value)
    const result = new Uint8Array(this.chunks)
    return result.buffer
  }

  private writeValue(value: any): void {
    if (value === null || value === undefined) {
      this.chunks.push(0xc0)
      return
    }

    if (typeof value === 'boolean') {
      this.chunks.push(value ? 0xc3 : 0xc2)
      return
    }

    if (typeof value === 'number') {
      this.writeNumber(value)
      return
    }

    if (typeof value === 'string') {
      this.writeString(value)
      return
    }

    if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value
      this.writeBin(bytes)
      return
    }

    if (Array.isArray(value)) {
      this.writeArray(value)
      return
    }

    if (typeof value === 'object') {
      this.writeMap(value)
      return
    }

    // fallback：转为字符串
    this.writeString(String(value))
  }

  private writeNumber(n: number): void {
    if (Number.isInteger(n)) {
      if (n >= 0) {
        if (n <= 0x7f) {
          // positive fixint
          this.chunks.push(n)
        } else if (n <= 0xff) {
          this.chunks.push(0xcc, n)
        } else if (n <= 0xffff) {
          this.chunks.push(0xcd)
          this.pushU16(n)
        } else if (n <= 0xffffffff) {
          this.chunks.push(0xce)
          this.pushU32(n)
        } else {
          // 大整数用 float64
          this.writeFloat64(n)
        }
      } else {
        if (n >= -32) {
          // negative fixint
          this.chunks.push(n + 256)
        } else if (n >= -128) {
          this.chunks.push(0xd0, n + 256)
        } else if (n >= -32768) {
          this.chunks.push(0xd1)
          this.pushI16(n)
        } else if (n >= -2147483648) {
          this.chunks.push(0xd2)
          this.pushI32(n)
        } else {
          this.writeFloat64(n)
        }
      }
    } else {
      this.writeFloat64(n)
    }
  }

  private writeFloat64(n: number): void {
    this.chunks.push(0xcb)
    const buf = new ArrayBuffer(8)
    new DataView(buf).setFloat64(0, n)
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < 8; i++) this.chunks.push(bytes[i])
  }

  private writeString(str: string): void {
    const encoded = utf8Encode(str)
    const len = encoded.length

    if (len <= 31) {
      this.chunks.push(0xa0 | len)
    } else if (len <= 0xff) {
      this.chunks.push(0xd9, len)
    } else if (len <= 0xffff) {
      this.chunks.push(0xda)
      this.pushU16(len)
    } else {
      this.chunks.push(0xdb)
      this.pushU32(len)
    }

    for (let i = 0; i < encoded.length; i++) {
      this.chunks.push(encoded[i])
    }
  }

  private writeBin(bytes: Uint8Array): void {
    const len = bytes.length
    if (len <= 0xff) {
      this.chunks.push(0xc4, len)
    } else if (len <= 0xffff) {
      this.chunks.push(0xc5)
      this.pushU16(len)
    } else {
      this.chunks.push(0xc6)
      this.pushU32(len)
    }
    for (let i = 0; i < len; i++) {
      this.chunks.push(bytes[i])
    }
  }

  private writeArray(arr: any[]): void {
    const len = arr.length
    if (len <= 15) {
      this.chunks.push(0x90 | len)
    } else if (len <= 0xffff) {
      this.chunks.push(0xdc)
      this.pushU16(len)
    } else {
      this.chunks.push(0xdd)
      this.pushU32(len)
    }
    for (let i = 0; i < len; i++) {
      this.writeValue(arr[i])
    }
  }

  private writeMap(obj: Record<string, any>): void {
    const keys = Object.keys(obj)
    const len = keys.length
    if (len <= 15) {
      this.chunks.push(0x80 | len)
    } else if (len <= 0xffff) {
      this.chunks.push(0xde)
      this.pushU16(len)
    } else {
      this.chunks.push(0xdf)
      this.pushU32(len)
    }
    for (const key of keys) {
      this.writeString(key)
      this.writeValue(obj[key])
    }
  }

  private pushU16(n: number): void {
    this.chunks.push((n >> 8) & 0xff, n & 0xff)
  }

  private pushU32(n: number): void {
    this.chunks.push(
      (n >>> 24) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 8) & 0xff,
      n & 0xff
    )
  }

  private pushI16(n: number): void {
    const buf = new ArrayBuffer(2)
    new DataView(buf).setInt16(0, n)
    const bytes = new Uint8Array(buf)
    this.chunks.push(bytes[0], bytes[1])
  }

  private pushI32(n: number): void {
    const buf = new ArrayBuffer(4)
    new DataView(buf).setInt32(0, n)
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < 4; i++) this.chunks.push(bytes[i])
  }
}

function utf8Encode(str: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i)
    if (c < 0x80) {
      bytes.push(c)
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
      const c2 = str.charCodeAt(++i)
      const cp = ((c - 0xd800) << 10) + (c2 - 0xdc00) + 0x10000
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      )
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    }
  }
  return bytes
}

// ============================================================================
// 导出 API
// ============================================================================

/**
 * 解码 msgpack 二进制数据
 * @param buffer ArrayBuffer 或 Uint8Array
 * @returns 解码后的 JS 对象
 */
export function decode(buffer: ArrayBuffer | Uint8Array): any {
  const decoder = new MsgpackDecoder(buffer)
  return decoder.decode()
}

/**
 * 编码 JS 对象为 msgpack 二进制数据
 * @param value 要编码的值
 * @returns ArrayBuffer
 */
export function encode(value: any): ArrayBuffer {
  const encoder = new MsgpackEncoder()
  return encoder.encode(value)
}
