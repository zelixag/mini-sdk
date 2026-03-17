import { AvatarStatus, RenderState, IAvatarOptions, IInitParams, InitModel, Layout, WalkConfig } from "./types/index";
import { EErrorCode } from "./types/error";
import { EFrameDataType, IRawFrameData, StateChangeInfo } from "./types/frame-data";
import RenderScheduler from "./control/RenderScheduler";
import ResourceManager, { ISessionResponse, TDownloadProgress } from "./modules/ResourceManager";
import WidgetDefaultRender from "./modules/TrackRenderer/render-implements";
import Ttsa from "./control/ttsa";
import { DebugOverlay } from "./view/DebugOverlay";
import NetworkMonitor from './modules/network';
import Errors from './modules/error-handle';

import { performanceConstant } from "./utils/perfermance";
import  './utils/logger.js';
import { IBRAnimationGeneratorCharInfo_NN, unpackIBRAnimation, formatMJT } from './utils/DataInterface'
import { getVertices, getWavefrontObjFromVertices, getPCATextures } from './utils/GLPipelineDebugTools'
import { GLDevice } from './utils/GLDevice'
import { GLPipeline } from './utils/GLPipeline'
import { isSupportMES } from "./utils";

export default class XmovAvatar {
  //static STATUS: AvatarStatus | -1 = -1;

  private options!: IAvatarOptions;

  private TAG = "[XMOV AVATAR]";
  private el: HTMLElement | null = null;
  
  // 实例状态，每个 XmovAvatar 实例都有自己独立的状态
  private status: AvatarStatus | -1 = -1;

  // 使用 ! 操作符告诉 TypeScript 这些属性会在构造函数中被初始化
  private resourceManager!: ResourceManager;
  private renderScheduler!: RenderScheduler;
  private networkMonitor!: NetworkMonitor;
  private ttsa: Ttsa | null = null;

  private debugOverlay: DebugOverlay | null = null;

  private _offlineTimer = -1
  private readonly _offlineInterval = 300
  private _env = "production"
  // 可以与隐身模式做联动，
  private avatarCanvasVisible: boolean = true; // 数字人canvas显隐状态，默认为true
  private pendingInvisibleMode: boolean = false; // 待处理的隐身模式（在init时设置，在start时应用）
  private isInitialized: boolean = false; // 初始化是否完成（progress === 100）

  // public onError: (error: SDKError) => void = (error) => {};
  public onStateChange: (state: string) => void = () => {};
  // public onClose: () => void = () => {};

  // private stream: MediaStream | null = null;
  public onDownloadProgress: TDownloadProgress | null = null;

  static IBRAnimationGeneratorCharInfo_NN = IBRAnimationGeneratorCharInfo_NN;
  static unpackIBRAnimation = unpackIBRAnimation;
  static formatMJT = formatMJT;
  static getVertices = getVertices;
  static getPCATextures = getPCATextures;
  static getWavefrontObjFromVertices = getWavefrontObjFromVertices;
  static GLDevice = GLDevice;
  static GLPipeline = GLPipeline;
  private boundVisibilityChange: () => void;
  private replayData: any = null;
  private startConnectTime: number = 0;
  private connectSuccessTime: number = 0;
  private enableClientInterrupt: boolean = false; // 是否开启客户端打断
  private retryCount = 1;
  private retryTimer = -1;
  private maxRetryCount = 9;
  private retryRound = 1; // 重试轮次
  private maxRetryRound = 3; // 最大轮次
  private isRetrying = false; // 重试中锁，避免并发调用
  private isStartRetry = false;
  private destroyed = false;
  private reconnectDebounceTimer = -1; // 重连防抖定时器

  constructor(options: IAvatarOptions) {
    (window as any).avatarSDKLogger.setEnabled(options.enableLogger);
    this.options = options;
    this._env = options.env || "production"
    this.enableClientInterrupt = options.enableClientInterrupt || false;
    this.initializeSDK(options);
    this.boundVisibilityChange = this.visibilitychange.bind(this);
    this.networkMonitor = new NetworkMonitor({
      offlineCallback: (message) => {
        this.onMessage({
          code: EErrorCode.NETWORK_DOWN,
          message: message || '网络断开',
        });
        console.log('网络断开（network off）', message);
        
        // 如果初始化未完成（progress < 100），清除所有已初始化的资源并断开连接
        if (!this.isInitialized) {
          (window as any).avatarSDKLogger.warn(this.TAG, '初始化未完成时断网，清除所有资源并断开连接');
          this.cleanupBeforeInitComplete("network_offline_before_init");
          return;
        }
        
        if(this.status !== AvatarStatus.offline) {
          // 无网断开则进入离线模式
          this.offlineHandle();
        }
      },
      onlineCallback: (message) => {
        this.onMessage({
          code: EErrorCode.NETWORK_UP,
          message: message || '网络恢复',
        });
        
        // 如果初始化未完成（progress < 100），清除所有已初始化的资源并断开连接
        if (!this.isInitialized) {
          (window as any).avatarSDKLogger.warn(this.TAG, '网络恢复但初始化未完成，清除所有资源并断开连接');
          this.cleanupBeforeInitComplete("network_online_before_init");
          return;
        }
        
        // 网络恢复时，取消WebSocket的reconnectTimer，避免与网络恢复的重连逻辑冲突
        this.ttsa?.clearReconnectTimer();
        
        if(this.isStartRetry) {
          this.triggerReconnect(); 
        }
        // this.onStatusChange(AvatarStatus.network_on)
        // this._reload()
        // this.ttsa?.connect()
      },
      // retryCallback: (count: number) => {
      //   this.onMessage({
      //     code: EErrorCode.NETWORK_RETRY,
      //     message: '网络重试中',
      //   });
      //   this.ttsa?.connect();
        // return this.resourceManager._startSession();
      // },
    })
  }

  public getStatus() {
    return this.status
  }

  public getTag() {
    return this.options.tag
  }

  public get businessENV() {
    return this._env
  }

  public getUniqueSpeakId() {
    return this.ttsa?.getUniqueSpeakId() || `0-${this.getSessionId()}`

  }

  private async initializeSDK(options: IAvatarOptions) {
    if (!navigator.onLine) {
      this.onMessage({
        code: EErrorCode.NETWORK_BREAK,
        message: '没有网络，请联网后重试',
      });
      return
    }

    const { containerId, appId, appSecret, gatewayServer, cacheServer, config } = options;

    const _config = { ...(config || {}), raw_audio: !isSupportMES() };

    const el = document.querySelector(containerId) as HTMLElement;
    if (!el) {
      this.onMessage({
        code: EErrorCode.CONTAINER_NOT_FOUND,
        message: `containerId: ${containerId} 不存在`,
      })
      return;
    }

    this.el = el;
    const bgContainer = document.createElement("div");
    bgContainer.setAttribute("id", "avatar-bg-container");
    bgContainer.setAttribute("style", "position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;opacity:0;");
    this.el.appendChild(bgContainer);
    const style = this.el.getAttribute("style");
    if (style) {
      this.el.setAttribute(
        "style",
        `position:relative;overflow:hidden;${style}`
      );
    } else {
      this.el.setAttribute(
        "style",
        `position:relative;overflow:hidden;`
      );
    }

    this.resourceManager = new ResourceManager({
      sdkInstance: this,
      headers: options.headers,
      appId,
      appSecret,
      gatewayServer,
      cacheServer,
      config:_config,
      onNetworkInfo(networkInfo) {
        options.onNetworkInfo?.(networkInfo);
      },
      onStartSessionWarning: (message: Object) => {
        this.options.onStartSessionWarning?.(message);
      },
    });

    this.renderScheduler = new RenderScheduler({
      sdkInstance: this,
      container: this.el,
      resourceManager: this.resourceManager,
      enableDebugger: options.enableDebugger,
      hardwareAcceleration: options.hardwareAcceleration || "default",
      enableClientInterrupt: this.enableClientInterrupt,
      onDownloadProgress: (progress: number) => {
        this.onDownloadProgress?.(progress);
        this.el?.setAttribute("style", this.el?.style.cssText + `opacity:${progress === 100 ? '1' : '0'};`);
        // 标记初始化完成
        this.isInitialized = progress === 100;
      },
      onStateChange: (state: string) => {
        if((this.getStatus() === AvatarStatus.offline && state !== 'idle') || state === "") {
          return
        }
        options.onStateChange?.(state);
      },
      onRenderChange: (state: RenderState, oldState?: RenderState) => {
        options.onRenderChange?.(state);
        // 在如果数字人在恢复渲染态一会和数字人在线态的时候，数字人进入渲染中了，都应该认为是可见状态
        if(state === RenderState.rendering && (oldState === RenderState.resumed || this.getStatus() === AvatarStatus.online) && this.isInitialized) {
          (window as any).avatarSDKLogger.log(this.TAG, 'Status:===== 渲染中，状态: rendering', this.getSessionId());
          this.onStatusChange(AvatarStatus.visible)
        }
      },
      onVoiceStateChange: (state: string, duration?: number) => {
        options.onVoiceStateChange?.(state, duration);
      },
      onWalkStateChange: (state: string) => {
        options.onWalkStateChange?.(state);
      },
      sendVideoInfo: (info: {name: string, body_id: number, id: number}) => {
        this.debugOverlay?.setVideoInfo(info);
      },
      onSpeakStateChange: (state: string, client_speak_id: number | string) => {
        options.onSpeakStateChange?.(state, client_speak_id);
      },
      setAudioInfo: (info: {
        sf: number;
        ef: number;
        ad: Uint8Array;
      }) => {
        this.debugOverlay?.setAudioInfo(info);
      },
      setEventData: (info: {
        sf: number;
        ef: number;
        event: Array<any>;
      }) => {
        this.debugOverlay?.setEventData(info);
      },
      renderFrameCallback: (frame: number) => {
        this.renderFrameCallback(frame);
        this.handleReplaySend(frame);
      },
      reportMessage: (message: {
        code: EErrorCode;
        message: string;
        e?: object;
      }) => {
        this.ttsa?.sendPerfLog(message);
      },
      sendSdkPoint: (type: string, data: any, extra?: any) => {
        this.ttsa?.sendSdkPoint(type, data, extra);
      },
    });
    options.onStateRenderChange && (window as any).performanceTracker.setOnStateRenderChange(options.onStateRenderChange);

    WidgetDefaultRender.CUSTOM_WIDGET = options.onWidgetEvent;
    WidgetDefaultRender.PROXY_WIDGET = options.proxyWidget || {};
  }

  // async preCache() {
  //   return this.resourceManager.preCache(this.options.appId, this.options.appSecret);
  // }

  private renderFrameCallback(frame: number) {
    // 间隔24帧执行一次
    if(!this.ttsa?.getStatus() && ![AvatarStatus.offline, AvatarStatus.network_off].includes(this.status as AvatarStatus) && frame % 24 === 0) {
      this.offlineHandle()
    }
  }

  async init(params: IInitParams) {
    this.destroyed = false;
    this.isInitialized = false; // 重置初始化状态
    this.startConnectTime = Date.now();
    const { onDownloadProgress, initModel } = params;
    this.onDownloadProgress = onDownloadProgress;

    // 如果初始化时指定了隐身模式，先标记待处理，等start时再真正应用
    if(initModel === InitModel.invisible) {
      this.pendingInvisibleMode = true;
    }

    // 加载资源
    (window as any).performanceTracker.markStart(performanceConstant.load_resource);
    (window as any).performanceTracker.markStart(performanceConstant.first_avatar_render);
    (window as any).performanceTracker.markStart(performanceConstant.first_webgl_render);
    const sessionInfo = await this.resourceManager.load(onDownloadProgress);
    if(!sessionInfo?.socket_io_url || !sessionInfo?.token) {
      (window as any).avatarSDKLogger.error(this.TAG, "init error, socket_io_url or token is empty reload");
      return
    };
    this.connectSuccessTime = Date.now();
    (window as any).performanceTracker.markEnd(performanceConstant.load_resource);
    this.debugOverlay = new DebugOverlay(this, sessionInfo);

    this.ttsa = this.connectTtsa(sessionInfo)
    this.renderScheduler.init();
    // 同步初始canvas显隐状态
    this.renderScheduler.setAvatarCanvasVisible(this.avatarCanvasVisible);
    // 设置上报使用ttsa
    (window as any).performanceTracker.setReportFunc(this.ttsa);

    window.addEventListener('beforeunload', this.handleBeforeUnload);
    document.addEventListener('visibilitychange', this.boundVisibilityChange);
  }

  visibilitychange() {
    if (document.hidden) {
      // this.offlineMode()
      // tab 回来时，强制同步解帧队列
      // this.renderScheduler.forceSyncDecoder();
    } else {
      if (this.ttsa?.getStatus()) {
        this.renderScheduler.forceSyncDecoder();
      }
    }
  }

  setReplayData(data: any) {
    this.replayData = data;
  }

  handleReplaySend(frame: number) {
    if(!this.replayData) {
      return;
    }
    const frameReplayData = this.replayData.filter((item: any) => (Number(item.client_frame_number) === frame && item.event_type !== "sdk_burial_point"))?.[0];
    if(frameReplayData) {
      if(frameReplayData.event_type === 'state_change') {
        this.ttsa?.stateChange(frameReplayData.event_data.state, frameReplayData.event_data.params);
      }else if(frameReplayData.event_type === 'send_text') {
        this.speak(frameReplayData.event_data.ssml, frameReplayData.event_data.is_start, frameReplayData.event_data.is_end, frameReplayData.event_data.extra);

      }else {
        (window as any).avatarSDKLogger.log(this.TAG, `[handleReplaySend] 未知事件类型: ${frameReplayData}`);
      }
    }
  }

  // 初始化 ttsa
  private connectTtsa(sessionInfo: ISessionResponse) {
    (window as any).performanceTracker.markStart(performanceConstant.ttsa_connect);
    (window as any).performanceTracker.markStart(performanceConstant.ttsa_ready);
    return new Ttsa({
      sdkInstance: this,
      url: sessionInfo.socket_io_url,
      room: sessionInfo.room,
      session_id: sessionInfo.session_id,
      token: sessionInfo.token,
      framedata_proto_version: this.resourceManager.getConfig().framedata_proto_version,
      reconnect_client_timeout: sessionInfo?.reconnect_client_timeout || 0,
      appInfo: {
        ...this.resourceManager.getAppInfo(),
        env: this._env
      },
      onReady: () => {
        this.ttsa?.sendSdkPoint('connect_sdk', {
          timestamp: this.startConnectTime,
        });

        this.ttsa?.sendSdkPoint('connect_sdk_success', {
          timestamp: this.connectSuccessTime,
        });

        this.start()
      },
      handleMessage: (type: EFrameDataType, data: IRawFrameData[]) => {
        // 处理下行数据
        this.renderScheduler.handleData(data, type);
      },
      handleAAFrame: (data: any) => {
        this.options.onAAFrameHandle?.(data);
      },
      runStartFrameIndex: (client_time: number) => {
        this.renderScheduler.runStartFrameIndex();
      },
      ttsaStateChangeHandle: (state: StateChangeInfo) => {
        this.renderScheduler.ttsaStateChangeHandle(state);
      },
      reloadSuccess: () => {
        this.reloadSuccess()
      },
      enterOfflineMode: () => {
        this.offlineHandle()
      },
      reStartSDK: () => {
        this.reStartSession()
      },
      sendVoiceEnd: () => {
        this.renderScheduler?.sendVoiceEnd();
      }
    });
  }

  start() {
    this.renderScheduler.render();
    this.ttsa?.start();
    
    // 如果初始化时设置了隐身模式，则立即进入隐身状态
    if (this.pendingInvisibleMode) {
      this.pendingInvisibleMode = false;
      this.setInvisibleMode()
    } else {
      this.onStatusChange(AvatarStatus.online);
    }
    
  }

  private async _reload() {
    const res = await this.resourceManager._reload();
    if (res) {
      this.ttsa = this.connectTtsa(res);
      this.ttsa._setResumeInfoCallback(
        this.resourceManager._getSessionId(),
        this.renderScheduler._getResumeInfo.bind(this.renderScheduler)
      )
    }
    return res;
  }

  reloadSuccess() {
    this.onStatusChange(AvatarStatus.online);
    setTimeout(() => {
      window.clearInterval(this._offlineTimer)
    }, 1000)
  }

  async stop() {
    await this.renderScheduler.stop();
  }
  private handleBeforeUnload = () => {
    this.destroy("beforeunload");
  };

  public isDestroyed() {
    return this.destroyed;
  }

  public async destroyClient() {
    this.destroyed = true;
    
    this.resetRetryState();
    // 清理重试定时器
    this.clearAllRetryTimers();
    
    // 清理离线模式定时器
    if (this._offlineTimer !== -1) {
      clearInterval(this._offlineTimer);
      this._offlineTimer = -1;
    }

    // 停止TTSA连接
    if (this.ttsa) {
      this.ttsa.close();
      this.ttsa = null;
    }

    // 停止渲染调度器
    if (this.renderScheduler) {
      this.renderScheduler.destroy();
    }

    // 清理资源管理器（包括缓存）
    if (this.resourceManager) {
      this.resourceManager.destroy();
    }

    // 清理调试浮层
    if (this.debugOverlay) {
      this.debugOverlay.destroy();
      this.debugOverlay = null;
    }
    // 主动断开需要销毁网络监听相关事件
    if(this.networkMonitor) {
      this.networkMonitor.destroy();
    }

    // 清理DOM元素
    this.el = null;
    this.startConnectTime = 0;
    this.connectSuccessTime = 0;
    window.removeEventListener("beforeunload", this.handleBeforeUnload);
    document.removeEventListener("visibilitychange", this.boundVisibilityChange);

    (window as any).avatarSDKLogger.log(this.TAG, "SDK 已销毁");
  }

  public async destroy(stop_reason: string = "user"): Promise<void> {
    this.replayData = null;
    this.ttsa?.sendSdkPoint('close_session', {
      reason: stop_reason,
    });
    this.destroyClient();
    const res = await this.resourceManager.stopSession(stop_reason);
    if(res) {
      this.onStatusChange(AvatarStatus.close);
    }
    return res
  }

  idle() {
    if(this.enableClientInterrupt) {
      this.renderScheduler.interrupt("idle");
    }
    this.ttsa?.idle();
  }

  listen() {
    if(this.enableClientInterrupt) {    
      this.renderScheduler.interrupt("listen");
    }
    this.ttsa?.listen();
  }

  think() {
    if(this.enableClientInterrupt) {    
      this.renderScheduler.interrupt("think");
    }
    this.ttsa?.think();
  }
  interactiveidle() {
    if(this.enableClientInterrupt) {    
      this.renderScheduler.interrupt("interactiveidle");
    }
    this.ttsa?.interactiveidle();
  }

  speak(ssml: string, is_start: boolean = true, is_end: boolean = true, extra = {client_speak_id: ''}) {
    if(this.enableClientInterrupt) {    
      this.renderScheduler.interrupt("speak");
    }
    this.ttsa?.sendText(ssml, is_start, is_end, extra);
    this.renderScheduler.resume();
  }

  /**
     * 通知后端进入隐身模式
     */
  private notifyEnterInvisibleMode(): void {
    this.ttsa?.enterInvisibleMode();
  }

  /**
   * 通知后端退出隐身模式
   */
  private notifyExitInvisibleMode(): void {
    this.ttsa?.exitInvisibleMode();
  }

  setVolume(volume: number) {
    this.renderScheduler.setVolume(volume);
  }

  getSessionId() {
    return this.resourceManager.session_id;
  }

  // 显示调试浮层
  public showDebugInfo() {
    if (!this.debugOverlay) {
      return;
    }
    this.debugOverlay?.show();
  }

  // 隐藏调试浮层
  public hideDebugInfo() {
    this.debugOverlay?.hide();
  }

  // 改变数字人canvas的显隐状态
  public changeAvatarVisible(visible: boolean) {
    this.avatarCanvasVisible = visible;
    this.renderScheduler?.setAvatarCanvasVisible(visible);
  }

  /**
   * 在初始化未完成时清理所有已初始化的资源
   * @param reason 清理原因
   */
  private cleanupBeforeInitComplete(reason: string) {
    (window as any).avatarSDKLogger.warn(this.TAG, `清理初始化未完成的资源，原因: ${reason}`);
    
    // 1. 停止会话
    if (this.resourceManager) {
      this.resourceManager.stopSession(reason);
    }
    
    // 2. 断开 WebSocket 连接
    if (this.ttsa) {
      this.ttsa.close();
      this.ttsa = null;
    }
    
    // 3. 清理渲染调度器（如果已初始化）
    if (this.renderScheduler) {
      try {
        this.renderScheduler.destroy();
      } catch (e) {
        (window as any).avatarSDKLogger.warn(this.TAG, '清理 renderScheduler 时出错', e);
      }
    }
    
    // 4. 清理资源管理器（如果已初始化）
    if (this.resourceManager) {
      try {
        this.resourceManager.destroy();
      } catch (e) {
        (window as any).avatarSDKLogger.warn(this.TAG, '清理 resourceManager 时出错', e);
      }
    }
    
    // 5. 清理调试浮层（如果已创建）
    if (this.debugOverlay) {
      try {
        this.debugOverlay.destroy();
        this.debugOverlay = null;
      } catch (e) {
        (window as any).avatarSDKLogger.warn(this.TAG, '清理 debugOverlay 时出错', e);
      }
    }
    
    // 6. 重置状态
    this.isInitialized = false;
    this.startConnectTime = 0;
    this.connectSuccessTime = 0;
  }

  private offlineHandle() {
    this.onStatusChange(AvatarStatus.offline)
    this.renderScheduler._offlineMode()
    this._offlineTimer = window.setInterval(() => {
      if(this.status !== AvatarStatus.offline) {
        clearInterval(this._offlineTimer);
        this._offlineTimer = -1;
        return
      }
      this.renderScheduler._offlineRun()
    }, this._offlineInterval)
  }

  public stopSessionFromSocket(reason: string) {
    this.resourceManager.stopSession(reason)
  }

  offlineMode() {
    // this.networkMonitor.setState(false)
    this.renderScheduler.interrupt("in_offline_mode")
    this.resourceManager.stopSession("offline_mode")
    this.ttsa?.close()
    this.offlineHandle()
  }

  onlineMode() {
    if (!NetworkMonitor.ONLINE) {
      return
    }
    // this.networkMonitor.setState(true)
    this._reload()
  }

  onMessage(params: Parameters<typeof Errors>[0]) {
    const e = Errors(params)
    if(params.code !== EErrorCode.RENDER_BODY_ERROR && params.code !== EErrorCode.RENDER_FACE_ERROR && params.code !== EErrorCode.BODY_DATA_EXPIRED) {
      this.options.onMessage(e)
    }
    this.debugOverlay?.addError(e)
  }

  onStatusChange(status: AvatarStatus) {
    if(status === this.status) {
      return
    }
    this.status = status
    this.options.onStatusChange?.(status)
  }

  /**
   * 切换隐身模式（暂停/恢复音视频实时渲染）
   */
  public switchInvisibleMode(): void {
    if (!this.renderScheduler) {
      (window as any).avatarSDKLogger?.warn(
        this.TAG,
        'RenderScheduler 未初始化，无法切换隐身模式'
      );
      return;
    }
    
      // 如果当前数字人状态是在线 或者 visible，切换到暂停时
      if (this.status === AvatarStatus.visible || this.status === AvatarStatus.online ) {
        this.setInvisibleMode()
      } else {
        this.notifyExitInvisibleMode();
        this.renderScheduler.switchInvisibleMode();
        this.listen();
    }
  }
  private setInvisibleMode() {
      // 先调用 interactiveidle()
      this.interactiveidle();
      this.renderScheduler.switchInvisibleMode();
      this.notifyEnterInvisibleMode();
      this.onStatusChange(AvatarStatus.invisible);
  }
  public getPendingInvisibleMode() {
    return this.pendingInvisibleMode || false;
  }
  /**
   * 获取当前渲染状态
   */
  public getRenderState(): RenderState {
    if (!this.renderScheduler) {
      return RenderState.init;
    }
    return this.renderScheduler.getRenderState();
  }

  changeLayout(layout: Layout) {
    this.ttsa?.changeLayout(layout);
    this.renderScheduler.setCharacterCanvasLayout(layout);
  }

  changeWalkConfig(walkConfig: WalkConfig) {
    this.ttsa?.changeWalkConfig(walkConfig)
    this.renderScheduler.setWalkConfig(walkConfig);
  }
  
  interrupt(type: string) {
    this.renderScheduler.interrupt(type);
  }

  private triggerReconnect() {
    // 如果已经在重连中，直接返回，避免重复触发
    if (this.isRetrying) {
      (window as any).avatarSDKLogger.warn(this.TAG, "正在重连中，跳过本次触发");
      return;
    }

    if (this.reconnectDebounceTimer !== -1) {
      clearTimeout(this.reconnectDebounceTimer);
      this.reconnectDebounceTimer = -1;
    }
    if (this.retryTimer !== -1) {
      clearTimeout(this.retryTimer);
      this.retryTimer = -1;
    }

    this.reconnectDebounceTimer = window.setTimeout(() => {
      this.isRetrying = false;
      this.retryCount = 1;
      this.retryRound = 1;
      this.reStartSession();
      this.reconnectDebounceTimer = -1;
    }, 100);
  }

  reStartSession() {
    if (this.isRetrying || this.retryRound > this.maxRetryRound) return;

    this.clearAllRetryTimers();

    // 标记重试状态
    this.isStartRetry = true;
    this.isRetrying = true;

    // 使用非递归方式实现重试逻辑
    this._retryImpl();
  }

  private async _retryImpl() {
    if (this.retryRound > this.maxRetryRound || !this.isRetrying) {
      return;
    }

    let delay = 1000;
    if (this.retryCount > 1) {
      delay = Math.pow(2, this.retryCount) * 1000;
    }

    // 使用setTimeout代替递归，避免调用栈溢出
    setTimeout(async () => {
      try {
        const result = await this._reload();
        if (result === null) {
          // 重试失败：判断本轮是否达上限
          if (this.retryCount >= this.maxRetryCount) {
            // 本轮次数用尽，判断是否达最大轮次
            if (this.retryRound >= this.maxRetryRound) {
              // 总次数用尽（3*9=27次），停止重试
              (window as any).avatarSDKLogger.warn(
                this.TAG, 
                `重试达最大轮次(${this.maxRetryRound})+每轮最大次数(${this.maxRetryCount})，总次数=${this.maxRetryRound*this.maxRetryCount}，停止重试`
              );
              this.resetRetryState(); // 完全重置状态
              return;
            } else {
              // 未达最大轮次：重置本轮计数，轮次+1
              (window as any).avatarSDKLogger.warn(
                this.TAG, 
                `第${this.retryRound}轮重试次数达上限(${this.maxRetryCount})，进入第${this.retryRound+1}轮重试`
              );
              this.retryCount = 1; // 重置本轮计数
              this.retryRound += 1; // 轮次+1
            }
          } else {
            // 本轮未达上限：计数+1
            this.retryCount += 1;
          }
          // 继续重试
          this._retryImpl();
        } else {
          // 重试成功：完全重置所有状态
          this.renderScheduler.stopAudio(-1);
          (window as any).avatarSDKLogger.log(
            this.TAG, 
            `第${this.retryRound}轮第${this.retryCount}次重试成功，停止重试`
          );
          this.resetRetryState();
        }
      } catch (error) {
        // 异常处理：逻辑同失败场景
        (window as any).avatarSDKLogger.error(this.TAG, "重试过程异常", error);
        if (this.retryCount >= this.maxRetryCount) {
          if (this.retryRound >= this.maxRetryRound) {
            (window as any).avatarSDKLogger.warn(
              this.TAG, 
              `重试异常且达总次数上限(${this.maxRetryRound*this.maxRetryCount})，停止重试`
            );
            this.resetRetryState();
            return;
          } else {
            this.retryCount = 1;
            this.retryRound += 1;
          }
        } else {
          this.retryCount += 1;
        }
        // 仅当未达最大轮次时，继续重试
        if (this.retryRound <= this.maxRetryRound && this.isRetrying) {
          this._retryImpl();
        } else {
          this.resetRetryState();
        }
      }
    }, delay);
  }
  private clearAllRetryTimers() {
    // 清理重连防抖定时器
    if (this.reconnectDebounceTimer !== -1) {
      clearTimeout(this.reconnectDebounceTimer);
      this.reconnectDebounceTimer = -1;
    }
    // 清理重试定时器
    if (this.retryTimer !== -1) {
      clearTimeout(this.retryTimer);
      this.retryTimer = -1;
    }
  }

  // 统一重置重试状态
  private resetRetryState() {
    this.isRetrying = false;
    this.isStartRetry = false;
    this.retryCount = 1; // 重置每轮计数
    this.retryRound = 1; // 重置轮次（关键）
  }
}
