/**
 * 简化版PCM音频播放器（24kHz采样率、S16LE单声道）
 * 新增功能：播放结束后持续检测新音频，自动续播
 */
export default class PCMAudioPlayer {
    readonly SAMPLE_RATE: number;
    readonly FRAME_ALIGNMENT: number;
    readonly CHECK_INTERVAL: number;
    audioCtx: AudioContext | null;
    pcmStash: Uint8Array;
    activeSources: AudioBufferSourceNode[];
    playTime: number;
    isPlaying: boolean;
    isInitialized: boolean;
    checkTimer: number | null;
    /**
     * 初始化音频上下文（需在用户交互中调用）
     * @returns {Promise<void>} 初始化结果
     */
    init(): Promise<void>;
    /**
     * 接收PCM音频流（仅缓存，不触发播放）
     * @param {Uint8Array} pcmData - 24kHz S16LE单声道PCM数据
     */
    receivePCMStream(pcmData: Uint8Array): void;
    /**
     * 开始播放（核心触发方法）
     * - 首次调用：恢复AudioContext + 处理缓存 + 启动检测定时器
     * - 暂停后调用：恢复AudioContext + 继续播放 + 重启检测定时器
     * @returns {Promise<void>} 播放启动结果
     */
    start(): Promise<void>;
    /**
     * 暂停播放（停止所有活跃音频源，挂起上下文，关闭检测定时器）
     * @returns {Promise<void>} 暂停结果
     */
    pause(): Promise<void>;
    stop(): Promise<void>;
    /**
     * 销毁播放器（释放所有音频资源，不可恢复）
     * @returns {Promise<void>} 销毁结果
     */
    destroy(): Promise<void>;
    /**
     * 【内部方法】处理缓存中的PCM数据（凑齐长度则播放）
     */
    private processCachedData;
    /**
     * 【内部方法】处理对齐后的PCM数据，转换并调度播放
     */
    private playAlignedPCM;
    /**
     * 【内部方法】S16LE格式PCM转AudioBuffer
     * @param {Uint8Array} pcmData - 对齐后的PCM数据
     * @returns {AudioBuffer|null} 转换后的音频缓冲区
     */
    private createBufferFromPCM;
    /**
     * 【内部方法】调度AudioBuffer播放（淡入淡出消爆音，避免重叠）
     * @param {AudioBuffer} audioBuffer - 待播放的音频缓冲区
     */
    private scheduleAudioPlay;
    /**
     * 【内部方法】启动新音频检测定时器（100ms间隔）
     */
    private startCheckTimer;
    /**
     * 【内部方法】停止新音频检测定时器
     */
    private stopCheckTimer;
    /**
     * 【辅助方法】获取当前播放器状态
     * @returns {Object} 状态对象
     */
    getStatus(): {
        isInitialized: boolean;
        isPlaying: boolean;
        cachedDataSize: number;
        isChecking: boolean;
    };
}
