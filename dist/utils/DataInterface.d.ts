import * as GLMath from "./Math";
export interface DataViewWithCustomOffset {
    offset: number;
    dataview: DataView;
}
declare const TensorDataTypeMap: {
    B: Uint8ArrayConstructor;
    b: Int8ArrayConstructor;
    H: Uint16ArrayConstructor;
    h: Int16ArrayConstructor;
    I: Uint32ArrayConstructor;
    i: Int32ArrayConstructor;
    L: BigUint64ArrayConstructor;
    l: BigInt64ArrayConstructor;
    f: Float32ArrayConstructor;
    d: Float64ArrayConstructor;
};
type ValueOf<T> = T[keyof T];
export type TensorDataConstructorType = ValueOf<typeof TensorDataTypeMap>;
export type TensorDataType = InstanceType<TensorDataConstructorType>;
export declare class Tensor {
    size: number[];
    data: TensorDataType;
    constructor(size: number[], data: TensorDataType);
    itemSize(): number;
    byteSize(): number;
    static zeros(size: number[], dataType?: TensorDataConstructorType): Tensor;
    part(...index: number[]): Tensor;
    static deserialize(buffer: ArrayBuffer | DataViewWithCustomOffset): Tensor;
}
export declare class CameraConfig {
    focalLength: number;
    filmAperture: [number, number];
    translation: GLMath.vec3;
    rotation: GLMath.vec3;
    getIntrinsicMatrix(resolution: [number, number]): GLMath.mat3;
    getProjMatrix(resolution: [number, number], near?: number, far?: number): GLMath.mat4;
    getExtrinsicMatrix(): GLMath.mat4;
    static deserialize(buffer: ArrayBuffer | DataViewWithCustomOffset): CameraConfig;
}
export declare class RigidTransform {
    translation: GLMath.vec3;
    rotQuaternion: GLMath.vec4;
    constructor(translation?: GLMath.vec3, rotQuaternion?: GLMath.vec4);
    apply(x: GLMath.vec3 | RigidTransform): GLMath.vec3 | RigidTransform;
    inv(): RigidTransform;
    matrix(): GLMath.mat3;
    homogeneous_matrix(): GLMath.mat4;
    static deserialize(buffer: ArrayBuffer | DataViewWithCustomOffset): RigidTransform;
}
export interface JointInfo {
    parent: number | null;
    local_transform: RigidTransform;
}
export interface IBRMeshInfoSpec {
    version: [number, number, number];
    maxJointsPerVertex: number;
    blendshapeIndices?: number[];
    archivedItems?: unknown[];
}
export declare class IBRMeshInfo {
    genMask: boolean;
    opacity?: Tensor;
    triangles: Tensor;
    UVCoord: Tensor;
    blendshapeIndices: number[];
    blendshapes: Tensor;
    jointIndex: Uint8Array;
    jointWeight: Float32Array;
    textureModels: {
        data: Tensor;
        scalingFactor?: Tensor;
    }[];
    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset, spec: IBRMeshInfoSpec);
}
export declare class IBRMeshFrameInfo {
    textureModelIndex: number;
    texturePCAWeights: Float32Array;
    constructor(textureModelIndex: number, texturePCAWeights: Float32Array);
    static deserialize(buffer: ArrayBuffer | DataViewWithCustomOffset, char_data: IBRMeshInfo): IBRMeshFrameInfo;
}
export declare class IBRAnimationGeneratorCharInfo_NN {
    cameraConfig: CameraConfig;
    blendshapeCount: number;
    mesh: IBRMeshInfo[];
    skeleton: JointInfo[];
    jointEvalOrder: number[];
    movableJoints: number[];
    maxJointsPerVertex: number;
    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset, spec?: {
        blendshapeMap?: number[][];
    });
    evalSkeleton(): RigidTransform[];
    evalSkeletonFromMovable(movableJointTransforms: RigidTransform[]): RigidTransform[];
}
export declare class IBRAnimationFrameData_NN {
    mesh: IBRMeshFrameInfo[];
    blendshapeWeights: Float32Array;
    movableJointTransforms: RigidTransform[];
    constructor();
    static deserialize(buffer: ArrayBuffer | DataViewWithCustomOffset, char_data: IBRAnimationGeneratorCharInfo_NN, version: [number, number, number]): IBRAnimationFrameData_NN;
    static interp(frame1: IBRAnimationFrameData_NN, frame2: IBRAnimationFrameData_NN, frameJointRef: IBRAnimationFrameData_NN, t: number, jointEvalOrder: [number, number][]): IBRAnimationFrameData_NN;
}
export declare function unpackIBRAnimation(buffer: ArrayBuffer | DataViewWithCustomOffset, char_data: IBRAnimationGeneratorCharInfo_NN): IBRAnimationFrameData_NN[];
export declare class TextureFloat_3D {
    size: [number, number, number, number];
    data: Float32Array;
    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset);
}
export declare function transformMJT(mjt: number[][]): RigidTransform[];
export declare function formatMJT(a1: number[], a2: number[]): RigidTransform;
export {};
