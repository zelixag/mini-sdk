/**
 * XmovAvatarMP - Mini Program Digital Human SDK
 * 微信小程序数字人 SDK 主入口
 *
 * 设计原则：
 * 1. API 与 Web SDK (XmovAvatar) 保持完全兼容
 * 2. 复用主项目核心逻辑，通过适配器层适配小程序平台
 * 3. 模块化设计，便于维护和测试
 */

// ========== Polyfill 初始化 ==========
import './polyfill/window';
import './polyfill/fetch';
import './polyfill/event';

// ========== 导出适配器 ==========
export { CanvasAdapter, createCanvasAdapter, getWebGLContext } from './adapters/canvas';
export { AudioAdapter } from './adapters/audio';
export { MiniProgramWebSocket, createWebSocket, io } from './adapters/websocket';
export { request, get, post, mpRequest, AbortController } from './adapters/request';

// ========== 导出工具 ==========
export { logger, createModuleLogger, LogLevel } from './utils/logger';
export * from './utils/Math';

// ========== 导出核心模块 ==========
export { RenderSchedulerMP } from './core/RenderSchedulerMP';
export { DataCacheQueueMP } from './core/DataCacheQueueMP';

// ========== 导出渲染组件 ==========
export { GLDeviceMP } from './render/GLDeviceMP';
export { GLPipelineMP } from './render/GLPipelineMP';
export { AvatarRendererMP } from './render/AvatarRendererMP';

// ========== 导出模块 ==========
export { ResourceManagerMP } from './modules/ResourceManagerMP';
export { Decoder, ParallelDecoder } from './modules/decoder';
export { AudioRenderer } from './modules/AudioRenderer';
export { UIRenderer } from './modules/UIRenderer';

// ========== 导出类型 ==========
export * from './types';

// ========== 主类定义 ==========
import { logger } from './utils/logger';
import { request, mpRequest } from './adapters/request';
import { AudioAdapter } from './adapters/audio';
import { io, MiniProgramWebSocket } from './adapters/websocket';
import { headersNeedSign } from './utils/encodeToken';
import { RenderSchedulerMP } from './core/RenderSchedulerMP';
import { DataCacheQueueMP } from './core/DataCacheQueueMP';
import { GLDeviceMP } from './render/GLDeviceMP';
import { AvatarRendererMP } from './render/AvatarRendererMP';
import { ResourceManagerMP } from './modules/ResourceManagerMP';
import { AudioRenderer } from './modules/AudioRenderer';
import { UIRenderer } from './modules/UIRenderer';
import { ParallelDecoder } from './modules/decoder';

/**
 * Avatar 状态枚举
 */
export enum AvatarStatus {
  online = 'online',
  offline = 'offline',
  network_on = 'network_on',
  network_off = 'network_off',
  close = 'close',
  visible = 'visible',
  invisible = 'invisible',
  stopped = 'stopped'
}

/**
 * 渲染状态枚举
 */
export enum RenderState {
  init = 'init',
  rendering = 'rendering',
  paused = 'paused',
  resumed = 'resumed',
  stopped = 'stopped'
}

/**
 * 初始化模式
 */
export enum InitModel {
  normal = 'normal',
  invisible = 'invisible'
}

/**
 * SDK 配置选项
 */
export interface IAvatarOptions {
  containerId: string;
  canvas?: any;
  gl?: any;
  appId: string;
  appSecret: string;
  gatewayServer: string;
  cacheServer?: string;
  tag?: string;
  headers?: Record<string, string>;
  env?: string;
  config?: any;
  enableLogger?: boolean;
  enableDebugger?: boolean;
  onMessage?: (error: any) => void;
  onStateChange?: (state: string) => void;
  onStatusChange?: (status: AvatarStatus) => void;
  onDownloadProgress?: (progress: number) => void;
  onSpeakStateChange?: (state: string, client_speak_id: string) => void;
  onRenderChange?: (state: RenderState) => void;
  onVoiceStateChange?: (state: string, duration?: number) => void;
  onWalkStateChange?: (state: string) => void;
}

/**
 * 初始化参数
 */
export interface IInitParams {
  initModel?: 'normal' | 'invisible';
  onDownloadProgress?: (progress: number) => void;
}

/**
 * 会话信息
 */
export interface ISessionInfo {
  session_id: string;
  socket_io_url: string;
  token: string;
  room: string;
  resource_pack?: any;
  config?: any;
}

/**
 * 布局配置
 */
export interface Layout {
  container: { size: number[] };
  avatar: {
    v_align: string;
    h_align: string;
    scale: number;
    offset_x: number;
    offset_y: number;
  };
}

/**
 * 行走配置
 */
export interface WalkConfig {
  min_x_offset: number;
  max_x_offset: number;
  walk_points: { [key: string]: number };
  init_point?: number;
}

/**
 * SDK 错误
 */
export interface SDKError {
  code: string;
  message: string;
  e?: any;
}

/**
 * 网络信息
 */
export interface INetworkInfo {
  downlink: number;
  rtt: number;
}

/**
 * XmovAvatarMP - 微信小程序数字人 SDK 主类
 */
export class XmovAvatarMP {
  private options: IAvatarOptions;
  private status: AvatarStatus = AvatarStatus.stopped;
  private sessionInfo: ISessionInfo | null = null;
  private sessionStarted: boolean = false;
  private destroyed: boolean = false;

  // 渲染组件
  private audioAdapter: AudioAdapter | null = null;
  private ttsaSocket: MiniProgramWebSocket | null = null;

  // 渲染相关
  private renderScheduler: RenderSchedulerMP | null = null;
  private avatarRenderer: AvatarRendererMP | null = null;
  private resourceManager: ResourceManagerMP | null = null;

  // 内部状态
  private avatarCanvasVisible: boolean = true;
  private pendingInvisibleMode: boolean = false;
  private isInitialized: boolean = false;

  // 回调函数
  private _onStateChange?: (state: string) => void;
  private _onStatusChange?: (status: AvatarStatus) => void;
  private _onDownloadProgress?: (progress: number) => void;

  constructor(options: IAvatarOptions) {
    this.options = options;

    if (options.enableLogger) {
      logger.setEnabled(true);
    }

    logger.info('[XmovAvatarMP] Creating instance');

    this._onStateChange = options.onStateChange;
    this._onStatusChange = options.onStatusChange;
    this._onDownloadProgress = options.onDownloadProgress;

    this.initAudio();
  }

  private initAudio(): void {
    try {
      this.audioAdapter = new AudioAdapter({ autoplay: false, volume: 1.0 });
    } catch (e) {
      logger.error('[XmovAvatarMP] Audio init error:', e);
    }
  }

  async init(params?: IInitParams): Promise<boolean> {
    if (this.destroyed) {
      throw new Error('[XmovAvatarMP] Instance already destroyed');
    }

    if (params?.initModel === 'invisible') {
      this.pendingInvisibleMode = true;
    }

    if (params?.onDownloadProgress) {
      this._onDownloadProgress = params.onDownloadProgress;
    }

    this.isInitialized = true;
    this.updateStatus(AvatarStatus.stopped);

    logger.info('[XmovAvatarMP] Initialized');
    return true;
  }

  async start(): Promise<boolean> {
    if (this.destroyed || !this.isInitialized) {
      return false;
    }

    const ok = await this.startSession();
    if (!ok) {
      return false;
    }

    this.status = AvatarStatus.visible;
    this.updateStatus(AvatarStatus.visible);

    logger.info('[XmovAvatarMP] Started');
    return true;
  }

  private async startSession(): Promise<boolean> {
    if (this.sessionStarted) {
      return true;
    }

    const { appId, appSecret, gatewayServer, tag, config } = this.options;

    try {
      const payload = {
        ...(tag ? { tag } : {}),
        config: { framedata_proto_version: 2, ...(config || {}) }
      };

      // 添加签名
      const { headers: signHeaders, data: signedData } = headersNeedSign(
        appId,
        appSecret,
        'POST',
        gatewayServer,
        payload
      );

      const headers = {
        'content-type': 'application/json',
        ...signHeaders,
        ...(this.options.headers || {})
      };

      const response = await mpRequest(gatewayServer, {
        method: 'POST',
        headers,
        body: JSON.stringify(signedData)
      });

      const result = await response.json();
      const data = result?.data || result;

      if (!data) {
        this.emitError('INIT_FAILED', 'Start session response is empty');
        return false;
      }

      if (!data.resource_pack) {
        this.emitError('INIT_FAILED', 'Missing resource_pack');
        return false;
      }

      if (!data.socket_io_url || !data.token || !data.room || !data.session_id) {
        this.emitError('INIT_FAILED', 'Missing socket_io_url/token/room/session_id');
        return false;
      }

      this.sessionInfo = data;
      this.sessionStarted = true;

      await this.connectTtsa();

      logger.info('[XmovAvatarMP] Session started:', data.session_id);
      return true;
    } catch (error) {
      logger.error('[XmovAvatarMP] Start session error:', error);
      this.emitError('INIT_FAILED', String(error));
      return false;
    }
  }

  private async connectTtsa(): Promise<boolean> {
    if (!this.sessionInfo) return false;

    try {
      const { socket_io_url } = this.sessionInfo;
      this.ttsaSocket = io(socket_io_url);

      return new Promise((resolve) => {
        this.ttsaSocket!.on('connect', () => {
          logger.info('[XmovAvatarMP] TTSA connected');
          resolve(true);
        });

        this.ttsaSocket!.on('connect_error', (err: any) => {
          logger.error('[XmovAvatarMP] TTSA connection error:', err);
          resolve(false);
        });

        this.ttsaSocket!.on('message', (data: any) => {
          this.handleTtsaData(data);
        });

        this.ttsaSocket!.connect();
      });
    } catch (error) {
      logger.error('[XmovAvatarMP] Connect TTSA error:', error);
      return false;
    }
  }

  private handleTtsaData(data: any): void {
    logger.debug('[XmovAvatarMP] TTSA data:', data);
  }

  pause(): boolean {
    if (this.status !== AvatarStatus.visible) {
      return false;
    }

    this.status = AvatarStatus.invisible;
    this.updateStatus(AvatarStatus.invisible);

    logger.info('[XmovAvatarMP] Paused');
    return true;
  }

  async stop(): Promise<boolean> {
    if (this.destroyed) {
      return false;
    }

    if (this.renderScheduler) {
      this.renderScheduler.stop();
    }

    await this.stopSession();

    this.status = AvatarStatus.stopped;
    this.updateStatus(AvatarStatus.stopped);

    logger.info('[XmovAvatarMP] Stopped');
    return true;
  }

  private async stopSession(): Promise<void> {
    if (this.ttsaSocket) {
      this.ttsaSocket.disconnect();
      this.ttsaSocket = null;
    }
    this.sessionStarted = false;
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    await this.stop();

    if (this.renderScheduler) {
      this.renderScheduler.destroy();
      this.renderScheduler = null;
    }

    if (this.avatarRenderer) {
      this.avatarRenderer.destroy();
      this.avatarRenderer = null;
    }

    if (this.audioAdapter) {
      this.audioAdapter.destroy();
      this.audioAdapter = null;
    }

    this.destroyed = true;
    this.isInitialized = false;

    logger.info('[XmovAvatarMP] Destroyed');
  }

  speak(ssml: string, is_start: boolean = true, is_end: boolean = true, extra?: any): string | null {
    return this.sendText(ssml, { isStart: is_start, isEnd: is_end });
  }

  sendText(text: string, options?: { isStart?: boolean; isEnd?: boolean }): string | null {
    if (!this.ttsaSocket || !this.sessionInfo) {
      logger.warn('[XmovAvatarMP] Not connected, cannot send text');
      return null;
    }

    const uniqueSpeakId = `mp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const payload = {
      ssml: text,
      is_start: options?.isStart ?? true,
      is_end: options?.isEnd ?? true,
      multi_turn_conversation_id: uniqueSpeakId,
      session_speak_req_id: Date.now(),
      extra: { client_speak_id: uniqueSpeakId }
    };

    this.ttsaSocket.emit('send_text', payload);

    logger.info('[XmovAvatarMP] Text sent:', uniqueSpeakId);
    return uniqueSpeakId;
  }

  idle(): void { this.stateChange('idle'); }
  listen(): void { this.stateChange('listen'); }
  think(): void { this.stateChange('think'); }
  interactiveidle(): void { this.stateChange('interactive_idle'); }

  private stateChange(state: string): void {
    if (!this.ttsaSocket) return;
    this.ttsaSocket.emit('state_change', { state, params: {} });
  }

  setVolume(volume: number): void {
    if (this.audioAdapter) {
      this.audioAdapter.setVolume(volume);
    }
  }

  changeAvatarVisible(visible: boolean): void {
    this.avatarCanvasVisible = visible;
    logger.info('[XmovAvatarMP] Avatar visible:', visible);
  }

  changeLayout(layout: Layout): void {
    if (this.ttsaSocket) {
      this.ttsaSocket.emit('change_layout', layout);
    }
  }

  changeWalkConfig(walkConfig: WalkConfig): void {
    if (this.ttsaSocket) {
      this.ttsaSocket.emit('walk_config', walkConfig);
    }
  }

  getStatus(): AvatarStatus {
    return this.status;
  }

  getSessionId(): string | null {
    return this.sessionInfo?.session_id || null;
  }

  getSessionInfo(): ISessionInfo | null {
    return this.sessionInfo;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  getTag(): string | undefined {
    return this.options.tag;
  }

  get businessENV(): string {
    return this.options.env || 'production';
  }

  getUniqueSpeakId(): string {
    return `${Date.now()}-${this.sessionInfo?.session_id || 'unknown'}`;
  }

  showDebugInfo(): void {}
  hideDebugInfo(): void {}

  private updateStatus(status: AvatarStatus): void {
    if (this.status === status) return;
    this.status = status;
    this._onStatusChange?.(status);
  }

  private emitError(code: string, message: string): void {
    const error = { code, message };
    this.options.onMessage?.(error);
    logger.error('[XmovAvatarMP] Error:', error);
  }
}

export default XmovAvatarMP;
