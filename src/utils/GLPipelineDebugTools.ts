import { GLPipelineCharData } from './GLPipeline'
import { mvmul } from './Math'
import { TensorDataType, RigidTransform, IBRAnimationFrameData_NN } from './DataInterface'

function sampleUniformTensor(data: TensorDataType, index: number): number {
    if(Float32Array === data.constructor || Float64Array == data.constructor)return data[index];
    else if(Uint8Array == data.constructor)return (data[index] / 0xFF) * 2.0 - 1.0;
    else if(Int8Array == data.constructor)return ((data[index] + 0x80) / 0xFF) * 2.0 - 1.0;
    else if(Uint16Array == data.constructor)return (data[index] / 0xFFFF) * 2.0 - 1.0;
    else if(Int16Array == data.constructor)return ((data[index] + 0x8000) / 0xFFFF) * 2.0 - 1.0;
    else if(Uint32Array == data.constructor)return (data[index] / 0xFFFFFFFF) * 2.0 - 1.0;
    else if(Int32Array == data.constructor)return ((data[index] + 0x80000000) / 0xFFFFFFFF) * 2.0 - 1.0;
    else if(BigUint64Array == data.constructor)return (Number(data[index] >> 32n) / 0xFFFFFFFF) * 2.0 - 1.0;
    else if(BigInt64Array == data.constructor)return ((Number(data[index] >> 32n) + 0x80000000) / 0xFFFFFFFF) * 2.0 - 1.0;
    else return 0.0;
}

export function getVertices(data: GLPipelineCharData, frame_data: IBRAnimationFrameData_NN): number[][][] {
    let char = data.char!;

    let initSkeletonStatus = char.evalSkeleton();
    let currentSkeletonStatus = char.evalSkeletonFromMovable(frame_data.movableJointTransforms);
    let joint_matrices = Array(char.skeleton.length);
    for (let i = 0; i < char.skeleton.length; i++) {
        const joint_transform = currentSkeletonStatus[i].apply(initSkeletonStatus[i].inv()) as RigidTransform;
        joint_matrices[i] = joint_transform.homogeneous_matrix();
    }

    let result: number[][][] = [];
    for (let mesh_index = 0; mesh_index < char.mesh.length; mesh_index++) {
        let geometry: number[][] = [];
        for (let i = 0; i < char.mesh[mesh_index].blendshapes.size[1]; i++) {
            let vertex: number[] = [];
            let blendshapes = char.mesh[mesh_index].blendshapes;
            let blendshapeWeights = frame_data.blendshapeWeights;
            for (let k = 0; k < 3; k++)vertex.push(Number(blendshapes.data[i * blendshapes.size[2] + k]));
            for (let j = 0; j + 1 < char.mesh[mesh_index].blendshapeIndices.length; j++) {
                for (let k = 0; k < 3; k++)vertex[k] += blendshapeWeights[char.mesh[mesh_index].blendshapeIndices[j + 1] - 1] * Number(blendshapes.data[((j + 1) * blendshapes.size[1] + i) * blendshapes.size[2] + k]);
            }

            vertex.push(1.0);
            let vertex_lbs = [0.0, 0.0, 0.0, 0.0];
            let jointIndex = char.mesh[mesh_index].jointIndex;
            let jointWeight = char.mesh[mesh_index].jointWeight;
            for (let j = 0; j < char.maxJointsPerVertex; j++) {
                let curJointIndex = jointIndex[i * char.maxJointsPerVertex + j];
                if(curJointIndex < char.skeleton.length){
                    let vertex_transformed = mvmul(joint_matrices[curJointIndex], vertex);
                    for (let k = 0; k < 4; k++)vertex_lbs[k] += jointWeight[i * char.maxJointsPerVertex + j] * vertex_transformed[k];
                }
            }

            for (let k = 0; k < 3; k++)vertex_lbs[k] /= vertex_lbs[3];
            geometry.push([vertex_lbs[0], vertex_lbs[1], vertex_lbs[2]]);
        }
        result.push(geometry);
    }
    return result;
}

export function getPCATextures(data: GLPipelineCharData, frame_data: IBRAnimationFrameData_NN): ImageData[] {
    let char = data.char!;
    let result: ImageData[] = [];

    for (let mesh_index = 0; mesh_index < char.mesh.length; mesh_index++) {
        let texture_model = char.mesh[mesh_index].textureModels[frame_data.mesh[mesh_index].textureModelIndex];
        let texture: number[][][] = [];
        let texture_data = new Uint8ClampedArray(texture_model.data.size[1] * texture_model.data.size[2] * 4);

        let mean_weight = 1.0;
        if(texture_model.scalingFactor)mean_weight *= Number(texture_model.scalingFactor.data[0]);
        for (let j = 0; j < texture_model.data.size[1]; j++){
            let row: number[][] = [];
            for (let k = 0; k < texture_model.data.size[2]; k++){
                let pixel: number[] = [];
                for (let l = 0; l < 3; l++)pixel.push(mean_weight * sampleUniformTensor(texture_model.data.data, (j * texture_model.data.size[2] + k) * 3 + l));
                row.push(pixel);
            }
            texture.push(row);
        }
        for (let i = 1; i < texture_model.data.size[0]; i++) {
            let weight = frame_data.mesh[mesh_index].texturePCAWeights[i - 1];
            if(texture_model.scalingFactor)weight *= Number(texture_model.scalingFactor.data[i]);
            for (let j = 0; j < texture_model.data.size[1]; j++){
                for (let k = 0; k < texture_model.data.size[2]; k++){
                    for (let l = 0; l < 3; l++)texture[j][k][l] += weight * sampleUniformTensor(texture_model.data.data, ((i * texture_model.data.size[1] + j) * texture_model.data.size[2] + k) * 3 + l);
                }
            }
        }
        for (let j = 0; j < texture_model.data.size[1]; j++){
            let row: number[][] = [];
            for (let k = 0; k < texture_model.data.size[2]; k++){
                let pixel: number[] = [];
                for (let l = 0; l < 3; l++)texture_data[(j * texture_model.data.size[2] + k) * 4 + l] = Math.round(texture[texture_model.data.size[1] - 1 - j][k][2 - l] * 255);
                texture_data[(j * texture_model.data.size[2] + k) * 4 + 3] = 0xFF;
            }
        }
        result.push(new ImageData(texture_data, texture_model.data.size[1], texture_model.data.size[2]));
    }

    return result;
}

interface PolygonMeshInfo {
    vertices: number[][],
    uv: number[][],
    polygons: number[][]
}

function exportAsWavefrontObj(geometries: PolygonMeshInfo[]): string {
    let vertex_string = "";
    let polygon_string = "";
    let vertex_index_offset = 1;
    let geometry_offset = 0;
    for(const geometry of geometries){
        for(const vertex of geometry.vertices)vertex_string += `v ${vertex[0]} ${vertex[1]} ${vertex[2]}\n`
        for(const uv of geometry.uv)vertex_string += `vt ${uv[0]} ${uv[1]}}\n`

        polygon_string += `g Obj${geometry_offset}\n`
        for(const poly of geometry.polygons){
            let poly_str = poly.map(x => (x + vertex_index_offset).toString()).map(x => `${x}/${x}`).join(" ");
            polygon_string += `f ${poly_str}\n`;
        }

        vertex_index_offset += geometry.vertices.length;
        geometry_offset += 1;
    }
    return vertex_string + polygon_string;
}

export function getWavefrontObjFromVertices(data: GLPipelineCharData, vertices: number[][][]): string {
    function unflattenUniform(data: TensorDataType, new_axis_size: number): number[][] {
        let result: number[][] = [];
        for (let i = 0; i < data.length; i++) {
            if (0 == i % new_axis_size) result.push([]);
            result[result.length - 1].push(sampleUniformTensor(data, i));
        }
        return result;
    }
    function unflatten(data: TensorDataType, new_axis_size: number): number[][] {
        let result: number[][] = [];
        for (let i = 0; i < data.length; i++) {
            if (0 == i % new_axis_size) result.push([]);
            result[result.length - 1].push(Number(data[i]));
        }
        return result;
    }

    let char = data.char!;
    let geometries: PolygonMeshInfo[] = [];
    for (let mesh_index = 0; mesh_index < char.mesh.length; mesh_index++) {
        geometries.push({
            vertices: vertices[mesh_index],
            uv: unflattenUniform(char.mesh[mesh_index].UVCoord.data, 2),
            polygons: unflatten(char.mesh[mesh_index].triangles.data, 3)
        });
    }
    return exportAsWavefrontObj(geometries);
}