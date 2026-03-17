import type { IBodyFrame, IRawBodyFrameData, IRawFaceFrameData, IRawAudioFrameData, IRawEventFrameData, StateChangeInfo } from '../types'
import { createModuleLogger } from '../utils/logger'

const log = createModuleLogger('CacheQueue')

export class DataCacheQueue {
  // Body frames indexed by frame number
  private bodyQueue: Map<number, IBodyFrame> = new Map()
  // Body chunks with frame ranges (sf, ef) for findBodyChunk
  private bodyChunks: IRawBodyFrameData[] = []
  // 最新的 body 数据（用于获取视频名）
  private latestBodyData: { n: string; sf: number; ef: number } | null = null
  // Face data queues
  private facialQueue: IRawFaceFrameData[] = []
  private realFacialQueue: IRawFaceFrameData[] = []
  // Audio queue
  private audioQueue: IRawAudioFrameData[] = []
  // Event queue
  private eventQueue: IRawEventFrameData[] = []
  // State
  private currentPlayState: string = 'idle'
  private currentTtsaState: StateChangeInfo | null = null

  // === Body ===
  updateBody(frame: IBodyFrame): void {
    // 保存最新的 body 数据
    if (frame.videoName) {
      this.latestBodyData = {
        n: frame.videoName,
        sf: frame.frameIndex,
        ef: frame.frameIndex,
      }
    }
    // Clean old frames with lower body_id
    const existing = this.bodyQueue.get(frame.frameIndex)
    if (existing) {
      // Replace
    }
    // Remove stale frames from older body_id
    for (const [idx, f] of this.bodyQueue) {
      if (f.body_id < frame.body_id && idx >= frame.frameIndex) {
        this.bodyQueue.delete(idx)
      }
    }
    this.bodyQueue.set(frame.frameIndex, frame)
  }

  /** 添加 body chunk（保留 sf/ef 范围，供 findBodyChunk 使用） */
  addBodyChunk(chunk: IRawBodyFrameData): void {
    // 移除同 body_id 的旧 chunk（相同视频段）
    this.bodyChunks = this.bodyChunks.filter(
      c => !(c.body_id === chunk.body_id && c.sf === chunk.sf)
    )
    this.bodyChunks.push(chunk)
    // 按 sf 排序
    this.bodyChunks.sort((a, b) => a.sf - b.sf)
    // 保留最新的 body 数据
    this.latestBodyData = { n: chunk.n, sf: chunk.sf, ef: chunk.ef }
  }

  /** 根据帧号查找所属的 body chunk */
  findBodyChunk(frameIndex: number): IRawBodyFrameData | null {
    for (let i = this.bodyChunks.length - 1; i >= 0; i--) {
      const chunk = this.bodyChunks[i]
      if (frameIndex >= chunk.sf && frameIndex <= chunk.ef) {
        return chunk
      }
    }
    return null
  }

  /** 清理已过期的 body chunks */
  trimBodyChunks(currentFrame: number): void {
    this.bodyChunks = this.bodyChunks.filter(c => c.ef >= currentFrame)
  }

  getBody(frameIndex: number): IBodyFrame | undefined {
    const frame = this.bodyQueue.get(frameIndex)
    // Clean frames before current
    for (const [idx] of this.bodyQueue) {
      if (idx < frameIndex) this.bodyQueue.delete(idx)
    }
    return frame
  }

  /** 获取最新的 body 数据（用于获取视频名） */
  getLatestBodyData(): { n: string; sf: number; ef: number } | null {
    return this.latestBodyData
  }

  // === Face ===
  updateFacial(data: IRawFaceFrameData[]): void {
    this.facialQueue.push(...data)
  }

  updateRealFacial(data: IRawFaceFrameData[]): void {
    this.realFacialQueue.push(...data)
  }

  getFace(frameIndex: number, bodyId: number): IRawFaceFrameData | null {
    let target: IRawFaceFrameData | null = null
    for (let i = this.facialQueue.length - 1; i >= 0; i--) {
      const item = this.facialQueue[i]
      if (item.frameIndex === frameIndex && item.body_id === bodyId) {
        target = item
        break
      }
    }
    // Trim old data
    this.facialQueue = this.facialQueue.filter(item => item.frameIndex >= frameIndex)
    return target
  }

  getRealFace(frameIndex: number, bodyId: number): IRawFaceFrameData | null {
    let target: IRawFaceFrameData | null = null
    for (let i = this.realFacialQueue.length - 1; i >= 0; i--) {
      const item = this.realFacialQueue[i]
      if (item.frameIndex === frameIndex && item.body_id === bodyId) {
        target = item
        break
      }
    }
    this.realFacialQueue = this.realFacialQueue.filter(item => item.frameIndex >= frameIndex)
    return target
  }

  clearAllFaceData(): void {
    this.facialQueue = []
    this.realFacialQueue = []
  }

  // === Audio ===
  updateAudio(data: IRawAudioFrameData[]): void {
    this.audioQueue.push(...data)
  }

  getAudio(frameIndex: number): IRawAudioFrameData | null {
    for (let i = this.audioQueue.length - 1; i >= 0; i--) {
      if (this.audioQueue[i].sf <= frameIndex && this.audioQueue[i].ef >= frameIndex) {
        const item = this.audioQueue[i]
        // Remove consumed items
        this.audioQueue = this.audioQueue.filter(a => a.ef > frameIndex)
        return item
      }
    }
    return null
  }

  clearAudio(speechId?: number): void {
    if (speechId !== undefined) {
      this.audioQueue = this.audioQueue.filter(a => a.sid !== speechId)
    } else {
      this.audioQueue = []
    }
  }

  // === Events ===
  updateEvent(data: IRawEventFrameData[]): void {
    this.eventQueue.push(...data)
  }

  getEvent(frameIndex: number): IRawEventFrameData | null {
    for (let i = 0; i < this.eventQueue.length; i++) {
      const ev = this.eventQueue[i]
      if (ev.sf <= frameIndex && ev.ef >= frameIndex) {
        this.eventQueue.splice(i, 1)
        return ev
      }
    }
    return null
  }

  getEventsInRange(startFrame: number, endFrame: number): IRawEventFrameData[] {
    const result: IRawEventFrameData[] = []
    this.eventQueue = this.eventQueue.filter(ev => {
      if (ev.sf >= startFrame && ev.sf <= endFrame) {
        result.push(ev)
        return false
      }
      return ev.ef >= startFrame
    })
    return result
  }

  clearSubtitleBySpeechId(speechId: number): void {
    this.eventQueue = this.eventQueue.filter(ev => {
      ev.e = ev.e.filter(item =>
        item.type !== 'subtitle_on' || item.speech_id !== speechId
      )
      return ev.e.length > 0
    })
  }

  // === State ===
  setPlayState(state: string): void { this.currentPlayState = state }
  getPlayState(): string { return this.currentPlayState }
  setTtsaState(state: StateChangeInfo | null): void { this.currentTtsaState = state }
  getTtsaState(): StateChangeInfo | null { return this.currentTtsaState }

  // === Cleanup ===
  clearAll(): void {
    this.bodyQueue.clear()
    this.bodyChunks = []
    this.latestBodyData = null
    this.facialQueue = []
    this.realFacialQueue = []
    this.audioQueue = []
    this.eventQueue = []
  }

  get bodyQueueSize(): number { return this.bodyQueue.size }
  get faceQueueSize(): number { return this.facialQueue.length + this.realFacialQueue.length }
}
