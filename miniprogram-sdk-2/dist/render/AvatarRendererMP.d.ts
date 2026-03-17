/**
 * AvatarRendererMP - 数字人渲染器 for Mini Program
 * 负责身体和脸部数据的融合渲染
 */
import type { IBodyFrame } from '../core/DataCacheQueueMP';
export interface AvatarRendererOptions {
    canvas: any;
    gl: WebGLRenderingContext | WebGL2RenderingContext;
    dataCacheQueue: any;
    resourceManager: any;
    onMessage?: (message: string) => void;
}
export interface RenderFrameData {
    frame: number;
    bodyFrame?: IBodyFrame;
    faceFrame?: any;
    audioFrame?: any;
}
/**
 * AvatarRendererMP - 数字人渲染器
 * 整合身体渲染和脸部渲染，实现 IBR (Image-Based Rendering) 效果
 */
export declare class AvatarRendererMP {
    private TAG;
    private options;
    private canvas;
    private gl;
    private device;
    private dataCacheQueue;
    private resourceManager;
    private isInitialized;
    private isRendering;
    private currentBodyFrame;
    private lastFaceFrame;
    private bodyTexture;
    private meshTexture;
    private program;
    private quadVertices;
    private vertexBuffer;
    private onMessageCallback?;
    constructor(options: AvatarRendererOptions);
    /**
     * 初始化 WebGL 设备
     */
    private initDevice;
    /**
     * 初始化着色器
     */
    private initShaders;
    /**
     * 初始化缓冲区
     */
    private initBuffers;
    /**
     * 创建纹理
     */
    private createTexture;
    /**
     * 渲染帧
     */
    render(data: RenderFrameData): void;
    /**
     * 更新身体纹理
     */
    private updateBodyTexture;
    /**
     * 执行渲染
     */
    private doRender;
    /**
     * 设置网格纹理
     */
    setMeshTexture(texture: WebGLTexture | null): void;
    /**
     * 设置面部对齐参数
     */
    setFaceAlignmentConfig(config: any): void;
    /**
     * 重置脸部帧状态
     */
    resetFaceFrameState(): void;
    /**
     * 设置画布尺寸
     */
    setCanvasSize(width: number, height: number): void;
    /**
     * 设置画布可见性
     */
    setCanvasVisibility(visible: boolean): void;
    /**
     * 获取当前身体帧信息
     */
    _getCurrentBodyFrameInfo(frame: number): any;
    /**
     * 获取 WebGL 上下文
     */
    getGL(): WebGLRenderingContext | WebGL2RenderingContext | null;
    /**
     * 获取渲染状态
     */
    getRenderState(): string;
    /**
     * 发送错误
     */
    private emitError;
    /**
     * 销毁
     */
    destroy(): void;
}
export default AvatarRendererMP;
