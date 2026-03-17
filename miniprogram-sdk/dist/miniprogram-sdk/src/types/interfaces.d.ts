/**
 * 小程序 SDK 接口类型定义（熵减优化）
 * 完善类型定义，消除 any 类型
 */
import { AvatarStatus, RenderState } from './index';
import { EErrorCode } from './error';
import { IRawFrameData, IRawBodyFrameData } from '../../../src/types/frame-data';
/**
 * 资源管理器接口
 */
export interface IResourceManager {
    loadVideo(name: string): Promise<ArrayBuffer | null>;
    preloadVideo(name: string): Promise<void>;
    getMouthShapeLib(): any;
    getConfig(): any;
    _getOfflineIdle(): any[];
}
/**
 * 渲染调度器接口
 */
export interface IRenderScheduler {
    init(): void;
    handleData(data: IRawFrameData[], type: any): Promise<void>;
    render(): void;
    stop(): void;
    pauseRender(): void;
    resumeRender(): void;
    setVolume(volume: number): void;
    destroy(): void;
}
/**
 * 解码器接口
 */
export interface IDecoder {
    decode(files: IRawBodyFrameData[], onFrame: (file: any, frame: any, index: number) => void): void;
    abort(): void;
    abortOne(id: string): void;
    destroy(): void;
    _tryStartNext(): void;
    syncDecode(currentFrameIndex: number): void;
}
/**
 * TTSA 接口
 */
export interface ITTSA {
    getUniqueSpeakId(): string;
    getSessionId(): string;
    start(): Promise<void>;
    stop(): void;
    destroy(): void;
}
/**
 * 网络监控器接口
 */
export interface INetworkMonitor {
    isOnlineNow(): boolean;
    start(): void;
    stop(): void;
}
/**
 * Canvas 适配器接口
 */
export interface ICanvasAdapter {
    getCanvasNode(canvasId: string): Promise<WechatMiniprogram.Canvas>;
    createWebGLContext(canvas: WechatMiniprogram.Canvas, options?: any): WebGL2RenderingContext | WebGLRenderingContext | null;
    setCanvasSize(canvasId: string, width: number, height: number): Promise<void>;
}
/**
 * WebSocket 适配器接口
 */
export interface IWebSocketAdapter {
    connect(url: string, protocols?: string[]): Promise<void>;
    send(data: string | ArrayBuffer): void;
    close(): void;
    onOpen(callback: () => void): void;
    onMessage(callback: (data: any) => void): void;
    onError(callback: (error: any) => void): void;
    onClose(callback: () => void): void;
}
/**
 * 音频渲染器接口
 */
export interface IAudioRenderer {
    setVolume(volume: number): void;
    stop(speechId: number): void;
    pause(): void;
    resume(): void;
    get speech_id(): number;
}
/**
 * Avatar 渲染器接口
 */
export interface IAvatarRenderer {
    init(data: any): void;
    initPipeline(): void;
    render(frameIndex: number): any;
    setCanvasVisibility(visible: boolean): void;
    setCharacterCanvasAnchor(layout?: any): void;
    setInterrupt(interrupt: boolean): void;
    resetFaceFrameState(): void;
    _getCurrentBodyFrameInfo(frame: number): any;
}
/**
 * 数据缓存队列接口
 */
export interface IDataCacheQueue {
    _updateBodyImageBitmap(data: any): void;
    _getBodyImageBitmap(frameIndex: number): any;
    _getFaceImageBitmap(frameIndex: number, bodyId: number): any;
    _getRealFaceImageBitmap(frameIndex: number, bodyId: number): any;
    _updateAudio(data: any): void;
    _updateUiEvent(data: any): void;
    _clearAudio(speechId: number): void;
    clearSubtitleOn(speechId: number): void;
    clearAllFaceData(): void;
    checkValidData(data: any, type: any): void;
    destroy(): void;
    currentPlayState: any;
    currentTtsaState: any;
}
/**
 * 调试覆盖层接口
 */
export interface IDebugOverlay {
    setVideoInfo(info: {
        name: string;
        body_id: number;
        id: number;
    }): void;
    setAudioInfo(info: {
        sf: number;
        ef: number;
        ad: Uint8Array;
    }): void;
    setEventData(info: {
        sf: number;
        ef: number;
        event: any[];
    }): void;
}
/**
 * 消息回调类型
 */
export type MessageCallback = (message: {
    code: EErrorCode;
    message: string;
    e?: any;
}) => void;
/**
 * 状态变更回调类型
 */
export type StateChangeCallback = (state: string) => void;
/**
 * 状态变更回调类型（AvatarStatus）
 */
export type StatusChangeCallback = (status: AvatarStatus) => void;
/**
 * 渲染状态变更回调类型
 */
export type RenderChangeCallback = (state: RenderState, oldState?: RenderState) => void;
/**
 * 语音状态变更回调类型
 */
export type VoiceStateChangeCallback = (state: string, duration?: number) => void;
/**
 * 行走状态变更回调类型
 */
export type WalkStateChangeCallback = (state: string) => void;
/**
 * 下载进度回调类型
 */
export type DownloadProgressCallback = (progress: number) => void;
/**
 * 网络信息回调类型
 */
export type NetworkInfoCallback = (networkInfo: any) => void;
/**
 * 会话警告回调类型
 */
export type StartSessionWarningCallback = (message: any) => void;
