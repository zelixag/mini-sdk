/**
 * Base64 字符串 → Uint8Array 字节流（工具函数，处理 2 字节对齐）
 * @param base64Str 服务端返回的 Base64 编码字符串（int16 字节流 Base64 后）
 * @returns Uint8Array 字节流（2 字节/元素，对应 int16）
 */
function base64ToUint8Array(base64Str) {
  if (!base64Str || base64Str.trim() === '') {
    return new Uint8Array(0);
  }

  const binaryStr = atob(base64Str);
  const uint8Array = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    uint8Array[i] = binaryStr.charCodeAt(i);
  }
  return uint8Array;
}

/**
 * 2 字节小端序 → int16 数值（兼容服务端 np.clip 范围：-32767~32767）
 * @param byte0 小端序低位字节
 * @param byte1 小端序高位字节
 * @returns 有符号 int16 数值（严格限制在 -32767~32767，与服务端一致）
 */
function twoByteToInt16(byte0, byte1) {
  // 小端序合并为无符号 16 位整数
  const uint16 = (byte0 << 0) | (byte1 << 8);
  // 无符号 → 有符号 int16（自动处理负数）
  let int16Value = uint16 > 32767 ? uint16 - 65536 : uint16;
  // 兼容服务端 np.clip：强制限制范围（防止异常数据超出）
  return Math.max(-32767, Math.min(32767, int16Value));
}

/**
 * 服务端 floats_to_scaled_int16_bytes 反向函数：Base64 → float32 数组
 * 核心逻辑：Base64→int16字节流→int16数值（兼容round+clip）→÷0x7FFF→float32
 * @param base64Str 服务端返回的 Base64 编码字符串
 * @returns float32 精度的浮点数数组（与服务端原始 floats 一致）
 */
export function scaledInt16BytesToFloat32(base64Str) {
  // 步骤1：Base64 → Uint8Array 字节流
  const uint8Array = base64ToUint8Array(base64Str);

  // 校验：int16 占 2 字节，必须 2 字节对齐
  if (uint8Array.length === 0 || uint8Array.length % 2 !== 0) {
    return [];
  }

  const SCALE_FACTOR = 0x7FFF; // 与服务端一致：32767
  const length = uint8Array.length / 2; // 计算 int16 元素个数

  // 批量处理：用 Float32Array 确保 float32 精度（与服务端输入对齐）
  const buffer = new ArrayBuffer(4 * length);
  const float32View = new Float32Array(buffer);

  // 步骤2：遍历解析+反量化
  for (let i = 0; i < length; i++) {
    const byteIndex = i * 2;
    const byte0 = uint8Array[byteIndex];     // 小端序低位字节
    const byte1 = uint8Array[byteIndex + 1]; // 小端序高位字节

    // 步骤2.1：解析 int16（兼容服务端 round+clip）
    const int16Value = twoByteToInt16(byte0, byte1);

    // 步骤2.2：反量化（除以缩放因子，还原原始浮点数）
    const floatValue = int16Value / SCALE_FACTOR;

    // 步骤2.3：强制 float32 精度（消除 JS float64 多余精度）
    float32View[i] = floatValue;
  }

  // 转为普通数组返回（方便业务使用）
  return Array.from(float32View);
}

/**
 * 可选：带平滑滤波的版本（解决“脸色闪”问题，优化视觉效果）
 * @param base64Str 服务端 Base64 字符串
 * @param lastData 上一帧数据（用于平滑）
 * @param alpha 平滑系数（0~1，默认0.2，越大响应越快，越小越平滑）
 * @returns 平滑后的 float32 数组
 */
export function scaledInt16BytesToSmoothFloat32(base64Str, lastData = [], alpha = 0.2) {
  const rawData = scaledInt16BytesToFloat32(base64Str);
  // 首次无历史数据，直接返回原始数据
  if (lastData.length !== rawData.length) return rawData;

  // 一阶低通滤波：current = alpha*raw + (1-alpha)*last
  return rawData.map((val, idx) => {
    return alpha * val + (1 - alpha) * lastData[idx];
  });
}


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
export function parseUint8ToFloat32(uint8Arr) {
 // 空值处理
  if (!uint8Arr || uint8Arr.length === 0) {
    return [];
  }


  // 步骤1：校验总字节数是否为 4 的倍数（float32 每个元素占 4 字节）
  if (uint8Arr.length % 4 !== 0) {
    window.avatarSDKLogger.error('Uint8Array长度不是4的倍数，无法解析为float32数组');
    return [];
  }

  // 步骤2：创建新的 ArrayBuffer 并拷贝字节（强制偏移量为 0）
  // 核心：不管原偏移量是多少，拷贝后新数组偏移量=0，必然满足 4 的倍数
  const alignedBuffer = new ArrayBuffer(uint8Arr.length);
  const alignedUint8 = new Uint8Array(alignedBuffer);
  alignedUint8.set(uint8Arr); // 把原始字节拷贝到新数组

  // 步骤3：基于对齐的 ArrayBuffer 创建 Float32Array
  const float32Arr = new Float32Array(alignedBuffer);

  // 步骤4：转普通数组返回
  const result = Array.from(float32Arr);
  return result;
}