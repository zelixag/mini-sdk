/**
 * Audio Adapter for Mini Program
 * 封装微信小程序音频 API，支持 PCM 音频播放
 */

declare const wx: any;

export interface AudioAdapterOptions {
  autoplay?: boolean;
  loop?: boolean;
  volume?: number;
}

/**
 * 音频上下文管理器
 */
export class AudioAdapter {
  private audioContext: any = null;
  private innerAudioContext: any = null;
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying: boolean = false;
  private volume: number = 1.0;
  private onEndedCallback: (() => void) | null = null;
  private onErrorCallback: ((error: any) => void) | null = null;

  constructor(options: AudioAdapterOptions = {}) {
    this.volume = options.volume ?? 1.0;
    this.initAudioContext();
  }

  /**
   * 初始化音频上下文
   */
  private initAudioContext(): void {
    try {
      // 小程序音频管理器
      this.audioContext = wx.createInnerAudioContext();
      this.audioContext.volume = this.volume;

      // 事件监听
      this.audioContext.onEnded(() => {
        this.isPlaying = false;
        this.onEndedCallback?.();
      });

      this.audioContext.onError((err: any) => {
        console.error('[AudioAdapter] Audio error:', err);
        this.isPlaying = false;
        this.onErrorCallback?.(err);
      });
    } catch (e) {
      console.error('[AudioAdapter] Failed to create audio context:', e);
    }
  }

  /**
   * 设置音频源 (支持 PCM 或 URL)
   */
  setSource(src: string | ArrayBuffer): void {
    if (!this.audioContext) return;

    if (typeof src === 'string') {
      // URL 音频
      this.audioContext.src = src;
      this.audioContext.autoplay = false;
    } else {
      // PCM ArrayBuffer - 需要先解码
      this.decodeAudioData(src);
    }
  }

  /**
   * 解码 PCM 数据
   */
  private async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer | null> {
    try {
      // 小程序不支持 Web Audio API 的 decodeAudioData
      // 需要将 PCM 数据写入文件后播放
      const buffer = arrayBuffer as any;
      const tempFilePath = `${wx.env.USER_DATA_PATH}/temp_audio_${Date.now()}.pcm`;

      // 将 ArrayBuffer 写入本地文件
      const fs = wx.getFileSystemManager();
      await fs.writeFile({
        filePath: tempFilePath,
        data: buffer,
        encoding: 'binary'
      });

      this.audioContext.src = tempFilePath;
      this.audioContext.format = 'pcm';
      return null;
    } catch (e) {
      console.error('[AudioAdapter] Failed to decode audio data:', e);
      return null;
    }
  }

  /**
   * 播放音频
   */
  play(): void {
    if (!this.audioContext) return;

    try {
      this.audioContext.play();
      this.isPlaying = true;
    } catch (e) {
      console.error('[AudioAdapter] Play error:', e);
    }
  }

  /**
   * 暂停音频
   */
  pause(): void {
    if (!this.audioContext) return;

    try {
      this.audioContext.pause();
      this.isPlaying = false;
    } catch (e) {
      console.error('[AudioAdapter] Pause error:', e);
    }
  }

  /**
   * 停止音频
   */
  stop(): void {
    if (!this.audioContext) return;

    try {
      this.audioContext.stop();
      this.isPlaying = false;
    } catch (e) {
      console.error('[AudioAdapter] Stop error:', e);
    }
  }

  /**
   * 跳转
   */
  seek(time: number): void {
    if (!this.audioContext) return;

    try {
      this.audioContext.seek(time);
    } catch (e) {
      console.error('[AudioAdapter] Seek error:', e);
    }
  }

  /**
   * 设置音量
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audioContext) {
      this.audioContext.volume = this.volume;
    }
  }

  /**
   * 获取音量
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * 设置播放结束回调
   */
  onEnded(callback: () => void): void {
    this.onEndedCallback = callback;
  }

  /**
   * 设置错误回调
   */
  onError(callback: (error: any) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * 获取播放状态
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * 获取当前播放时间
   */
  getCurrentTime(): number {
    return this.audioContext?.currentTime || 0;
  }

  /**
   * 获取音频时长
   */
  getDuration(): number {
    return this.audioContext?.duration || 0;
  }

  /**
   * 销毁
   */
  destroy(): void {
    if (this.audioContext) {
      this.audioContext.stop();
      this.audioContext = null;
    }
    this.isPlaying = false;
    this.onEndedCallback = null;
    this.onErrorCallback = null;
  }
}

export default AudioAdapter;
