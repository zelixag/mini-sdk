/**
 * 音频播放适配器
 *
 * 基于 wx.createInnerAudioContext 实现队列式音频播放。
 * 每段音频数据先写入临时文件，再通过 InnerAudioContext 播放，
 * 播放完成后自动清理临时文件并播放队列中的下一段。
 */

import { createModuleLogger } from '../utils/logger'

const log = createModuleLogger('Audio')
const fs = wx.getFileSystemManager()

export interface AudioPlayerCallbacks {
  onPlayStart?: () => void
  onPlayEnd?: () => void
  onAllEnd?: () => void
  onError?: (err: any) => void
}

export class AudioPlayer {
  private audioCtx: WechatMiniprogram.InnerAudioContext
  private queue: string[] = [] // 待播放的临时文件路径
  private isPlaying = false
  private _volume = 1.0
  private _destroyed = false
  private _currentSrc: string = ''

  // 外部回调
  onPlayStart?: () => void
  onPlayEnd?: () => void
  /** 队列全部播放完毕 */
  onAllEnd?: () => void
  onError?: (err: any) => void

  constructor(callbacks?: AudioPlayerCallbacks) {
    this.audioCtx = wx.createInnerAudioContext()
    this.audioCtx.volume = this._volume

    if (callbacks) {
      this.onPlayStart = callbacks.onPlayStart
      this.onPlayEnd = callbacks.onPlayEnd
      this.onAllEnd = callbacks.onAllEnd
      this.onError = callbacks.onError
    }

    this.audioCtx.onEnded(() => {
      this.isPlaying = false
      this.onPlayEnd?.()
      this._cleanupCurrentFile()
      this._playNext()
    })

    this.audioCtx.onError((err: any) => {
      log.error('播放错误:', err)
      this.isPlaying = false
      this.onError?.(err)
      this._cleanupCurrentFile()
      this._playNext()
    })
  }

  // ---------- 音量控制 ----------

  get volume(): number {
    return this._volume
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v))
    if (!this._destroyed) {
      this.audioCtx.volume = this._volume
    }
  }

  // ---------- 播放队列 ----------

  /**
   * 将音频数据写入临时文件并加入播放队列。
   * @param audioData 音频二进制数据
   * @param format    文件扩展名，默认 'mp3'
   */
  enqueue(audioData: ArrayBuffer, format: string = 'mp3'): void {
    if (this._destroyed) return

    const tempPath = `${wx.env.USER_DATA_PATH}/audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${format}`

    try {
      fs.writeFileSync(tempPath, audioData, 'binary')
      this.queue.push(tempPath)

      if (!this.isPlaying) {
        this._playNext()
      }
    } catch (e) {
      log.error('写入临时音频文件失败:', e)
      this.onError?.(e)
    }
  }

  /**
   * 直接播放一个本地/网络音频路径（不走队列，会中断当前播放）
   */
  playSrc(src: string): void {
    if (this._destroyed) return
    this.stop()
    this.isPlaying = true
    this._currentSrc = src
    this.audioCtx.src = src
    this.audioCtx.play()
    this.onPlayStart?.()
  }

  private _playNext(): void {
    if (this._destroyed || this.queue.length === 0) {
      this.onAllEnd?.()
      return
    }

    const filePath = this.queue.shift()!
    this.isPlaying = true
    this._currentSrc = filePath
    this.audioCtx.src = filePath
    this.audioCtx.play()
    this.onPlayStart?.()
  }

  private _cleanupCurrentFile(): void {
    const src = this._currentSrc
    if (src && src.startsWith(wx.env.USER_DATA_PATH)) {
      try {
        fs.unlinkSync(src)
      } catch (_) {
        // 忽略删除失败
      }
    }
    this._currentSrc = ''
  }

  // ---------- 播放控制 ----------

  /**
   * 停止当前播放并清空队列
   */
  stop(): void {
    if (this._destroyed) return

    try {
      this.audioCtx.stop()
    } catch (_) {
      // 部分场景 stop 会抛异常
    }

    this.isPlaying = false
    this._cleanupCurrentFile()

    // 清理所有排队的临时文件
    for (const path of this.queue) {
      try {
        fs.unlinkSync(path)
      } catch (_) {
        // ignore
      }
    }
    this.queue = []
  }

  /**
   * 暂停当前播放
   */
  pause(): void {
    if (!this._destroyed) {
      this.audioCtx.pause()
    }
  }

  /**
   * 恢复播放
   */
  resume(): void {
    if (!this._destroyed) {
      this.audioCtx.play()
    }
  }

  // ---------- 状态查询 ----------

  get playing(): boolean {
    return this.isPlaying
  }

  get queueLength(): number {
    return this.queue.length
  }

  get currentTime(): number {
    return this.audioCtx.currentTime || 0
  }

  get duration(): number {
    return this.audioCtx.duration || 0
  }

  // ---------- 生命周期 ----------

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this.stop()
    this.audioCtx.destroy()
    this.onPlayStart = undefined
    this.onPlayEnd = undefined
    this.onAllEnd = undefined
    this.onError = undefined
  }
}
