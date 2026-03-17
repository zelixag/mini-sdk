// @ts-nocheck
/**
 * Composition - 渲染合成器（小程序版）
 *
 * 编排 AvatarRenderer（视觉）和 AudioRenderer（音频）的逐帧渲染。
 * 由 RenderScheduler 在每一帧调用 compose(frameIndex) 驱动。
 *
 * 职责：
 * 1. 按顺序调用各渲染器的 render 方法
 * 2. 捕获并记录渲染错误（不中断整体循环）
 * 3. 提供事件回调机制供上层监听渲染事件
 */

import { AvatarRenderer } from './avatar-renderer'
import { AudioRenderer } from './audio-renderer'
import { createModuleLogger } from '../utils/logger'

const log = createModuleLogger('Composition')

export interface CompositionEvent {
  type: string
  data?: any
  frameIndex?: number
  timestamp?: number
}

export class Composition {
  private avatarRenderer: AvatarRenderer
  private audioRenderer: AudioRenderer
  private _destroyed = false

  // 事件回调
  onEvent?: (event: CompositionEvent) => void

  // 渲染统计
  private _totalFrames = 0
  private _errorCount = 0
  private _lastComposeTime = 0

  constructor(avatarRenderer: AvatarRenderer, audioRenderer: AudioRenderer) {
    this.avatarRenderer = avatarRenderer
    this.audioRenderer = audioRenderer
  }

  /**
   * 合成一帧
   *
   * 按顺序执行：
   * 1. Avatar 渲染（body + face WebGL 合成）
   * 2. Audio 渲染（检查是否应开始播放音频）
   *
   * 任一渲染器出错不会影响其他渲染器。
   *
   * @param frameIndex - 当前帧号
   */
  compose(frameIndex: number): void {
    if (this._destroyed) return

    this._totalFrames++
    const startTime = Date.now()

    // 1. 渲染 avatar（body + face）
    try {
      this.avatarRenderer.render(frameIndex)
    } catch (e) {
      this._errorCount++
      log.error('Avatar render error at frame', frameIndex, ':', e)
      this._emitEvent({
        type: 'render_error',
        data: { renderer: 'avatar', error: e },
        frameIndex
      })
    }

    // 2. 渲染 audio
    try {
      this.audioRenderer.render(frameIndex)
    } catch (e) {
      this._errorCount++
      log.error('Audio render error at frame', frameIndex, ':', e)
      this._emitEvent({
        type: 'render_error',
        data: { renderer: 'audio', error: e },
        frameIndex
      })
    }

    this._lastComposeTime = Date.now() - startTime
  }

  /**
   * 发送音频数据到 AudioRenderer
   */
  updateAudioData(audioList: any[]): void {
    if (!this._destroyed) {
      this.audioRenderer.updateAudioData(audioList)
    }
  }

  /**
   * 停止音频播放
   */
  stopAudio(speechId?: number): void {
    this.audioRenderer.stop(speechId)
  }

  /**
   * 暂停音频
   */
  pauseAudio(): void {
    this.audioRenderer.pause()
  }

  /**
   * 恢复音频
   */
  resumeAudio(): void {
    this.audioRenderer.resume()
  }

  /**
   * 设置音量
   */
  setVolume(v: number): void {
    this.audioRenderer.setVolume(v)
  }

  /**
   * 重置 avatar face 混合状态
   */
  resetFaceState(): void {
    this.avatarRenderer.resetFaceState()
  }

  /**
   * 设置 avatar 中断标志
   */
  setInterrupt(v: boolean): void {
    this.avatarRenderer.setInterrupt(v)
  }

  private _emitEvent(event: CompositionEvent): void {
    event.timestamp = Date.now()
    try {
      this.onEvent?.(event)
    } catch (e) {
      // 回调本身出错不应影响渲染
    }
  }

  // ========== 状态查询 ==========

  /**
   * 音频是否正在播放
   */
  get audioPlaying(): boolean {
    return this.audioRenderer.playing
  }

  /**
   * avatar 渲染器是否就绪
   */
  get avatarReady(): boolean {
    return this.avatarRenderer.ready
  }

  /**
   * 总渲染帧数
   */
  get totalFrames(): number {
    return this._totalFrames
  }

  /**
   * 渲染错误计数
   */
  get errorCount(): number {
    return this._errorCount
  }

  /**
   * 上一帧 compose 耗时（毫秒）
   */
  get lastComposeTime(): number {
    return this._lastComposeTime
  }

  /**
   * 当前渲染 FPS
   */
  get fps(): number {
    return this.avatarRenderer.fps
  }

  /**
   * 销毁所有资源
   */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    log.info('Destroying Composition, total frames rendered:', this._totalFrames, ', errors:', this._errorCount)

    this.avatarRenderer.destroy()
    this.audioRenderer.destroy()
    this.onEvent = undefined
  }
}
