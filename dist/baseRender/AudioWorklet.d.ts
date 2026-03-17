/**
 * Web Audio Worklet版PCM流式播放器（24kHz采样率、S16LE单声道）
 * 核心：无定时器，依赖AudioWorklet的process方法实时处理流式数据
 */
export default class PCMAudioPlayer {
    readonly SAMPLE_RATE: number;
    readonly FRAME_ALIGNMENT: number;
    readonly WORKLET_SCRIPT_URL: string;
    audioCtx: AudioContext | null;
    audioWorkletNode: AudioWorkletNode | null;
    isInitialized: boolean;
    isPlaying: boolean;
    private destroyResolve;
    /**
     * 初始化（加载Worklet + 创建AudioContext + 连接节点）
     * @returns {Promise<void>} 初始化结果（需用户交互中调用）
     */
    init(): Promise<void>;
    /**
     * 接收PCM音频流（流式下发到Worklet，无本地缓存）
     * @param {Uint8Array} pcmData - 24kHz S16LE单声道PCM数据
     */
    receivePCMStream(pcmData: Uint8Array): void;
    /**
     * 开始播放（激活Worklet的音频生成）
     * @returns {Promise<void>} 启动结果
     */
    start(): Promise<void>;
    /**
     * 暂停播放（停止Worklet音频生成，保留缓存）
     */
    pause(): void;
    /**
     * 停止播放（清空Worklet缓存，重置状态）
     */
    stop(): void;
    /**
     * 销毁播放器（释放所有音频资源，不可恢复）
     * @returns {Promise<void>} 销毁结果
     */
    destroy(): Promise<void>;
    /**
     * 获取当前播放器状态
     * @returns {Object} 状态对象
     */
    getStatus(): {
        isInitialized: boolean;
        isPlaying: boolean;
        isWorkletReady: boolean;
    };
    setVolume(valume: number): void;
    /**
     * @returns {Promise<void>} 恢复结果
     */
    resume(): Promise<void>;
}
