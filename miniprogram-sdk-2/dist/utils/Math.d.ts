/**
 * Math Utils for Mini Program SDK
 * 数学工具函数
 */
/**
 * 矩阵乘法
 */
export declare function mmul(a: number[], b: number[]): number[];
/**
 * 矩阵转置
 */
export declare function transpose(m: number[]): number[];
/**
 * 展平多维数组
 */
export declare function flatten(arr: any[]): number[];
/**
 * 4x4 矩阵乘法
 */
export declare function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array;
/**
 * 创建单位矩阵
 */
export declare function createIdentityMatrix(): Float32Array;
/**
 * 创建透视投影矩阵
 */
export declare function createPerspectiveMatrix(fov: number, aspect: number, near: number, far: number): Float32Array;
/**
 * 创建正交投影矩阵
 */
export declare function createOrthographicMatrix(left: number, right: number, bottom: number, top: number, near: number, far: number): Float32Array;
/**
 * 3D 旋转矩阵 (绕 X 轴)
 */
export declare function rotateX(angle: number): Float32Array;
/**
 * 3D 旋转矩阵 (绕 Y 轴)
 */
export declare function rotateY(angle: number): Float32Array;
/**
 * 3D 旋转矩阵 (绕 Z 轴)
 */
export declare function rotateZ(angle: number): Float32Array;
/**
 * 平移矩阵
 */
export declare function translate(x: number, y: number, z: number): Float32Array;
/**
 * 缩放矩阵
 */
export declare function scale(x: number, y: number, z: number): Float32Array;
/**
 * 线性插值
 */
export declare function lerp(a: number, b: number, t: number): number;
/**
 * 角度转弧度
 */
export declare function degToRad(degrees: number): number;
/**
 * 弧度转角度
 */
export declare function radToDeg(radians: number): number;
/**
 * 限制数值范围
 */
export declare function clamp(value: number, min: number, max: number): number;
/**
 * 平滑过渡
 */
export declare function smoothstep(edge0: number, edge1: number, x: number): number;
declare const _default: {
    mmul: typeof mmul;
    transpose: typeof transpose;
    flatten: typeof flatten;
    mat4Multiply: typeof mat4Multiply;
    createIdentityMatrix: typeof createIdentityMatrix;
    createPerspectiveMatrix: typeof createPerspectiveMatrix;
    createOrthographicMatrix: typeof createOrthographicMatrix;
    rotateX: typeof rotateX;
    rotateY: typeof rotateY;
    rotateZ: typeof rotateZ;
    translate: typeof translate;
    scale: typeof scale;
    lerp: typeof lerp;
    degToRad: typeof degToRad;
    radToDeg: typeof radToDeg;
    clamp: typeof clamp;
    smoothstep: typeof smoothstep;
};
export default _default;
