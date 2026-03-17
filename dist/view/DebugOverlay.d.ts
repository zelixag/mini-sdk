import { type SDKError } from "../types/error";
import { type ISessionResponse } from "../modules/ResourceManager";
/**
 * 调试信息浮层
 */
export declare class DebugOverlay {
    private container;
    private sdk;
    private sessionInfo;
    private startTime;
    private updateInterval;
    private errors;
    private fps;
    private frameCount;
    private lastFpsUpdate;
    private videoInfo;
    private audioInfo;
    private eventInfo;
    private memoryInfo;
    private perfMetrics;
    private currentFrameIndex;
    constructor(sdk: any, sessionInfo: ISessionResponse);
    setAudioInfo(info: {
        sf: number;
        ef: number;
        ad: Uint8Array;
    }): void;
    setEventData(info: {
        sf: number;
        ef: number;
        event: Array<any>;
    }): void;
    addError(error: SDKError): void;
    /**
     * 显示浮层
     */
    show(): void;
    /**
     * 隐藏浮层
     */
    hide(): void;
    /**
     * 销毁浮层和定时器
     */
    destroy(): void;
    setVideoInfo(info: any): void;
    /**
     * 更新浮层内容
     */
    private update;
    private formatErrors;
    private formatPerfMetrics;
    private trackFPS;
    private trackMemory;
    /**
     * 创建DOM元素
     */
    private createOverlay;
    /**
     * 应用CSS样式
     * @param element
     */
    private applyStyles;
    private enableDrag;
}
