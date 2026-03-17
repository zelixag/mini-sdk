/**
 * 音频适配器 - 小程序版本（熵减优化）
 * 将 wx.createInnerAudioContext 适配为 Web Audio API 语义
 * 
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，纯适配逻辑，无业务逻辑
 * 2. 系统秩序：清晰的播放控制、音量管理、事件系统
 * 3. 抽象层次：隐藏 wx.createInnerAudioContext 细节，提供标准 Web Audio API
 * 4. 负熵实现：统一错误处理、平滑音量变化、完整事件系统
 */

/// <reference path="../types/wechat.d.ts" />

import { ErrorHandler, SDKError } from '../utils/ErrorHandler';
import { EErrorCode } from '../types/error';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('Audio');

export interface AudioAdapterOptions {
  src?: string;
  autoplay?: boolean;
  loop?: boolean;
  volume?: number; // 0-1
  errorHandler?: ErrorHandler;
}

/**
 * 音频适配器类
 */
export class AudioAdapter {
  private audioContext: WechatMiniprogram.InnerAudioContext | null = null;
  private errorHandler: ErrorHandler;
  private listeners: Map<string, Set<Function>> = new Map();
  private _volume: number = 1.0;
  private targetVolume: number = 1.0;
  private volumeAnimationFrame: number | null = null;
  private isDestroyed = false;

  constructor(options: AudioAdapterOptions = {}) {
    this.errorHandler = options.errorHandler || new ErrorHandler();
    this._volume = options.volume !== undefined ? Math.max(0, Math.min(1, options.volume)) : 1.0;
    this.targetVolume = this._volume;

    try {
      this.audioContext = wx.createInnerAudioContext();
      
      if (!this.audioContext) {
        throw new Error('Failed to create InnerAudioContext');
      }

      // 设置初始属性
      if (options.src) {
        this.audioContext.src = options.src;
      }
      this.audioContext.autoplay = options.autoplay || false;
      this.audioContext.loop = options.loop || false;
      this.audioContext.volume = this._volume;
      this.audioContext.obeyMuteSwitch = false;

      // 绑定事件
      this._bindEvents();
    } catch (err) {
      const error = this.errorHandler.handle(err, {
        module: 'AudioAdapter',
        method: 'constructor',
        params: { options }
      });
      throw error;
    }
  }

  /**
   * 绑定小程序音频事件
   */
  private _bindEvents(): void {
    if (!this.audioContext) return;

    this.audioContext.onPlay(() => {
      this._emit('play');
    });

    this.audioContext.onPause(() => {
      this._emit('pause');
    });

    this.audioContext.onStop(() => {
      this._emit('stop');
    });

    this.audioContext.onEnded(() => {
      this._emit('ended');
    });

    this.audioContext.onError((err: WechatMiniprogram.InnerAudioContextOnErrorCallbackResult) => {
      const error = this.errorHandler.handle({
        code: EErrorCode.AUDIO_PLAYBACK_ERROR,
        message: err.errMsg || 'Audio playback error',
        timestamp: Date.now(),
        details: err
      }, {
        module: 'AudioAdapter',
        method: 'onError',
        params: { err }
      });
      this._emit('error', error);
    });

    this.audioContext.onCanplay(() => {
      this._emit('canplay');
    });

    this.audioContext.onWaiting(() => {
      this._emit('waiting');
    });

    this.audioContext.onSeeking(() => {
      this._emit('seeking');
    });

    this.audioContext.onSeeked(() => {
      this._emit('seeked');
    });
  }

  /**
   * 播放
   */
  play(): void {
    try {
      if (!this.audioContext) {
        throw new Error('Audio context not initialized');
      }
      this.audioContext.play();
    } catch (err) {
      const error = this.errorHandler.handle(err, {
        module: 'AudioAdapter',
        method: 'play'
      });
      this._emit('error', error);
    }
  }

  /**
   * 暂停
   */
  pause(): void {
    try {
      if (!this.audioContext) {
        throw new Error('Audio context not initialized');
      }
      this.audioContext.pause();
    } catch (err) {
      const error = this.errorHandler.handle(err, {
        module: 'AudioAdapter',
        method: 'pause'
      });
      this._emit('error', error);
    }
  }

  /**
   * 停止
   */
  stop(): void {
    try {
      if (!this.audioContext) {
        throw new Error('Audio context not initialized');
      }
      this.audioContext.stop();
    } catch (err) {
      const error = this.errorHandler.handle(err, {
        module: 'AudioAdapter',
        method: 'stop'
      });
      this._emit('error', error);
    }
  }

  /**
   * 设置音频源
   */
  set src(value: string) {
    if (this.audioContext) {
      this.audioContext.src = value;
    }
  }

  /**
   * 获取音频源
   */
  get src(): string {
    return this.audioContext?.src || '';
  }

  /**
   * 设置音量（0-1），支持平滑变化
   */
  set volume(value: number) {
    const clampedValue = Math.max(0, Math.min(1, value));
    this.targetVolume = clampedValue;
    
    // 启动平滑音量变化
    this._animateVolume();
  }

  /**
   * 获取音量
   */
  get volume(): number {
    return this._volume;
  }

  /**
   * 平滑音量变化动画
   */
  private _animateVolume(): void {
    if (this.volumeAnimationFrame) {
      return; // 已经在动画中
    }

    const animate = () => {
      if (this.isDestroyed || !this.audioContext) {
        this.volumeAnimationFrame = null;
        return;
      }

      const diff = this.targetVolume - this._volume;
      const threshold = 0.01;

      if (Math.abs(diff) < threshold) {
        // 达到目标音量
        this._volume = this.targetVolume;
        if (this.audioContext) {
          this.audioContext.volume = this._volume;
        }
        this.volumeAnimationFrame = null;
      } else {
        // 平滑过渡（每次变化 10%）
        this._volume += diff * 0.1;
        if (this.audioContext) {
          this.audioContext.volume = this._volume;
        }
        this.volumeAnimationFrame = requestAnimationFrame(animate) as any;
      }
    };

    this.volumeAnimationFrame = requestAnimationFrame(animate) as any;
  }

  /**
   * 设置是否循环
   */
  set loop(value: boolean) {
    if (this.audioContext) {
      this.audioContext.loop = value;
    }
  }

  /**
   * 获取是否循环
   */
  get loop(): boolean {
    return this.audioContext?.loop || false;
  }

  /**
   * 设置是否自动播放
   */
  set autoplay(value: boolean) {
    if (this.audioContext) {
      this.audioContext.autoplay = value;
    }
  }

  /**
   * 获取是否自动播放
   */
  get autoplay(): boolean {
    return this.audioContext?.autoplay || false;
  }

  /**
   * 获取当前播放时间（秒）
   */
  get currentTime(): number {
    return this.audioContext?.currentTime || 0;
  }

  /**
   * 设置当前播放时间（秒）
   */
  set currentTime(value: number) {
    if (this.audioContext) {
      this.audioContext.seek(value);
    }
  }

  /**
   * 获取音频时长（秒）
   */
  get duration(): number {
    return this.audioContext?.duration || 0;
  }

  /**
   * 监听事件
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * 移除监听
   */
  off(event: string, callback?: Function): void {
    if (!this.listeners.has(event)) return;

    if (callback) {
      this.listeners.get(event)!.delete(callback);
    } else {
      this.listeners.delete(event);
    }
  }

  /**
   * 触发事件（内部方法）
   */
  private _emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          this.errorHandler.handle(err, {
            module: 'AudioAdapter',
            method: '_emit',
            params: { event, data }
          });
        }
      });
    }
  }

  /**
   * 销毁适配器
   */
  destroy(): void {
    this.isDestroyed = true;

    if (this.volumeAnimationFrame) {
      cancelAnimationFrame(this.volumeAnimationFrame);
      this.volumeAnimationFrame = null;
    }

    if (this.audioContext) {
      this.audioContext.stop();
      this.audioContext.destroy();
      this.audioContext = null;
    }

    this.listeners.clear();
  }
}

/**
 * 创建音频适配器实例
 */
export function createAudioAdapter(options?: AudioAdapterOptions): AudioAdapter {
  return new AudioAdapter(options);
}
