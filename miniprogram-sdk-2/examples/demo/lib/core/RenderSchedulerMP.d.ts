/**
 * RenderSchedulerMP - 渲染调度器 for Mini Program
 * 借鉴 Web SDK RenderScheduler 实现
 */
export interface RenderSchedulerOptions {
    resourceManager: any;
    canvas: any;
    gl: any;
    frameRate?: number;
    onMessage?: (message: string) => void;
    onStateChange?: (state: string) => void;
    onRenderChange?: (state: string) => void;
}
/**
 * 数据缓存队列接口
 */
export interface IBodyFrame {
    frame: any;
    frameIndex: number;
    frameState: string;
    id: number;
    name: string;
    body_id: number;
    hfd: boolean;
    sf: number;
    offset: number;
}
export interface DataCacheQueueMP {
    _updateBodyImageBitmap(data: IBodyFrame): void;
    _getBodyImageBitmap(frameIndex: number): IBodyFrame | undefined;
    _updateFacial(data: any[]): void;
    _getFacial(frameIndex: number): any;
    _updateAudio(data: any[]): void;
    _getAudio(frameIndex: number): any;
    _updateUiEvent(data: any[]): void;
    currentPlayState: string;
    currentTtsaState: any;
    clearAllFaceData(): void;
    destroy(): void;
}
/**
 * RenderSchedulerMP - 渲染调度器
 * 负责帧动画驱动、数据路由、渲染协调
 */
export declare class RenderSchedulerMP {
    private options;
    private dataCacheQueue;
    private bodyRenderer;
    private avatarRenderer;
    private frameRate;
    private currentFrame;
    private isPlaying;
    private renderState;
    private animationFrameId;
    private lastFrameTime;
    private frameInterval;
    private onFrameCallback;
    private onStateChangeCallback;
    private onRenderChangeCallback;
    private bodyRendererImpl;
    private avatarRendererImpl;
    constructor(options: RenderSchedulerOptions);
    /**
     * 初始化
     */
    init(dataCacheQueue: DataCacheQueueMP): void;
    /**
     * 设置身体渲染器
     */
    setBodyRenderer(renderer: any): void;
    /**
     * 设置数字人渲染器
     */
    setAvatarRenderer(renderer: any): void;
    /**
     * 获取数据缓存队列
     */
    getDataCacheQueue(): DataCacheQueueMP | null;
    /**
     * 开始渲染
     */
    start(): void;
    /**
     * 停止渲染
     */
    stop(): void;
    /**
     * 暂停渲染
     */
    pause(): void;
    /**
     * 恢复渲染
     */
    resume(): void;
    /**
     * 启动渲染循环
     */
    private startRenderLoop;
    /**
     * 渲染单帧
     */
    private renderFrame;
    /**
     * 处理数据（从 TTSA 接收）
     */
    handleData(data: any[], type: string): void;
    /**
     * 处理身体数据
     */
    private handleBodyData;
    /**
     * 处理脸部数据
     */
    private handleFaceData;
    /**
     * 处理音频数据
     */
    private handleAudioData;
    /**
     * 处理事件数据
     */
    private handleEventData;
    /**
     * 设置帧回调
     */
    setFrameCallback(callback: (frame: number) => void): void;
    /**
     * 获取当前帧
     */
    getCurrentFrame(): number;
    /**
     * 设置当前帧
     */
    setCurrentFrame(frame: number): void;
    /**
     * 获取渲染状态
     */
    getRenderState(): string;
    /**
     * 强制同步解码器
     */
    forceSyncDecoder(): void;
    /**
     * 清理所有脸部数据（暂停时）
     */
    clearAllFaceData(): void;
    /**
     * 销毁
     */
    destroy(): void;
}
export default RenderSchedulerMP;
