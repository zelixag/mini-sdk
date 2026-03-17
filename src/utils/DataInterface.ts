// @ts-nocheck
import * as GLMath from "./Math"

const __version__ = "3.0.0"

export interface DataViewWithCustomOffset {
    offset: number,
    dataview: DataView // DataView is a generic type after TypeScript 5.7. We do not derive from it for the sake of compatibility.
}

function checkVersion(buffer: ArrayBuffer | DataViewWithCustomOffset, version: string): [number, number, number] {
    if (buffer instanceof ArrayBuffer) buffer = { offset: 0, dataview: new DataView(buffer) } as DataViewWithCustomOffset;

    const dataver: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
        dataver[i] = buffer.dataview.getUint8(buffer.offset);
        buffer.offset += 1;
    }

    const refver = version.split(".").map(x => parseInt(x))
    if (refver[0] < dataver[0]) throw new Error(`Data version (${dataver[0]}.${dataver[1]}.${dataver[2]}) is incompatible with the version of current data interface (${refver[0]}.${refver[1]}.${refver[2]}).`)
    return dataver;
}

function decodeStr(buffer: ArrayBuffer | DataViewWithCustomOffset): string {
    if (buffer instanceof ArrayBuffer) buffer = { offset: 0, dataview: new DataView(buffer) } as DataViewWithCustomOffset;
    const charView = new Uint8Array(buffer.dataview.buffer, buffer.offset, buffer.dataview.byteLength - buffer.offset);
    let strlen = 0;
    while (strlen < charView.byteLength && charView[strlen] > 0) strlen++;
    buffer.offset += strlen + 1;
    const stringBytes = charView.slice(0, strlen);
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(stringBytes);
}

function decodeLongInt(buffer: ArrayBuffer | DataViewWithCustomOffset): number {
    if (buffer instanceof ArrayBuffer) buffer = { offset: 0, dataview: new DataView(buffer) } as DataViewWithCustomOffset;

    let result = 0, shift = 0;
    while (true) {
        let byte_val = buffer.dataview.getUint8(buffer.offset);
        buffer.offset++;
        let data_bits = byte_val & 0x7F;
        let new_result = result | (data_bits << shift);
        if (new_result < result) throw new Error("Integer too large to decode.");
        result = new_result;
        if (0 === (byte_val & 0x80)) break;
        shift += 7;
    }
    return result;
}

const TensorDataTypeMap = {
    "B": Uint8Array,
    "b": Int8Array,
    "H": Uint16Array,
    "h": Int16Array,
    "I": Uint32Array,
    "i": Int32Array,
    "L": BigUint64Array,
    "l": BigInt64Array,
    "f": Float32Array,
    "d": Float64Array
};
if ("undefined" !== typeof Float16Array) TensorDataTypeMap["e"] = Float16Array;

type ValueOf<T> = T[keyof T];
export type TensorDataConstructorType = ValueOf<typeof TensorDataTypeMap>;
export type TensorDataType = InstanceType<TensorDataConstructorType>;

export class Tensor {
    public size: number[];
    public data: TensorDataType;
    constructor(size: number[], data: TensorDataType) {
        this.size = size;
        this.data = data;
    }
    itemSize(): number {
        let size = 1;
        for (let dim of this.size) size *= dim;
        return size;
    }
    byteSize(): number { return this.itemSize() * this.data.BYTES_PER_ELEMENT; }

    static zeros(size: number[], dataType: TensorDataConstructorType = Float32Array): Tensor {
        let itemSize = 1;
        for (let i = 0; i < size.length; i++)itemSize *= size[i];
        const data = new dataType(itemSize);
        for (let i = 0; i < itemSize; i++)data[i] = 0;
        return new Tensor(size, data);
    }
    // extract subtensors
    part(...index: number[]): Tensor {
        if (index.length > this.size.length) throw new Error("Subtensor index length larger than tensor dimension.");
        let size: number[] = [];
        let newLength = 1;
        for (let i = index.length; i < this.size.length; i++) {
            size.push(this.size[i]);
            newLength *= this.size[i];
        }

        let newStart = 0;
        if (index.length > 0) newStart += index[0];
        for (let i = 1; i < index.length; i++) {
            newStart *= this.size[i];
            newStart += index[i];
        }
        newStart *= newLength;
        return new Tensor(size, this.data.slice(newStart, newStart + newLength));
    }

    static deserialize(buffer: ArrayBuffer | DataViewWithCustomOffset) {
        if (buffer instanceof ArrayBuffer) buffer = { offset: 0, dataview: new DataView(buffer) } as DataViewWithCustomOffset;

        const dimCount = buffer.dataview.getUint8(buffer.offset);
        buffer.offset++;
        const size = new Array<number>(dimCount);
        let dataSize = 1;
        for (let i = 0; i < dimCount; i++) {
            size[i] = decodeLongInt(buffer);
            dataSize *= size[i];
        }
        const dataTypeSymbol = String.fromCodePoint(buffer.dataview.getUint8(buffer.offset)) as keyof typeof TensorDataTypeMap;
        buffer.offset++;
        const dataType = TensorDataTypeMap[dataTypeSymbol];
        if (undefined === dataType) throw new Error(`Unsupported tensor element type "${dataTypeSymbol}".`);
        const dataByteSize = dataSize * dataType.BYTES_PER_ELEMENT;
        const dataView = buffer.dataview.buffer.slice(buffer.offset, buffer.offset + dataByteSize);
        const data = new dataType(dataView as ArrayBuffer);
        buffer.offset += dataByteSize;

        return new Tensor(size, data);
    }
}

function loadArchives(buffer: ArrayBuffer | DataViewWithCustomOffset): unknown[] {
    if (buffer instanceof ArrayBuffer) buffer = { offset: 0, dataview: new DataView(buffer) } as DataViewWithCustomOffset;

    let result: unknown[] = [null];
    while (true) {
        const mimeType = decodeStr(buffer);
        if ('' == mimeType) break;
        else {
            let item: unknown = null;
            if ("text/plain;charset=UTF-8" === mimeType) {
                const dataLen = decodeLongInt(buffer);
                const charView = new Uint8Array(buffer.dataview.buffer, buffer.offset, dataLen);
                buffer.offset += dataLen;
                const decoder = new TextDecoder('utf-8');
                item = decoder.decode(charView);
            }
            else if ("application/json;charset=UTF-8" == mimeType) {
                const dataLen = decodeLongInt(buffer);
                const charView = new Uint8Array(buffer.dataview.buffer, buffer.offset, dataLen);
                buffer.offset += dataLen;
                const decoder = new TextDecoder('utf-8');
                item = JSON.parse(decoder.decode(charView));
            }
            else if ("application/octet-stream" === mimeType) item = Tensor.deserialize(buffer);
            else {
                const dataLen = decodeLongInt(buffer);
                const dataSlice = buffer.dataview.buffer.slice(buffer.offset, buffer.offset + dataLen);
                buffer.offset += dataLen;
                item = new Blob([dataSlice as ArrayBuffer], { type: mimeType });
            }
            result.push(item);
        }
    }
    return result;
}

export class CameraConfig {
    focalLength: number = 75.0;
    filmAperture: [number, number] = [1.0, 1.0]; // horizontal, vertical
    translation: GLMath.vec3 = [0.0, 0.0, 0.0]; // X, Y, Z
    rotation: GLMath.vec3 = [0.0, 0.0, 0.0]; // X, Y, Z

    // methods
    getIntrinsicMatrix(resolution: [number, number]): GLMath.mat3 {
        const [size_X, size_Y] = resolution;

        // 摄影机光圈是指多少英寸，25.4mm，胶片大小
        let camera_aperture_in_mm_x = this.filmAperture[0] * 25.4
        // 纵向的根据横向的来计算，而不是直接读取，可能和渲染分辨率、镜头挤压比有关系
        // 在maya里面修改纵向光圈值完全没反应的，是根据渲染分辨率和横向光圈值来计算的
        // 胶片纵横比理论上需要等于渲染分辨率的纵横比
        // camera_aperture_in_mm_ = this.filmAperture[1] * 25.4
        let camera_aperture_in_mm_y = camera_aperture_in_mm_x * resolution[1] / resolution[0];

        // convert from maya camera to OpenCV camera
        let px = resolution[0] / 2.0;
        let py = resolution[1] / 2.0;
        // 胶片尺寸/像素，代表1个像素多少mm，然后可以得到内参矩阵
        let fx = this.focalLength / (camera_aperture_in_mm_x / size_X);
        let fy = this.focalLength / (camera_aperture_in_mm_y / size_Y);

        return [
            [fx, 0, px],
            [0, fy, py],
            [0, 0, 1]
        ];
    }
    getProjMatrix(resolution: [number, number], near: number = 0.01, far: number = Infinity): GLMath.mat4 {
        const [size_X, size_Y] = resolution;
        const intrinsic_mat = this.getIntrinsicMatrix(resolution);

        let proj22: number;
        let proj23: number;

        if (Infinity === far) {
            proj22 = -1.0;
            proj23 = -2.0 * near;
        }
        else {
            proj22 = -(far + near) / (far - near);
            proj23 = -(2.0 * far * near) / (far - near);
        }

        return [
            [2.0 * intrinsic_mat[0][0] / size_X, 0.0, (size_X - 2 * intrinsic_mat[0][2]) / size_X, 0.0],
            [0.0, 2.0 * intrinsic_mat[1][1] / size_Y, (size_Y - 2 * intrinsic_mat[1][2]) / size_Y, 0.0],
            [0.0, 0.0, proj22, proj23],
            [0.0, 0.0, -1.0, 0.0]
        ];
    }
    getExtrinsicMatrix(): GLMath.mat4 {
        // 相机的世界坐标轴
        const deg2rad = Math.PI / 180.0;
        const R = GLMath.Euler_to_mat(this.rotation.map(x => x * deg2rad) as GLMath.vec3, "xyz");
        // 反算物体的view matrix, 将相机坐标系转成世界坐标系, 相机朝向-z轴
        const R_inv = GLMath.inv3(R);
        const R_inv_neg_t = GLMath.mvmul(R_inv, this.translation.map(x => -x) as GLMath.vec3) as GLMath.vec3;
        return GLMath.make_homogeneous(R_inv, R_inv_neg_t);
    }
    static deserialize(buffer: ArrayBuffer | DataViewWithCustomOffset) {
        if (buffer instanceof ArrayBuffer) buffer = { offset: 0, dataview: new DataView(buffer) } as DataViewWithCustomOffset;

        let result = new CameraConfig();
        result.focalLength = buffer.dataview.getFloat32(buffer.offset, true);
        for (let i = 0; i < 2; i++)result.filmAperture[i] = buffer.dataview.getFloat32(buffer.offset + (i + 1) * 4, true);
        for (let i = 0; i < 3; i++)result.translation[i] = buffer.dataview.getFloat32(buffer.offset + (i + 3) * 4, true);
        for (let i = 0; i < 3; i++)result.rotation[i] = buffer.dataview.getFloat32(buffer.offset + (i + 6) * 4, true);
        buffer.offset += 9 * 4;

        return result;
    }
}

export class RigidTransform {
    translation: GLMath.vec3; // X, Y, Z
    rotQuaternion: GLMath.vec4; // 1, i, j, k

    // methods
    constructor(translation: GLMath.vec3 = [0.0, 0.0, 0.0], rotQuaternion: GLMath.vec4 = [1.0, 0.0, 0.0, 0.0]) {
        this.translation = translation;
        this.rotQuaternion = rotQuaternion;
    }
    apply(x: GLMath.vec3 | RigidTransform): GLMath.vec3 | RigidTransform {
        if (x instanceof RigidTransform) {
            let result_quaternion = GLMath.quaternion_mul(this.rotQuaternion, x.rotQuaternion);
            result_quaternion = GLMath.normalize(result_quaternion) as GLMath.vec4; // reduce floating point error
            let result_translation = GLMath.mvmul(GLMath.quaternion_to_mat(this.rotQuaternion), x.translation) as GLMath.vec3;
            for (let i = 0; i < 3; i++)result_translation[i] += this.translation[i];
            return new RigidTransform(result_translation, result_quaternion);
        }
        else {
            let result = GLMath.mvmul(this.matrix(), x) as GLMath.vec3;
            for (let i = 0; i < 3; i++)result[i] += this.translation[i];
            return result;
        }
    }
    inv() {
        let newRotQuaternion = GLMath.quaternion_conj(this.rotQuaternion);
        let R_inv_neg_x = GLMath.mvmul(GLMath.quaternion_to_mat(newRotQuaternion), this.translation.map(x => -x) as GLMath.vec3) as GLMath.vec3;
        return new RigidTransform(R_inv_neg_x, newRotQuaternion);
    }
    matrix() { return GLMath.quaternion_to_mat(this.rotQuaternion); }
    homogeneous_matrix(): GLMath.mat4 { return GLMath.make_homogeneous(this.matrix(), this.translation); }
    static deserialize(buffer: ArrayBuffer | DataViewWithCustomOffset) {
        if (buffer instanceof ArrayBuffer) buffer = { offset: 0, dataview: new DataView(buffer) } as DataViewWithCustomOffset;

        let translation: GLMath.vec3 = [0.0, 0.0, 0.0];
        let rotQuaternion: GLMath.vec4 = [1.0, 0.0, 0.0, 0.0];
        for (let i = 0; i < 3; i++)translation[i] = buffer.dataview.getFloat32(buffer.offset + i * 4, true);
        let sum_sqr = 0.0;
        for (let i = 0; i < 3; i++) {
            rotQuaternion[i + 1] = buffer.dataview.getFloat32(buffer.offset + (i + 3) * 4, true);
            sum_sqr += rotQuaternion[i + 1] * rotQuaternion[i + 1];
        }
        rotQuaternion[0] = Math.sqrt(Math.max(1.0 - sum_sqr, 0.0));
        buffer.offset += 6 * 4;

        return new RigidTransform(translation, rotQuaternion);
    }
}

export interface JointInfo {
    parent: number | null,
    local_transform: RigidTransform
}

export interface IBRMeshInfoSpec {
    version: [number, number, number],
    maxJointsPerVertex: number,
    blendshapeIndices?: number[], // for v2.0 only
    archivedItems?: unknown[]
}

export class IBRMeshInfo {
    genMask: boolean;
    opacity?: Tensor;
    triangles: Tensor;
    UVCoord: Tensor;
    blendshapeIndices: number[];
    blendshapes: Tensor; // Dim 0 is the number of blendshapes, blendshape #0 is neutral
    jointIndex: Uint8Array; // vertexCount * skeletonJointCount
    jointWeight: Float32Array; // vertexCount * skeletonJointCount
    textureModels: {
        data: Tensor,
        scalingFactor?: Tensor
    }[];

    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset, spec: IBRMeshInfoSpec) {
        if (buffer instanceof ArrayBuffer) buffer = { offset: 0, dataview: new DataView(buffer) } as DataViewWithCustomOffset;

        if (spec.version[0] > 2) {
            // v3.0
            let meshFlag = buffer.dataview.getUint8(buffer.offset);
            buffer.offset += 1;
            this.genMask = (meshFlag & 1) > 0;

            let bs_indices: number[] = [];
            let bs_element_indices: number[][] = [];
            while (true) {
                let bs_index = decodeLongInt(buffer);
                if (0 === bs_index && bs_indices.length > 0) break;
                else bs_indices.push(bs_index);

                let cur_bs_element_indices: number[] = [];
                let segment_stat = true, segment_ptr = 0;
                while (true) {
                    let segment_len = decodeLongInt(buffer);
                    if (segment_stat) {
                        for (let i = 0; i < segment_len; i++)cur_bs_element_indices.push(segment_ptr + i);
                    }
                    segment_stat = !segment_stat;
                    segment_ptr += segment_len;
                    if (0 === segment_len && segment_ptr > 0) break;
                }
                bs_element_indices.push(cur_bs_element_indices);
            }

            let vertexCount = bs_element_indices[0].length;

            this.blendshapeIndices = bs_indices;
            let rawBlendshapeData: Tensor = spec.archivedItems![decodeLongInt(buffer)] as Tensor;
            let blendshapes = Tensor.zeros([this.blendshapeIndices.length, vertexCount, rawBlendshapeData.size[1]], rawBlendshapeData.data.constructor as TensorDataConstructorType);
            let bs_data_index = 0;
            for (let bs_index = 0; bs_index < bs_element_indices.length; bs_index++) {
                const elementIndexList = bs_element_indices[bs_index];
                for (let element_index of elementIndexList) {
                    for (let i = 0; i < 3; i++)blendshapes.data[(bs_index * vertexCount + element_index) * 3 + i] = rawBlendshapeData.data[bs_data_index * 3 + i];
                    bs_data_index++;
                }
            }
            this.blendshapes = blendshapes;
            this.triangles = spec.archivedItems![decodeLongInt(buffer)] as Tensor;
            this.opacity = spec.archivedItems![decodeLongInt(buffer)] as Tensor;
            this.UVCoord = spec.archivedItems![decodeLongInt(buffer)] as Tensor;

            this.jointIndex = new Uint8Array(vertexCount * spec.maxJointsPerVertex);
            this.jointWeight = new Float32Array(vertexCount * spec.maxJointsPerVertex);
            for (let i = 0; i < vertexCount; i++) {
                for (let j = 0; j < spec.maxJointsPerVertex; j++) {
                    this.jointIndex[i * spec.maxJointsPerVertex + j] = buffer.dataview.getUint8(buffer.offset);
                    buffer.offset += 1;
                }
                for (let j = 0; j < spec.maxJointsPerVertex; j++) {
                    this.jointWeight[i * spec.maxJointsPerVertex + j] = buffer.dataview.getFloat32(buffer.offset, true);
                    buffer.offset += 4;
                }
            }

            const textureModelCount = buffer.dataview.getUint8(buffer.offset);
            buffer.offset += 1;
            this.textureModels = new Array(textureModelCount);
            for (let i = 0; i < textureModelCount; i++) {
                this.textureModels[i] = {
                    data: spec.archivedItems![decodeLongInt(buffer)] as Tensor,
                    scalingFactor: spec.archivedItems![decodeLongInt(buffer)] as Tensor
                };
            }
        }
        else {
            // v2.0
            this.genMask = true;

            let vertexCount = buffer.dataview.getUint16(buffer.offset, true);
            buffer.offset += 2;

            const opacity = new Float32Array(vertexCount);
            for (let i = 0; i < vertexCount; i++) {
                opacity[i] = buffer.dataview.getFloat32(buffer.offset, true);
                buffer.offset += 4;
            }
            this.opacity = new Tensor([vertexCount], opacity);

            let triangleCount = buffer.dataview.getUint16(buffer.offset, true);
            buffer.offset += 2;

            const triangles = new Uint16Array(triangleCount * 3);
            for (let i = 0; i < triangleCount; i++) {
                for (let j = 0; j < 3; j++) {
                    triangles[i * 3 + j] = buffer.dataview.getUint16(buffer.offset, true);
                    buffer.offset += 2;
                }
            }
            this.triangles = new Tensor([triangleCount, 3], triangles);

            const UVCoord = new Float32Array(vertexCount * 2);
            for (let i = 0; i < vertexCount; i++) {
                for (let j = 0; j < 2; j++) {
                    UVCoord[i * 2 + j] = buffer.dataview.getFloat32(buffer.offset, true);
                    buffer.offset += 4;
                }
            }
            this.UVCoord = new Tensor([vertexCount, 2], UVCoord);

            const blendshapeCount = buffer.dataview.getUint16(buffer.offset, true);
            buffer.offset += 2;
            const blendshapes = new Float32Array(blendshapeCount * vertexCount * 3);
            for (let i = 0; i < blendshapeCount * vertexCount * 3; i++) {
                blendshapes[i] = buffer.dataview.getFloat32(buffer.offset, true);
                buffer.offset += 4;
            }
            this.blendshapes = new Tensor([blendshapeCount, vertexCount, 3], blendshapes);
            this.blendshapeIndices = [0];
            for(let index of spec.blendshapeIndices!)this.blendshapeIndices.push(index + 1);

            this.jointIndex = new Uint8Array(vertexCount * spec.maxJointsPerVertex);
            this.jointWeight = new Float32Array(vertexCount * spec.maxJointsPerVertex);
            for (let i = 0; i < vertexCount; i++) {
                for (let j = 0; j < spec.maxJointsPerVertex; j++){
                    this.jointIndex[i * spec.maxJointsPerVertex + j] = buffer.dataview.getUint8(buffer.offset);
                    buffer.offset += 1;
                }
                for (let j = 0; j < spec.maxJointsPerVertex; j++){
                    this.jointWeight[i * spec.maxJointsPerVertex + j] = buffer.dataview.getFloat32(buffer.offset, true);
                    buffer.offset += 4;
                }
            }

            const textureModelCount = buffer.dataview.getUint8(buffer.offset);
            buffer.offset += 1;
            this.textureModels = new Array(textureModelCount);
            for (let i = 0; i < textureModelCount; i++){
                const PCASize = [0, 0, 0, 3];
                for (let j = 0; j < 3; j++) {
                    PCASize[j] = buffer.dataview.getUint16(buffer.offset, true);
                    buffer.offset += 2;
                }
                const PCAComponents = new Float32Array(PCASize[0] * PCASize[1] * PCASize[2] * 3);
                for (let j = 0; j < PCAComponents.length; j++) {
                    PCAComponents[j] = buffer.dataview.getFloat32(buffer.offset, true);
                    buffer.offset += 4;
                }
                this.textureModels[i] = { data: new Tensor(PCASize, PCAComponents) };
            }
        }
    }
}

export class IBRMeshFrameInfo {
    textureModelIndex: number;
    texturePCAWeights: Float32Array;

    constructor(textureModelIndex: number, texturePCAWeights: Float32Array) {
        this.textureModelIndex = textureModelIndex;
        this.texturePCAWeights = texturePCAWeights;
    }
    static deserialize(buffer: ArrayBuffer | DataViewWithCustomOffset, char_data: IBRMeshInfo) {
        if (buffer instanceof ArrayBuffer) buffer = { offset: 0, dataview: new DataView(buffer) } as DataViewWithCustomOffset;

        let textureModelIndex = buffer.dataview.getUint8(buffer.offset);
        buffer.offset += 1;
        let texturePCAWeights = new Float32Array(char_data.textureModels[textureModelIndex].data.size[0] - 1);
        for (let i = 0; i < texturePCAWeights.length; i++) {
            texturePCAWeights[i] = buffer.dataview.getFloat32(buffer.offset, true);
            buffer.offset += 4;
        }

        return new IBRMeshFrameInfo(textureModelIndex, texturePCAWeights);
    }
}

export class IBRAnimationGeneratorCharInfo_NN {
    cameraConfig: CameraConfig;
    blendshapeCount: number;
    mesh: IBRMeshInfo[];

    skeleton: JointInfo[];
    jointEvalOrder: number[];
    movableJoints: number[];
    maxJointsPerVertex: number;

    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset, spec: { blendshapeMap?: number[][] } = {}) {
        if (buffer instanceof ArrayBuffer) buffer = { offset: 0, dataview: new DataView(buffer) } as DataViewWithCustomOffset;
        const version = checkVersion(buffer, __version__);

        let archivedItems: unknown[] = [];
        if (version[0] > 2) archivedItems = loadArchives(buffer);

        this.cameraConfig = CameraConfig.deserialize(buffer);
        if (version[0] > 2) this.blendshapeCount = decodeLongInt(buffer);
        else {
            if (!spec.blendshapeMap) throw new Error(`A blendshape map is required to load the character information of v2.0 format.`);
            let bsIndexSet = new Set();
            for (const map of spec.blendshapeMap) {
                for (const index of map) bsIndexSet.add(index);
            }
            this.blendshapeCount = bsIndexSet.size;
        }

        let skeletonJointCount = buffer.dataview.getUint8(buffer.offset);
        buffer.offset += 1;
        this.maxJointsPerVertex = buffer.dataview.getUint8(buffer.offset);
        buffer.offset += 1;
        let movableJointCount = buffer.dataview.getUint8(buffer.offset);
        buffer.offset += 1;
        let movableJoints = new Array(movableJointCount);
        for (let i = 0; i < movableJointCount; i++) {
            movableJoints[i] = buffer.dataview.getUint8(buffer.offset);
            buffer.offset += 1;
        }
        this.movableJoints = movableJoints;
        this.skeleton = new Array(skeletonJointCount);
        for (let i = 0; i < skeletonJointCount; i++) {
            let parent: number | null = buffer.dataview.getUint8(buffer.offset);
            if (parent >= this.skeleton.length) parent = null;
            buffer.offset += 1;
            let local_transform = RigidTransform.deserialize(buffer);
            this.skeleton[i] = { parent: parent, local_transform: local_transform };
        }
        this.jointEvalOrder = new Array(skeletonJointCount);
        for (let i = 0; i < skeletonJointCount; i++) {
            this.jointEvalOrder[i] = buffer.dataview.getUint8(buffer.offset);
            buffer.offset += 1;
        }

        let meshInfoSpec: IBRMeshInfoSpec = {
            version: version,
            maxJointsPerVertex: this.maxJointsPerVertex
        }
        if (version[0] > 2) meshInfoSpec.archivedItems = archivedItems;

        let meshCount = buffer.dataview.getUint8(buffer.offset);
        buffer.offset += 1;
        this.mesh = new Array(meshCount);
        for (let i = 0; i < meshCount; i++){
            if (version[0] <= 2) meshInfoSpec.blendshapeIndices = spec.blendshapeMap![i];
            this.mesh[i] = new IBRMeshInfo(buffer, meshInfoSpec);
        }
    }
    evalSkeleton(): RigidTransform[] {
        let result = Array(this.skeleton.length);
        for (let i of this.jointEvalOrder) {
            if (null == this.skeleton[i].parent) result[i] = this.skeleton[i].local_transform;
            else result[i] = result[this.skeleton[i].parent].apply(this.skeleton[i].local_transform);
        }
        return result;
    }
    evalSkeletonFromMovable(movableJointTransforms: RigidTransform[]): RigidTransform[] {
        let result = Array(this.skeleton.length);
        for (let i = 0; i < movableJointTransforms.length; i++)result[this.movableJoints[i]] = movableJointTransforms[i];
        for (let i of this.jointEvalOrder) {
            if (null != this.skeleton[i].parent) result[i] = result[this.skeleton[i].parent].apply(this.skeleton[i].local_transform);
        }
        return result;
    }
}

export class IBRAnimationFrameData_NN {
    mesh: IBRMeshFrameInfo[];
    blendshapeWeights: Float32Array;
    movableJointTransforms: RigidTransform[];

    constructor() {
        this.mesh = [];
        this.blendshapeWeights = new Float32Array();
        this.movableJointTransforms = [];
    }
    static deserialize(buffer: ArrayBuffer | DataViewWithCustomOffset, char_data: IBRAnimationGeneratorCharInfo_NN, version: [number, number, number]): IBRAnimationFrameData_NN {
        if (buffer instanceof ArrayBuffer) buffer = { offset: 0, dataview: new DataView(buffer) } as DataViewWithCustomOffset;

        let result = new IBRAnimationFrameData_NN();

        const meshCount = char_data.mesh.length;
        result.mesh = new Array(meshCount);

        result.blendshapeWeights = new Float32Array(char_data.blendshapeCount);
        if (version[0] > 2) {
            // v3.0
            for (let i = 0; i < meshCount; i++)result.mesh[i] = IBRMeshFrameInfo.deserialize(buffer, char_data.mesh[i]);
            for (let i = 0; i < result.blendshapeWeights.length; i++) {
                result.blendshapeWeights[i] = buffer.dataview.getFloat32(buffer.offset, true);
                buffer.offset += 4;
            }
        }
        else {
            // v2.0
            for (let i = 0; i < meshCount; i++) {
                const blendshapeIndices = char_data.mesh[i].blendshapeIndices;
                for (let j = 0; j + 1 < blendshapeIndices.length; j++) {
                    result.blendshapeWeights[blendshapeIndices[j + 1] - 1] = buffer.dataview.getFloat32(buffer.offset, true);
                    buffer.offset += 4;

                }

                let textureModelIndex = buffer.dataview.getUint8(buffer.offset);
                buffer.offset += 1;
                let texturePCAWeights = new Float32Array(char_data.mesh[i].textureModels[textureModelIndex].data.size[0] - 1);
                for (let j = 0; j < texturePCAWeights.length; j++) {
                    texturePCAWeights[j] = buffer.dataview.getFloat32(buffer.offset, true);
                    buffer.offset += 4;
                }

                result.mesh[i] = new IBRMeshFrameInfo(textureModelIndex, texturePCAWeights);
            }
        }

        result.movableJointTransforms = new Array(char_data.movableJoints.length);
        for (let i = 0; i < char_data.movableJoints.length; i++)result.movableJointTransforms[i] = RigidTransform.deserialize(buffer);

        return result;
    }
    static interp(frame1: IBRAnimationFrameData_NN, frame2: IBRAnimationFrameData_NN, frameJointRef: IBRAnimationFrameData_NN, t: number, jointEvalOrder: [number, number][]): IBRAnimationFrameData_NN {
        // return linear interpolated result between frame data.
        let result = new IBRAnimationFrameData_NN();

        result.blendshapeWeights = new Float32Array(frame1.blendshapeWeights.length);
        for (let i = 0; i < result.blendshapeWeights.length; i++)result.blendshapeWeights[i] = t * frame2.blendshapeWeights[i] + (1.0 - t) * frame1.blendshapeWeights[i];
        result.mesh = [];
        for (let i = 0; i < frame1.mesh.length; i++) {
            let new_mesh_pca_info = new IBRMeshFrameInfo(frame1.mesh[i].textureModelIndex, new Float32Array(frame1.mesh[i].texturePCAWeights.length));
            for (let j = 0; j < frame1.mesh[i].texturePCAWeights.length; j++)new_mesh_pca_info.texturePCAWeights[j] = t * frame2.mesh[i].texturePCAWeights[j] + (1.0 - t) * frame1.mesh[i].texturePCAWeights[j];
            result.mesh.push(new_mesh_pca_info);
        }

        // joints
        result.movableJointTransforms = new Array(frameJointRef.movableJointTransforms.length);
        for (let i = 0; i < frameJointRef.movableJointTransforms.length; i++) {
            let preserved = true;
            for (let [index_child, _] of jointEvalOrder) {
                if (index_child === i) {
                    preserved = false;
                    break;
                }
            }
            if (preserved) result.movableJointTransforms[i] = frameJointRef.movableJointTransforms[i];
        }
        for (let [index_child, index_parent] of jointEvalOrder) {
            let T1 = frame1.movableJointTransforms[index_parent].inv().apply(frame1.movableJointTransforms[index_child]) as RigidTransform;
            let T2 = frame2.movableJointTransforms[index_parent].inv().apply(frame2.movableJointTransforms[index_child]) as RigidTransform;
            let translation = [], rotQuaternion = [];
            for (let j = 0; j < 3; j++)translation.push(t * T2.translation[j] + (1.0 - t) * T1.translation[j]);
            for (let j = 0; j < 4; j++)rotQuaternion.push(t * T2.rotQuaternion[j] + (1.0 - t) * T1.rotQuaternion[j]);
            rotQuaternion = GLMath.normalize(rotQuaternion);
            let blended_transform = new RigidTransform(translation as GLMath.vec3, rotQuaternion as GLMath.vec4);
            blended_transform = frameJointRef.movableJointTransforms[index_parent].apply(blended_transform) as RigidTransform;
            result.movableJointTransforms[index_child] = blended_transform;
        }
        return result;
    }
}

export function unpackIBRAnimation(buffer: ArrayBuffer | DataViewWithCustomOffset, char_data: IBRAnimationGeneratorCharInfo_NN): IBRAnimationFrameData_NN[] {
    if (buffer instanceof ArrayBuffer) buffer = { offset: 0, dataview: new DataView(buffer) } as DataViewWithCustomOffset;
    const version = checkVersion(buffer, __version__);

    const frameCount = buffer.dataview.getUint32(buffer.offset, true);
    buffer.offset += 4;

    let result = Array(frameCount);
    for (let i = 0; i < frameCount; i++)result[i] = IBRAnimationFrameData_NN.deserialize(buffer, char_data, version);
    return result;
}

export class TextureFloat_3D {
    size: [number, number, number, number]; // dim0, dim1, dim2, component
    data: Float32Array; // first component is mean
    constructor(buffer: ArrayBuffer | DataViewWithCustomOffset) {
        if (buffer instanceof ArrayBuffer) buffer = { offset: 0, dataview: new DataView(buffer) } as DataViewWithCustomOffset;

        this.size = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) {
            this.size[i] = buffer.dataview.getUint16(buffer.offset, true);
            buffer.offset += 2;
        }
        this.data = new Float32Array(this.size[0] * this.size[1] * this.size[2] * this.size[3]);
        for (let i = 0; i < this.data.length; i++) {
            this.data[i] = buffer.dataview.getFloat32(buffer.offset, true);
            buffer.offset += 4;
        }
    }
}

export function transformMJT(mjt: number[][]): RigidTransform[] {
    let result = Array(mjt.length);
    for (let i = 0; i < mjt.length; i++) {
        result[i] = new RigidTransform(
            mjt[i].slice(0, 3) as [number, number, number],
            mjt[i].slice(3) as [number, number, number, number]
        );
    }
    return result;
}

export function formatMJT(a1: number[], a2: number[]) {
    return new RigidTransform(
        a1 as [number, number, number],
        a2 as [number, number, number, number]
    );
}