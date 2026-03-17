/**
 * 基于 MediaSource API 的 WebM 音频流式播放器
 */

export default class MediaSourceAudioPlayer {
  private TAG = "[MediaSourceAudioPlayer]";
  private mediaSource: MediaSource | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private isInitialized = false;
  public isPlaying = false; // 公开访问，用于外部检查播放状态
  private volume = 1.0;
  private readonly MIME_TYPE = 'audio/webm;codecs=opus';
  private queue: Array<{ data: ArrayBuffer; frameIndex?: number; speechId?: number }> = [];
  private isUpdating = false;
  private logger: any;
  private currentObjectURL: string | null = null;
  private currentSpeechId: number = -1; // 当前播放的 speech_id
  private firstFrameIndex: number = -1; // 第一个音频段的帧索引
  private pendingStartFrameIndex: number = -1; // 等待开始播放的帧索引

  constructor() {
    this.logger = (window as any).avatarSDKLogger || console;
  }

  /**
   * 清理旧的 MediaSource 资源
   */
  private cleanupMediaSource(): void {
    // 清理旧的 SourceBuffer
    if (this.sourceBuffer) {
      try {
        if (this.mediaSource && this.mediaSource.readyState === 'open') {
          if (this.mediaSource.sourceBuffers.length > 0) {
            this.mediaSource.removeSourceBuffer(this.sourceBuffer);
          }
        }
      } catch (e) {
        this.logger.warn(this.TAG, "清理 SourceBuffer 失败:", e);
      }
      this.sourceBuffer = null;
    }

    // 清理旧的 MediaSource
    if (this.mediaSource) {
      try {
        if (this.mediaSource.readyState === 'open') {
          this.mediaSource.endOfStream();
        }
      } catch (e) {
        // ignore
      }
      this.mediaSource = null;
    }

    // 清理旧的 Object URL
    if (this.currentObjectURL && this.audioElement) {
      // 移除之前失效的资源
      this.audioElement.removeAttribute('src');
      URL.revokeObjectURL(this.currentObjectURL);
      this.currentObjectURL = null;
    }
  }

  /**
   * 创建并初始化 MediaSource
   */
  private createMediaSource(): void {
    if (!this.audioElement) return;

    this.mediaSource = new MediaSource();
    this.currentObjectURL = URL.createObjectURL(this.mediaSource);
    this.audioElement.src = this.currentObjectURL;

    this.mediaSource.addEventListener("sourceopen", () => {
      try {
        this.sourceBuffer = this.mediaSource!.addSourceBuffer(this.MIME_TYPE);
        this.sourceBuffer.mode = "sequence";

        this.sourceBuffer.addEventListener("updateend", () => {
          this.isUpdating = false;
          this.processQueue();
        });

        this.sourceBuffer.addEventListener("error", (e) => {
          this.logger.error(this.TAG, "SourceBuffer 错误:", e);
        });

        this.isInitialized = true;
        this.logger.log(this.TAG, "MediaSource 初始化成功");
      } catch (error: any) {
        this.logger.error(this.TAG, "初始化失败:", error.message);
      }
    });

    this.mediaSource.addEventListener("sourceended", () => {
      this.logger.log(this.TAG, "MediaSource 结束");
    });

    this.mediaSource.addEventListener("error", () => {
      this.logger.error(this.TAG, "MediaSource 错误");
    });
  }

  /**
   * 初始化 MediaSource 和 AudioElement
   * 每次播放都重新初始化
   */
  public init() {
    // 如果已经初始化且 MediaSource 状态正常，不重复初始化
    if (this.isInitialized && this.mediaSource && this.mediaSource.readyState === 'open') {
      return;
    }

    // 清理旧的资源
    this.cleanupMediaSource();

    // 创建 Audio 元素
    if (!this.audioElement) {
      this.audioElement = document.createElement("audio");
      this.audioElement.style.display = "none";
      document.body.appendChild(this.audioElement);

      // 监听音频播放结束
      this.audioElement.addEventListener("ended", () => {
        this.logger.log(this.TAG, "播放完成");
        this.isPlaying = false;
      });

      // 监听音频错误
      this.audioElement.addEventListener("error", (e) => {
        const error = (e.target as HTMLAudioElement).error;
        this.logger.error(
          this.TAG,
          "播放错误:",
          error ? error.message : "Unknown"
        );
      });

      // 监听播放卡顿
      this.audioElement.addEventListener("waiting", () => {
        this.logger.log(
          this.TAG,
          `⏸ 缓冲中... (currentTime: ${this.audioElement!.currentTime.toFixed(2)}s)`
        );
      });

      this.audioElement.addEventListener("playing", () => {
        this.logger.log(
          this.TAG,
          `▶ 继续播放 (currentTime: ${this.audioElement!.currentTime.toFixed(2)}s)`
        );
      });

      this.audioElement.addEventListener("stalled", () => {
        this.logger.error(this.TAG, "⚠️ 播放停滞 (可能是数据获取问题)");
      });

      this.audioElement.addEventListener("suspend", () => {
        this.logger.log(this.TAG, "⏸ 数据加载暂停");
      });

      // 监听时间更新，检测缓冲不足
      this.audioElement.addEventListener("timeupdate", () => {
        if (this.sourceBuffer && this.sourceBuffer.buffered.length > 0) {
          const currentTime = this.audioElement!.currentTime;
          const bufferedEnd =
            this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length - 1);
          const gap = bufferedEnd - currentTime;

          // 如果缓冲不足，警告
          if (gap < 0.5 && this.isPlaying) {
            this.logger.warn(
              this.TAG,
              `⚠️ 缓冲不足！gap: ${gap.toFixed(2)}s`
            );
          }
        }
      });
    }

    // 创建 MediaSource
    this.createMediaSource();
  }

  /**
   * 添加音频段
   * @param audioData WebM 格式的音频数据（ArrayBuffer）
   * @param frameIndex 帧索引（用于对齐）
   * @param speechId 语音ID（用于区分不同的语音段）
   */
  addAudioSegment(
    audioData: ArrayBuffer,
    frameIndex?: number,
    speechId?: number
  ): void {
    // 如果是新的 speech_id，重置状态
    if (speechId !== undefined && speechId !== this.currentSpeechId) {
      if (this.currentSpeechId !== -1) {
        // 停止当前播放，准备播放新的语音
        this.logger.log(this.TAG, `检测到新的 speech_id: ${speechId}, 停止当前播放`);
        this.stop();
        this.init(); // 重新初始化 MediaSource
      }
      this.currentSpeechId = speechId;
      this.firstFrameIndex = frameIndex !== undefined ? frameIndex : -1;
      this.pendingStartFrameIndex = this.firstFrameIndex;
    } else if (this.firstFrameIndex === -1 && frameIndex !== undefined) {
      // 记录第一个音频段的帧索引
      this.firstFrameIndex = frameIndex;
      this.pendingStartFrameIndex = frameIndex;
    }

    this.queue.push({ data: audioData, frameIndex, speechId });
    this.processQueue();
  }

  /**
   * 处理队列，将数据添加到 SourceBuffer
   */
  private processQueue() {
    if (this.isUpdating || this.queue.length === 0 || !this.sourceBuffer) {
      return;
    }

    // 检查 MediaSource 状态
    if (
      this.mediaSource &&
      this.mediaSource.readyState !== "open"
    ) {
      return;
    }

    this.isUpdating = true;
    const queueItem = this.queue.shift()!;
    const data = queueItem.data;

    try {
      this.sourceBuffer.appendBuffer(data);
    } catch (error: any) {
      this.logger.error(this.TAG, "追加数据失败:", error.message);

      // 如果是 QuotaExceededError，尝试清理旧数据
      if (error.name === "QuotaExceededError") {
        this.logger.log(this.TAG, "缓冲区已满，清理旧数据...");
        try {
          const currentTime = this.audioElement!.currentTime;
          // 优化：更激进的清理策略，只保留最近 3 秒的数据（而不是 10 秒）
          const keepTime = 3;
          if (currentTime > keepTime && this.sourceBuffer) {
            // 保留最近 3 秒的数据，减少内存占用
            // 注意：remove() 是异步的，需要等待 updateend 事件
            // 将数据放回队列，等待 remove 完成后再处理
            this.queue.unshift(queueItem);
            this.sourceBuffer.remove(0, currentTime - 10);
            // isUpdating 保持为 true，等待 remove 的 updateend 事件
            // updateend 事件会设置 isUpdating = false 并调用 processQueue
            return; // 不设置 isUpdating = false，等待 remove 完成
          } else {
            // 如果当前时间不足，无法清理，丢弃数据
            this.logger.warn(this.TAG, `无法清理缓冲区 (currentTime: ${currentTime.toFixed(2)}s)，数据可能丢失`);
            this.isUpdating = false;
          }
        } catch (removeError: any) {
          this.logger.error(
            this.TAG,
            "清理缓冲区失败:",
            removeError.message
          );
          this.isUpdating = false;
        }
      } else {
        // 其他错误，重置状态
        this.isUpdating = false;
      }
    }
  }

  /**
   * 等待 SourceBuffer 准备好
   */
  private async waitForSourceBuffer(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.sourceBuffer) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * 等待缓冲区更新完成
   * 优化：等待更多数据缓冲，避免播放时卡顿
   */
  private async waitForBufferUpdate(): Promise<void> {
    return new Promise((resolve) => {
      let checkCount = 0;
      const maxChecks = 40; // 最多等待 2 秒 (40 * 50ms)
      const minBufferTime = 0.5; // 至少缓冲 0.5 秒的数据
      
      const check = () => {
        checkCount++;
        
        // 检查是否有足够的缓冲数据
        if (this.sourceBuffer && this.sourceBuffer.buffered.length > 0) {
          const bufferedEnd = this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length - 1);
          if (bufferedEnd >= minBufferTime) {
            this.logger.log(this.TAG, `缓冲区就绪: ${bufferedEnd.toFixed(2)}s`);
            resolve();
            return;
          }
        }
        
        // 如果队列已空且不在更新中，也认为可以开始播放
        if (!this.isUpdating && this.queue.length === 0 && checkCount >= 10) {
          this.logger.log(this.TAG, "队列已空，开始播放");
          resolve();
          return;
        }
        
        // 超时保护
        if (checkCount >= maxChecks) {
          this.logger.warn(this.TAG, "等待缓冲区超时，强制开始播放");
          resolve();
          return;
        }
        
        setTimeout(check, 50);
      };
      check();
    });
  }

  /**
   * 开始播放
   * @param frameIndex 当前帧索引（用于对齐）
   */
  async start(frameIndex?: number): Promise<void> {
    if (this.isPlaying) return;

    // 如果提供了 frameIndex，检查是否应该开始播放
    if (frameIndex !== undefined && this.pendingStartFrameIndex !== -1) {
      if (frameIndex < this.pendingStartFrameIndex) {
        // 还没到开始播放的帧，等待
        this.logger.log(this.TAG, `等待帧对齐: 当前帧 ${frameIndex}, 目标帧 ${this.pendingStartFrameIndex}`);
        return;
      }
    }

    // 等待 SourceBuffer 准备好
    await this.waitForSourceBuffer();

    // 等待一些数据缓冲（优化后的缓冲策略）
    await this.waitForBufferUpdate();

    try {
      if (this.audioElement) {
        // 检查缓冲状态
        if (this.sourceBuffer && this.sourceBuffer.buffered.length > 0) {
          const bufferedEnd = this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length - 1);
          this.logger.log(this.TAG, `🎵 开始播放 (缓冲: ${bufferedEnd.toFixed(2)}s, 队列: ${this.queue.length})`);
        } else {
          this.logger.log(this.TAG, `🎵 开始播放 (队列: ${this.queue.length})`);
        }
        
        await this.audioElement.play();
        this.isPlaying = true;
        this.pendingStartFrameIndex = -1; // 已开始播放，清除待播放帧索引
        this.logger.log(this.TAG, `🎵 开始播放 (speech_id: ${this.currentSpeechId}, frameIndex: ${frameIndex})`);
      }
    } catch (error: any) {
      // 如果是 AbortError（被 pause 中断），这是正常情况，静默处理
      if (error?.name === 'AbortError' || error?.message?.includes('interrupted')) {
        this.logger.debug?.(this.TAG, `播放被中断（正常情况）: ${error.message}`);
        // 不设置 isPlaying，因为播放没有成功
        return;
      }
      // 其他错误才记录并抛出
      this.logger.error(this.TAG, `播放失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 停止播放（内部方法：清空队列、暂停音频、重置状态）
   */
  private stopPlayback(): void {
    this.queue = [];
    this.isPlaying = false;
    this.isUpdating = false;
    this.firstFrameIndex = -1;
    this.pendingStartFrameIndex = -1;
    this.currentSpeechId = -1;

    if (this.audioElement) {
      this.audioElement.pause();
    }
  }

  /**
   * 停止播放
   * @param speechId 语音ID（可选，用于确认停止的是当前播放的语音）
   */
  stop(speechId?: number): void {
    // 如果提供了 speechId，只停止匹配的语音
    if (speechId !== undefined && speechId !== this.currentSpeechId) {
      this.logger.log(this.TAG, `忽略停止请求: speech_id 不匹配 (当前: ${this.currentSpeechId}, 请求: ${speechId})`);
      return;
    }

    const stoppedSpeechId = this.currentSpeechId;
    this.stopPlayback();

    // 清理旧的 MediaSource，彻底清除旧数据
    this.cleanupMediaSource();

    // 重新创建 MediaSource，为下次播放做准备
    this.createMediaSource();

    this.logger.log(this.TAG, `播放已停止 (speech_id: ${stoppedSpeechId})`);
  }
  /**
   * 设置音量
   * @param volume 音量值（0-1）
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audioElement) {
      this.audioElement.volume = this.volume;
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      isPlaying: this.isPlaying,
      isInitialized: this.isInitialized,
      queueLength: this.queue.length,
      bufferedRanges: this.getBufferedRanges(),
      mediaSourceReadyState: this.mediaSource?.readyState || 'null',
    };
  }

  /**
   * 获取缓冲范围
   */
  private getBufferedRanges(): string {
    if (this.sourceBuffer && this.sourceBuffer.buffered.length > 0) {
      const ranges: string[] = [];
      for (let i = 0; i < this.sourceBuffer.buffered.length; i++) {
        const start = this.sourceBuffer.buffered.start(i).toFixed(2);
        const end = this.sourceBuffer.buffered.end(i).toFixed(2);
        ranges.push(`[${start}-${end}]`);
      }
      return ranges.join(", ");
    }
    return "-";
  }

  /**
   * 销毁播放器
   */
  async destroy(): Promise<void> {
    // 停止播放（暂停音频，清空队列和状态）
    this.stopPlayback();

    // 彻底清理 MediaSource 资源（不重新创建，因为要销毁）
    this.cleanupMediaSource();

    // 移除 Audio 元素
    if (this.audioElement && this.audioElement.parentNode) {
      this.audioElement.parentNode.removeChild(this.audioElement);
    }

    this.audioElement = null;
    this.isInitialized = false;
    this.isPlaying = false;

    this.logger.log(this.TAG, "播放器已销毁");
  }
}

