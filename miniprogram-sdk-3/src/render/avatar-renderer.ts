// @ts-nocheck
/**
 * AvatarRenderer - 数字人渲染器（小程序版）
 *
 * 协调 body 视频解码和 face 网格渲染。
 * 从 DataCacheQueue 获取当前帧的 body 像素数据和 face 动画数据，
 * 调用 GLPipeline 进行 WebGL 渲染。
 *
 * 与 Web SDK 的主要差异：
 * 1. body 数据来自 VideoDecoder 解码后的 Uint8Array RGBA 像素，而非 HTMLVideoElement
 * 2. face 混合插值逻辑保持一致
 * 3. 无 window/DOM 依赖
 */

import { GLDevice } from './gl-device'
import { GLPipeline, GLPipelineCharData } from './gl-pipeline'
import { DataCacheQueue } from '../data/cache-queue'
import {
  IBRAnimationFrameData_NN,
  IBRAnimationGeneratorCharInfo_NN,
  RigidTransform,
} from '../data/data-interface'
import { ResourceManager } from '../data/resource-manager'
import { MPVideoDecoder } from '../decoder/video-decoder'
import { createModuleLogger } from '../utils/logger'
import type { IRawFaceFrameData, IBodyFrame } from '../types'

const log = createModuleLogger('AvatarRenderer')

export class AvatarRenderer {
  private pipeline: GLPipeline | null = null
  private device: GLDevice | null = null
  private videoDecoder: MPVideoDecoder
  private dataCacheQueue: DataCacheQueue
  private resourceManager: ResourceManager
  private charData: IBRAnimationGeneratorCharInfo_NN | null = null

  // Face blending state
  private lastFaceFrame: IRawFaceFrameData | null = null
  private lastRealFaceFrame: number = -1
  private lastWeight: number = 0
  private interrupt = false

  // Current video state
  private currentVideoName: string = ''
  private currentBodyId: number = -1

  // Rendering stats
  private _frameCount = 0
  private _lastStatTime = 0
  private _fps = 0

  constructor(
    dataCacheQueue: DataCacheQueue,
    resourceManager: ResourceManager
  ) {
    this.dataCacheQueue = dataCacheQueue
    this.resourceManager = resourceManager
    this.videoDecoder = new MPVideoDecoder()
  }

  /**
   * 初始化 WebGL 设备和视频解码器
   *
   * @param gl     - 从小程序 canvas 节点获取的 WebGL2RenderingContext
   * @param canvas - 小程序 canvas 节点引用
   */
  async init(gl: WebGL2RenderingContext, canvas: any): Promise<void> {
    this.device = new GLDevice(gl, canvas)
    log.info('GLDevice initialized, canvas size:', canvas.width, 'x', canvas.height)

    try {
      await this.videoDecoder.init()
      log.info('VideoDecoder initialized')
    } catch (e) {
      log.warn('VideoDecoder init failed (video decode may be limited):', e)
    }
  }

  /**
   * 初始化渲染管线
   * 需要在 init() 之后调用，可在设置 charData 前后调用
   */
  initPipeline(): void {
    if (!this.pipeline && this.device) {
      this.pipeline = new GLPipeline(this.device)
      log.info('GLPipeline created')

      if (this.charData) {
        this._applyCharData()
      }
    }
  }

  /**
   * 设置角色数据（脸部网格、骨骼、PCA 纹理等）
   */
  setCharData(data: IBRAnimationGeneratorCharInfo_NN): void {
    this.charData = data
    log.info('CharData set, mesh count:', data.mesh.length, ', skeleton joints:', data.skeleton.length)

    if (this.pipeline) {
      this._applyCharData()
    }
  }

  private _applyCharData(): void {
    if (!this.pipeline || !this.charData) return
    this.pipeline.setCharData({
      char: this.charData,
      LUT: null,
      transform: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
      multisample: null, // 小程序环境默认不开 MSAA，避免兼容性问题
    })
  }

  /**
   * 设置渲染变换参数（偏移和缩放）
   */
  setTransform(offsetX: number, offsetY: number, scaleX: number, scaleY: number): void {
    if (!this.pipeline || !this.charData) return
    this.pipeline.setCharData({
      char: this.charData,
      LUT: null,
      transform: { offsetX, offsetY, scaleX, scaleY },
      multisample: null,
    })
  }

  /**
   * 设置 Gamma 校正参数
   */
  setGamma(r: number, g: number, b: number): void {
    this.pipeline?.setGamma(r, g, b)
  }

  /**
   * 设置色彩平衡
   */
  setColorBalance(rc: number, gm: number, by: number): void {
    this.pipeline?.setColorBalance(rc, gm, by)
  }

  /**
   * 渲染指定帧
   *
   * 流程：
   * 1. 从 DataCacheQueue 获取 body frame（解码后的 RGBA 像素）
   * 2. 获取 face 数据（实时 face 优先于 idle face）
   * 3. Face 插值混合（丢帧补偿）
   * 4. 调用 GLPipeline.renderFrame 进行 WebGL 渲染
   */
  render(frameIndex: number): void {
    // 统计 FPS
    this._frameCount++
    const now = Date.now()
    if (now - this._lastStatTime > 5000) {
      this._fps = this._frameCount / ((now - this._lastStatTime) / 1000)
      this._frameCount = 0
      this._lastStatTime = now
      if (this._fps > 0) log.debug('Render FPS:', this._fps.toFixed(1))
    }

    // 1. 获取 body frame
    const bodyFrame = this.dataCacheQueue.getBody(frameIndex)
    if (!bodyFrame) {
      // 没有 body 数据，跳过渲染
      log.debug('No body frame for index:', frameIndex)
      return
    }

    log.debug('Got body frame:', bodyFrame.videoName, 'body_id:', bodyFrame.body_id)

    // 1.1 处理视频解码（如果 bodyFrame 有 videoName）
    let bodyPixels: Uint8Array | null = null
    let bodyWidth = 0
    let bodyHeight = 0

    if (bodyFrame.videoName) {
      // 检查是否需要切换视频
      if (bodyFrame.videoName !== this.currentVideoName) {
        log.info('Switching video to:', bodyFrame.videoName)
        this._switchVideo(bodyFrame.videoName)
      }

      // 获取解码后的帧
      log.debug('VideoDecoder ready:', this.videoDecoder?.ready, 'currentVideo:', this.currentVideoName)
      if (this.videoDecoder?.ready) {
        const videoFrame = this.videoDecoder.getFrameData()
        if (videoFrame) {
          bodyPixels = videoFrame.data
          bodyWidth = videoFrame.width
          bodyHeight = videoFrame.height
          log.debug('Got video frame:', bodyWidth, 'x', bodyHeight)
          // 推进到下一帧
          this.videoDecoder.seekToNextFrame()
        } else {
          log.debug('No video frame available')
        }
      } else {
        log.debug('VideoDecoder not ready')
      }
    } else if (bodyFrame.data) {
      // 直接使用已解码的数据（备用路径）
      bodyPixels = bodyFrame.data
      bodyWidth = bodyFrame.width
      bodyHeight = bodyFrame.height
    }

    if (!bodyPixels) {
      // 没有可用的 body 像素数据，跳过渲染
      return
    }

    if (!this.pipeline) {
      // 管线未就绪，但有 body 数据 => 仅渲染 body（无 face mesh）
      this._renderBodyOnly({ ...bodyFrame, data: bodyPixels, width: bodyWidth, height: bodyHeight } as IBodyFrame)
      return
    }

    // 2. 获取 face 数据
    const bodyId = bodyFrame.body_id
    let faceData: IBRAnimationFrameData_NN | null = null

    const realFace = this.dataCacheQueue.getRealFace(frameIndex, bodyId)
    const idleFace = this.dataCacheQueue.getFace(frameIndex, bodyId)

    if (realFace) {
      faceData = realFace.FaceFrameData
      this.lastRealFaceFrame = frameIndex
    } else if (idleFace) {
      faceData = idleFace.FaceFrameData
    }

    // 3. Face blending（丢帧时平滑插值）
    if (faceData && this.lastFaceFrame?.FaceFrameData) {
      const weight = this._computeWeight(frameIndex)
      if (weight > 0 && weight < 1) {
        try {
          faceData = IBRAnimationFrameData_NN.interp(
            this.lastFaceFrame.FaceFrameData,
            faceData,
            faceData,
            weight,
            [] // jointEvalOrder - simplified
          )
        } catch (e) {
          // 插值失败时使用原始 faceData
          log.warn('Face interp failed:', e)
        }
      }
    }

    if (realFace) this.lastFaceFrame = realFace
    else if (idleFace) this.lastFaceFrame = idleFace

    // 4. Render
    try {
      this.pipeline.renderFrame(
        bodyFrame.data,
        bodyFrame.width,
        bodyFrame.height,
        faceData
      )
    } catch (e) {
      log.error('Pipeline renderFrame failed:', e)
    }
  }

  /**
   * 无 face mesh 时仅渲染 body 像素
   */
  private _renderBodyOnly(bodyFrame: IBodyFrame): void {
    if (this.pipeline) {
      try {
        this.pipeline.renderFrame(bodyFrame.data, bodyFrame.width, bodyFrame.height, null)
      } catch (e) {
        log.error('Body-only render failed:', e)
      }
    }
  }

  /**
   * 切换当前视频并启动解码
   */
  private async _switchVideo(videoName: string): Promise<void> {
    if (!this.videoDecoder || videoName === this.currentVideoName) return

    log.info('[AvatarRenderer] _switchVideo:', videoName)

    // 停止当前解码
    if (this.videoDecoder.ready) {
      log.info('Stopping current decoder')
      this.videoDecoder.stop()
    }

    // 获取视频路径
    const videoPath = await this.resourceManager.getVideoPath(videoName)
    log.info('[AvatarRenderer] videoPath:', videoPath)
    if (!videoPath) {
      log.error('[AvatarRenderer] Video path not found:', videoName)
      return
    }

    // 启动新视频解码
    try {
      log.info('[AvatarRenderer] Starting video decoder...')
      await this.videoDecoder.start(videoPath)
      this.currentVideoName = videoName
      log.info('[AvatarRenderer] Video started successfully:', videoName)
    } catch (e) {
      log.error('[AvatarRenderer] Failed to start video:', videoName, e)
    }
  }

  /**
   * 计算 face 插值权重
   *
   * 当丢失实时 face 帧时，权重逐渐升到 1（完全使用当前帧），
   * 重新收到实时 face 帧时权重逐渐降到 0（完全使用实时帧）。
   * maxTweenStep 控制过渡速度。
   */
  private _computeWeight(frameIndex: number): number {
    const maxTweenStep = 12
    const frameDiff = Math.max(1, frameIndex - (this.lastRealFaceFrame || 0))
    const isLost = frameIndex > this.lastRealFaceFrame

    if (isLost) {
      this.lastWeight = Math.min(this.lastWeight + frameDiff / maxTweenStep, 1)
    } else {
      this.lastWeight = Math.max(this.lastWeight - frameDiff / maxTweenStep, 0)
    }
    return this.lastWeight
  }

  /**
   * 重置 face 混合状态
   * 在切换视频/状态时调用
   */
  resetFaceState(): void {
    this.lastFaceFrame = null
    this.lastRealFaceFrame = -1
    this.lastWeight = 0
    this.interrupt = false
  }

  /**
   * 设置中断标志（用于跳过 face 渲染）
   */
  setInterrupt(v: boolean): void {
    this.interrupt = v
  }

  /**
   * 获取当前渲染 FPS
   */
  get fps(): number {
    return this._fps
  }

  /**
   * 获取管线是否就绪
   */
  get ready(): boolean {
    return this.pipeline !== null && this.device !== null
  }

  /**
   * 获取当前角色数据是否已设置
   */
  get hasCharData(): boolean {
    return this.charData !== null
  }

  /**
   * 销毁所有资源
   */
  destroy(): void {
    log.info('Destroying AvatarRenderer')

    this.pipeline?.destroy()
    this.videoDecoder.destroy()
    this.device?.destroy()

    this.pipeline = null
    this.device = null
    this.charData = null
    this.lastFaceFrame = null
    this.dataCacheQueue = null as any
    this.resourceManager = null as any
  }
}
