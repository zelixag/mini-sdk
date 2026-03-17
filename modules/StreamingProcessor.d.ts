import { ErrorHandler } from '../control/ErrorHandler';
interface IStreamingProcessorOptions {
    frameSkip?: number;
    onFrame?: (frame: any) => void;
    onEnd?: () => void;
    onError?: (error: string) => void;
    errorHandler: ErrorHandler;
}
/**
 * 负责处理视频流、解码和抽帧。
 */
export default class StreamingProcessor {
    private TAG;
    private frameSkip;
    private worker;
    private onFrameCallback?;
    private onEndCallback?;
    private onErrorCallback?;
    private errorHandler;
    /**
     * @param {object} options 配置选项
     * @param {number} options.frameSkip - 每隔多少帧取一帧。1表示不抽帧。
     * @param {function(VideoFrame): void} [options.onFrame] - 收到一帧后的回调。
     * @param {function(): void} [options.onEnd] - 视频流处理结束的回调。
     * @param {function(string): void} [options.onError] - 发生错误时的回调。
     */
    constructor(options: IStreamingProcessorOptions);
    /**
     * 初始化并启动Worker
     */
    init(config?: {
        animationStartFrame?: number;
        animationEndFrame?: number;
    }): void;
    /**
     * 向Worker追加视频数据块。
     * @param {ArrayBuffer} data - 从socket收到的视频数据块。
     */
    appendData(data: ArrayBuffer): void;
    /**
     * 通知Worker视频流已结束。
     */
    streamEnded(): void;
    /**
     * 终止Worker并清理资源。
     */
    terminate(): void;
}
export {};
