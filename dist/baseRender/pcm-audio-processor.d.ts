declare class PCMAudioProcessor {
    static get parameterDescriptors(): {
        name: string;
        defaultValue: number;
        minValue: number;
        maxValue: number;
        automationRate: string;
    }[];
    config: {
        sampleRate: number;
        bytesPerSample: number;
    };
    pcmCache: Uint8Array;
    isActive: boolean;
    isDestroyed: boolean;
    fadeState: {
        phase: string;
        currentGain: number;
        fadeTime: number;
        fadeSamples: number;
    };
    currentSegment: Float32Array | null;
    segmentOffset: number;
    /**
     * 处理主线程发来的消息（PCM数据/状态控制等）
     * @param {Object} data - 消息数据
     * @param {string} data.type - 消息类型：'pcm'/'start'/'pause'/'stop'/'config'/'destroy'/'volume'
     * @param {Uint8Array} [data.pcmData] - PCM数据（仅type='pcm'时存在）
     * @param {Object} [data.config] - 配置更新（仅type='config'时存在）
     * @param {number} [data.volume] - 音量值（仅type='volume'时存在）
     */
    handleMainThreadMessage(data: {
        type: string;
        pcmData?: Uint8Array | undefined;
        config?: any;
        volume?: number | undefined;
    }): void;
    volume: number | undefined;
    /**
     * 重置当前音频段状态（暂停/停止时调用）
     */
    resetSegmentState(): void;
    /**
     * S16LE Uint8Array 转 Float32Array（-1~1范围）
     * @param {Uint8Array} pcmData - PCM数据
     * @returns {Float32Array} 转换后的音频样本
     */
    pcmToFloat32(pcmData: Uint8Array): Float32Array;
    /**
     * 计算当前样本的增益（淡入淡出）
     * @param {number} segmentLength - 当前音频段的总样本数
     * @returns {number} 增益值（0~1）
     */
    calculateGain(segmentLength: number): number;
    /**
     * AudioWorklet核心方法：实时生成音频样本（音频线程调用）
     * @param {Float32Array[][]} inputs - 输入样本
     * @param {Float32Array[][]} outputs - 输出样本（单声道）
     * @param {Object} parameters - 音频参数
     * @returns {boolean} 是否继续运行
     */
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: any): boolean;
}
