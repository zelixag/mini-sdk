/**
 * Math Utils for Mini Program SDK
 * 数学工具函数
 */

/**
 * 矩阵乘法
 */
export function mmul(a: number[], b: number[]): number[] {
  const rows = a.length;
  const cols = b[0]?.length || 1;
  const result = new Array(rows * cols).fill(0);

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      for (let k = 0; k < cols; k++) {
        result[i * cols + j] += a[i * cols + k] * b[k * cols + j];
      }
    }
  }
  return result;
}

/**
 * 矩阵转置
 */
export function transpose(m: number[]): number[] {
  const rows = m.length;
  const cols = m[0]?.length || 1;
  const result = new Array(rows * cols);

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j * rows + i] = m[i * cols + j];
    }
  }
  return result;
}

/**
 * 展平多维数组
 */
export function flatten(arr: any[]): number[] {
  const result: number[] = [];
  for (const item of arr) {
    if (Array.isArray(item)) {
      result.push(...flatten(item));
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * 4x4 矩阵乘法
 */
export function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(16);

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[i * 4 + k] * b[k * 4 + j];
      }
      result[i * 4 + j] = sum;
    }
  }

  return result;
}

/**
 * 创建单位矩阵
 */
export function createIdentityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

/**
 * 创建透视投影矩阵
 */
export function createPerspectiveMatrix(
  fov: number,
  aspect: number,
  near: number,
  far: number
): Float32Array {
  const f = 1.0 / Math.tan(fov / 2);
  const nf = 1 / (near - far);

  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

/**
 * 创建正交投影矩阵
 */
export function createOrthographicMatrix(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number
): Float32Array {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);

  return new Float32Array([
    -2 * lr, 0, 0, 0,
    0, -2 * bt, 0, 0,
    0, 0, 2 * nf, 0,
    (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1
  ]);
}

/**
 * 3D 旋转矩阵 (绕 X 轴)
 */
export function rotateX(angle: number): Float32Array {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1
  ]);
}

/**
 * 3D 旋转矩阵 (绕 Y 轴)
 */
export function rotateY(angle: number): Float32Array {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ]);
}

/**
 * 3D 旋转矩阵 (绕 Z 轴)
 */
export function rotateZ(angle: number): Float32Array {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return new Float32Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

/**
 * 平移矩阵
 */
export function translate(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ]);
}

/**
 * 缩放矩阵
 */
export function scale(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1
  ]);
}

/**
 * 线性插值
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 角度转弧度
 */
export function degToRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

/**
 * 弧度转角度
 */
export function radToDeg(radians: number): number {
  return radians * 180 / Math.PI;
}

/**
 * 限制数值范围
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 平滑过渡
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export default {
  mmul,
  transpose,
  flatten,
  mat4Multiply,
  createIdentityMatrix,
  createPerspectiveMatrix,
  createOrthographicMatrix,
  rotateX,
  rotateY,
  rotateZ,
  translate,
  scale,
  lerp,
  degToRad,
  radToDeg,
  clamp,
  smoothstep
};
