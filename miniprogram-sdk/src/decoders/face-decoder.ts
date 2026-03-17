/**
 * face_data 解码器（熵减：单一职责，双路径可切换）
 *
 * 说明：将 WebSocket 下发的 face_data 原始字节解码为 ITtsFaceFrameData[]。
 * 协议：framedata_proto_version=0 用 msgpack；=2 用 pako inflate + protobuf decode。
 *
 * 设计原则：
 * 1. 信息密度：仅负责「字节 → 结构化数据」
 * 2. 可替换：两种协议路径独立，便于扩展
 * 3. 无副作用：纯逻辑，依赖注入 protoVersion
 */

import { decode } from '@msgpack/msgpack';
import Pako from 'pako';
import type { ITtsFaceFrameData } from '../types/frame-data';
import { scaledInt16BytesToFloat32 } from './float32-decoder';
import { createModuleLogger } from '../utils/logger';
import { getFaceFrameDataList, getFaceProtoDebugState } from '../proto-loader';

const log = createModuleLogger('FaceDecoder');
let protoDiagLogged = false;

export type FaceDecodeInput = ArrayBuffer | Uint8Array | ArrayLike<number>;

/**
 * 解码 face_data（按 protoVersion 选择 msgpack 或 protobuf）
 * @param raw 原始字节
 * @param protoVersion 0=msgpack, 2=protobuf
 */
/** 判断是否为已解码的 face 帧数组（JSON 直传） */
function isDecodedFaceArray(raw: any): raw is ITtsFaceFrameData[] {
  return Array.isArray(raw) && raw.length > 0 && raw[0] != null && typeof raw[0] === 'object'
    && ('bsw' in raw[0] || 'js' in raw[0] || 'sf' in raw[0] || 'body_id' in raw[0] || 'face_frame_type' in raw[0]);
}

export function decodeFaceData(
  raw: FaceDecodeInput,
  protoVersion: number
): ITtsFaceFrameData[] {
  if (isDecodedFaceArray(raw)) return raw;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as any).data)) {
    const arr = (raw as any).data;
    if (isDecodedFaceArray(arr)) return arr;
  }
  let result: ITtsFaceFrameData[] = [];
  const normalized = normalizeRawInput(raw);
  const looksLikeGzip = normalized && normalized.length >= 2 && normalized[0] === 0x1f && normalized[1] === 0x8b;
  const looksLikeZlib = isLikelyZlib(normalized);
  const isProtoV2 = Number(protoVersion) >= 2;

  if (protoVersion === 0 || !protoVersion) {
    result = decodeFaceDataMsgpack(raw);
  } else if (isProtoV2 || looksLikeGzip || looksLikeZlib) {
    result = decodeFaceDataProtobuf(raw);
    if (result.length === 0) result = decodeFaceDataMsgpack(raw);
  } else {
    result = decodeFaceDataMsgpack(raw);
    if (result.length === 0) result = decodeFaceDataProtobuf(raw);
  }
  if (result.length === 0) {
    let rawInfo = raw == null ? 'null' : Array.isArray(raw) ? `Array(${raw.length})` : (raw as any)?.constructor?.name ?? typeof raw;
    if (raw instanceof ArrayBuffer) rawInfo += `,byteLen=${raw.byteLength}`;
    else if (raw instanceof Uint8Array) rawInfo += `,byteLen=${raw.length}`;
    else if (Array.isArray(raw) && raw[0] instanceof ArrayBuffer) rawInfo += `,[0].byteLen=${(raw[0] as ArrayBuffer).byteLength}`;
    const head = normalized && normalized.length >= 4
      ? Array.from(normalized.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ')
      : '?';
    log.warn('face_data decode empty', {
      raw: rawInfo,
      protoVersion,
      looksLikeGzip: !!looksLikeGzip,
      headHex: head,
      protoLoaded: !!getFaceFrameDataList(),
    });
  }
  return result;
}

/** zlib 头校验：CMF/FLG 满足 RFC1950 校验规则 */
function isLikelyZlib(data: Uint8Array | null): boolean {
  if (!data || data.length < 2) return false;
  const cmf = data[0];
  const flg = data[1];
  // 压缩方法 deflate (CM=8)
  const isDeflate = (cmf & 0x0f) === 0x08;
  // FCHECK: (CMF*256 + FLG) % 31 === 0
  const checksumOk = (((cmf << 8) + flg) % 31) === 0;
  return isDeflate && checksumOk;
}

/** msgpack 路径（v0） */
function decodeFaceDataMsgpack(raw: FaceDecodeInput): ITtsFaceFrameData[] {
  const normalized = normalizeRawInput(raw);
  if (!normalized) return [];
  try {
    const decoded = decode(normalized) as any;
    if (Array.isArray(decoded)) return decoded;
    if (decoded && typeof decoded === 'object' && Array.isArray(decoded.data))
      return decoded.data;
    if (decoded != null) {
      log.warn('face_data msgpack decoded but not array', {
        type: typeof decoded,
        keys: typeof decoded === 'object' ? Object.keys(decoded).slice(0, 10) : null,
        dataLen: decoded?.data?.length,
      });
    }
    return [];
  } catch (e) {
    log.warn('face_data msgpack decode failed:', String(e));
    return [];
  }
}

/** 标准化输入：Socket.IO 可能传入 [buffer]、buffer、或 base64 字符串 */
function normalizeRawInput(raw: any): Uint8Array | null {
  if (raw == null) return null;
  let buf: ArrayBuffer | Uint8Array;
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (first instanceof ArrayBuffer || first instanceof Uint8Array) buf = first;
    else return null;
  } else if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
    buf = raw;
  } else if (typeof raw === 'string') {
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
    return null;
  } else {
    return null;
  }
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

/** protobuf 路径（v2）：pako inflate + FaceFrameDataList decode */
function decodeFaceDataProtobuf(raw: FaceDecodeInput): ITtsFaceFrameData[] {
  const uint8Array = normalizeRawInput(raw);
  if (!uint8Array) return [];
  let decompressed: Uint8Array;
  try {
    decompressed = Pako.inflate(uint8Array);
  } catch (e1) {
    try {
      decompressed = Pako.ungzip(uint8Array);
    } catch (e2) {
      log.warn('face_data pako inflate/ungzip failed. inflate:', String(e1), 'ungzip:', String(e2));
      return [];
    }
  }
  const FaceFrameDataList = getFaceFrameDataList();
  if (!FaceFrameDataList) {
    log.warn('face_data proto not loaded (FaceFrameDataList null)');
    if (!protoDiagLogged) {
      protoDiagLogged = true;
      const state = getFaceProtoDebugState();
      log.warn('=== Proto Debug Start ===');
      log.warn('hasGlobalThis:', state.hasGlobalThis, 'hasGetter:', state.hasGetter, 'hasInject:', state.hasInject, 'hasGlobalPb:', state.hasGlobalPb);
      log.warn('same_pb_global:', state.same_pb_global, 'same_pb_injected:', state.same_pb_injected, 'same_global_injected:', state.same_global_injected);
      log.warn('hasFaceList_pb:', state.hasFaceList_pb, 'hasFaceList_injected:', state.hasFaceList_injected, 'hasFaceList_global:', state.hasFaceList_global);
      log.warn('rootKeys_pb:', JSON.stringify(state.rootKeys_pb));
      log.warn('rootKeys_injected:', JSON.stringify(state.rootKeys_injected));
      log.warn('rootKeys_global:', JSON.stringify(state.rootKeys_global));
      log.warn('=== Proto Debug End ===');
    }
    return [];
  }
  try {
    const FaceFrameDataListDecoded = FaceFrameDataList.decode(decompressed, undefined, () => {});
    const faceFrameList = FaceFrameDataListDecoded.toJSON?.() || { data: [] };
    const data = faceFrameList.data || [];
    if (data.length === 0 && decompressed.length > 0) {
      log.warn('face_data protobuf decoded but data array empty', { decompressedLen: decompressed.length });
    }
    return data.map((frame: any) => {
      const decodedBsw = frame.bsw ? scaledInt16BytesToFloat32(frame.bsw) : [];
      const joints = (frame.js || []).map((joint: any) => ({
        translate: joint.translate || [],
        rotate: joint.rotate ? scaledInt16BytesToFloat32(joint.rotate) : [],
      }));
      const meshes = (frame.ms || []).map((mesh: any) => ({
        index: mesh.index || 0,
        weights: mesh.weights || [],
      }));
      return {
        ...frame,
        bsw: decodedBsw,
        js: joints,
        ms: meshes,
        body_id: frame.bodyId ?? frame.body_id ?? 0,
        face_frame_type: frame.faceFrameType ?? frame.face_frame_type ?? 0,
      };
    });
  } catch (e) {
    log.warn('face_data protobuf.decode failed:', String(e));
    return [];
  }
}

/**
 * 初始化 proto（必须在解码 protobuf 前调用）
 * 由 index 在启动时按序 import
 */
export function initFaceProto(): void {
  getFaceFrameDataList();
}
