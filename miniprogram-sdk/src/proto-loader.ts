/**
 * Proto 加载器（与 Web SDK ttsa.ts 保持一致）
 *
 * Web SDK: import '../proto/protobuf.min'; import '../proto/face_data_pb'; const proxyProtobuf = protobuf.roots.default;
 * 使用 proto-init 先挂载 global，再直接执行 face_data_pb（import 会被 Rollup treeshake 清掉）
 */
import { pb, executeFaceDataPb } from './proto-init';

// 显式执行一次，确保 schema 注册（避免被 treeshake）
executeFaceDataPb();

export function getFaceFrameDataList(): any {
  const g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? (window as any) : null));
  const injected = g && ((g as any).__getFaceDataPbProtobuf ? (g as any).__getFaceDataPbProtobuf() : (g as any).__PROTOBUF_INJECT__);
  const pbMaybe = (pb as any)?.default ?? (pb as any);
  const injectedMaybe = (injected as any)?.default ?? (injected as any);
  const globalPbMaybe = g && ((g as any).protobuf?.default ?? (g as any).protobuf);
  const candidates = [pbMaybe, injectedMaybe, globalPbMaybe].filter(Boolean);
  for (const candidate of candidates) {
    const schema = candidate?.roots?.default?.FaceFrameDataList;
    if (schema) return schema;
  }
  return null;
}

export function getFaceProtoDebugState(): Record<string, any> {
  const g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? (window as any) : null));
  const injected = g && ((g as any).__getFaceDataPbProtobuf ? (g as any).__getFaceDataPbProtobuf() : (g as any).__PROTOBUF_INJECT__);
  const pbMaybe = (pb as any)?.default ?? (pb as any);
  const injectedMaybe = (injected as any)?.default ?? (injected as any);
  const globalPbMaybe = g && ((g as any).protobuf?.default ?? (g as any).protobuf);

  const rootKeys = (obj: any): string[] => {
    try {
      return Object.keys(obj?.roots?.default || {}).slice(0, 30);
    } catch {
      return [];
    }
  };

  return {
    hasGlobalThis: !!g,
    hasGetter: !!(g && (g as any).__getFaceDataPbProtobuf),
    hasInject: !!(g && (g as any).__PROTOBUF_INJECT__),
    hasGlobalPb: !!(g && (g as any).protobuf),
    same_pb_global: !!pbMaybe && !!globalPbMaybe && pbMaybe === globalPbMaybe,
    same_pb_injected: !!pbMaybe && !!injectedMaybe && pbMaybe === injectedMaybe,
    same_global_injected: !!globalPbMaybe && !!injectedMaybe && globalPbMaybe === injectedMaybe,
    hasFaceList_pb: !!pbMaybe?.roots?.default?.FaceFrameDataList,
    hasFaceList_injected: !!injectedMaybe?.roots?.default?.FaceFrameDataList,
    hasFaceList_global: !!globalPbMaybe?.roots?.default?.FaceFrameDataList,
    rootKeys_pb: rootKeys(pbMaybe),
    rootKeys_injected: rootKeys(injectedMaybe),
    rootKeys_global: rootKeys(globalPbMaybe),
  };
}
