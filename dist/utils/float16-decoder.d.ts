/**
 * 前端解码服务端的 float16 字节流（核心函数）
 * @param bytes 服务端返回的字节流（Uint8Array 或 protobuf 解码后的 bytes 字段）
 * @returns JS 普通数字数组（number[]），每个元素对应解码后的 float16 数值
 */
export function decodeBase64ToFp16(base64Str: any): number[];
