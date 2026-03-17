import { ErrorHandler } from "../control/ErrorHandler";
import { IRawBodyFrameData } from "../types/frame-data";
import ResourceManager from "./ResourceManager";
import { IBodyFrame } from "../control/DataCacheQueue";
export interface IVideoProcessorConfig {
    resourceManager: ResourceManager;
    errorHandler: ErrorHandler;
    onFrameProcessed: (data: IBodyFrame) => void;
    onVideoProcessed: () => void;
}
export declare class VideoProcessor {
    private config;
    private processor;
    private resourceManager;
    private errorHandler;
    private currentVideo;
    private videoIndexObj;
    private isProcessing;
    constructor(config: IVideoProcessorConfig);
    private onError;
    private onVideoFrame;
    private onVideoEnd;
    processVideo(video: IRawBodyFrameData): Promise<void>;
    isVideoProcessing(): boolean;
    destroy(): void;
}
