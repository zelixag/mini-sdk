/**
 * Decoder - 视频解码器 for Mini Program
 * 负责从视频 URL 解码出帧图像
 */
export interface DecoderOptions {
    hardwareAcceleration?: string;
    onMessage?: (message: any) => void;
}
export interface DecodedFrame {
    frame: any;
    index: number;
    width: number;
    height: number;
}
export interface VideoData {
    name: string;
    url: string;
    body_id: number;
    id: number;
    sf: number;
    ef: number;
    startFrameIndex: number;
    endFrameIndex: number;
    frameRate?: number;
}
/**
 * Decoder - 视频解码器
 * 使用小程序视频组件解码视频帧
 */
export declare class Decoder {
    private TAG;
    private options;
    private decodingTasks;
    private maxParallelDecodes;
    private decodeQueue;
    constructor(options?: DecoderOptions);
    /**
     * 解码视频帧
     */
    decode(videoData: VideoData, frameCallback: (file: VideoData, frame: any, index: number) => void, doneCallback?: (file: VideoData) => void): void;
    /**
     * 使用小程序视频上下文解码
     */
    private decodeWithVideoContext;
    /**
     * 提取帧
     */
    private extractFrames;
    /**
     * 捕获帧
     */
    private captureFrame;
    /**
     * 取消解码
     */
    abort(taskId?: string): void;
    /**
     * 取消单个视频解码
     */
    abortOne(taskId: string): void;
    /**
     * 获取任务 ID
     */
    private getTaskId;
    /**
     * 同步解码（用于断线重连）
     */
    syncDecode(frameIndex: number): void;
    /**
     * 离线模式解码
     */
    _offLineMode(offlineData: any, frame: number): void;
    /**
     * 离线模式运行
     */
    _offlineRun(): void;
    /**
     * 重新加载
     */
    _reload(): void;
    /**
     * 销毁
     */
    destroy(): void;
}
/**
 * ParallelDecoder - 并行解码器
 * 支持多视频并行解码
 */
export declare class ParallelDecoder {
    private TAG;
    private decoder;
    private activeDecodes;
    constructor(options?: DecoderOptions);
    /**
     * 解码视频
     */
    decode(videoList: VideoData[], frameCallback: (file: VideoData, frame: any, index: number) => void, doneCallback?: (file: VideoData) => void): void;
    /**
     * 尝试开始下一个解码任务
     */
    _tryStartNext(): void;
    /**
     * 同步解码
     */
    syncDecode(frameIndex: number): void;
    /**
     * 取消所有解码
     */
    abort(): void;
    /**
     * 取消单个解码
     */
    abortOne(taskId: string): void;
    /**
     * 重新加载
     */
    _reload(): void;
    /**
     * 离线模式
     */
    _offLineMode(data: any, frame: number): void;
    /**
     * 离线运行
     */
    _offlineRun(): void;
    /**
     * 销毁
     */
    destroy(): void;
}
declare const _default: {
    Decoder: typeof Decoder;
    ParallelDecoder: typeof ParallelDecoder;
};
export default _default;
