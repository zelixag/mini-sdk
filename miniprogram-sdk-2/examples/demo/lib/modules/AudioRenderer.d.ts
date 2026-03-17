/**
 * AudioRenderer - 音频渲染器 for Mini Program
 * 负责 TTS 音频的播放控制
 */
export interface AudioRendererOptions {
    onMessage?: (message: any) => void;
}
export interface AudioData {
    sf: number;
    ef: number;
    ad: Uint8Array;
    sid: number;
}
/**
 * AudioRenderer - 音频渲染器
 * 负责:
 * - 音频数据缓存
 * - 音频播放控制
 * - 音量管理
 */
export declare class AudioRenderer {
    private TAG;
    private options;
    private audioAdapter;
    private audioQueue;
    private currentAudio;
    private isPlaying;
    private volume;
    private speech_id;
    private currentFrame;
    private onVoiceStartCallback?;
    private onVoiceEndCallback?;
    constructor(options?: AudioRendererOptions);
    /**
     * 初始化音频
     */
    private initAudio;
    /**
     * 更新音频数据
     */
    updateAudioData(data: AudioData[]): void;
    /**
     * 查找当前帧对应的音频
     */
    private findAudioForFrame;
    /**
     * 播放音频
     */
    private playAudio;
    /**
     * 音频播放结束
     */
    private onAudioEnded;
    /**
     * 播放下一个音频
     */
    private playNextAudio;
    /**
     * 设置音量
     */
    setVolume(volume: number): void;
    /**
     * 获取音量
     */
    getVolume(): number;
    /**
     * 停止播放
     */
    stop(speech_id?: number): void;
    /**
     * 暂停
     */
    pause(): void;
    /**
     * 恢复播放
     */
    resume(): void;
    /**
     * 设置当前帧
     */
    setCurrentFrame(frame: number): void;
    /**
     * 设置语音开始回调
     */
    onVoiceStart(callback: (duration: number, speech_id: number) => void): void;
    /**
     * 设置语音结束回调
     */
    onVoiceEnd(callback: (speech_id: number) => void): void;
    /**
     * 获取播放状态
     */
    getIsPlaying(): boolean;
    /**
     * 获取当前语音 ID
     */
    getSpeechId(): number;
    /**
     * 销毁
     */
    destroy(): void;
}
export default AudioRenderer;
