/**
 * face_data 解码器
 *
 * 支持两种协议：
 * 1. msgpack (proto_version=0)：直接 msgpack 解码
 * 2. protobuf (proto_version>=2)：pako.inflate 解压 + 手工 protobuf 解码
 *
 * protobuf schema:
 *   message MeshData { int32 index=1; repeated float weights=2; }
 *   message JointData { repeated float translate=1; bytes rotate=2; }
 *   message FaceFrameData {
 *     int32 id=1; string s=2; int32 sf=3; int32 ef=4; bytes bsw=5;
 *     bytes cs=11; repeated JointData js=12; repeated MeshData ms=13;
 *     int32 body_id=14; int32 face_frame_type=15;
 *   }
 *   message FaceFrameDataList { repeated FaceFrameData data=1; }
 */

import { decode as msgpackDecode } from '../protocol/msgpack-lite'
import { normalizeRawInput } from './body-decoder'
import { scaledInt16BytesToFloat32, parseUint8ToFloat32 } from './float16-decoder'
import type { ITtsFaceFrameData } from '../types/frame-data'
import { createModuleLogger } from '../utils/logger'

const log = createModuleLogger('FaceDecoder')

// pako 通过构建注入全局或作为外部依赖
declare const pako: { inflate: (data: Uint8Array) => Uint8Array; ungzip: (data: Uint8Array) => Uint8Array }

// ============================================================================
// 入口
// ============================================================================

/**
 * 解码 face_data
 * @param raw 原始字节
 * @param protoVersion 0=msgpack, >=2=protobuf
 */
export function decodeFaceData(
  raw: ArrayBuffer | Uint8Array,
  protoVersion: number
): ITtsFaceFrameData[] {
  // 已解码的 JSON 数组直接返回
  if (isDecodedFaceArray(raw)) return raw as any

  // 包含 .data 的对象
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as any).data)) {
    const arr = (raw as any).data
    if (isDecodedFaceArray(arr)) return arr
  }

  const normalized = normalizeRawInput(raw)
  if (!normalized) {
    log.warn('face_data normalizeRawInput returned null')
    return []
  }

  const isProtoV2 = Number(protoVersion) >= 2
  const compressed = isCompressed(normalized)

  let result: ITtsFaceFrameData[] = []

  if (protoVersion === 0 || !protoVersion) {
    // msgpack 路径
    result = decodeFaceDataMsgpack(normalized)
  } else if (isProtoV2 || compressed) {
    // protobuf 路径
    result = decodeFaceDataProtobuf(normalized)
    // fallback 到 msgpack
    if (result.length === 0) result = decodeFaceDataMsgpack(normalized)
  } else {
    // 尝试 msgpack 再 fallback protobuf
    result = decodeFaceDataMsgpack(normalized)
    if (result.length === 0) result = decodeFaceDataProtobuf(normalized)
  }

  if (result.length === 0) {
    const head =
      normalized.length >= 4
        ? Array.from(normalized.slice(0, 4))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(' ')
        : '?'
    log.warn('face_data decode empty', {
      protoVersion,
      compressed,
      byteLen: normalized.length,
      headHex: head,
    })
  }

  return result
}

// ============================================================================
// 辅助判断
// ============================================================================

function isDecodedFaceArray(raw: any): raw is ITtsFaceFrameData[] {
  return (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw[0] != null &&
    typeof raw[0] === 'object' &&
    ('bsw' in raw[0] || 'js' in raw[0] || 'sf' in raw[0] || 'body_id' in raw[0])
  )
}

/** 检测数据是否经过 gzip/zlib 压缩 */
function isCompressed(data: Uint8Array): boolean {
  if (data.length < 2) return false
  // gzip: 0x1f 0x8b
  if (data[0] === 0x1f && data[1] === 0x8b) return true
  // zlib: CM=8 (deflate) 且 FCHECK 校验通过
  const cmf = data[0]
  const flg = data[1]
  const isDeflate = (cmf & 0x0f) === 0x08
  const checksumOk = ((cmf << 8) + flg) % 31 === 0
  return isDeflate && checksumOk
}

// ============================================================================
// msgpack 路径
// ============================================================================

function decodeFaceDataMsgpack(data: Uint8Array): ITtsFaceFrameData[] {
  try {
    const decoded = msgpackDecode(data) as any
    if (Array.isArray(decoded)) return decoded
    if (decoded && typeof decoded === 'object' && Array.isArray(decoded.data)) return decoded.data
    return []
  } catch (e) {
    log.warn('face_data msgpack decode failed:', String(e))
    return []
  }
}

// ============================================================================
// protobuf 路径：pako 解压 + 手工解码
// ============================================================================

function decodeFaceDataProtobuf(data: Uint8Array): ITtsFaceFrameData[] {
  // 1. 解压
  let decompressed: Uint8Array
  try {
    decompressed = inflateData(data)
  } catch (e) {
    log.warn('face_data inflate failed:', String(e))
    return []
  }

  // 2. protobuf 解码 FaceFrameDataList
  try {
    const faceList = decodeFaceFrameDataList(decompressed)
    return faceList.map(convertProtobufToFaceData)
  } catch (e) {
    log.warn('face_data protobuf decode failed:', String(e))
    return []
  }
}

/** 解压数据（尝试 inflate 和 ungzip） */
function inflateData(data: Uint8Array): Uint8Array {
  if (typeof pako === 'undefined') {
    throw new Error('pako not available: need pako for protobuf face_data decompression')
  }
  try {
    return pako.inflate(data)
  } catch {
    return pako.ungzip(data)
  }
}

// ============================================================================
// 手工 Protobuf 解码器（专用于 FaceFrameDataList schema）
// ============================================================================

/**
 * Protobuf wire type 定义
 * 0: varint, 1: 64-bit, 2: length-delimited, 5: 32-bit
 */

interface ProtobufReader {
  buf: Uint8Array
  pos: number
  end: number
}

function createReader(buf: Uint8Array, start = 0, end?: number): ProtobufReader {
  return { buf, pos: start, end: end ?? buf.length }
}

/** 读取 varint（最多 64 位，返回 number，超大值可能丢失精度） */
function readVarint(r: ProtobufReader): number {
  let result = 0
  let shift = 0
  while (r.pos < r.end) {
    const byte = r.buf[r.pos++]
    result |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) {
      // 处理负数（sint/int32 的补码）
      return result >>> 0
    }
    shift += 7
    if (shift > 49) {
      // 防止无限循环
      throw new Error('protobuf: varint too long')
    }
  }
  throw new Error('protobuf: unexpected end reading varint')
}

/** 读取有符号 varint（int32） */
function readSignedVarint(r: ProtobufReader): number {
  const raw = readVarint(r)
  return raw | 0 // 转为有符号 int32
}

/** 读取 length-delimited 字段的字节 */
function readBytes(r: ProtobufReader): Uint8Array {
  const len = readVarint(r)
  const start = r.pos
  r.pos += len
  if (r.pos > r.end) throw new Error('protobuf: length-delimited overflows buffer')
  return r.buf.subarray(start, start + len)
}

/** 读取 UTF-8 字符串 */
function readString(r: ProtobufReader): string {
  const bytes = readBytes(r)
  return utf8Decode(bytes)
}

/** 读取 float32 */
function readFloat32(r: ProtobufReader): number {
  const buf = new ArrayBuffer(4)
  const u8 = new Uint8Array(buf)
  u8[0] = r.buf[r.pos++]
  u8[1] = r.buf[r.pos++]
  u8[2] = r.buf[r.pos++]
  u8[3] = r.buf[r.pos++]
  return new DataView(buf).getFloat32(0, true) // 小端序
}

/** 读取 float64 */
function readFloat64(r: ProtobufReader): number {
  const buf = new ArrayBuffer(8)
  const u8 = new Uint8Array(buf)
  for (let i = 0; i < 8; i++) u8[i] = r.buf[r.pos++]
  return new DataView(buf).getFloat64(0, true) // 小端序
}

/** 跳过未知字段 */
function skipField(r: ProtobufReader, wireType: number): void {
  switch (wireType) {
    case 0: // varint
      readVarint(r)
      break
    case 1: // 64-bit
      r.pos += 8
      break
    case 2: // length-delimited
      readBytes(r)
      break
    case 5: // 32-bit
      r.pos += 4
      break
    default:
      throw new Error(`protobuf: unknown wire type ${wireType}`)
  }
}

/** 读取 packed repeated float */
function readPackedFloats(r: ProtobufReader): number[] {
  const bytes = readBytes(r)
  const result: number[] = []
  const subR = createReader(bytes)
  while (subR.pos < subR.end) {
    result.push(readFloat32(subR))
  }
  return result
}

// ---- Schema-specific decoders ----

interface RawProtobufMeshData {
  index: number
  weights: number[]
}

interface RawProtobufJointData {
  translate: number[]
  rotate: Uint8Array
}

interface RawProtobufFaceFrameData {
  id: number
  s: string
  sf: number
  ef: number
  bsw: Uint8Array
  cs: Uint8Array
  js: RawProtobufJointData[]
  ms: RawProtobufMeshData[]
  body_id: number
  face_frame_type: number
}

function decodeMeshData(data: Uint8Array): RawProtobufMeshData {
  const r = createReader(data)
  const mesh: RawProtobufMeshData = { index: 0, weights: [] }

  while (r.pos < r.end) {
    const tag = readVarint(r)
    const fieldNumber = tag >>> 3
    const wireType = tag & 0x07

    switch (fieldNumber) {
      case 1: // int32 index
        mesh.index = readSignedVarint(r)
        break
      case 2: // repeated float weights (packed)
        if (wireType === 2) {
          mesh.weights = readPackedFloats(r)
        } else if (wireType === 5) {
          mesh.weights.push(readFloat32(r))
        } else {
          skipField(r, wireType)
        }
        break
      default:
        skipField(r, wireType)
    }
  }

  return mesh
}

function decodeJointData(data: Uint8Array): RawProtobufJointData {
  const r = createReader(data)
  const joint: RawProtobufJointData = { translate: [], rotate: new Uint8Array(0) }

  while (r.pos < r.end) {
    const tag = readVarint(r)
    const fieldNumber = tag >>> 3
    const wireType = tag & 0x07

    switch (fieldNumber) {
      case 1: // repeated float translate (packed)
        if (wireType === 2) {
          joint.translate = readPackedFloats(r)
        } else if (wireType === 5) {
          joint.translate.push(readFloat32(r))
        } else {
          skipField(r, wireType)
        }
        break
      case 2: // bytes rotate
        joint.rotate = readBytes(r)
        break
      default:
        skipField(r, wireType)
    }
  }

  return joint
}

function decodeFaceFrameData(data: Uint8Array): RawProtobufFaceFrameData {
  const r = createReader(data)
  const frame: RawProtobufFaceFrameData = {
    id: 0,
    s: '',
    sf: 0,
    ef: 0,
    bsw: new Uint8Array(0),
    cs: new Uint8Array(0),
    js: [],
    ms: [],
    body_id: 0,
    face_frame_type: 0,
  }

  while (r.pos < r.end) {
    const tag = readVarint(r)
    const fieldNumber = tag >>> 3
    const wireType = tag & 0x07

    switch (fieldNumber) {
      case 1: // int32 id
        frame.id = readSignedVarint(r)
        break
      case 2: // string s
        frame.s = readString(r)
        break
      case 3: // int32 sf
        frame.sf = readSignedVarint(r)
        break
      case 4: // int32 ef
        frame.ef = readSignedVarint(r)
        break
      case 5: // bytes bsw
        frame.bsw = readBytes(r)
        break
      case 11: // bytes cs
        frame.cs = readBytes(r)
        break
      case 12: // repeated JointData js
        frame.js.push(decodeJointData(readBytes(r)))
        break
      case 13: // repeated MeshData ms
        frame.ms.push(decodeMeshData(readBytes(r)))
        break
      case 14: // int32 body_id
        frame.body_id = readSignedVarint(r)
        break
      case 15: // int32 face_frame_type
        frame.face_frame_type = readSignedVarint(r)
        break
      default:
        skipField(r, wireType)
    }
  }

  return frame
}

function decodeFaceFrameDataList(data: Uint8Array): RawProtobufFaceFrameData[] {
  const r = createReader(data)
  const frames: RawProtobufFaceFrameData[] = []

  while (r.pos < r.end) {
    const tag = readVarint(r)
    const fieldNumber = tag >>> 3
    const wireType = tag & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      // repeated FaceFrameData data = 1
      frames.push(decodeFaceFrameData(readBytes(r)))
    } else {
      skipField(r, wireType)
    }
  }

  return frames
}

/** 将 protobuf 解码结果转换为 ITtsFaceFrameData 格式 */
function convertProtobufToFaceData(frame: RawProtobufFaceFrameData): ITtsFaceFrameData {
  const decodedBsw = frame.bsw.length > 0 ? scaledInt16BytesToFloat32(frame.bsw) : []

  const joints = frame.js.map((joint) => ({
    translate: joint.translate,
    rotate: joint.rotate.length > 0 ? scaledInt16BytesToFloat32(joint.rotate) : [],
  }))

  const meshes = frame.ms.map((mesh) => ({
    index: mesh.index,
    weights: mesh.weights,
  }))

  return {
    id: frame.id,
    s: frame.s,
    sf: frame.sf,
    ef: frame.ef,
    bsw: decodedBsw,
    js: joints,
    ms: meshes,
    body_id: frame.body_id,
    face_frame_type: frame.face_frame_type,
  }
}

// ============================================================================
// UTF-8 解码
// ============================================================================

function utf8Decode(bytes: Uint8Array): string {
  let str = ''
  let i = 0
  while (i < bytes.length) {
    const byte1 = bytes[i++]
    if (byte1 < 0x80) {
      str += String.fromCharCode(byte1)
    } else if (byte1 < 0xe0) {
      const byte2 = bytes[i++] & 0x3f
      str += String.fromCharCode(((byte1 & 0x1f) << 6) | byte2)
    } else if (byte1 < 0xf0) {
      const byte2 = bytes[i++] & 0x3f
      const byte3 = bytes[i++] & 0x3f
      str += String.fromCharCode(((byte1 & 0x0f) << 12) | (byte2 << 6) | byte3)
    } else {
      const byte2 = bytes[i++] & 0x3f
      const byte3 = bytes[i++] & 0x3f
      const byte4 = bytes[i++] & 0x3f
      const cp = ((byte1 & 0x07) << 18) | (byte2 << 12) | (byte3 << 6) | byte4
      str += String.fromCharCode(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff))
    }
  }
  return str
}
