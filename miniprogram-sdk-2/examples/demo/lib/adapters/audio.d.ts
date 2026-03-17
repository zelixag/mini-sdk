/**
 * Audio Adapter for Mini Program
 * 封装微信小程序音频 API，支持 PCM 音频播放
 */
export interface AudioAdapterOptions {
    autoplay?: boolean;
    loop?: boolean;
    volume?: number;
}
/**
 * 音频上下文管理器
 */
export declare class AudioAdapter {
    private audioContext;
    private innerAudioContext;
    private audioBuffer;
    private sourceNode;
    private gainNode;
    private isPlaying;
    private volume;
    private onEndedCallback;
    private onErrorCallback;
    constructor(options?: AudioAdapterOptions);
    /**
     * 初始化音频上下文
     */
    private initAudioContext;
    /**
     * 设置音频源 (支持 PCM 或 URL)
     */
    setSource(src: string | ArrayBuffer): void;
    /**
     * 解码 PCM 数据
     */
    private decodeAudioData;
    /**
     * 播放音频
     */
    play(): void;
    /**
     * 暂停音频
     */
    pause(): void;
    /**
     * 停止音频
     */
    stop(): void;
    /**
     * 跳转
     */
    seek(time: number): void;
    /**
     * 设置音量
     */
    setVolume(volume: number): void;
    /**
     * 获取音量
     */
    getVolume(): number;
    /**
     * 设置播放结束回调
     */
    onEnded(callback: () => void): void;
    /**
     * 设置错误回调
     */
    onError(callback: (error: any) => void): void;
    /**
     * 获取播放状态
     */
    getIsPlaying(): boolean;
    /**
     * 获取当前播放时间
     */
    getCurrentTime(): number;
    /**
     * 获取音频时长
     */
    getDuration(): number;
    /**
     * 销毁
     */
    destroy(): void;
}
export default AudioAdapter;
