/**
 * RenderSchedulerMP - 渲染调度器 for Mini Program
 * 借鉴 Web SDK RenderScheduler 实现
 */

import { logger } from '../utils/logger';

export interface RenderSchedulerOptions {
  resourceManager: any;
  canvas: any;
  gl: any;
  frameRate?: number;
  onMessage?: (message: string) => void;
  onStateChange?: (state: string) => void;
  onRenderChange?: (state: string) => void;
}

/**
 * 数据缓存队列接口
 */
export interface IBodyFrame {
  frame: any;
  frameIndex: number;
  frameState: string;
  id: number;
  name: string;
  body_id: number;
  hfd: boolean;
  sf: number;
  offset: number;
}

export interface DataCacheQueueMP {
  // Body 数据
  _updateBodyImageBitmap(data: IBodyFrame): void;
  _getBodyImageBitmap(frameIndex: number): IBodyFrame | undefined;

  // Face 数据
  _updateFacial(data: any[]): void;
  _getFacial(frameIndex: number): any;

  // Audio 数据
  _updateAudio(data: any[]): void;
  _getAudio(frameIndex: number): any;

  // 事件数据
  _updateUiEvent(data: any[]): void;

  // 状态
  currentPlayState: string;
  currentTtsaState: any;

  // 清理
  clearAllFaceData(): void;
  destroy(): void;
}

/**
 * RenderSchedulerMP - 渲染调度器
 * 负责帧动画驱动、数据路由、渲染协调
 */
export class RenderSchedulerMP {
  private options: RenderSchedulerOptions;
  private dataCacheQueue: DataCacheQueueMP | null = null;
  private bodyRenderer: any = null;
  private avatarRenderer: any = null;

  private frameRate: number = 24;
  private currentFrame: number = 0;
  private isPlaying: boolean = false;
  private renderState: string = 'init';

  private animationFrameId: number = 0;
  private lastFrameTime: number = 0;
  private frameInterval: number = 1000 / 24;

  // 回调
  private onFrameCallback: ((frame: number) => void) | null = null;
  private onStateChangeCallback: ((state: string) => void) | null = null;
  private onRenderChangeCallback: ((state: string) => void) | null = null;

  // 外部注入
  private bodyRendererImpl: any = null;
  private avatarRendererImpl: any = null;

  constructor(options: RenderSchedulerOptions) {
    this.options = options;
    this.frameRate = options.frameRate || 24;
    this.frameInterval = 1000 / this.frameRate;

    this.onStateChangeCallback = options.onStateChange;
    this.onRenderChangeCallback = options.onRenderChange;

    logger.info('[RenderSchedulerMP] Created with frameRate:', this.frameRate);
  }

  /**
   * 初始化
   */
  init(dataCacheQueue: DataCacheQueueMP): void {
    this.dataCacheQueue = dataCacheQueue;
    this.renderState = 'init';
    logger.info('[RenderSchedulerMP] Initialized');
  }

  /**
   * 设置身体渲染器
   */
  setBodyRenderer(renderer: any): void {
    this.bodyRenderer = renderer;
  }

  /**
   * 设置数字人渲染器
   */
  setAvatarRenderer(renderer: any): void {
    this.avatarRenderer = renderer;
  }

  /**
   * 获取数据缓存队列
   */
  getDataCacheQueue(): DataCacheQueueMP | null {
    return this.dataCacheQueue;
  }

  /**
   * 开始渲染
   */
  start(): void {
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.renderState = 'rendering';
    this.lastFrameTime = performance.now();

    this.startRenderLoop();

    this.onRenderChangeCallback?.('rendering');
    this.onStateChangeCallback?.('playing');

    logger.info('[RenderSchedulerMP] Started');
  }

  /**
   * 停止渲染
   */
  stop(): void {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    this.renderState = 'stopped';

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }

    this.onRenderChangeCallback?.('stopped');
    this.onStateChangeCallback?.('stopped');

    logger.info('[RenderSchedulerMP] Stopped');
  }

  /**
   * 暂停渲染
   */
  pause(): void {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    this.renderState = 'paused';

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }

    this.onRenderChangeCallback?.('paused');
    logger.info('[RenderSchedulerMP] Paused');
  }

  /**
   * 恢复渲染
   */
  resume(): void {
    if (this.isPlaying || this.renderState !== 'paused') return;

    this.isPlaying = true;
    this.renderState = 'rendering';
    this.lastFrameTime = performance.now();

    this.startRenderLoop();

    this.onRenderChangeCallback?.('resumed');
    logger.info('[RenderSchedulerMP] Resumed');
  }

  /**
   * 启动渲染循环
   */
  private startRenderLoop(): void {
    const loop = () => {
      if (!this.isPlaying) return;

      const now = performance.now();
      const elapsed = now - this.lastFrameTime;

      if (elapsed >= this.frameInterval) {
        this.renderFrame();
        this.lastFrameTime = now - (elapsed % this.frameInterval);
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * 渲染单帧
   */
  private renderFrame(): void {
    this.currentFrame++;

    // 触发帧回调
    this.onFrameCallback?.(this.currentFrame);

    // 获取当前帧数据
    const bodyFrame = this.dataCacheQueue?._getBodyImageBitmap(this.currentFrame);
    const faceFrame = this.dataCacheQueue?._getFacial?.(this.currentFrame);
    const audioFrame = this.dataCacheQueue?._getAudio?.(this.currentFrame);

    // 渲染身体
    if (bodyFrame && this.bodyRenderer) {
      this.bodyRenderer.render(bodyFrame);
    }

    // 渲染数字人（脸部 + 身体融合）
    if (this.avatarRenderer) {
      this.avatarRenderer.render({
        frame: this.currentFrame,
        bodyFrame,
        faceFrame,
        audioFrame
      });
    }
  }

  /**
   * 处理数据（从 TTSA 接收）
   */
  handleData(data: any[], type: string): void {
    if (!this.dataCacheQueue) return;

    switch (type) {
      case 'body':
        // 处理身体数据
        this.handleBodyData(data);
        break;
      case 'face':
        // 处理脸部数据
        this.handleFaceData(data);
        break;
      case 'audio':
        // 处理音频数据
        this.handleAudioData(data);
        break;
      case 'event':
        // 处理事件数据
        this.handleEventData(data);
        break;
      default:
        logger.warn('[RenderSchedulerMP] Unknown data type:', type);
    }
  }

  /**
   * 处理身体数据
   */
  private handleBodyData(data: any[]): void {
    data.forEach(item => {
      const frameData: IBodyFrame = {
        frame: item.frame,
        frameIndex: item.frameIndex || item.sf,
        frameState: item.frameState || 'default',
        id: item.id || 0,
        name: item.name || '',
        body_id: item.body_id || 0,
        hfd: item.hfd || false,
        sf: item.sf || 0,
        offset: item.offset || 0
      };
      this.dataCacheQueue?._updateBodyImageBitmap(frameData);
    });
  }

  /**
   * 处理脸部数据
   */
  private handleFaceData(data: any[]): void {
    this.dataCacheQueue?._updateFacial?.(data);
  }

  /**
   * 处理音频数据
   */
  private handleAudioData(data: any[]): void {
    this.dataCacheQueue?._updateAudio?.(data);
  }

  /**
   * 处理事件数据
   */
  private handleEventData(data: any[]): void {
    this.dataCacheQueue?._updateUiEvent?.(data);
  }

  /**
   * 设置帧回调
   */
  setFrameCallback(callback: (frame: number) => void): void {
    this.onFrameCallback = callback;
  }

  /**
   * 获取当前帧
   */
  getCurrentFrame(): number {
    return this.currentFrame;
  }

  /**
   * 设置当前帧
   */
  setCurrentFrame(frame: number): void {
    this.currentFrame = frame;
  }

  /**
   * 获取渲染状态
   */
  getRenderState(): string {
    return this.renderState;
  }

  /**
   * 强制同步解码器
   */
  forceSyncDecoder(): void {
    // TODO: 实现强制同步解码
    logger.debug('[RenderSchedulerMP] Force sync decoder');
  }

  /**
   * 清理所有脸部数据（暂停时）
   */
  clearAllFaceData(): void {
    this.dataCacheQueue?.clearAllFaceData?.();
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.stop();

    if (this.dataCacheQueue) {
      this.dataCacheQueue.destroy?.();
      this.dataCacheQueue = null;
    }

    this.bodyRenderer = null;
    this.avatarRenderer = null;

    logger.info('[RenderSchedulerMP] Destroyed');
  }
}

export default RenderSchedulerMP;
