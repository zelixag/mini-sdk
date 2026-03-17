/**
 * 基于 MediaSource API 的 WebM 音频流式播放器
 */
export default class MediaSourceAudioPlayer {
    private TAG;
    private mediaSource;
    private audioElement;
    private sourceBuffer;
    private isInitialized;
    isPlaying: boolean;
    private volume;
    private readonly MIME_TYPE;
    private queue;
    private isUpdating;
    private logger;
    private currentObjectURL;
    private currentSpeechId;
    private firstFrameIndex;
    private pendingStartFrameIndex;
    constructor();
    /**
     * 清理旧的 MediaSource 资源
     */
    private cleanupMediaSource;
    /**
     * 创建并初始化 MediaSource
     */
    private createMediaSource;
    /**
     * 初始化 MediaSource 和 AudioElement
     * 每次播放都重新初始化
     */
    init(): void;
    /**
     * 添加音频段
     * @param audioData WebM 格式的音频数据（ArrayBuffer）
     * @param frameIndex 帧索引（用于对齐）
     * @param speechId 语音ID（用于区分不同的语音段）
     */
    addAudioSegment(audioData: ArrayBuffer, frameIndex?: number, speechId?: number): void;
    /**
     * 处理队列，将数据添加到 SourceBuffer
     */
    private processQueue;
    /**
     * 等待 SourceBuffer 准备好
     */
    private waitForSourceBuffer;
    /**
     * 等待缓冲区更新完成
     * 优化：等待更多数据缓冲，避免播放时卡顿
     */
    private waitForBufferUpdate;
    /**
     * 开始播放
     * @param frameIndex 当前帧索引（用于对齐）
     */
    start(frameIndex?: number): Promise<void>;
    /**
     * 停止播放（内部方法：清空队列、暂停音频、重置状态）
     */
    private stopPlayback;
    /**
     * 停止播放
     * @param speechId 语音ID（可选，用于确认停止的是当前播放的语音）
     */
    stop(speechId?: number): void;
    /**
     * 设置音量
     * @param volume 音量值（0-1）
     */
    setVolume(volume: number): void;
    /**
     * 获取统计信息
     */
    getStats(): {
        isPlaying: boolean;
        isInitialized: boolean;
        queueLength: number;
        bufferedRanges: string;
        mediaSourceReadyState: string;
    };
    /**
     * 获取缓冲范围
     */
    private getBufferedRanges;
    /**
     * 销毁播放器
     */
    destroy(): Promise<void>;
}
