/**
 * AudioRenderer - 音频渲染器 for Mini Program
 * 负责 TTS 音频的播放控制
 */

import { logger } from '../utils/logger';
import { AudioAdapter } from '../adapters/audio';

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
export class AudioRenderer {
  private TAG = '[AudioRenderer]';
  private options: AudioRendererOptions;

  // 音频适配器
  private audioAdapter: AudioAdapter | null = null;

  // 音频数据缓存
  private audioQueue: AudioData[] = [];
  private currentAudio: AudioData | null = null;

  // 播放状态
  private isPlaying: boolean = false;
  private volume: number = 1.0;
  private speech_id: number = -1;

  // 当前帧
  private currentFrame: number = 0;

  // 回调
  private onVoiceStartCallback?: (duration: number, speech_id: number) => void;
  private onVoiceEndCallback?: (speech_id: number) => void;

  constructor(options: AudioRendererOptions = {}) {
    this.options = options;
    this.initAudio();

    logger.info(this.TAG, 'Created');
  }

  /**
   * 初始化音频
   */
  private initAudio(): void {
    try {
      this.audioAdapter = new AudioAdapter({
        autoplay: false,
        volume: this.volume
      });

      // 设置播放结束回调
      this.audioAdapter.onEnded(() => {
        this.onAudioEnded();
      });

      this.audioAdapter.onError((err) => {
        logger.error(this.TAG, 'Audio error:', err);
        this.isPlaying = false;
      });
    } catch (e) {
      logger.error(this.TAG, 'Audio init error:', e);
    }
  }

  /**
   * 更新音频数据
   */
  updateAudioData(data: AudioData[]): void {
    if (!data || data.length === 0) return;

    // 更新队列
    this.audioQueue = data;

    // 找到当前帧对应的音频
    const currentAudio = this.findAudioForFrame(this.currentFrame);

    if (currentAudio && currentAudio.sid !== (this.currentAudio?.sid || -1)) {
      // 新音频，开始播放
      this.playAudio(currentAudio);
    }
  }

  /**
   * 查找当前帧对应的音频
   */
  private findAudioForFrame(frame: number): AudioData | null {
    for (const audio of this.audioQueue) {
      if (audio.sf <= frame && audio.ef >= frame) {
        return audio;
      }
    }
    return null;
  }

  /**
   * 播放音频
   */
  private playAudio(audio: AudioData): void {
    if (!this.audioAdapter) return;

    // 设置音频源
    if (audio.ad) {
      // PCM 数据
      const buffer = audio.ad.buffer.slice(
        audio.ad.byteOffset,
        audio.ad.byteOffset + audio.ad.byteLength
      );
      this.audioAdapter.setSource(buffer as ArrayBuffer);
    }

    // 更新状态
    this.currentAudio = audio;
    this.speech_id = audio.sid;
    this.isPlaying = true;

    // 开始播放
    this.audioAdapter.play();

    // 触发开始回调
    const duration = (audio.ef - audio.sf) / 24; // 假设 24fps
    this.onVoiceStartCallback?.(duration, audio.sid);

    logger.info(this.TAG, 'Playing audio:', audio.sid);
  }

  /**
   * 音频播放结束
   */
  private onAudioEnded(): void {
    this.isPlaying = false;

    if (this.speech_id !== -1) {
      this.onVoiceEndCallback?.(this.speech_id);
      this.speech_id = -1;
    }

    // 尝试播放队列中的下一个音频
    this.playNextAudio();
  }

  /**
   * 播放下一个音频
   */
  private playNextAudio(): void {
    // 清理已过期的音频
    this.audioQueue = this.audioQueue.filter(a => a.ef > this.currentFrame);

    if (this.audioQueue.length > 0) {
      const nextAudio = this.audioQueue[0];
      this.playAudio(nextAudio);
    }
  }

  /**
   * 设置音量
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audioAdapter) {
      this.audioAdapter.setVolume(this.volume);
    }
  }

  /**
   * 获取音量
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * 停止播放
   */
  stop(speech_id: number = -1): void {
    if (speech_id === -1 || speech_id === this.speech_id) {
      this.audioAdapter?.stop();
      this.isPlaying = false;
      this.currentAudio = null;

      if (speech_id !== -1) {
        this.onVoiceEndCallback?.(speech_id);
      }
    }

    // 清理对应 speech_id 的音频数据
    if (speech_id !== -1) {
      this.audioQueue = this.audioQueue.filter(a => a.sid !== speech_id);
    }
  }

  /**
   * 暂停
   */
  pause(): void {
    this.audioAdapter?.pause();
    this.isPlaying = false;
  }

  /**
   * 恢复播放
   */
  resume(): void {
    if (this.currentAudio) {
      this.audioAdapter?.play();
      this.isPlaying = true;
    }
  }

  /**
   * 设置当前帧
   */
  setCurrentFrame(frame: number): void {
    this.currentFrame = frame;

    // 检查是否需要切换音频
    if (this.isPlaying) {
      const audio = this.findAudioForFrame(frame);
      if (audio && audio.sid !== this.currentAudio?.sid) {
        this.playAudio(audio);
      }
    }
  }

  /**
   * 设置语音开始回调
   */
  onVoiceStart(callback: (duration: number, speech_id: number) => void): void {
    this.onVoiceStartCallback = callback;
  }

  /**
   * 设置语音结束回调
   */
  onVoiceEnd(callback: (speech_id: number) => void): void {
    this.onVoiceEndCallback = callback;
  }

  /**
   * 获取播放状态
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * 获取当前语音 ID
   */
  getSpeechId(): number {
    return this.speech_id;
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.stop();
    this.audioAdapter?.destroy();
    this.audioAdapter = null;
    this.audioQueue = [];
    logger.info(this.TAG, 'Destroyed');
  }
}

export default AudioRenderer;
