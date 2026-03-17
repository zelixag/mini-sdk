/**
 * 简化版PCM音频播放器（24kHz采样率、S16LE单声道）
 * 新增功能：播放结束后持续检测新音频，自动续播
 */
export default class PCMAudioPlayer {
  // 常量配置（固定24kHz采样率与帧对齐规则）
  readonly SAMPLE_RATE: number = 24000;
  readonly FRAME_ALIGNMENT: number = 2000; // 帧对齐字节数（避免短片段爆音）
  readonly CHECK_INTERVAL: number = 10; // 新音频检测间隔（100ms，可调整）

  // 实例状态与资源
  audioCtx: AudioContext | null = null; // AudioContext实例
  pcmStash: Uint8Array = new Uint8Array(0); // PCM数据缓存（未播放的缓存）
  activeSources: AudioBufferSourceNode[] = []; // 活跃音频源节点
  playTime: number = 0; // 下一段音频的开始播放时间（秒）
  isPlaying: boolean = false; // 播放状态标记
  isInitialized: boolean = false; // 初始化状态标记（避免重复init）
  checkTimer: number | null = null; // 新音频检测定时器（null=未启动）

  /**
   * 初始化音频上下文（需在用户交互中调用）
   * @returns {Promise<void>} 初始化结果
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    // 浏览器兼容性处理
    const AudioContextConstructor =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error("当前浏览器不支持Web Audio API，无法播放音频");
    }

    // 创建24kHz采样率的AudioContext
    this.audioCtx = new AudioContextConstructor({
      sampleRate: this.SAMPLE_RATE,
    });
    this.playTime = this.audioCtx.currentTime;
    this.isInitialized = true;

    // 初始化时仅创建上下文，不主动resume（等待start时处理）
  }

  /**
   * 接收PCM音频流（仅缓存，不触发播放）
   * @param {Uint8Array} pcmData - 24kHz S16LE单声道PCM数据
   */
  receivePCMStream(pcmData: Uint8Array): void {
    // 校验前置条件
    if (!this.isInitialized) {
      (window as any).avatarSDKLogger.info("音频播放器未初始化，请先调用init()");
      this.init();
    }
    if (!(pcmData instanceof Uint8Array)) {
      (window as any).avatarSDKLogger.error("输入数据必须是Uint8Array类型");
      return;
    }

    // 合并PCM数据到缓存（仅缓存，不播放）
    const mergedPcm = new Uint8Array(this.pcmStash.length + pcmData.length);
    mergedPcm.set(this.pcmStash, 0);
    mergedPcm.set(pcmData, this.pcmStash.length);
    this.pcmStash = mergedPcm;
  }

  /**
   * 开始播放（核心触发方法）
   * - 首次调用：恢复AudioContext + 处理缓存 + 启动检测定时器
   * - 暂停后调用：恢复AudioContext + 继续播放 + 重启检测定时器
   * @returns {Promise<void>} 播放启动结果
   */
  async start(): Promise<void> {
    // 1. 校验初始化状态
    if (!this.isInitialized || !this.audioCtx) {
      (window as any).avatarSDKLogger.error("请先调用init()初始化播放器");
    }

    // 2. 确保AudioContext处于运行状态（处理暂停后恢复/首次启动）
    if (this.audioCtx?.state !== "running") {
      await this.audioCtx?.resume();
    }
    // 3. 处理缓存中的PCM数据（凑齐帧对齐长度则播放）
    this.processCachedData();

    // 4. 启动新音频检测定时器（避免重复启动）
    // this.startCheckTimer();
  }

  /**
   * 暂停播放（停止所有活跃音频源，挂起上下文，关闭检测定时器）
   * @returns {Promise<void>} 暂停结果
   */
  async pause(): Promise<void> {
    if (!this.audioCtx || !this.isInitialized) return;

    // 1. 停止所有活跃音频源（避免残留播放）
    this.activeSources.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch (err) {
        (window as any).avatarSDKLogger.error("暂停时停止音频源失败:", err);
      }
    });
    this.activeSources = [];
    this.isPlaying = false;

    // 2. 挂起AudioContext（保留资源，便于后续start恢复）
    if (this.audioCtx.state === "running") {
      await this.audioCtx.suspend();
    }

    // 3. 暂停时关闭检测定时器（避免无效检测）
    this.stopCheckTimer();

    // 4. 重置播放时间（下次start时从当前时间重新调度，避免时间断层）
    this.playTime = this.audioCtx.currentTime;
  }

  async stop() {
    await this.pause();
    this.pcmStash = new Uint8Array(0);
    this.playTime = 0;
  }

  /**
   * 销毁播放器（释放所有音频资源，不可恢复）
   * @returns {Promise<void>} 销毁结果
   */
  async destroy(): Promise<void> {
    // 1. 先暂停所有播放（自动关闭检测定时器）
    await this.pause();

    // 2. 关闭AudioContext（释放底层资源）
    if (this.audioCtx) {
      if (this.audioCtx.state !== "closed") {
        await this.audioCtx.close();
      }
      this.audioCtx = null;
    }

    // 3. 清空所有状态与缓存
    this.pcmStash = new Uint8Array(0);
    this.playTime = 0;
    this.isInitialized = false;
    this.activeSources = [];
  }

  /**
   * 【内部方法】处理缓存中的PCM数据（凑齐长度则播放）
   */
  private processCachedData(): void {
    if (!this.audioCtx || !this.isInitialized) return;

    // 循环处理：只要缓存数据≥帧对齐长度，就持续播放（避免多段缓存堆积）
    while (this.pcmStash.length >= this.FRAME_ALIGNMENT) {
      this.playAlignedPCM();
    }

    // 处理完后若仍有剩余缓存（不足帧对齐长度），等待后续数据补充
    if (this.pcmStash.length > 0) {
    }
  }

  /**
   * 【内部方法】处理对齐后的PCM数据，转换并调度播放
   */
  private playAlignedPCM(): void {
    if (!this.audioCtx) return;

    // 1. PCM帧对齐（补零处理不足长度的数据，避免播放异常）
    const rem = this.pcmStash.length % this.FRAME_ALIGNMENT;
    const pad = rem === 0 ? 0 : this.FRAME_ALIGNMENT - rem;
    const paddedPcm = new Uint8Array(this.pcmStash.length + pad);
    paddedPcm.set(this.pcmStash); // 补零对齐
    this.pcmStash = new Uint8Array(0); // 清空已处理的缓存

    // 2. 转换S16LE Uint8Array → AudioBuffer（适配Web Audio API）
    const audioBuffer = this.createBufferFromPCM(paddedPcm);
    if (!audioBuffer) return;

    // 3. 调度音频播放（添加淡入淡出，避免片段切换爆音）
    this.scheduleAudioPlay(audioBuffer);
  }

  /**
   * 【内部方法】S16LE格式PCM转AudioBuffer
   * @param {Uint8Array} pcmData - 对齐后的PCM数据
   * @returns {AudioBuffer|null} 转换后的音频缓冲区
   */
  private createBufferFromPCM(pcmData: Uint8Array): AudioBuffer | null {
    if (!this.audioCtx) return null;

    try {
      const sampleCount = pcmData.length / 2; // 16位=2字节/采样点
      const buffer = this.audioCtx.createBuffer(
        1, // 声道数：1=单声道
        sampleCount,
        this.SAMPLE_RATE
      );
      const channelData = buffer.getChannelData(0);
      const dataView = new DataView(pcmData.buffer);

      // S16LE转Float32（-1~1范围）
      for (let i = 0; i < sampleCount; i++) {
        channelData[i] = dataView.getInt16(i * 2, true) / 32768;
      }

      return buffer;
    } catch (err) {
      (window as any).avatarSDKLogger.error("PCM数据转AudioBuffer失败:", err);
      return null;
    }
  }

  /**
   * 【内部方法】调度AudioBuffer播放（淡入淡出消爆音，避免重叠）
   * @param {AudioBuffer} audioBuffer - 待播放的音频缓冲区
   */
  private scheduleAudioPlay(audioBuffer: AudioBuffer): void {
    if (!this.audioCtx) return;

    // 1. 创建音频源节点与增益节点
    const source = this.audioCtx.createBufferSource();
    const gainNode = this.audioCtx.createGain();
    source.buffer = audioBuffer;

    // 2. 淡入淡出配置（最大10ms，避免极短片段异常）
    const fadeTime = Math.min(0.01, audioBuffer.duration / 3);
    const startAt = Math.max(this.playTime, this.audioCtx.currentTime + 0.01);
    const endAt = startAt + audioBuffer.duration;

    // 淡入淡出曲线
    gainNode.gain.setValueAtTime(0, startAt);
    gainNode.gain.linearRampToValueAtTime(1, startAt + fadeTime);
    const fadeOutStart = Math.max(startAt + fadeTime, endAt - fadeTime);
    gainNode.gain.setValueAtTime(1, fadeOutStart);
    gainNode.gain.linearRampToValueAtTime(0.0001, endAt);

    // 3. 连接音频链路
    source.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    // 4. 记录活跃音频源
    this.activeSources.push(source);
    this.isPlaying = true;

    // 5. 调度播放并更新下一段开始时间
    source.start(startAt);
    this.playTime = endAt;

    // 6. 音频源结束处理：清理资源 + 检测新数据
    source.onended = () => {
      // 移除活跃源并释放资源
      const index = this.activeSources.indexOf(source);
      if (index > -1) this.activeSources.splice(index, 1);
      source.disconnect();
      gainNode.disconnect();

      // 无活跃源时标记为非播放状态，并立即检测新缓存
      if (this.activeSources.length === 0) {
        this.isPlaying = false;
        // 立即检测一次缓存（避免等定时器，减少延迟）
        this.processCachedData();
      }
    };
  }

  /**
   * 【内部方法】启动新音频检测定时器（100ms间隔）
   */
  private startCheckTimer(): void {
    // 避免重复启动定时器（防止多个定时器叠加）
    if (this.checkTimer !== null) return;

    this.checkTimer = window.setInterval(() => {
      // 仅在“非播放中”且“有初始化”时检测（播放中无需检测，避免重复处理）
      if (!this.isPlaying && this.isInitialized && this.audioCtx) {
        this.processCachedData();
      }
    }, this.CHECK_INTERVAL);
  }

  /**
   * 【内部方法】停止新音频检测定时器
   */
  private stopCheckTimer(): void {
    if (this.checkTimer !== null) {
      window.clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * 【辅助方法】获取当前播放器状态
   * @returns {Object} 状态对象
   */
  getStatus(): {
    isInitialized: boolean;
    isPlaying: boolean;
    cachedDataSize: number;
    isChecking: boolean; // 新增：是否正在检测新音频
  } {
    return {
      isInitialized: this.isInitialized,
      isPlaying: this.isPlaying,
      cachedDataSize: this.pcmStash.length,
      isChecking: this.checkTimer !== null, // 暴露检测状态
    };
  }
}
