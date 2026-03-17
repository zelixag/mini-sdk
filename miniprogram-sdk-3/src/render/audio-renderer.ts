// @ts-nocheck
/**
 * AudioRenderer - 音频渲染器（小程序版）
 *
 * 基于 platform/audio.ts 的 AudioPlayer 实现音频播放调度。
 * 从 DataCacheQueue 接收音频数据，在合适的帧时机触发播放。
 *
 * 音频数据通过 updateAudioData 注入，在 render(frameIndex) 中
 * 当帧号达到首帧音频的起始帧时开始播放。
 */

import { AudioPlayer } from '../platform/audio'
import { DataCacheQueue } from '../data/cache-queue'
import { createModuleLogger } from '../utils/logger'

const log = createModuleLogger('AudioRenderer')

export class AudioRenderer {
  private player: AudioPlayer
  private dataCacheQueue: DataCacheQueue
  private isPlaying = false
  private speechId: number = -1
  private firstFrameIndex: number = -1
  private _destroyed = false

  // 音频累计统计
  private _audioChunkCount = 0

  constructor(dataCacheQueue: DataCacheQueue) {
    this.dataCacheQueue = dataCacheQueue
    this.player = new AudioPlayer({
      onPlayStart: () => {
        log.debug('Audio playback started')
      },
      onPlayEnd: () => {
        log.debug('Audio chunk playback ended')
      },
      onAllEnd: () => {
        log.debug('All audio chunks finished, speechId:', this.speechId)
        this.isPlaying = false
      },
      onError: (err: any) => {
        log.error('Audio playback error:', err)
      }
    })
  }

  /**
   * 接收音频数据列表
   *
   * 每个 item 的结构：
   * - ad: ArrayBuffer | Uint8Array  音频二进制数据
   * - sid: number                    语音 ID
   * - sf: number                     起始帧号
   * - ef: number                     结束帧号
   * - id: number                     数据 ID
   *
   * @param audioList - 音频数据列表
   */
  updateAudioData(audioList: any[]): void {
    if (!audioList || audioList.length === 0 || this._destroyed) return

    const firstItem = audioList[0]
    if (this.speechId === -1) {
      this.speechId = firstItem.sid
      this.firstFrameIndex = firstItem.sf
      log.debug('New speech started, sid:', this.speechId, 'startFrame:', this.firstFrameIndex)
    }

    // 将音频数据写入播放队列
    for (const item of audioList) {
      if (item.ad) {
        let audioBuffer: ArrayBuffer
        if (item.ad instanceof ArrayBuffer) {
          audioBuffer = item.ad
        } else if (item.ad.buffer && item.ad.buffer instanceof ArrayBuffer) {
          // TypedArray (e.g. Uint8Array)
          audioBuffer = item.ad.buffer.slice(item.ad.byteOffset, item.ad.byteOffset + item.ad.byteLength)
        } else {
          // 尝试转换
          audioBuffer = new Uint8Array(item.ad).buffer
        }

        // 检测音频格式
        const format = this._detectFormat(new Uint8Array(audioBuffer))
        this.player.enqueue(audioBuffer, format)
        this._audioChunkCount++
      }
    }
  }

  /**
   * 每帧调用，检查是否应该开始播放
   *
   * 当 frameIndex 达到首个音频数据的起始帧时，
   * 如果还没开始播放且队列中有数据，则标记为正在播放。
   * 实际播放由 AudioPlayer 的队列机制驱动。
   */
  render(frameIndex: number): void {
    if (this._destroyed) return

    if (this.firstFrameIndex >= 0 && frameIndex >= this.firstFrameIndex && !this.isPlaying && this.player.queueLength > 0) {
      this.isPlaying = true
      log.debug('Audio render activated at frame:', frameIndex)
    }
  }

  /**
   * 检测音频格式（通过 magic bytes）
   */
  private _detectFormat(data: Uint8Array): string {
    if (data.length < 4) return 'mp3'

    // WebM: 0x1A 0x45 0xDF 0xA3
    if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) return 'webm'
    // MP3: 0xFF 0xFB / 0xFF 0xF3 / 0xFF 0xF2 (MPEG sync word)
    if (data[0] === 0xff && (data[1] & 0xe0) === 0xe0) return 'mp3'
    // OGG: 0x4F 0x67 0x67 0x53 ("OggS")
    if (data[0] === 0x4f && data[1] === 0x67 && data[2] === 0x67 && data[3] === 0x53) return 'ogg'
    // WAV: 0x52 0x49 0x46 0x46 ("RIFF")
    if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) return 'wav'
    // AAC: ADTS header
    if (data[0] === 0xff && (data[1] & 0xf0) === 0xf0) return 'aac'
    // M4A/MP4: ftyp box
    if (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) return 'm4a'

    return 'mp3' // 默认 mp3
  }

  /**
   * 停止当前播放并重置状态
   *
   * @param speechId - 可选，指定要停止的 speechId（未使用但保持 API 兼容）
   */
  stop(speechId?: number): void {
    this.player.stop()
    this.isPlaying = false
    this.speechId = -1
    this.firstFrameIndex = -1
    this._audioChunkCount = 0
    log.debug('AudioRenderer stopped')
  }

  /**
   * 暂停播放
   */
  pause(): void {
    this.player.pause()
  }

  /**
   * 恢复播放
   */
  resume(): void {
    this.player.resume()
  }

  /**
   * 设置音量 (0.0 ~ 1.0)
   */
  setVolume(v: number): void {
    this.player.volume = v
  }

  /**
   * 获取当前音量
   */
  getVolume(): number {
    return this.player.volume
  }

  /**
   * 是否正在播放
   */
  get playing(): boolean {
    return this.player.playing
  }

  /**
   * 当前语音 ID
   */
  get currentSpeechId(): number {
    return this.speechId
  }

  /**
   * 已接收的音频块数
   */
  get audioChunkCount(): number {
    return this._audioChunkCount
  }

  /**
   * 销毁所有资源
   */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    log.info('Destroying AudioRenderer')
    this.player.destroy()
    this.dataCacheQueue = null as any
  }
}
