/**
 * body_data 解码器（熵减：单一职责）
 *
 * 说明：将 WebSocket 下发的 body_data 原始字节解码为 IRawBodyFrameData[]。
 * 协议：msgpack 编码，与主项目 ttsa.ts 一致。
 *
 * 设计原则：
 * 1. 信息密度：仅负责「字节 → 结构化数据」
 * 2. 可替换：若协议变更，只需修改此模块
 * 3. 无副作用：纯函数，不依赖外部状态
 */

import { decode } from '@msgpack/msgpack';
import type { IRawBodyFrameData } from '../types/frame-data';

export type BodyDecodeInput = ArrayBuffer | Uint8Array | ArrayLike<number>;

/**
 * 标准化输入：Socket.IO 可能传入 [buffer]、buffer、或 base64 字符串
 */
export function normalizeRawInput(raw: any): ArrayBuffer | Uint8Array | ArrayLike<number> | null {
  if (raw == null) return null;
  if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) return raw;
  if (ArrayBuffer.isView(raw)) return raw;
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (first instanceof ArrayBuffer || first instanceof Uint8Array) return first;
  }
  if (typeof raw === 'string') {
    try {
      const g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : ({} as any));
      const wx = (g as any).wx;
      if (wx?.base64ToArrayBuffer) {
        return new Uint8Array(wx.base64ToArrayBuffer(raw));
      }
      if (typeof atob !== 'undefined') {
        const binary = atob(raw);
        const arr = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
        return arr;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/** 判断是否为已解码的 body 帧数组（JSON 直传） */
function isDecodedBodyArray(raw: any): raw is IRawBodyFrameData[] {
  return Array.isArray(raw) && raw.length > 0 && raw[0] != null && typeof raw[0] === 'object'
    && ('sf' in raw[0] || 'ef' in raw[0] || 'n' in raw[0]);
}

/**
 * 解码 body_data
 * @param raw 原始字节（ArrayBuffer / Uint8Array / [buffer]）或已解码的 JSON 数组
 * @returns 解码后的帧数组，含 x_offset 占位（主项目约定）
 */
export function decodeBodyData(raw: BodyDecodeInput): IRawBodyFrameData[] {
  if (isDecodedBodyArray(raw)) {
    return raw.map((item) => ({ ...item, x_offset: item.x_offset ?? [] }));
  }
  const normalized = normalizeRawInput(raw);
  if (!normalized) return [];
  const decoded = decode(normalized) as IRawBodyFrameData[];
  if (!Array.isArray(decoded)) return [];
  return decoded.map((item) => ({
    ...item,
    x_offset: item.x_offset ?? [],
  }));
}
