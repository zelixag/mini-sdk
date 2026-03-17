/**
 * body_data 解码器
 *
 * 将 WebSocket 下发的 body_data 原始字节解码为 IRawBodyFrameData[]
 * 协议：msgpack 编码
 */

import { decode as msgpackDecode } from '../protocol/msgpack-lite'
import type { IRawBodyFrameData } from '../types/frame-data'
import { createModuleLogger } from '../utils/logger'

const log = createModuleLogger('BodyDecoder')

export type BodyDecodeInput = ArrayBuffer | Uint8Array | ArrayLike<number>

/**
 * 标准化输入
 * Socket.IO / wx.connectSocket 可能传入 ArrayBuffer、Uint8Array、[buffer]、base64 字符串
 */
export function normalizeRawInput(raw: any): Uint8Array | null {
  if (raw == null) return null

  if (raw instanceof Uint8Array) return raw
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw)

  // ArrayBufferView (e.g. Int8Array)
  if (ArrayBuffer.isView(raw)) return new Uint8Array((raw as any).buffer, (raw as any).byteOffset, (raw as any).byteLength)

  // Socket.IO 风格：[ArrayBuffer] 或 [Uint8Array]
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0]
    if (first instanceof ArrayBuffer) return new Uint8Array(first)
    if (first instanceof Uint8Array) return first
  }

  // base64 字符串
  if (typeof raw === 'string') {
    try {
      // 小程序环境
      if (typeof wx !== 'undefined' && typeof wx.base64ToArrayBuffer === 'function') {
        return new Uint8Array(wx.base64ToArrayBuffer(raw))
      }
      // Web 环境 fallback
      if (typeof atob !== 'undefined') {
        const binary = atob(raw)
        const arr = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
        return arr
      }
    } catch {
      return null
    }
  }

  return null
}

/** 判断是否为已解码的 body 帧数组（JSON 直传场景） */
function isDecodedBodyArray(raw: any): raw is IRawBodyFrameData[] {
  return (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw[0] != null &&
    typeof raw[0] === 'object' &&
    ('sf' in raw[0] || 'ef' in raw[0] || 'n' in raw[0])
  )
}

/**
 * 解码 body_data
 * @param raw 原始字节（ArrayBuffer / Uint8Array / [buffer]）或已解码的 JSON 数组
 * @returns 解码后的帧数组
 */
export function decodeBodyData(raw: BodyDecodeInput): IRawBodyFrameData[] {
  // 已解码的 JSON 数组直接返回
  if (isDecodedBodyArray(raw)) {
    return raw.map((item) => ({
      ...item,
      x_offset: item.x_offset ?? new Uint8Array(0),
    }))
  }

  const normalized = normalizeRawInput(raw)
  if (!normalized) {
    log.warn('body_data normalizeRawInput returned null')
    return []
  }

  try {
    const decoded = msgpackDecode(normalized) as any

    // 可能是数组或包含 data 字段的对象
    const items: any[] = Array.isArray(decoded)
      ? decoded
      : decoded && typeof decoded === 'object' && Array.isArray(decoded.data)
        ? decoded.data
        : []

    if (items.length === 0) {
      log.warn('body_data decoded but empty')
      return []
    }

    return items.map((item: any) => ({
      sf: item.sf,
      ef: item.ef,
      hfd: item.hfd,
      aef: item.aef ?? item.ef,
      asf: item.asf ?? item.sf,
      id: item.id,
      n: item.n,
      s: item.s,
      body_id: item.body_id ?? 0,
      x_offset: item.x_offset ?? new Uint8Array(0),
    }))
  } catch (e) {
    log.error('body_data decode failed:', String(e))
    return []
  }
}
