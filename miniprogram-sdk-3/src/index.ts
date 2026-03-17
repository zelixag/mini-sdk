/**
 * XmovAvatarMP — 微信小程序离线数字人 SDK 入口
 *
 * 提供完整的数字人渲染与交互能力：
 * - init()      初始化会话、加载资源、创建渲染管线
 * - start()     启动 TTSA 连接和渲染循环
 * - speak()     文本驱动 TTS 说话
 * - interrupt()  打断当前语音
 * - idle() / listen() / think()  切换数字人状态
 * - setInvisibleMode()  切换隐身模式（暂停渲染以节省性能）
 * - destroy()   销毁所有资源
 */

import { ResourceManager } from './data/resource-manager'
import { DataCacheQueue } from './data/cache-queue'
import { RenderScheduler } from './control/render-scheduler'
import { BodyRendererMP } from './modules/body-renderer-mp'
import { Ttsa } from './control/ttsa'
import { StateMachine } from './control/state-machine'
import { getCanvasNode } from './platform/canvas'
import { initRAF } from './platform/env'
import { onNetworkChange } from './platform/network'
import { logger, LogLevel } from './utils/logger'
import { EventEmitter } from './utils/event-emitter'
import { perfTracker } from './utils/performance'
import type { IInitParams } from './types'

export class XmovAvatarMP extends EventEmitter {
  private resourceManager: ResourceManager
  private dataCacheQueue: DataCacheQueue
  /**
   * 渲染器引用（any 类型）。
   * AvatarRenderer / AudioRenderer 属于 render/ 层，尚未完全实现。
   * 在渲染层就绪后，可替换为具体类型。
   */
  private avatarRenderer: any = null
  private audioRenderer: any = null
  private renderScheduler: RenderScheduler | null = null
  private ttsa: Ttsa | null = null
  private statusMachine: StateMachine<string>
  private initParams: IInitParams | null = null
  private isInitialized = false
  private pendingInvisibleMode = false
  /** 组件上下文，用于 canvas 查询 */
  private componentCtx: any = null

  constructor() {
    super()
    this.resourceManager = new ResourceManager()
    this.dataCacheQueue = new DataCacheQueue()
    this.statusMachine = new StateMachine('init')
  }

  // ======================== 初始化 ========================

  /**
   * 初始化 SDK
   *
   * @param params       初始化参数
   * @param componentCtx 自定义组件实例（在 Component 中使用时传入 this）
   */
  async init(params: IInitParams, componentCtx?: any): Promise<void> {
    this.initParams = params
    this.componentCtx = componentCtx

    if (params.debug) logger.setLevel(LogLevel.DEBUG)

    perfTracker.markStart('sdk_init')

    // 1. 创建会话
    perfTracker.markStart('start_session')
    await this.resourceManager.startSession(params)
    perfTracker.markEnd('start_session')

    // 2. 获取 Canvas 并初始化渲染器（资源在 first_start_timestamp 后台加载）
    const canvasId = params.containerId || '#avatar-canvas'
    perfTracker.markStart('canvas_init')
    const canvasInfo = await getCanvasNode(componentCtx, canvasId)
    initRAF(canvasInfo.canvas)

    // 3.1 创建 BodyRendererMP（视频解码和渲染）
    const bodyRenderer = new BodyRendererMP({
      resourceManager: this.resourceManager,
      gl: canvasInfo.gl,
      canvas: canvasInfo.canvas,
      frameRate: 24,
      onMessage: (msg) => logger.warn('BodyRenderer:', msg),
    })

    // 3.2 延迟导入渲染器，避免渲染层未就绪时编译报错
    try {
      const { AvatarRenderer } = await import('./render/avatar-renderer')
      this.avatarRenderer = new AvatarRenderer(this.dataCacheQueue, this.resourceManager)
      await this.avatarRenderer.init(canvasInfo.gl, canvasInfo.canvas)
    } catch (e) {
      // AvatarRenderer 尚未实现，使用空桩
      logger.warn('SDK', 'AvatarRenderer 不可用，使用空桩:', e)
      this.avatarRenderer = _createStubRenderer()
    }

    perfTracker.markEnd('canvas_init')

    // 4. 初始化音频渲染器
    const config = this.resourceManager.getConfig()
    try {
      const { AudioRenderer } = await import('./render/audio-renderer')
      this.audioRenderer = new AudioRenderer(this.dataCacheQueue, config?.raw_audio ?? true)
    } catch (e) {
      logger.warn('SDK', 'AudioRenderer 不可用，使用空桩:', e)
      this.audioRenderer = _createStubAudioRenderer()
    }

    // 5. 创建渲染调度器（传入 bodyRenderer）
    this.renderScheduler = new RenderScheduler(
      this.dataCacheQueue,
      this.avatarRenderer,
      this.audioRenderer,
      this.resourceManager,
      bodyRenderer,
    )
    this.renderScheduler.onEvent = (eventData) => {
      this.emit('event', eventData)
    }
    this.renderScheduler.onRenderStateChange = (state) => {
      this.emit('renderStateChange', { state })
    }

    // 6. 隐身模式标记
    if (params.initModel === 'invisible') {
      this.pendingInvisibleMode = true
    }

    // 7. 网络监听
    onNetworkChange((isConnected, type) => {
      if (isConnected) {
        this.statusMachine.setState('network_on')
        this.emit('status', { status: 'network_on' })
      } else {
        this.statusMachine.setState('network_off')
        this.emit('status', { status: 'network_off' })
      }
    })

    this.isInitialized = true
    perfTracker.markEnd('sdk_init')
    this.emit('status', { status: 'inited' })
  }

  // ======================== 启动 ========================

  /**
   * 启动渲染和 TTSA 连接
   */
  start(): void {
    if (!this.isInitialized) {
      throw new Error('SDK 未初始化，请先调用 init()')
    }

    const config = this.resourceManager.getConfig()

    this.ttsa = new Ttsa({
      url: this.resourceManager.getSocketUrl(),
      token: this.resourceManager.getToken(),
      room: this.resourceManager.getRoom(),
      sessionId: this.resourceManager.getSessionId(),
      protoVersion: config?.framedata_proto_version || 0,

      handleMessage: (type, data) => {
        this.renderScheduler!.handleData(data, type)
      },

      onReady: (startFrame) => {
        // 后台加载角色数据（不阻塞 onReady）
        this.resourceManager.loadCharData().then((charData) => {
          if (charData && this.avatarRenderer?.setCharData) {
            this.avatarRenderer.setCharData(charData)
          }
        }).catch((e) => {
          logger.warn('加载角色数据失败:', e)
        })

        this.renderScheduler!.setStartFrame(startFrame)
        this.renderScheduler!.start()

        if (this.pendingInvisibleMode) {
          this.setInvisibleMode(true)
          this.pendingInvisibleMode = false
        } else {
          this.statusMachine.setState('online')
          this.emit('status', { status: 'online' })
        }
      },

      onDisconnect: (reason) => {
        this.statusMachine.setState('offline')
        this.emit('status', { status: 'offline', reason })
      },

      onStateChange: (state, params, startFrame) => {
        this.dataCacheQueue.setTtsaState({ state, params, start_frame: startFrame })
        this.emit('stateChange', { state, params, startFrame })
      },

      onError: (error) => {
        this.emit('error', error)
      },
    })

    this.ttsa.start()
  }

  // ======================== 公共 API ========================

  /**
   * 发送文本进行 TTS 合成
   * @returns 唯一对话 ID
   */
  speak(text: string, extra?: Record<string, any>): string {
    if (!this.ttsa) throw new Error('TTSA 未连接')
    return this.ttsa.sendText(text, true, true, extra)
  }

  /**
   * 打断当前语音
   */
  interrupt(): void {
    this.ttsa?.interrupt()
    if (this.audioRenderer?.stop) this.audioRenderer.stop()
    if (this.avatarRenderer?.setInterrupt) this.avatarRenderer.setInterrupt(true)
  }

  /** 切换到空闲状态 */
  idle(): void {
    this.ttsa?.idle()
  }

  /** 切换到聆听状态 */
  listen(): void {
    this.ttsa?.listen()
  }

  /** 切换到思考状态 */
  think(): void {
    this.ttsa?.think()
  }

  /**
   * 切换隐身模式
   *
   * 隐身模式下暂停渲染和音频，仅保持 WebSocket 连接以节省性能。
   */
  setInvisibleMode(invisible: boolean): void {
    if (invisible) {
      this.ttsa?.interactiveIdle()
      this.renderScheduler?.pause()
      this.ttsa?.enterInvisibleMode()
      this.statusMachine.setState('invisible')
      this.emit('status', { status: 'invisible' })
    } else {
      this.ttsa?.exitInvisibleMode()
      this.renderScheduler?.resume()
      this.ttsa?.listen()
      this.statusMachine.setState('visible')
      this.emit('status', { status: 'visible' })
    }
  }

  /**
   * 设置音频音量
   * @param volume 0.0 ~ 1.0
   */
  setVolume(volume: number): void {
    if (this.audioRenderer?.setVolume) this.audioRenderer.setVolume(volume)
  }

  /**
   * 获取当前状态
   */
  getStatus(): string {
    return this.statusMachine.state
  }

  // ======================== 页面生命周期 ========================

  /**
   * 页面 onShow 回调
   */
  onPageShow(): void {
    if (this.statusMachine.state === 'invisible') return
    // 可在此恢复渲染（如需）
  }

  /**
   * 页面 onHide 回调
   */
  onPageHide(): void {
    // 可在此暂停渲染以节省资源（如需）
  }

  // ======================== 销毁 ========================

  /**
   * 销毁 SDK 并释放所有资源
   */
  async destroy(reason: string = 'user_destroy'): Promise<void> {
    this.renderScheduler?.stop()
    this.ttsa?.destroy()
    if (this.audioRenderer?.destroy) this.audioRenderer.destroy()
    if (this.avatarRenderer?.destroy) this.avatarRenderer.destroy()
    await this.resourceManager.stopSession(reason)
    this.resourceManager.destroy()
    this.dataCacheQueue.clearAll()
    this.statusMachine.setState('close')
    this.emit('status', { status: 'close' })
    this.removeAllListeners()
  }
}

// ======================== 工厂函数 ========================

/**
 * 创建 XmovAvatarMP 实例
 */
export function createAvatar(): XmovAvatarMP {
  return new XmovAvatarMP()
}

// ======================== 空桩渲染器 ========================

/** AvatarRenderer 空桩，用于渲染层未就绪时的降级 */
function _createStubRenderer(): any {
  return {
    init() {},
    initPipeline() {},
    setCharData() {},
    resetFaceState() {},
    setInterrupt() {},
    destroy() {},
  }
}

/** AudioRenderer 空桩 */
function _createStubAudioRenderer(): any {
  return {
    updateAudioData() {},
    stop() {},
    setVolume() {},
    destroy() {},
  }
}

// ======================== 类型导出 ========================

export * from './types'
export { LogLevel } from './utils/logger'
