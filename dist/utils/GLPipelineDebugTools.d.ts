import { GLPipelineCharData } from './GLPipeline';
import { IBRAnimationFrameData_NN } from './DataInterface';
export declare function getVertices(data: GLPipelineCharData, frame_data: IBRAnimationFrameData_NN): number[][][];
export declare function getPCATextures(data: GLPipelineCharData, frame_data: IBRAnimationFrameData_NN): ImageData[];
export declare function getWavefrontObjFromVertices(data: GLPipelineCharData, vertices: number[][][]): string;
