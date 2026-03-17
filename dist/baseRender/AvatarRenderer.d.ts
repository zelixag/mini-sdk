/**
 * 3D 渲染（身体+表情）
 */
import ResourceManager from "../modules/ResourceManager";
import { DataCacheQueue, IBodyFrame } from "../control/DataCacheQueue";
import { GLDevice } from "../utils/GLDevice";
import { GLPipeline, GLPipelineCharData } from "../utils/GLPipeline";
import { Layout, RenderState, WalkConfig } from "../types";
import SaveAndDownload from "../control/SaveAndDownload";
import { IRawFaceFrameData } from "types/frame-data";
type Option = {
    dataCacheQueue: DataCacheQueue;
    resourceManager: ResourceManager;
    saveAndDownload: SaveAndDownload;
    onDownloadProgress: (progress: number) => void;
    onStateChange: (state: string) => void;
    onRenderChange: (state: RenderState) => void;
    sendVideoInfo: (info: {
        name: string;
        body_id: number;
        id: number;
    }) => void;
    onError: (error: any) => void;
};
export default class AvatarRender {
    private TAG;
    options: Option;
    canvas: HTMLCanvasElement;
    device: GLDevice | null;
    pipeline: GLPipeline | null;
    currentBodyFrame: IBodyFrame | null;
    lastFaceFrame: IRawFaceFrameData | null;
    private isInit;
    private isFirstRender;
    private lastFrameState;
    private lastRenderState;
    private onDownloadProgress;
    private onStateChange?;
    private onRenderChange?;
    private sendVideoInfo;
    private lostHandler;
    private restoreHandler;
    private avatarCanvasVisible;
    private lastRealFaceFrameData;
    private lastRealFaceFrame;
    private lastWeight;
    private lastFrameIndex;
    private saveAndDownload;
    private canvasOffsetX;
    private pendingCharData;
    private interrupt;
    private walkConfig;
    layout: Layout | null;
    constructor(options: Option);
    /**
     * 重置表情相关状态（用于从隐身模式恢复渲染时）
     */
    resetFaceFrameState(): void;
    /**
     * 创建 pipeline 并设置字符数据
     */
    private _createPipeline;
    _lostHandler(event: Event): void;
    _restoreHandler(event: Event): void;
    init(data: GLPipelineCharData | null): void;
    /**
     * 初始化 pipeline（在从隐身模式切换到在线模式时调用）
     * 用于延迟创建 pipeline，避免在隐身模式时创建 pipeline 导致的 GPU 资源竞争
     */
    initPipeline(): void;
    private style;
    /**
     * 设置画布样式（修复transform失效 + 优化对齐逻辑 + 优雅拼接样式）
     * @param avatar 布局配置
     */
    setCanvasStyle(layout: Layout): void;
    setWalkConfig(walkConfig: WalkConfig): void;
    setCharacterCanvasAnchor(layout?: Layout): void;
    computeWeight(frameIndex: any): number;
    render(frameIndex: number): HTMLCanvasElement | undefined;
    renderBackground(): void;
    _setCurrentBodyFrame(bodyFrame?: IBodyFrame): void;
    _getCurrentBodyFrameInfo(frameIndex: number): {
        client_frame: number;
        current_ani: string;
        current_ani_frame: number;
        next_state: string;
    };
    /**
     * 设置canvas的显隐状态
     * @param visible 是否可见
     */
    setCanvasVisibility(visible: boolean): void;
    /**
     * 获取canvas的显隐状态
     */
    getCanvasVisibility(): boolean;
    destroy(): void;
    setInterrupt(interrupt: boolean): void;
}
export {};
