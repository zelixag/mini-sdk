import * as GLMath from "./Math";
export interface DataViewWithCustomOffset {
    offset: number;
    dataview: DataView;
}
export type TensorDataConstructorType = Uint8ArrayConstructor
    | Int8ArrayConstructor
    | Uint16ArrayConstructor
    | Int16ArrayConstructor
    | Uint32ArrayConstructor
    | Int32ArrayConstructor
    | BigUint64ArrayConstructor
    | BigInt64ArrayConstructor
    | Float16ArrayConstructor
    | Float32ArrayConstructor
    | Float64ArrayConstructor;
export type TensorDataType = InstanceType<TensorDataConstructorType>;
export declare class Tensor {
    public size: number[];
    public data: TensorDataType;
    constructor(size: number[], data: TensorDataType);
    itemSize(): number;
    byteSize(): number;

    static zeros(size: number[], dataType: TensorDataConstructorType): Tensor;
    part(...index: number[]): Tensor;
    static deserialize(buffer: ArrayBuffer | DataViewWithCustomOffset): void;
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
export declare class PCAData_3D {
    size: [number, number, number];
    components: Float32Array;
    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset);
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
        data: Tensor,
        scalingFactor?: Tensor
    }[];
    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset, maxJointsPerVertex: number, archivedItems: unknown[]);
}
export declare class IBRMeshFrameInfo {
    textureModelIndex: number;
    texturePCAWeights: Float32Array;
    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset, char_data: IBRMeshInfo);
}
export declare class IBRAnimationGeneratorCharInfo_NN {
    cameraConfig: CameraConfig;
    blendshapeCount: number;
    mesh: IBRMeshInfo[];
    skeleton: JointInfo[];
    jointEvalOrder: number[];
    movableJoints: number[];
    maxJointsPerVertex: number;
    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset);
    evalSkeleton(): RigidTransform[];
    evalSkeletonFromMovable(movableJointTransforms: RigidTransform[]): RigidTransform[];
}
export declare class IBRAnimationGeneratorStaticInfo {
    headVertexCount: number;
    headOpacityMask: Float32Array;
    headTriangles: Uint16Array;
    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset);
}
export declare class IBRAnimationGeneratorStaticInfo_NN extends IBRAnimationGeneratorStaticInfo {
    headUVCoord: Float32Array;
    teethVertexCount: number;
    teethOpacityMask: Float32Array;
    teethTriangles: Uint16Array;
    teethUVCoord: Float32Array;
    skeletonJointCount: number;
    movableJoints: number[];
    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset);
}
export declare class IBRAnimationFrameData_NN {
    mesh: IBRMeshFrameInfo[];
    blendshapeWeights: Float32Array;
    movableJointTransforms: RigidTransform[];
    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset, char_data: IBRAnimationGeneratorCharInfo_NN);
}
export declare class TextureFloat_3D {
    size: [number, number, number, number];
    data: Float32Array;
    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset);
}
export declare function unpackIBRAnimation(buffer: ArrayBuffer | DataViewWithCustomOffset, char_data: IBRAnimationGeneratorCharInfo_NN): IBRAnimationFrameData_NN[];