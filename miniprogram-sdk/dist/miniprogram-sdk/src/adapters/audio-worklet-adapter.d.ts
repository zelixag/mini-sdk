/**
 * Audio Worklet 适配器 - 小程序版本（熵减优化）
 *
 * 说明：小程序不支持 Audio Worklet API，提供降级实现
 * Web SDK 使用 Audio Worklet 进行音频处理，小程序环境需要降级到主线程处理
 *
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，仅处理 Audio Worklet 降级
 * 2. 系统秩序：清晰的降级策略
 * 3. 抽象层次：隐藏平台差异，提供统一接口
 * 4. 负熵实现：最小化性能影响，保持功能可用
 */
/**
 * Audio Worklet 降级实现
 * 小程序不支持 Audio Worklet，使用主线程处理
 */
export declare class AudioWorkletAdapter {
    private processor;
    constructor();
    /**
     * 注册处理器（降级实现）
     */
    registerProcessor(name: string, processorCtor: any): void;
    /**
     * 处理音频数据（降级实现）
     */
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): void;
    /**
     * 设置处理器函数
     */
    setProcessor(processor: (inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) => void): void;
}
/**
 * 创建 Audio Worklet 适配器实例
 */
export declare function createAudioWorkletAdapter(): AudioWorkletAdapter;
export default AudioWorkletAdapter;
