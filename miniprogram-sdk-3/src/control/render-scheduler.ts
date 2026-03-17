/**
 * 渲染调度器
 *
 * 管理帧循环、数据路由和渲染流水线：
 * - 以 24fps 驱动 requestAnimationFrame 循环
 * - 将 TTSA 推送的 body/face/audio/event 数据分发到对应的渲染器和缓存队列
 * - 将 ITtsFaceFrameData 转换为 IBRAnimationFrameData_NN 格式
 * - 支持 pause/resume/stop 生命周期
 */

import { DataCacheQueue } from '../data/cache-queue'
import { ResourceManager } from '../data/resource-manager'
import { MPVideoDecoder, type VideoFrame } from '../decoder/video-decoder'
import {
  IBRAnimationFrameData_NN,
  IBRMeshFrameInfo,
  RigidTransform,
  formatMJT,
} from '../data/data-interface'
import { StateMachine } from './state-machine'
import { raf, caf } from '../platform/env'
import { createModuleLogger } from '../utils/logger'
import type {
  IRawFaceFrameData,
  ITtsFaceFrameData,
  IRawBodyFrameData,
} from '../types'

const log = createModuleLogger('Scheduler')

/** 目标帧率 */
const FRAME_RATE = 24
/** 帧间隔（毫秒） */
const FRAME_INTERVAL = 1000 / FRAME_RATE

export class RenderScheduler {
  private dataCacheQueue: DataCacheQueue
  private resourceManager: ResourceManager

  /**
   * 渲染器引用。
   * 因为 AvatarRenderer / AudioRenderer / Composition 可能尚未实现，
   * 使用 any 类型持有引用，避免编译期循环依赖。
   * 后续渲染层完成后可收窄为具体类型。
   */
  private avatarRenderer: any
  private bodyRenderer: any
  private audioRenderer: any
  private composition: any

  private state: StateMachine<string>
  private rafId: number = 0
  private frameIndex: number = 0
  private startFrame: number = 0
  private isStartPlay = false
  private lastTickTime = 0

  // VideoDecoder 相关
  private videoDecoder: MPVideoDecoder | null = null
  private currentVideoName: string = ''
  private currentVideoPath: string = ''
  private videoReady: boolean = false

  // 外部回调
  onRenderStateChange?: (state: string) => void
  onEvent?: (eventData: any) => void

  constructor(
    dataCacheQueue: DataCacheQueue,
    avatarRenderer: any,
    audioRenderer: any,
    resourceManager: ResourceManager,
    bodyRenderer?: any,
  ) {
    this.dataCacheQueue = dataCacheQueue
    this.avatarRenderer = avatarRenderer
    this.bodyRenderer = bodyRenderer
    this.audioRenderer = audioRenderer
    this.resourceManager = resourceManager
    this.state = new StateMachine('init')

    // 如果传入了 BodyRendererMP，使用它来处理视频渲染
    if (bodyRenderer) {
      bodyRenderer.setDataCacheQueue(dataCacheQueue)
      bodyRenderer.init()
    }

    // Composition 延迟创建：仅在渲染器均就绪时初始化
    this.composition = null
  }

  // ======================== 帧号管理 ========================

  setStartFrame(frame: number): void {
    this.startFrame = frame
    this.frameIndex = frame
  }

  get currentFrame(): number {
    return this.frameIndex
  }

  get currentState(): string {
    return this.state.state
  }

  // ======================== 渲染循环 ========================

  /**
   * 启动渲染循环
   */
  start(): void {
    if (this.avatarRenderer?.initPipeline) {
      this.avatarRenderer.initPipeline()
    }
    // 如果有 bodyRenderer，初始化它
    if (this.bodyRenderer?.init) {
      this.bodyRenderer.init()
    }
    this.isStartPlay = true
    this.state.setState('rendering')
    this.onRenderStateChange?.('rendering')
    this.lastTickTime = Date.now()
    this._loop()
  }

  private _loop = (): void => {
    if (!this.isStartPlay) return

    const now = Date.now()
    const elapsed = now - this.lastTickTime

    if (elapsed >= FRAME_INTERVAL) {
      this.lastTickTime = now - (elapsed % FRAME_INTERVAL)
      this.frameIndex++

      // 渲染帧（优先用 avatarRenderer，否则用 bodyRenderer）
      if (this.avatarRenderer?.render && typeof this.avatarRenderer.render === 'function') {
        this.avatarRenderer.render(this.frameIndex)
      } else if (this.bodyRenderer?.renderFrame) {
        // 没有 avatarRenderer 时，直接用 bodyRenderer 渲染
        this.bodyRenderer.renderFrame(this.frameIndex)
      }

      // 处理事件
      this._processEvents(this.frameIndex)
    }

    this.rafId = raf(this._loop)
  }

  // ======================== 数据路由 ========================

  /**
   * 接收 TTSA 推送数据并分发到对应模块
   */
  handleData(data: any[], type: string): void {
    switch (type) {
      case 'body_data':
        this._handleBodyData(data as IRawBodyFrameData[])
        break
      case 'face_data':
        this._handleFaceData(data as ITtsFaceFrameData[])
        break
      case 'tts_audio':
        if (this.audioRenderer?.updateAudioData) {
          this.audioRenderer.updateAudioData(data)
        }
        break
      case 'event_data':
        this.dataCacheQueue.updateEvent(data as any)
        break
    }
  }

  // ---------- Body ----------

  private async _handleBodyData(bodyDataList: IRawBodyFrameData[]): Promise<void> {
    log.info('Received body_data, count:', bodyDataList.length)
    for (const bodyData of bodyDataList) {
      // 过滤已过期帧
      if (bodyData.ef < this.frameIndex) continue

      log.info('Processing body data:', bodyData.n, 'frame range:', bodyData.sf, '-', bodyData.ef)

      // 存入 body chunk（保留 sf/ef 范围，供 BodyRendererMP.findBodyChunk 使用）
      this.dataCacheQueue.addBodyChunk(bodyData)

      // 预下载视频（不阻塞）
      this.resourceManager.getVideoPath(bodyData.n).catch((e) => {
        log.error('Video preload failed:', bodyData.n, e)
      })
    }

    // 清理过期的 body chunks
    this.dataCacheQueue.trimBodyChunks(this.frameIndex)
  }

  // ---------- Face ----------

  private _handleFaceData(faceDataList: ITtsFaceFrameData[]): void {
    const blendshapeMap = this.resourceManager.getBlendshapeMap()
    const charData = this.resourceManager.getCharData()
    if (!charData) return

    const realFaceData: IRawFaceFrameData[] = []
    const idleFaceData: IRawFaceFrameData[] = []

    for (const raw of faceDataList) {
      const frameData = this._convertFaceFrame(raw, charData, blendshapeMap)
      if (!frameData) continue

      const processed: IRawFaceFrameData = {
        sf: raw.sf,
        ef: raw.ef,
        FaceFrameData: frameData,
        frameIndex: raw.sf,
        state: raw.s,
        id: raw.id,
        body_id: raw.body_id,
        face_frame_type: raw.face_frame_type,
      }

      if (raw.face_frame_type === 0) {
        realFaceData.push(processed)
      } else {
        idleFaceData.push(processed)
      }
    }

    if (realFaceData.length > 0) this.dataCacheQueue.updateRealFacial(realFaceData)
    if (idleFaceData.length > 0) this.dataCacheQueue.updateFacial(idleFaceData)
  }

  /**
   * 将 TTSA 原始脸部帧数据转换为 IBRAnimationFrameData_NN
   */
  private _convertFaceFrame(
    raw: ITtsFaceFrameData,
    charData: any,
    blendshapeMap: number[][] | null,
  ): IBRAnimationFrameData_NN | null {
    try {
      const result = new IBRAnimationFrameData_NN()

      // ---- blendshape weights ----
      result.blendshapeWeights = new Float32Array(charData.blendshapeCount)
      if (raw.bsw && blendshapeMap) {
        for (let meshIdx = 0; meshIdx < blendshapeMap.length; meshIdx++) {
          const map = blendshapeMap[meshIdx]
          for (let i = 0; i < map.length && i < raw.bsw.length; i++) {
            if (map[i] < result.blendshapeWeights.length) {
              result.blendshapeWeights[map[i]] = raw.bsw[i]
            }
          }
        }
      } else if (raw.bsw) {
        for (let i = 0; i < Math.min(raw.bsw.length, result.blendshapeWeights.length); i++) {
          result.blendshapeWeights[i] = raw.bsw[i]
        }
      }

      // ---- mesh info ----
      result.mesh = []
      if (raw.ms && raw.ms.length > 0) {
        for (const meshData of raw.ms) {
          const texWeights = new Float32Array(meshData.weights || [])
          result.mesh.push(new IBRMeshFrameInfo(meshData.index || 0, texWeights))
        }
      } else {
        // 默认：为 charData 中每个 mesh 创建零权重帧
        for (let i = 0; i < charData.mesh.length; i++) {
          const pcaCount =
            charData.mesh[i].textureModels[0]?.data.size[0] - 1 || 0
          result.mesh.push(new IBRMeshFrameInfo(0, new Float32Array(pcaCount)))
        }
      }

      // ---- movable joint transforms ----
      if (raw.js && raw.js.length > 0) {
        result.movableJointTransforms = raw.js.map((j) =>
          formatMJT(j.translate || [0, 0, 0], j.rotate || [1, 0, 0, 0]),
        )
      } else if (raw.mjt) {
        result.movableJointTransforms = raw.mjt.map(
          (arr) =>
            new RigidTransform(
              arr.slice(0, 3) as [number, number, number],
              arr.slice(3) as [number, number, number, number],
            ),
        )
      } else {
        // 默认：单位变换
        result.movableJointTransforms = charData.movableJoints.map(
          () => new RigidTransform(),
        )
      }

      return result
    } catch (e) {
      log.error('Face 帧转换错误:', e)
      return null
    }
  }

  // ---------- Events ----------

  private _processEvents(frameIndex: number): void {
    const event = this.dataCacheQueue.getEvent(frameIndex)
    if (event && event.e) {
      for (const item of event.e) {
        this.onEvent?.(item)
      }
    }
  }

  // ======================== 暂停 / 恢复 ========================

  /**
   * 暂停渲染（隐身模式使用）
   */
  pause(): void {
    this.isStartPlay = false
    if (this.rafId) caf(this.rafId)
    if (this.audioRenderer?.stop) this.audioRenderer.stop()
    this.dataCacheQueue.clearAllFaceData()
    this.state.setState('paused')
    this.onRenderStateChange?.('paused')
  }

  /**
   * 恢复渲染
   */
  resume(): void {
    if (this.avatarRenderer?.initPipeline) this.avatarRenderer.initPipeline()
    if (this.avatarRenderer?.resetFaceState) this.avatarRenderer.resetFaceState()
    this.isStartPlay = true
    this.lastTickTime = Date.now()
    this.state.setState('rendering')
    this.onRenderStateChange?.('rendering')
    this._loop()
  }

  /**
   * 停止渲染循环
   */
  stop(): void {
    this.isStartPlay = false
    if (this.rafId) caf(this.rafId)
    this.state.setState('stopped')
    this.onRenderStateChange?.('stopped')
  }

  // ======================== 销毁 ========================

  // ======================== VideoDecoder ========================

  /**
   * 初始化 VideoDecoder
   */
  async initVideoDecoder(): Promise<void> {
    if (this.videoDecoder) return

    this.videoDecoder = new MPVideoDecoder()
    await this.videoDecoder.init()
    log.info('VideoDecoder initialized')
  }

  /**
   * 根据帧号获取身体视频帧
   * @returns 解码后的视频帧或 null
   */
  getBodyVideoFrame(frameIndex: number): VideoFrame | null {
    // 从缓存队列获取当前帧对应的 body 数据
    const bodyData = this.dataCacheQueue.getLatestBodyData()
    if (!bodyData || !bodyData.n) return null

    // 检查是否需要切换视频
    if (bodyData.n !== this.currentVideoName) {
      this._switchVideo(bodyData.n)
      return null
    }

    // 如果视频解码器未就绪，返回 null
    if (!this.videoDecoder || !this.videoReady) {
      return null
    }

    // 获取解码后的帧
    const frame = this.videoDecoder.getFrameData()
    if (frame) {
      // 推进到下一帧
      this.videoDecoder.seekToNextFrame()
    }
    return frame
  }

  /**
   * 切换当前视频
   */
  private async _switchVideo(videoName: string): Promise<void> {
    if (!this.videoDecoder || videoName === this.currentVideoName) return

    log.info('Switching video to:', videoName)

    // 获取视频路径
    const videoPath = await this.resourceManager.getVideoPath(videoName)
    if (!videoPath) {
      log.warn('Video path not found:', videoName)
      return
    }

    // 停止当前解码
    if (this.videoReady) {
      this.videoDecoder.stop()
      this.videoReady = false
    }

    // 启动新视频解码
    try {
      await this.videoDecoder.start(videoPath)
      this.currentVideoName = videoName
      this.currentVideoPath = videoPath
      this.videoReady = true
      log.info('Video started:', videoName)
    } catch (e) {
      log.error('Failed to start video:', videoName, e)
    }
  }

  /**
   * 获取当前视频解码器实例（供 AvatarRenderer 使用）
   */
  getVideoDecoder(): MPVideoDecoder | null {
    return this.videoDecoder
  }

  destroy(): void {
    this.stop()
    if (this.videoDecoder) {
      this.videoDecoder.destroy()
      this.videoDecoder = null
    }
    this.state.destroy()
  }
}
