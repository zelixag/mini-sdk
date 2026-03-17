import ResourceManager from "../modules/ResourceManager";
import { EFrameDataType, IRawFrameData, IRawFaceFrameData, ITtsFaceFrameData, StateChangeInfo } from "../types/frame-data";
import { EErrorCode } from "../types/error";
import XmovAvatar from "index";
import { RenderState, WalkConfig } from "../types/index";
import { Layout } from "../types";
export default class RenderScheduler {
    private TAG;
    private dataCacheQueue;
    private sdk;
    private avatarRenderer;
    private audioRenderer;
    private uiRenderer;
    private composition;
    private currentSpeechId;
    private resourceManager;
    private frameAnimationController;
    private isStartPlay;
    private renderState;
    private onDownloadProgress;
    private onRenderChange;
    private decoder;
    private saveAndDownload;
    lastSpeechId: number;
    private enableClientInterrupt;
    private setAudioInfo;
    private setEventData;
    private reportMessage;
    private sendSdkPoint;
    constructor(config: {
        sdkInstance: XmovAvatar;
        container: Element;
        hardwareAcceleration: string;
        resourceManager: ResourceManager;
        enableDebugger?: boolean;
        enableClientInterrupt?: boolean;
        onDownloadProgress: (progress: number) => void;
        onStateChange: (state: string) => void;
        onSpeakStateChange: (state: string, client_speak_id: number | string) => void;
        onRenderChange: (state: RenderState, oldState?: RenderState) => void;
        onVoiceStateChange: (state: string, duration?: number) => void;
        onWalkStateChange: (state: string) => void;
        sendVideoInfo: (info: {
            name: string;
            body_id: number;
            id: number;
        }) => void;
        setAudioInfo: (info: {
            sf: number;
            ef: number;
            ad: Uint8Array;
        }) => void;
        setEventData: (info: {
            sf: number;
            ef: number;
            event: Array<any>;
        }) => void;
        renderFrameCallback: (frame: number) => void;
        reportMessage: (message: {
            code: EErrorCode;
            message: string;
            e?: object;
        }) => void;
        sendSdkPoint: (type: string, data: any, extra?: any) => void;
    });
    init(): void;
    /**
     * 处理数据：拆解并添加到缓存队列中
     * @param data TTSA 下发的数据
     */
    handleData(data: IRawFrameData[], type: EFrameDataType): Promise<void>;
    setVolume(volume: number): void;
    runStartFrameIndex(): void;
    stateChangeHandle(e: any): void;
    stopAudio(speech_id: number): void;
    render(): void;
    stop(): void;
    /**
     * 暂停渲染（停止渲染循环和音频播放）
     * 但继续接收和处理后端推送的数据并放入缓存队列，避免切换到在线时丢失数据导致丢帧
     */
    pauseRender(): void;
    /**
     * 恢复渲染
     */
    resumeRender(): void;
    /**
     * 切换隐身模式（暂停/恢复渲染）
     */
    switchInvisibleMode(): void;
    /**
     * 获取渲染状态
     */
    getRenderState(): RenderState;
    destroy(): void;
    handleFaceData(data: ITtsFaceFrameData[]): IRawFaceFrameData[];
    forceSyncDecoder(): void;
    _reload(): void;
    _getResumeInfo(): {
        client_frame: number;
        current_ani: string;
        current_ani_frame: number;
        next_state: string;
    };
    sendVoiceEnd(): void;
    _offlineMode(): void;
    _offlineRun(): void;
    ttsaStateChangeHandle(state: StateChangeInfo): void;
    resume(): void;
    /**
     * 设置数字人canvas的显隐状态
     * @param visible 是否可见
     */
    setAvatarCanvasVisible(visible: boolean): void;
    setCharacterCanvasLayout(layout?: Layout): void;
    setWalkConfig(walkConfig: WalkConfig): void;
    interrupt(type?: string): void;
}
