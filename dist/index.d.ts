import { AvatarStatus, RenderState, IAvatarOptions, IInitParams, Layout, WalkConfig } from "./types/index";
import { TDownloadProgress } from "./modules/ResourceManager";
import Errors from './modules/error-handle';
import './utils/logger.js';
import { IBRAnimationGeneratorCharInfo_NN, unpackIBRAnimation, formatMJT } from './utils/DataInterface';
import { getVertices, getWavefrontObjFromVertices, getPCATextures } from './utils/GLPipelineDebugTools';
import { GLDevice } from './utils/GLDevice';
import { GLPipeline } from './utils/GLPipeline';
export default class XmovAvatar {
    private options;
    private TAG;
    private el;
    private status;
    private resourceManager;
    private renderScheduler;
    private networkMonitor;
    private ttsa;
    private debugOverlay;
    private _offlineTimer;
    private readonly _offlineInterval;
    private _env;
    private avatarCanvasVisible;
    private pendingInvisibleMode;
    private isInitialized;
    onStateChange: (state: string) => void;
    onDownloadProgress: TDownloadProgress | null;
    static IBRAnimationGeneratorCharInfo_NN: typeof IBRAnimationGeneratorCharInfo_NN;
    static unpackIBRAnimation: typeof unpackIBRAnimation;
    static formatMJT: typeof formatMJT;
    static getVertices: typeof getVertices;
    static getPCATextures: typeof getPCATextures;
    static getWavefrontObjFromVertices: typeof getWavefrontObjFromVertices;
    static GLDevice: typeof GLDevice;
    static GLPipeline: typeof GLPipeline;
    private boundVisibilityChange;
    private replayData;
    private startConnectTime;
    private connectSuccessTime;
    private enableClientInterrupt;
    private retryCount;
    private retryTimer;
    private maxRetryCount;
    private retryRound;
    private maxRetryRound;
    private isRetrying;
    private isStartRetry;
    private destroyed;
    private reconnectDebounceTimer;
    constructor(options: IAvatarOptions);
    getStatus(): AvatarStatus | -1;
    getTag(): string | undefined;
    get businessENV(): string;
    getUniqueSpeakId(): string;
    private initializeSDK;
    private renderFrameCallback;
    init(params: IInitParams): Promise<void>;
    visibilitychange(): void;
    setReplayData(data: any): void;
    handleReplaySend(frame: number): void;
    private connectTtsa;
    start(): void;
    private _reload;
    reloadSuccess(): void;
    stop(): Promise<void>;
    private handleBeforeUnload;
    isDestroyed(): boolean;
    destroyClient(): Promise<void>;
    destroy(stop_reason?: string): Promise<void>;
    idle(): void;
    listen(): void;
    think(): void;
    interactiveidle(): void;
    speak(ssml: string, is_start?: boolean, is_end?: boolean, extra?: {
        client_speak_id: string;
    }): void;
    /**
       * 通知后端进入隐身模式
       */
    private notifyEnterInvisibleMode;
    /**
     * 通知后端退出隐身模式
     */
    private notifyExitInvisibleMode;
    setVolume(volume: number): void;
    getSessionId(): string | undefined;
    showDebugInfo(): void;
    hideDebugInfo(): void;
    changeAvatarVisible(visible: boolean): void;
    /**
     * 在初始化未完成时清理所有已初始化的资源
     * @param reason 清理原因
     */
    private cleanupBeforeInitComplete;
    private offlineHandle;
    stopSessionFromSocket(reason: string): void;
    offlineMode(): void;
    onlineMode(): void;
    onMessage(params: Parameters<typeof Errors>[0]): void;
    onStatusChange(status: AvatarStatus): void;
    /**
     * 切换隐身模式（暂停/恢复音视频实时渲染）
     */
    switchInvisibleMode(): void;
    private setInvisibleMode;
    getPendingInvisibleMode(): boolean;
    /**
     * 获取当前渲染状态
     */
    getRenderState(): RenderState;
    changeLayout(layout: Layout): void;
    changeWalkConfig(walkConfig: WalkConfig): void;
    interrupt(type: string): void;
    private triggerReconnect;
    reStartSession(): void;
    private _retryImpl;
    private clearAllRetryTimers;
    private resetRetryState;
}
