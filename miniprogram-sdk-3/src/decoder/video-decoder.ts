/**
 * 视频解码器适配器（小程序环境）
 *
 * 使用 wx.createVideoDecoder API 逐帧解码视频
 * 若 API 不可用则降级处理
 */

import { createModuleLogger } from '../utils/logger'

const log = createModuleLogger('VideoDecoder')

export interface VideoFrame {
  /** 像素数据 (RGBA or YUV) */
  data: Uint8Array
  width: number
  height: number
  /** 帧索引，-1 表示由调用方分配 */
  frameIndex: number
}

export class MPVideoDecoder {
  private decoder: any = null
  private _ready = false
  private _destroyed = false

  /**
   * 初始化解码器
   * 检测并创建 wx.createVideoDecoder 实例
   */
  async init(): Promise<void> {
    if (this._destroyed) {
      log.warn('init called on destroyed decoder')
      return
    }

    if (typeof wx !== 'undefined' && typeof wx.createVideoDecoder === 'function') {
      this.decoder = wx.createVideoDecoder()
      this._ready = true
      log.info('VideoDecoder created')
    } else {
      log.warn('wx.createVideoDecoder not available, video decode will be limited')
    }
  }

  /**
   * 开始解码视频文件
   * @param filePath 视频临时文件路径
   * @param mode 解码模式：0=解码所有帧 1=仅关键帧
   */
  async start(filePath: string, mode: number = 0): Promise<void> {
    if (!this.decoder) {
      throw new Error('VideoDecoder not initialized')
    }
    if (this._destroyed) {
      throw new Error('VideoDecoder already destroyed')
    }

    return new Promise<void>((resolve, reject) => {
      let started = false

      this.decoder.on('start', () => {
        if (!started) {
          started = true
          log.info('VideoDecoder started:', filePath)
          resolve()
        }
      })

      this.decoder.on('error', (err: any) => {
        log.error('VideoDecoder error:', err)
        if (!started) {
          started = true
          reject(err)
        }
      })

      this.decoder.start({
        source: filePath,
        mode,
      })
    })
  }

  /**
   * 获取下一个已解码帧
   * @returns VideoFrame 或 null（无更多帧或解码器未就绪）
   */
  getFrameData(): VideoFrame | null {
    if (!this.decoder || this._destroyed) return null

    const frameData = this.decoder.getFrameData()
    if (!frameData) return null

    return {
      data: new Uint8Array(frameData.data),
      width: frameData.width,
      height: frameData.height,
      frameIndex: -1, // 由调用方分配
    }
  }

  /**
   * 跳转到指定时间位置
   * @param positionMs 目标位置（毫秒）
   */
  seek(positionMs: number): Promise<void> {
    if (!this.decoder || this._destroyed) return Promise.resolve()

    return new Promise<void>((resolve) => {
      this.decoder.seek(positionMs)
      // VideoDecoder.seek 是异步操作，通过短延时等待完成
      setTimeout(resolve, 50)
    })
  }

  /**
   * 推进到下一帧
   * 小程序 VideoDecoder.seekToNextFrame API
   */
  seekToNextFrame(): void {
    if (!this.decoder || this._destroyed) return

    if (typeof this.decoder.seekToNextFrame === 'function') {
      try {
        this.decoder.seekToNextFrame()
      } catch (e) {
        log.warn('seekToNextFrame failed:', e)
      }
    }
  }

  /**
   * 停止当前解码
   */
  stop(): void {
    if (this.decoder && !this._destroyed) {
      try {
        this.decoder.stop()
      } catch (e) {
        // 忽略已停止状态的错误
      }
    }
  }

  /**
   * 销毁解码器，释放资源
   */
  destroy(): void {
    if (this._destroyed) return

    this._destroyed = true
    if (this.decoder) {
      try {
        this.decoder.stop()
      } catch {
        // ignore
      }
      try {
        this.decoder.remove()
      } catch {
        // ignore
      }
      this.decoder = null
    }
    this._ready = false
    log.info('VideoDecoder destroyed')
  }

  /** 解码器是否就绪 */
  get ready(): boolean {
    return this._ready && !this._destroyed
  }

  /** 解码器是否已销毁 */
  get destroyed(): boolean {
    return this._destroyed
  }
}
