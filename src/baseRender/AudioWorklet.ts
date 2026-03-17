const pcm_audio_script = `// pcm-audio-processor.js - 运行在音频线程的Worklet处理器
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
        console.warn('[PCMAudioProcessor] 未知消息类型:', data.type);
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
`
const workletBlob = new Blob([pcm_audio_script], { type: 'application/javascript' });
const workletUrl = URL.createObjectURL(workletBlob);
/**
 * Web Audio Worklet版PCM流式播放器（24kHz采样率、S16LE单声道）
 * 核心：无定时器，依赖AudioWorklet的process方法实时处理流式数据
 */
export default class PCMAudioPlayer {
  // 常量配置（与Worklet保持一致）
  readonly SAMPLE_RATE: number = 24000;
  readonly FRAME_ALIGNMENT: number = 2000; // 帧对齐字节数
  readonly WORKLET_SCRIPT_URL: string = workletUrl; // 改为本地引入，内网客户无法使用远程资源
  // readonly WORKLET_SCRIPT_URL: string = 'http://localhost:5173/pcm-audio-processor.js'; // Worklet脚本路径（需与HTML同域）

  // 实例状态与资源
  audioCtx: AudioContext | null = null;
  audioWorkletNode: AudioWorkletNode | null = null; // Worklet节点（主线程与Worklet通信桥梁）
  isInitialized: boolean = false; // 初始化状态（Worklet加载完成）
  isPlaying: boolean = false; // 播放状态标记
  private destroyResolve: (() => void) | null = null;

  /**
   * 初始化（加载Worklet + 创建AudioContext + 连接节点）
   * @returns {Promise<void>} 初始化结果（需用户交互中调用）
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    // 1. 浏览器兼容性处理
    const AudioContextConstructor =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextConstructor || !window.AudioWorklet) {
      throw new Error("当前浏览器不支持Web Audio Worklet，无法实现流式播放");
    }

    // 2. 创建AudioContext（24kHz采样率）
    this.audioCtx = new AudioContextConstructor({
      sampleRate: this.SAMPLE_RATE,
    });
    const logger = (window as any).avatarSDKLogger || console;

    try {
      // 3. 加载Worklet脚本（必须先加载，再创建节点）
      await this.audioCtx.audioWorklet.addModule(this.WORKLET_SCRIPT_URL);
      logger.log(
        `[PCMAudioPlayer] Worklet脚本加载完成: ${this.WORKLET_SCRIPT_URL}`
      );

      // 4. 创建Worklet节点（指定处理器名称，与Worklet中registerProcessor一致）
      this.audioWorkletNode = new AudioWorkletNode(
        this.audioCtx,
        "pcm-audio-processor" // 必须与Worklet中注册的名称一致
      );

      // 5. 连接音频链路：WorkletNode → 扬声器（destination）
      this.audioWorkletNode.connect(this.audioCtx.destination);
      logger.log("[PCMAudioPlayer] Worklet节点已连接到扬声器");

      // 6. 监听Worklet发来的消息（如缓存状态、错误）
      this.audioWorkletNode.port.onmessage = (e) => {
        switch (e.data.type) {
          case "cacheStatus":
            // logger.log(`[PCMAudioPlayer] Worklet缓存状态: ${e.data.size}字节`);
            break;
          case "error":
            logger.error(`[PCMAudioPlayer] Worklet错误:`, e.data.detail);
            break;
          case "destroyConfirmed":
            // logger.log(`[PCMAudioPlayer] Worklet已确认销毁`);
            this.destroyResolve?.(); // 触发销毁等待的Promise
            break;
          case "syncVolume":
            // 同步音量到AudioWorkletNode的parameters
            if (
              this.audioWorkletNode?.parameters?.get("volume")?.value !==
              undefined
            ) {
              this.audioWorkletNode.parameters.get("volume")!.value =
                e.data.volume;
            }
            break;
          default:
          // logger.log(`[PCMAudioPlayer] Worklet消息:`, e.data);
        }
      };

      // 7. 标记初始化完成
      this.isInitialized = true;
      // logger.log('[PCMAudioPlayer] 播放器初始化完成（Worklet就绪）');
    } catch (err) {
      logger.error("[PCMAudioPlayer] 初始化失败:", err);
      throw err; // 抛出错误，让业务层处理
    }
  }

  /**
   * 接收PCM音频流（流式下发到Worklet，无本地缓存）
   * @param {Uint8Array} pcmData - 24kHz S16LE单声道PCM数据
   */
  receivePCMStream(pcmData: Uint8Array): void {
    const logger = (window as any).avatarSDKLogger || console;

    // 1. 前置校验
    if (!this.isInitialized || !this.audioWorkletNode) {
      logger.error("[PCMAudioPlayer] 播放器未初始化，无法接收PCM数据");
      return;
    }
    if (!(pcmData instanceof Uint8Array)) {
      logger.error("[PCMAudioPlayer] 输入PCM数据必须是非空的Uint8Array");
      return;
    }
    // logger.log(`[PCMAudioPlayer] 已下发PCM数据: ${pcmData.length}字节`);

    // 2. 下发PCM数据到Worklet（通过postMessage，数据会被转移/复制到音频线程）
    try {
      this.audioWorkletNode.port.postMessage(
        {
          type: "pcm",
          pcmData: pcmData, // Worklet中会合并到缓存
        },
        [pcmData.buffer] // 可选：Transferable对象，避免数据复制（提升性能）
      );
    } catch (err) {
      logger.error("[PCMAudioPlayer] 下发PCM数据到Worklet失败:", err);
    }
  }

  /**
   * 开始播放（激活Worklet的音频生成）
   * @returns {Promise<void>} 启动结果
   */
  async start(): Promise<void> {
    if (!this.isInitialized || !this.audioCtx || !this.audioWorkletNode) {
      throw new Error("[PCMAudioPlayer] 请先调用init()初始化播放器");
    }
    const logger = (window as any).avatarSDKLogger || console;

    // 1. 恢复AudioContext（需用户交互，否则抛异常）
    if (this.audioCtx.state !== "running") {
      await this.audioCtx.resume();
      // logger.log('[PCMAudioPlayer] AudioContext已恢复运行');
    }

    // 2. 发送start消息给Worklet（激活音频生成）
    this.audioWorkletNode.port.postMessage({ type: "start" });
    this.isPlaying = true;
    // logger.log('[PCMAudioPlayer] 已启动播放（Worklet激活）');
  }

  /**
   * 暂停播放（停止Worklet音频生成，保留缓存）
   */
  pause(): void {
    if (!this.isInitialized || !this.audioWorkletNode) return;
    const logger = (window as any).avatarSDKLogger || console;

    // 发送pause消息给Worklet
    this.audioWorkletNode.port.postMessage({ type: "pause" });
    this.isPlaying = false;
    // logger.log('[PCMAudioPlayer] 已暂停播放（Worklet暂停）');
  }

  /**
   * 停止播放（清空Worklet缓存，重置状态）
   */
  stop(): void {
    if (!this.isInitialized || !this.audioWorkletNode) return;
    const logger = (window as any).avatarSDKLogger || console;

    // 发送stop消息给Worklet
    this.audioWorkletNode.port.postMessage({ type: "stop" });
    this.isPlaying = false;
    // logger.log('[PCMAudioPlayer] 已停止播放（Worklet缓存清空）');
  }

  /**
   * 销毁播放器（释放所有音频资源，不可恢复）
   * @returns {Promise<void>} 销毁结果
   */
  async destroy(): Promise<void> {
    const logger = (window as any).avatarSDKLogger || console;

    // 1. 若未初始化/已销毁，直接返回
    if (!this.isInitialized || !this.audioCtx || !this.audioWorkletNode) {
      // logger.log('[PCMAudioPlayer] 播放器未初始化或已销毁');
      return;
    }

    // 2. 发送销毁指令给Worklet，并等待确认
    await new Promise<void>((resolve) => {
      this.destroyResolve = resolve; // 绑定resolve函数
      // 发送销毁消息（触发Worklet内的#isDestroyed=true）
      this.audioWorkletNode?.port.postMessage({ type: "destroy" });
      // 超时容错：300ms未确认则强制继续（避免Worklet无响应）
      const timeout = setTimeout(() => {
        logger.warn("[PCMAudioPlayer] Worklet销毁超时，强制释放资源");
        this.destroyResolve?.();
      }, 300);
      // 确认后清除超时
      if (this.audioWorkletNode) {
        this.audioWorkletNode.port.onmessage = (e) => {
          if (e.data.type === "destroyConfirmed") {
            clearTimeout(timeout);
            this.destroyResolve?.();
          }
        };
      }
    });

    // 3. 断开Worklet节点连接（此时Worklet已终止执行）
    this.audioWorkletNode.disconnect();
    this.audioWorkletNode.port.close();
    this.audioWorkletNode = null;

    // 4. 关闭AudioContext（确保音频线程资源释放）
    if (this.audioCtx.state !== "closed") {
      await this.audioCtx.close();
    }
    this.audioCtx = null;
    // logger.log('[PCMAudioPlayer] AudioContext已关闭');

    // 5. 重置所有状态
    this.isInitialized = false;
    this.isPlaying = false;
    this.destroyResolve = null;
    logger.log("[PCMAudioPlayer] 播放器已完全销毁，所有资源释放完成");
  }

  /**
   * 获取当前播放器状态
   * @returns {Object} 状态对象
   */
  getStatus(): {
    isInitialized: boolean;
    isPlaying: boolean;
    isWorkletReady: boolean;
  } {
    return {
      isInitialized: this.isInitialized,
      isPlaying: this.isPlaying,
      isWorkletReady: !!this.audioWorkletNode, // Worklet节点是否就绪
    };
  }

  setVolume(valume: number) {
    if (this.isInitialized && this.audioWorkletNode) {
      this.audioWorkletNode.port.postMessage({
        type: "volume",
        volume: valume,
      });
    }
  }

  /**
   * @returns {Promise<void>} 恢复结果
   */
  async resume(): Promise<void> {
    const logger = (window as any).avatarSDKLogger || console;
    try {
      if (this.audioCtx?.state === "suspended") {
        this.audioCtx
          .resume()
          .then(() => {
            (window as any).avatarSDKLogger.info("worklet音频上下文恢复成功");
          })
          .catch((error) => {
            (window as any).avatarSDKLogger.error(
              "worklet音频上下文恢复失败:",
              error
            );
          });
      }
    } catch (err) {
      logger.error("[PCMAudioPlayer] worklet恢复播放失败:", err);
      throw err;
    }
  }
}
