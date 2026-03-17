/**
 * RenderScheduler 小程序版（熵减：帧驱动、数据路由）
 *
 * 职责：帧动画循环、body/face 数据路由、驱动 AvatarRenderer
 * 与主项目 RenderScheduler 对齐，但无 Worker 解码、无 Composition
 */

import { DataCacheQueueMP } from './DataCacheQueueMP';
import type { IAlignedFaceFrameData, IRawBodyFrameData, ITtsFaceFrameData } from '../types/frame-data';
import type { ResourceManagerMP } from '../modules/resource-manager-adapter';
import type { BodyRendererMP } from '../modules/body-renderer-mp';
import type { AvatarRendererMP } from '../baseRender/AvatarRendererMP';
import { alignFaceFrames } from '../core/face-frame-aligner';

const DEFAULT_FPS = 24;

export interface RenderSchedulerMPOptions {
  resourceManager: ResourceManagerMP;
  bodyRenderer: BodyRendererMP;
  canvas: any;
  frameRate?: number;
  onMessage?: (msg: string) => void;
}

export class RenderSchedulerMP {
  private dataCacheQueue: DataCacheQueueMP;
  private resourceManager: ResourceManagerMP;
  private bodyRenderer: BodyRendererMP;
  private avatarRenderer: AvatarRendererMP | null = null;
  private canvas: any;
  private onMessage?: (msg: string) => void;

  private firstStartTimeMs: number = 0;
  private animId: any = null;
  private destroyed = false;
  /** 上一次实际渲染的帧号（用于把 RAF 高频循环降到目标 FPS） */
  private lastRenderedFrameIndex: number = -1;
  private frameRate: number = DEFAULT_FPS;
  /** 固定节拍器：每帧时长（ms） */
  private frameIntervalMs: number = 1000 / DEFAULT_FPS;
  /** 固定节拍器：下一次应渲染时刻（ms） */
  private nextTickAtMs: number = 0;
  /** 固定节拍器：当前时间轴帧号 */
  private timelineFrameIndex: number = 0;

  constructor(options: RenderSchedulerMPOptions) {
    this.dataCacheQueue = new DataCacheQueueMP();
    this.resourceManager = options.resourceManager;
    this.bodyRenderer = options.bodyRenderer;
    this.canvas = options.canvas;
    this.frameRate = (options.frameRate && options.frameRate > 0) ? options.frameRate : DEFAULT_FPS;
    this.frameIntervalMs = 1000 / this.frameRate;
    this.onMessage = options.onMessage;
    this.bodyRenderer.setDataCacheQueue(this.dataCacheQueue);
    this.bodyRenderer.setFrameRate(this.frameRate);
  }

  setAvatarRenderer(renderer: AvatarRendererMP | null): void {
    this.avatarRenderer = renderer;
  }

  getDataCacheQueue(): DataCacheQueueMP {
    return this.dataCacheQueue;
  }

  setFirstStartTime(ms: number): void {
    this.firstStartTimeMs = ms;
    this.timelineFrameIndex = 0;
    this.nextTickAtMs = ms;
    this.bodyRenderer.setFirstStartTime(ms);
  }

  getCurrentFrameIndex(): number {
    return this.timelineFrameIndex;
  }

  /** 处理 body_data（路由到 DataCacheQueue + 预加载视频） */
  handleBodyData(items: IRawBodyFrameData[]): void {
    if (!items?.length) return;
    this.dataCacheQueue.updateBodyData(items);
    this.resourceManager.preloadVideosFromBodyData(items);
  }

  /** 处理 face_data（路由到 DataCacheQueue，face_frame_type 区分） */
  handleFaceData(items: ITtsFaceFrameData[]): void {
    if (!items?.length) return;
    const framedataProtoVersion = this.resourceManager.getConfig?.()?.framedata_proto_version;
    const blendshapeMap = this.resourceManager.resource_pack?.blendshape_map || [];
    const aligned = alignFaceFrames(items, blendshapeMap, framedataProtoVersion);
    const real: IAlignedFaceFrameData[] = [];
    const now: IAlignedFaceFrameData[] = [];
    for (const item of aligned) {
      if (!item?.face_frame_type) real.push(item);
      else now.push(item);
    }
    if (now.length) this.dataCacheQueue.updateFacial(now);
    if (real.length) this.dataCacheQueue.updateRealFacial(real);
  }

  /** 渲染循环 */
  private renderLoop(): void {
    if (this.destroyed) return;
    const nowMs = Date.now();
    if (!this.nextTickAtMs) {
      this.nextTickAtMs = nowMs;
    }
    // 固定 24fps 节拍器：不到时刻不渲染
    if (nowMs < this.nextTickAtMs) {
      const setTimerWait = (typeof globalThis !== 'undefined' ? globalThis.setTimeout : null);
      if (setTimerWait) {
        const delay = Math.max(0, Math.floor(this.nextTickAtMs - nowMs));
        this.animId = setTimerWait(() => this.renderLoop(), delay);
      }
      return;
    }
    // 顺滑优先：每个 tick 只前进 1 帧，避免补帧快进带来的明显顿挫
    this.timelineFrameIndex += 1;
    this.nextTickAtMs += this.frameIntervalMs;
    // 长卡顿后重置节拍，避免持续“补账”
    if (nowMs - this.nextTickAtMs > this.frameIntervalMs * 3) {
      this.nextTickAtMs = nowMs + this.frameIntervalMs;
    }
    const frameIndex = this.timelineFrameIndex;

    // 仅在渲染帧号变化时绘制，降低重复渲染开销
    if (frameIndex === this.lastRenderedFrameIndex) {
      const setTimerSkip = (typeof globalThis !== 'undefined' ? globalThis.setTimeout : null);
      if (setTimerSkip) {
        const delay = Math.max(0, Math.floor(this.nextTickAtMs - Date.now()));
        this.animId = setTimerSkip(() => this.renderLoop(), delay);
      }
      return;
    }
    this.lastRenderedFrameIndex = frameIndex;
    this.dataCacheQueue.trimFaceDataBefore(frameIndex);
    if (this.avatarRenderer) {
      this.avatarRenderer.render(frameIndex);
    } else {
      this.bodyRenderer.renderFrame(frameIndex);
    }
    
    // 使用全局 polyfill 的 requestAnimationFrame
    const raf = (globalThis as any).requestAnimationFrame;
    if (typeof raf === 'function') {
      if (Math.random() < 0.01) {
        this.onMessage?.('[RenderSchedulerMP] Using requestAnimationFrame (global)');
      }
      this.animId = raf(() => this.renderLoop());
    } else {
       // 理论上 initWindowPolyfill 应该已经覆盖了，这里只是终极兜底
       const delay = Math.max(0, Math.floor(this.nextTickAtMs - Date.now()));
       this.animId = setTimeout(() => this.renderLoop(), delay);
    }
  }

  start(): void {
    if (this.destroyed) return;
    this.lastRenderedFrameIndex = -1;
    this.timelineFrameIndex = 0;
    this.nextTickAtMs = this.firstStartTimeMs > 0 ? this.firstStartTimeMs : Date.now();
    this.bodyRenderer.setDataCacheQueue(this.dataCacheQueue);
    this.bodyRenderer.init();
    this.renderLoop();
  }

  stop(): void {
    if (this.animId != null) {
      const clearTimer = (typeof globalThis !== 'undefined' ? globalThis.clearTimeout : null);
      if (clearTimer) clearTimer(this.animId);
      this.animId = null;
    }
    this.bodyRenderer.stop();
  }

  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.lastRenderedFrameIndex = -1;
    this.timelineFrameIndex = 0;
    this.nextTickAtMs = 0;
    this.bodyRenderer.setDataCacheQueue(null);
    this.dataCacheQueue.destroy();
  }
}
