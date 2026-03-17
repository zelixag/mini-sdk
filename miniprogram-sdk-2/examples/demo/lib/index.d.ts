/**
 * XmovAvatarMP - Mini Program Digital Human SDK
 * 微信小程序数字人 SDK 主入口
 *
 * 设计原则：
 * 1. API 与 Web SDK (XmovAvatar) 保持完全兼容
 * 2. 复用主项目核心逻辑，通过适配器层适配小程序平台
 * 3. 模块化设计，便于维护和测试
 */
import './polyfill/window';
import './polyfill/fetch';
import './polyfill/event';
export { CanvasAdapter, createCanvasAdapter, getWebGLContext } from './adapters/canvas';
export { AudioAdapter } from './adapters/audio';
export { MiniProgramWebSocket, createWebSocket, io } from './adapters/websocket';
export { request, get, post, mpRequest, AbortController } from './adapters/request';
export { logger, createModuleLogger, LogLevel } from './utils/logger';
export * from './utils/Math';
export { RenderSchedulerMP } from './core/RenderSchedulerMP';
export { DataCacheQueueMP } from './core/DataCacheQueueMP';
export { GLDeviceMP } from './render/GLDeviceMP';
export { GLPipelineMP } from './render/GLPipelineMP';
export { AvatarRendererMP } from './render/AvatarRendererMP';
export { ResourceManagerMP } from './modules/ResourceManagerMP';
export { Decoder, ParallelDecoder } from './modules/decoder';
export { AudioRenderer } from './modules/AudioRenderer';
export { UIRenderer } from './modules/UIRenderer';
export * from './types';
/**
 * Avatar 状态枚举
 */
export declare enum AvatarStatus {
    online = "online",
    offline = "offline",
    network_on = "network_on",
    network_off = "network_off",
    close = "close",
    visible = "visible",
    invisible = "invisible",
    stopped = "stopped"
}
/**
 * 渲染状态枚举
 */
export declare enum RenderState {
    init = "init",
    rendering = "rendering",
    paused = "paused",
    resumed = "resumed",
    stopped = "stopped"
}
/**
 * 初始化模式
 */
export declare enum InitModel {
    normal = "normal",
    invisible = "invisible"
}
/**
 * SDK 配置选项
 */
export interface IAvatarOptions {
    containerId: string;
    canvas?: any;
    gl?: any;
    appId: string;
    appSecret: string;
    gatewayServer: string;
    cacheServer?: string;
    tag?: string;
    headers?: Record<string, string>;
    env?: string;
    config?: any;
    enableLogger?: boolean;
    enableDebugger?: boolean;
    onMessage?: (error: any) => void;
    onStateChange?: (state: string) => void;
    onStatusChange?: (status: AvatarStatus) => void;
    onDownloadProgress?: (progress: number) => void;
    onSpeakStateChange?: (state: string, client_speak_id: string) => void;
    onRenderChange?: (state: RenderState) => void;
    onVoiceStateChange?: (state: string, duration?: number) => void;
    onWalkStateChange?: (state: string) => void;
}
/**
 * 初始化参数
 */
export interface IInitParams {
    initModel?: 'normal' | 'invisible';
    onDownloadProgress?: (progress: number) => void;
}
/**
 * 会话信息
 */
export interface ISessionInfo {
    session_id: string;
    socket_io_url: string;
    token: string;
    room: string;
    resource_pack?: any;
    config?: any;
}
/**
 * 布局配置
 */
export interface Layout {
    container: {
        size: number[];
    };
    avatar: {
        v_align: string;
        h_align: string;
        scale: number;
        offset_x: number;
        offset_y: number;
    };
}
/**
 * 行走配置
 */
export interface WalkConfig {
    min_x_offset: number;
    max_x_offset: number;
    walk_points: {
        [key: string]: number;
    };
    init_point?: number;
}
/**
 * SDK 错误
 */
export interface SDKError {
    code: string;
    message: string;
    e?: any;
}
/**
 * 网络信息
 */
export interface INetworkInfo {
    downlink: number;
    rtt: number;
}
/**
 * XmovAvatarMP - 微信小程序数字人 SDK 主类
 */
export declare class XmovAvatarMP {
    private options;
    private status;
    private sessionInfo;
    private sessionStarted;
    private destroyed;
    private audioAdapter;
    private ttsaSocket;
    private renderScheduler;
    private avatarRenderer;
    private resourceManager;
    private avatarCanvasVisible;
    private pendingInvisibleMode;
    private isInitialized;
    private _onStateChange?;
    private _onStatusChange?;
    private _onDownloadProgress?;
    constructor(options: IAvatarOptions);
    private initAudio;
    init(params?: IInitParams): Promise<boolean>;
    start(): Promise<boolean>;
    private startSession;
    private connectTtsa;
    private handleTtsaData;
    pause(): boolean;
    stop(): Promise<boolean>;
    private stopSession;
    destroy(): Promise<void>;
    speak(ssml: string, is_start?: boolean, is_end?: boolean, extra?: any): string | null;
    sendText(text: string, options?: {
        isStart?: boolean;
        isEnd?: boolean;
    }): string | null;
    idle(): void;
    listen(): void;
    think(): void;
    interactiveidle(): void;
    private stateChange;
    setVolume(volume: number): void;
    changeAvatarVisible(visible: boolean): void;
    changeLayout(layout: Layout): void;
    changeWalkConfig(walkConfig: WalkConfig): void;
    getStatus(): AvatarStatus;
    getSessionId(): string | null;
    getSessionInfo(): ISessionInfo | null;
    isDestroyed(): boolean;
    getTag(): string | undefined;
    get businessENV(): string;
    getUniqueSpeakId(): string;
    showDebugInfo(): void;
    hideDebugInfo(): void;
    private updateStatus;
    private emitError;
}
export default XmovAvatarMP;
