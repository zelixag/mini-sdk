import ResourceManager from "../modules/ResourceManager";
import { EFrameDataType, IRawFrameData, IRawFaceFrameData } from "types/frame-data";
import { ErrorHandler } from "./ErrorHandler";
export default class RenderScheduler {
    private TAG;
    private dataCacheQueue;
    private avatarRenderer;
    private audioRenderer;
    private uiRenderer;
    private composition;
    private resourceManager;
    private frameAnimationController;
    private errorHandler;
    private isStartPlay;
    private currentVideoProcessor;
    private nextVideoProcessor;
    private currentVideoInfo;
    private nextVideoInfo;
    constructor(config: {
        container: Element;
        resourceManager: ResourceManager;
        errorHandler: ErrorHandler;
    });
    private createVideoProcessor;
    init(): void;
    /**
     * 处理数据：拆解并添加到缓存队列中
     * @param data TTSA 下发的数据
     */
    handleData(data: IRawFrameData[], type: EFrameDataType): Promise<void>;
    private processVideoQueue;
    private startNextVideo;
    runStartFrameIndex(client_time: number): void;
    stateChangeHandle(e: any): void;
    getCurrentState(): string;
    render(): void;
    stop(): void;
    destroy(): void;
    handleFaceData(data: IRawFaceFrameData[]): IRawFaceFrameData[];
}
