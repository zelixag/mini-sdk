/**
 * 服务端 floats_to_scaled_int16_bytes 反向函数：Base64 → float32 数组
 * 核心逻辑：Base64→int16字节流→int16数值（兼容round+clip）→÷0x7FFF→float32
 * @param base64Str 服务端返回的 Base64 编码字符串
 * @returns float32 精度的浮点数数组（与服务端原始 floats 一致）
 */
export function scaledInt16BytesToFloat32(base64Str: any): number[];
/**
 * 可选：带平滑滤波的版本（解决“脸色闪”问题，优化视觉效果）
 * @param base64Str 服务端 Base64 字符串
 * @param lastData 上一帧数据（用于平滑）
 * @param alpha 平滑系数（0~1，默认0.2，越大响应越快，越小越平滑）
 * @returns 平滑后的 float32 数组
 */
export function scaledInt16BytesToSmoothFloat32(base64Str: any, lastData?: any[], alpha?: number): number[];
/**
 * 解析后端传输的 float32 字节流为普通数组
 * @param {string|ArrayBuffer|Uint8Array} bytes - 后端传来的二进制数据（注意格式兼容）
 * @returns {number[]} 解析后的浮点数组（空数据返回空数组）
 */
/**
 * 从 Uint8Array 解析出 float32 数组（核心修复版）
 * @param {Uint8Array} uint8Arr - 后端传来的 Uint8Array 原始字节
 * @returns {number[]} 解析后的浮点数组
 */
export function parseUint8ToFloat32(uint8Arr: Uint8Array): number[];
