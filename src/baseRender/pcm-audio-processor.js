// pcm-audio-processor.js - 运行在音频线程的Worklet处理器
class PCMAudioProcessor extends AudioWorkletProcessor {
  // 音量配置（与主线程保持一致）
  static get parameterDescriptors() {
    return [
      {
        name: 'volume',
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'a-rate' // 支持音频速率自动化
      }
    ];
  }

  constructor() {
    super();
    this.config = {
      sampleRate: 24000, // 固定24kHz采样率
      bytesPerSample: 2, // S16LE=2字节/采样点
    };
    this.pcmCache = new Uint8Array(0); // Worklet内的PCM缓存
    this.isActive = false; // 播放音频状态（控制是否生成声音）
    this.isDestroyed = false;
    this.fadeState = {
      // 淡入淡出状态（避免片段切换爆音）
      phase: 'idle', // idle/fadeIn/fadeOut/steady
      currentGain: 0,
      fadeTime: 0.01, // 淡入淡出时间（秒，建议最小0.01s避免爆音）
      fadeSamples: Math.floor(0.01 * 24000), // 淡入淡出样本数（24000Hz下为240样本）
    };
    this.currentSegment = null; // 当前处理的音频段（float32数组）
    this.segmentOffset = 0; // 当前音频段的播放偏移量
    
    // 监听主线程消息（接收PCM数据、状态控制等）
    this.port.onmessage = (e) => this.handleMainThreadMessage(e.data);
    
    // 初始化淡入淡出样本数
    this.fadeState.fadeSamples = Math.floor(this.fadeState.fadeTime * this.config.sampleRate);
  }

  /**
   * 处理主线程发来的消息（PCM数据/状态控制等）
   * @param {Object} data - 消息数据
   * @param {string} data.type - 消息类型：'pcm'/'start'/'pause'/'stop'/'config'/'destroy'/'volume'
   * @param {Uint8Array} [data.pcmData] - PCM数据（仅type='pcm'时存在）
   * @param {Object} [data.config] - 配置更新（仅type='config'时存在）
   * @param {number} [data.volume] - 音量值（仅type='volume'时存在）
   */
  handleMainThreadMessage(data) {
    switch (data.type) {
      // 接收主线程下发的PCM流数据
      case 'pcm':
        if (data.pcmData instanceof Uint8Array && data.pcmData.length > 0) {
          // 确保PCM数据字节数为2的整数倍（S16LE要求）
          const validLength = data.pcmData.length - (data.pcmData.length % this.config.bytesPerSample);
          if (validLength <= 0) break;
          
          // 合并到Worklet缓存
          const newCache = new Uint8Array(this.pcmCache.length + validLength);
          newCache.set(this.pcmCache, 0);
          newCache.set(data.pcmData.subarray(0, validLength), this.pcmCache.length);
          this.pcmCache = newCache;
          
          // 向主线程发送缓存状态
          this.port.postMessage({
            type: 'cacheStatus',
            size: this.pcmCache.length,
            sampleCount: this.pcmCache.length / this.config.bytesPerSample
          });
        }
        break;

      // 启动播放（继续音频生成）
      case 'start':
        this.isActive = true;
        break;

      // 暂停播放（停止音频生成，保留缓存）
      case 'pause':
        this.isActive = false;
        this.resetSegmentState();
        break;

      // 停止播放（清空缓存+重置状态）
      case 'stop':
        this.isActive = false;
        this.pcmCache = new Uint8Array(0);
        this.resetSegmentState();
        break;

      // 更新配置（如采样率/淡入淡出时间）
      case 'config':
        if (data.config.sampleRate) {
          this.config.sampleRate = data.config.sampleRate;
          // 重新计算淡入淡出样本数
          this.fadeState.fadeSamples = Math.floor(this.fadeState.fadeTime * this.config.sampleRate);
        }
        if (data.config.fadeTime) {
          this.fadeState.fadeTime = data.config.fadeTime;
          this.fadeState.fadeSamples = Math.floor(this.fadeState.fadeTime * this.config.sampleRate);
        }
        break;

      // 单独更新音量（可选，也可通过参数自动化控制）
      case 'volume':
        this.volume = Number(data.volume);
        // 通知主线程同步AudioWorkletNode的parameters
        this.port.postMessage({
          type: 'syncVolume',
          volume: this.volume
        });
        break;

      // 销毁处理器
      case 'destroy':
        this.isDestroyed = true;
        this.isActive = false;
        this.pcmCache = new Uint8Array(0);
        this.resetSegmentState();
        this.port.postMessage({ type: 'destroyConfirmed' });
        break;
  
      default:
    }
  }

  /**
   * 重置当前音频段状态（暂停/停止时调用）
   */
  resetSegmentState() {
    this.currentSegment = null;
    this.segmentOffset = 0;
    this.fadeState.phase = 'idle';
    this.fadeState.currentGain = 0;
  }

  /**
   * S16LE Uint8Array 转 Float32Array（-1~1范围）
   * @param {Uint8Array} pcmData - PCM数据
   * @returns {Float32Array} 转换后的音频样本
   */
  pcmToFloat32(pcmData) {
    const sampleCount = pcmData.length / this.config.bytesPerSample;
    const floatData = new Float32Array(sampleCount);
    const dataView = new DataView(pcmData.buffer);

    for (let i = 0; i < sampleCount; i++) {
      // S16LE格式：小端序解析，范围-32768~32767 归一化到-1~1
      floatData[i] = dataView.getInt16(i * this.config.bytesPerSample, true) / 32768;
    }
    return floatData;
  }

  /**
   * 计算当前样本的增益（淡入淡出）
   * @param {number} segmentLength - 当前音频段的总样本数
   * @returns {number} 增益值（0~1）
   */
  calculateGain(segmentLength) {
    const { phase, fadeSamples } = this.fadeState;
    const { segmentOffset } = this;

    // 边界保护：防止无效值导致的NaN
    if (typeof segmentOffset !== 'number' || typeof segmentLength !== 'number' || segmentLength <= 0) {
      return 0;
    }

    switch (phase) {
      // 淡入阶段：从0线性增加到1
      case 'fadeIn':
        if (segmentOffset >= fadeSamples) {
          this.fadeState.phase = 'steady';
          return 1;
        }
        return segmentOffset / fadeSamples;

      // 稳定阶段：增益保持1
      case 'steady':
        // 检测是否进入淡出阶段（接近段尾）
        if (segmentOffset >= segmentLength - fadeSamples) {
          this.fadeState.phase = 'fadeOut';
        }
        return 1;

      // 淡出阶段：从1线性降低到0.0001（避免分音）
      case 'fadeOut':
        const fadeStart = Math.max(segmentLength - fadeSamples, 0);
        const fadeProgress = (segmentOffset - fadeStart) / fadeSamples;
        return Math.max(1 - fadeProgress, 0.0001);

      // 空闲阶段：增益0
      case 'idle':
      default:
        return 0;
    }
  }

  /**
   * AudioWorklet核心方法：实时生成音频样本（音频线程调用）
   * @param {Float32Array[][]} inputs - 输入样本
   * @param {Float32Array[][]} outputs - 输出样本（单声道）
   * @param {Object} parameters - 音频参数
   * @returns {boolean} 是否继续运行
   */
  process(inputs, outputs, parameters) {
    // 销毁状态：终止处理
    if (this.isDestroyed) {
      if (outputs.length > 0 && outputs[0].length > 0) {
        outputs[0][0].fill(0);
      }
      return false;
    }

    // 未激活或无输出：返回静音
    if (!this.isActive || outputs.length === 0 || outputs[0].length === 0) {
      outputs[0][0].fill(0);
      return true;
    }

    const outputBuffer = outputs[0][0];
    const bufferLength = outputBuffer.length;
    // 获取音量参数（支持自动化）
    const volume = parameters.volume.length > 1 
      ? parameters.volume // 自动化模式：每个样本点可能有不同值
      : parameters.volume[0]; // 控制模式：整个缓冲区使用相同值

    // 生成输出样本
    for (let i = 0; i < bufferLength; i++) {
      // 如当前无音频段且缓存有数据，创建新段
      if (!this.currentSegment && this.pcmCache.length > 0) {
        // 使用缓存中的所有数据创建新段
        this.currentSegment = this.pcmToFloat32(this.pcmCache);
        // 清空缓存（已处理）
        this.pcmCache = new Uint8Array(0);
        this.segmentOffset = 0;
        // 根据前一段状态决定是否淡入
        this.fadeState.phase = this.fadeState.phase === 'fadeOut' ? 'steady' : 'fadeIn';
      }

      // 生成当前样本
      let sample = 0;
      if (this.currentSegment) {
        const segmentLength = this.currentSegment.length;
        // 确保偏移量有效
        if (this.segmentOffset < segmentLength) {
          const gain = this.calculateGain(segmentLength);
          // 应用淡入淡出增益和音量控制
          sample = this.currentSegment[this.segmentOffset] * gain * volume;
          this.segmentOffset++;
        } else {
          // 当前段处理完毕，重置
          this.currentSegment = null;
          this.segmentOffset = 0;
          this.fadeState.phase = 'idle';
        }
      }

      outputBuffer[i] = sample;
    }

    return true;
  }
}

// 注册Worklet处理器
registerProcessor('pcm-audio-processor', PCMAudioProcessor);
