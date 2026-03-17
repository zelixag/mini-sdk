/**
 * UIRenderer - UI 渲染器 for Mini Program
 * 负责字幕、事件等 UI 元素的渲染
 */

import { logger } from '../utils/logger';

export interface UIRendererOptions {
  container?: any;
  onWalkStateChange?: (state: string) => void;
  onVoiceStart?: (duration: number, speech_id: number) => void;
  onVoiceEnd?: (speech_id: number) => void;
  onSpeakStateChange?: (state: string, client_speak_id: string) => void;
  clearSubtitleOn?: (speech_id: number) => void;
}

export interface UIEvent {
  id: number;
  s: string;
  sf: number;
  ef: number;
  e: {
    type: string;
    content?: string;
    url?: string;
    [key: string]: any;
  }[];
}

/**
 * UIRenderer - UI 渲染器
 * 负责:
 * - 字幕渲染
 * - 事件处理
 * - 行走状态管理
 */
export class UIRenderer {
  private TAG = '[UIRenderer]';
  private options: UIRendererOptions;

  // 容器
  private container: any = null;

  // 事件队列
  private eventQueue: UIEvent[] = [];
  private currentEvent: UIEvent | null = null;

  // 字幕元素
  private subtitleElement: any = null;

  // 状态
  private currentFrame: number = 0;
  private isInterrupt: boolean = false;

  // 回调
  private onWalkStateChangeCallback?: (state: string) => void;
  private onVoiceStartCallback?: (duration: number, speech_id: number) => void;
  private onVoiceEndCallback?: (speech_id: number) => void;
  private onSpeakStateChangeCallback?: (state: string, client_speak_id: string) => void;
  private clearSubtitleOnCallback?: (spepeech_id: number) => void;

  constructor(options: UIRendererOptions = {}) {
    this.options = options;
    this.onWalkStateChangeCallback = options.onWalkStateChange;
    this.onVoiceStartCallback = options.onVoiceStart;
    this.onVoiceEndCallback = options.onVoiceEnd;
    this.onSpeakStateChangeCallback = options.onSpeakStateChange;
    this.clearSubtitleOnCallback = options.clearSubtitleOn;

    this.initContainer();

    logger.info(this.TAG, 'Created');
  }

  /**
   * 初始化容器
   */
  private initContainer(): void {
    if (this.options.container) {
      this.container = this.options.container;
      this.createSubtitleElement();
    }
  }

  /**
   * 创建字幕元素
   */
  private createSubtitleElement(): void {
    // 小程序中字幕通常通过 cover-view 或自定义组件实现
    // 这里预留接口，实际由调用方提供
    logger.debug(this.TAG, 'Creating subtitle element');
  }

  /**
   * 更新 UI 事件
   */
  updateUiEvent(events: UIEvent[]): void {
    this.eventQueue.push(...events);
    this.processEvents();
  }

  /**
   * 处理事件
   */
  private processEvents(): void {
    // 查找当前帧对应的事件
    const event = this.eventQueue.find(
      e => e.sf <= this.currentFrame && e.ef >= this.currentFrame
    );

    if (event !== this.currentEvent) {
      // 事件变化，处理旧事件
      if (this.currentEvent) {
        this.handleEventEnd(this.currentEvent);
      }

      // 处理新事件
      this.currentEvent = event;
      if (event) {
        this.handleEventStart(event);
      }
    }

    // 处理当前事件
    if (event) {
      this.handleEventUpdate(event);
    }
  }

  /**
   * 处理事件开始
   */
  private handleEventStart(event: UIEvent): void {
    for (const e of event.e) {
      switch (e.type) {
        case 'subtitle_on':
          this.showSubtitle(e.content || '');
          break;
        case 'subtitle_off':
          this.hideSubtitle();
          break;
        case 'voice_start':
          this.onVoiceStartCallback?.(event.ef - event.sf, event.id);
          break;
        case 'voice_end':
          this.onVoiceEndCallback?.(event.id);
          break;
        case 'walk_start':
          this.onWalkStateChangeCallback?.('walking');
          break;
        case 'walk_stop':
          this.onWalkStateChangeCallback?.('idle');
          break;
        case 'speak_start':
          this.onSpeakStateChangeCallback?.('speaking', e.client_speak_id || '');
          break;
        case 'speak_end':
          this.onSpeakStateChangeCallback?.('idle', e.client_speak_id || '');
          break;
        default:
          logger.debug(this.TAG, 'Unknown event type:', e.type);
      }
    }
  }

  /**
   * 处理事件更新
   */
  private handleEventUpdate(event: UIEvent): void {
    for (const e of event.e) {
      if (e.type === 'subtitle_update') {
        this.updateSubtitle(e.content || '');
      }
    }
  }

  /**
   * 处理事件结束
   */
  private handleEventEnd(event: UIEvent): void {
    for (const e of event.e) {
      switch (e.type) {
        case 'subtitle_on':
        case 'subtitle_off':
          this.hideSubtitle();
          break;
      }
    }
  }

  /**
   * 显示字幕
   */
  showSubtitle(content: string): void {
    if (this.subtitleElement) {
      // 更新字幕内容
      this.subtitleElement.text = content;
      this.subtitleElement.visible = true;
    }
    // TODO: 通过事件通知外部渲染字幕
    logger.debug(this.TAG, 'Show subtitle:', content);
  }

  /**
   * 更新字幕
   */
  updateSubtitle(content: string): void {
    if (this.subtitleElement) {
      this.subtitleElement.text = content;
    }
  }

  /**
   * 隐藏字幕
   */
  hideSubtitle(): void {
    if (this.subtitleElement) {
      this.subtitleElement.visible = false;
    }
  }

  /**
   * 清理字幕
   */
  clearSubtitle(speech_id: number): void {
    this.hideSubtitle();
    this.clearSubtitleOnCallback?.(speech_id);
  }

  /**
   * 设置当前帧
   */
  setCurrentFrame(frame: number): void {
    this.currentFrame = frame;
    this.processEvents();
  }

  /**
   * 设置中断
   */
  setInterrupt(speech_id: number): void {
    this.isInterrupt = true;
    this.clearSubtitle(speech_id);
  }

  /**
   * 获取事件队列
   */
  getEventQueue(): UIEvent[] {
    return this.eventQueue;
  }

  /**
   * 清理事件
   */
  clearEvents(): void {
    this.eventQueue = [];
    this.currentEvent = null;
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.clearEvents();
    this.container = null;
    this.subtitleElement = null;
    logger.info(this.TAG, 'Destroyed');
  }
}

export default UIRenderer;
