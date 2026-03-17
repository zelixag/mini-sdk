/**
 * GLPipelineMP - WebGL 渲染管线 for Mini Program
 * 实现 IBR (Image-Based Rendering) 渲染管线
 */
import { GLDeviceMP } from './GLDeviceMP';
export interface GLPipelineOptions {
    device: GLDeviceMP;
}
/**
 * 字符数据接口
 */
export interface GLPipelineCharData {
    char: any;
    LUT?: any;
    transform?: {
        offsetX: number;
        offsetY: number;
        scaleX: number;
        scaleY: number;
    };
    multisample?: number;
}
/**
 * IBR 动画帧数据
 */
export interface IBRAnimationFrameData {
    mesh: any[];
    blendshapeWeights: number[];
    movableJointTransforms: any[];
    textureModelIndex: number;
    texturePCAWeights: number[];
}
/**
 * GLPipelineMP - WebGL 渲染管线
 * 负责 IBR 渲染，包括:
 * - 身体纹理渲染
 * - 表情混合形状 (Blendshape)
 * - 骨骼动画 (Skeleton Animation)
 * - 网格纹理融合
 */
export declare class GLPipelineMP {
    private TAG;
    private device;
    private bodyProgram;
    private meshProgram;
    private vertexBuffer;
    private indexBuffer;
    private texCoordBuffer;
    private bodyTexture;
    private meshColorTexture;
    private meshAlphaTexture;
    private charData;
    private isCharDataSet;
    private isInitialized;
    constructor(options: GLPipelineOptions);
    /**
     * 初始化
     */
    private init;
    /**
     * 初始化着色器
     */
    private initShaders;
    /**
     * 创建着色器程序
     */
    private createProgram;
    /**
     * 初始化缓冲区
     */
    private initBuffers;
    /**
     * 设置字符数据
     */
    setCharData(data: GLPipelineCharData): void;
    /**
     * 设置同步媒体
     */
    setSyncMedia(): void;
    /**
     * 渲染身体纹理
     */
    renderBody(image: any): void;
    /**
     * 渲染 IBR 帧
     */
    renderIBRFrame(frameData: IBRAnimationFrameData): void;
    /**
     * 重新初始化
     */
    reinitialize(): void;
    /**
     * 销毁
     */
    destroy(): void;
}
export default GLPipelineMP;
