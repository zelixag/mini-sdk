/**
 * 将 protobuf 挂载到 global，必须在 face_data_pb 之前执行（import 顺序保证）
 * 使用 getter 避免小程序里 global 引用不一致时拿不到 pb
 */
import * as protobufNs from '../../src/proto/protobuf.min.js';
const pb: any = (protobufNs as any)?.default ?? protobufNs;

// 确保 pb 有 roots.default（face_data_pb IIFE 需要它）
if (pb && !pb.roots) {
  pb.roots = { default: {} };
} else if (pb && pb.roots && !pb.roots.default) {
  pb.roots.default = {};
}

const setOn = (g: any) => {
  if (!g) return;
  g.protobuf = pb;
  g.__PROTOBUF_INJECT__ = pb;
  g.__getFaceDataPbProtobuf = () => pb;
};
setOn(typeof globalThis !== 'undefined' ? globalThis : undefined);
setOn(typeof global !== 'undefined' ? (global as any) : undefined);
setOn(typeof window !== 'undefined' ? (window as any) : undefined);
setOn(typeof self !== 'undefined' ? self : undefined);

// ===== 直接执行 face_data_pb 避免被 treeshake =====
// @INJECT_FACE_DATA_PB_PLACEHOLDER@
export function executeFaceDataPb(): void {
  // 这个函数体会在构建时被替换为 face_data_pb.js 的执行逻辑
}

export { pb };
