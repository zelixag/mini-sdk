/**
 * 小程序 SDK 入口文件（熵减优化）
 * 
 * 说明：这是小程序 SDK 的主入口，负责：
 * 1. 初始化所有 Polyfill（window, fetch, Event 等）
 * 2. 初始化所有适配器（Network, WebSocket, Canvas, Audio）
 * 3. 导出 XmovAvatarMP 类（小程序专用包装类）
 * 
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一入口，清晰的初始化顺序
 * 2. 系统秩序：Polyfill → 适配器 → 核心 SDK
 * 3. 抽象层次：隐藏平台差异，提供统一接口
 * 4. 负熵实现：构建时桥接，运行时适配
 */

// ========== 第一步：Polyfill 初始化（必须在最前面）==========
import './utils/window-polyfill';        // window → globalThis
import { initWindowPolyfill } from './utils/window-polyfill';
import './utils/api-polyfill';           // fetch, Event, Image, URL
import './utils/blob-polyfill';          // Blob
import './utils/module-polyfill';        // socket.io-client 适配器

// ========== Proto 初始化（face_data protobuf 解码用）==========
import './proto-loader';

// ========== 第二步：适配器初始化 ==========
import './utils/request-adapter-wrapper'; // 初始化 globalThis.fetch（供主项目 request 用）
import { mpRequest } from './utils/request-adapter';
import { EErrorCode } from './types/error';
import { headersNeedSign } from './utils/encodeToken';
import { io } from './adapters/websocket';
import { decode as msgpackDecode } from '@msgpack/msgpack';
import { decodeBodyData, normalizeRawInput } from './decoders/body-decoder';
import { decodeFaceData, initFaceProto } from './decoders/face-decoder';
import { AudioAdapter } from './adapters/audio';
import { createModuleLogger } from './utils/logger';
import type { IRawBodyFrameData, ITtsFaceFrameData, IRawEventFrameData, IRawAudioFrameData } from './types/frame-data';
import { ResourceManagerMP } from './modules/resource-manager-adapter';
import { BodyRendererMP } from './modules/body-renderer-mp';
import { RenderSchedulerMP } from './control/RenderSchedulerMP';
import { AvatarRendererMP, FaceAlignmentConfigMP } from './baseRender/AvatarRendererMP';

const log = createModuleLogger('SDK');

// ========== 第三步：导出适配器（供外部使用）==========
export { CanvasAdapter, createCanvasAdapter } from './adapters/canvas';
export { AudioAdapter, createAudioAdapter } from './adapters/audio';
export { MiniProgramWebSocket, createWebSocket, io } from './adapters/websocket';
export { mpRequest, setGlobalFetch, AbortController } from './utils/request-adapter';
export { ErrorHandler, errorHandler } from './utils/ErrorHandler';
export { logger, createModuleLogger, LogLevel } from './utils/logger';
export { EErrorCode } from './types/error';
// UMD 格式不支持 type-only exports，改为普通导出
// 注意：SDKError 是接口类型，UMD 格式中类型会被擦除，只导出值
export { AvatarStatus, RenderState } from './types/index';
export { decodeBodyData, decodeFaceData } from './decoders';
export type { IRawBodyFrameData, ITtsFaceFrameData, IRawAudioFrameData, IRawEventFrameData, IRawWidgetData, EFrameDataType } from './types/frame-data';
export type { FaceAlignmentConfigMP } from './baseRender/AvatarRendererMP';
// SDKError 类型可以通过 EErrorCode 和相关类型推断，不需要单独导出

// ========== 第四步：导出核心 SDK（可运行骨架）==========
/**
 * XmovAvatarMP - 小程序版数字人 SDK（最小可运行骨架）
 *
 * 说明：
 * 1. 先提供稳定的实例生命周期，打通小程序示例流程
 * 2. 后续可在该类内部替换为真实渲染/网络/解码实现
 * 3. 对外 API 保持稳定：init/start/pause/stop/destroy/getStatus
 */
/** start_session 返回的会话信息（与主项目 ISessionResponse 一致） */
export interface ISessionInfoMP {
  session_id: string;
  socket_io_url: string;
  token: string;
  room: string;
  resource_pack?: any;
  config?: any;
}

export class XmovAvatarMP {
  private options: any;
  private status: string;
  private sessionInfo: ISessionInfoMP | null;
  private sessionStarted: boolean;
  private ttsaSocket: ReturnType<typeof io> | null = null;
  private env: string;
  private avatarCanvasVisible = true;
  private destroyed = false;
  /** 资源管理器（供 RenderScheduler 等复用） */
  public resourceManager: ResourceManagerMP | null = null;
  /** 渲染调度器（帧驱动、数据路由） */
  private renderScheduler: RenderSchedulerMP | null = null;
  /** 数字人渲染器（身体+预留脸部） */
  private avatarRenderer: AvatarRendererMP | null = null;
  /** 音频播放适配器（用于 TTS 音频） */
  private audioAdapter: AudioAdapter | null = null;

  // ---- 音频队列管理 ----
  /** 按 sid 缓存尚未写入文件的 WebM/MP3 音频 chunks */
  private ttsAudioChunks = new Map<number, Uint8Array[]>();
  /** 末尾静默 flush 定时器 */
  private ttsAudioFlushTimer: any = null;
  /** 等待顺序播放的临时文件列表 */
  private audioPlayQueue: Array<{ path: string; sid: number }> = [];
  /** 当前是否正在播放 */
  private audioPlaying = false;
  /** 最近一次收到的音频 sid（用于检测 sid 变化） */
  private lastIncomingAudioSid = -1;
  private audioFlushDelayMs = 600;

  constructor(options: any = {}) {
    this.options = options;
    this.status = 'created';
    this.sessionInfo = null;
    this.sessionStarted = false;
    this.env = options?.env || 'production';
    this.audioFlushDelayMs = typeof options?.audioFlushDelayMs === 'number' ? options.audioFlushDelayMs : 600;
    this.emitStatus(this.status);
  }

  async init(): Promise<boolean> {
    if (this.status === 'destroyed') {
      throw new Error('[XmovAvatarMP] instance already destroyed');
    }
    this.status = 'inited';
    this.emitStatus(this.status);
    return true;
  }

  async start(): Promise<boolean> {
    if (this.status === 'destroyed') {
      return false;
    }
    const ok = await this.startSessionIfNeeded();
    if (!ok) {
      return false;
    }
    this.status = 'playing';
    this.emitStatus(this.status);
    return true;
  }

  pause(): boolean {
    if (this.status !== 'playing') {
      return false;
    }
    this.status = 'paused';
    this.emitStatus(this.status);
    return true;
  }

  async stop(): Promise<boolean> {
    if (this.status === 'destroyed') {
      return false;
    }
    this.renderScheduler?.stop();
    await this.stopSessionIfNeeded();
    this.status = 'stopped';
    this.emitStatus(this.status);
    return true;
  }

  destroy(): boolean {
    this.clearAudioQueue();
    this.renderScheduler?.destroy();
    this.avatarRenderer?.destroy();
    this.audioAdapter?.destroy();
    this.renderScheduler = null;
    this.avatarRenderer = null;
    this.audioAdapter = null;
    this.status = 'destroyed';
    this.destroyed = true;
    this.emitStatus(this.status);
    return true;
  }

  getStatus(): string {
    return this.status;
  }

  getTag(): string | undefined {
    return this.options?.tag;
  }

  get businessENV(): string {
    return this.env;
  }

  getUniqueSpeakId(): string {
    return `${Date.now()}-${this.sessionInfo?.session_id || 'unknown'}`;
  }

  getSessionId(): string | null {
    return this.sessionInfo?.session_id || null;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  showDebugInfo(): void {}

  hideDebugInfo(): void {}

  changeAvatarVisible(visible: boolean): void {
    this.avatarCanvasVisible = visible;
    if (!this.renderScheduler) return;
    if (visible) {
      if (this.status === 'playing') this.renderScheduler.start();
    } else {
      this.renderScheduler.stop();
    }
  }

  setVolume(volume: number): void {
    if (this.audioAdapter) {
      this.audioAdapter.volume = volume;
    }
  }

  /** 获取当前会话信息（调试用） */
  getSessionInfo(): ISessionInfoMP | null {
    return this.sessionInfo;
  }

  /** 获取资源管理器（供渲染层使用） */
  getResourceManager(): ResourceManagerMP | null {
    return this.resourceManager;
  }

  /**
   * 运行时热更新脸部贴合参数（无需重启会话）
   */
  setFaceAlignmentConfig(config: FaceAlignmentConfigMP): boolean {
    if (!config || typeof config !== 'object') return false;
    const merged = {
      ...(this.options?.config?.face_align || {}),
      ...config
    };
    this.options = this.options || {};
    this.options.config = this.options.config || {};
    this.options.config.face_align = merged;
    if (this.resourceManager?.config) {
      this.resourceManager.config.face_align = {
        ...(this.resourceManager.config.face_align || {}),
        ...config
      };
    }
    this.avatarRenderer?.setFaceAlignmentConfig(config);
    return true;
  }

  /**
   * 设置画布尺寸并重建渲染缓冲（用于非全屏或自定义大小）。
   * @param width 画布缓冲宽度（像素）
   * @param height 画布缓冲高度（像素）
   */
  setCanvasSize(width: number, height: number): void {
    this.avatarRenderer?.setCanvasSize(width, height);
  }

  /**
   * 发送文本驱动 TTS（高级封装，包含打断逻辑）
   * @param ssml 文本内容
   * @param is_start 是否为一段话的开始
   * @param is_end 是否为一段话的结束
   * @param extra 额外参数
   */
  speak(ssml: string, is_start: boolean = true, is_end: boolean = true, extra = { client_speak_id: '' }): string | null {
    this._speakCalledAt = Date.now();

    // 与 Web SDK 对齐：speak 前先执行打断逻辑
    // Web SDK: renderScheduler.interrupt("speak") → 清音频/face data, 停播放, 发 voice_end
    this.clearAudioQueue();

    // 通知服务端中断当前 speak（如果正在播报），使服务端状态机回到可接受新 speak 的状态
    // 这是修复"第二次 speak 无响应"的关键：服务端可能卡在上一次的 speak 状态
    this.sendSocket('state_change', { state: 'interactive_idle', params: {} });

    const result = this.sendText(ssml, { isStart: is_start, isEnd: is_end });
    return result;
  }

  /**
   * 发送文本驱动 TTS（上行 send_text）
   * 需在 TTSA 连接就绪后调用
   */
  sendText(text: string, options?: { isStart?: boolean; isEnd?: boolean; pitch?: string; speed?: string; volume?: string }): string | null {
    const socket = this.ttsaSocket;
    if (!socket?.connected) {
      log.error('sendText: socket 未连接');
      this.emitMessage(EErrorCode.WEBSOCKET_CONNECT_ERROR, '[XmovAvatarMP] sendText: TTSA not connected');
      return null;
    }
    const sessionId = this.sessionInfo?.session_id;
    if (!sessionId) {
      log.error('sendText: session_id 为空');
      this.emitMessage(EErrorCode.WEBSOCKET_CONNECT_ERROR, '[XmovAvatarMP] sendText: session_id is empty');
      return null;
    }
    const uniqueSpeakId = `mp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    (this as any)._speakIdSeq = ((this as any)._speakIdSeq || 0) + 1;
    const sessionSpeakReqId = (this as any)._speakIdSeq;

    const pitch = options?.pitch ?? '1';
    const speed = options?.speed ?? '1';
    const volume = options?.volume ?? '1';
    const ssml = /^\s*<speak[\s>]/i.test(text)
      ? text
      : `<speak pitch="${pitch}" speed="${speed}" volume="${volume}">${text}</speak>`;

    // 先发送 sdk_burial_point 埋点（告诉服务端客户端已准备好接收数据）
    const burialPayload = {
      ssml,
      is_start: options?.isStart ?? true,
      is_end: options?.isEnd ?? true,
      multi_turn_conversation_id: uniqueSpeakId,
      speak_id: sessionSpeakReqId,
      appId: this.options?.appId,
      appSecret: this.options?.appSecret,
      env: 'production',
      burial_type: 1,
      session_id: sessionId,
      event_en_name: 'llm_text_sdk_received',
      event_cn_name: '大模型输出的文本SDK前端收到',
      device: 'Mozilla/5.0 (iPhone; CPU iPhone OS like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0',
      timestamp: Date.now(),
      sdkVersion: '0.1.0-alpha'
    };
    socket.emit('sdk_burial_point', burialPayload);

    const payload = {
      ssml,
      is_start: options?.isStart ?? true,
      is_end: options?.isEnd ?? true,
      multi_turn_conversation_id: uniqueSpeakId,
      session_speak_req_id: sessionSpeakReqId,
      extra: {
        client_speak_id: uniqueSpeakId
      }
    };
    socket.emit('send_text', payload);
    return uniqueSpeakId;
  }

  idle(): void {
    this.stateChange('idle');
  }

  listen(): void {
    this.stateChange('listen');
  }

  think(): void {
    this.stateChange('think');
  }

  interactiveidle(): void {
    this.stateChange('interactive_idle');
  }

  changeLayout(layout: any): void {
    this.sendSocket('change_layout', layout);
  }

  changeWalkConfig(walkConfig: any): void {
    this.sendSocket('walk_config', walkConfig);
  }

  interrupt(type: string): void {
    this.sendSocket('interrupt', { type });
  }

  private stateChange(state: string, params?: object): void {
    this.sendSocket('state_change', { state, params: params || {} });
  }

  private sendSocket(event: string, payload: any): void {
    if (!this.ttsaSocket?.connected) {
      return;
    }
    this.ttsaSocket.emit(event, payload);
  }

  private async startSessionIfNeeded(): Promise<boolean> {
    if (this.sessionStarted) {
      return true;
    }

    const gatewayServer = this.options?.gatewayServer;
    if (!gatewayServer) {
      this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] gatewayServer is required');
      return false;
    }

    try {
      const appId = this.options?.appId;
      const appSecret = this.options?.appSecret;
      if (!appId || !appSecret) {
        this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] appId and appSecret are required for start_session');
        return false;
      }

      const payload = {
        ...(this.options?.tag ? { tag: this.options.tag } : {}),
        config: {
          framedata_proto_version: 2,
          ...(this.options?.config || {})
        }
      };

      const { headers: signHeaders, data: signedData } = headersNeedSign(appId, appSecret, 'POST', gatewayServer, payload);
      const headers = {
        'content-type': 'application/json',
        ...signHeaders,
        ...(this.options?.headers || {})
      };

      const response = await mpRequest(gatewayServer, {
        method: 'POST',
        headers,
        body: JSON.stringify(signedData)
      });

      const result = await response.json();
      const sessionData = result?.data || result;
      if (!sessionData) {
        this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] start_session response is empty', result);
        return false;
      }

      if (!sessionData.resource_pack) {
        this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] start_session response missing resource_pack', result);
        return false;
      }
      if (!sessionData.socket_io_url || !sessionData.token || !sessionData.room || !sessionData.session_id) {
        this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] start_session response missing socket_io_url/token/room/session_id', result);
        return false;
      }

      this.sessionInfo = sessionData;
      this.sessionStarted = true;

      // 初始化 ResourceManager（resource_pack 解析）
      const rp = sessionData.resource_pack;
      if (rp) {
        this.resourceManager = new ResourceManagerMP({
          resource_pack: rp,
          config: sessionData.config || this.options?.config,
        });
      }
      // 初始化渲染链路：BodyRenderer → RenderScheduler → AvatarRenderer
      const gl = this.options?.gl;
      const canvas = this.options?.canvas;
      
      // 核心：初始化 Window Polyfill（挂载 requestAnimationFrame）
      // 必须在 RenderScheduler 创建之前完成，确保其能使用全局 rAF
      if (canvas) {
        initWindowPolyfill(canvas);
      }

      try {
        this.audioAdapter = new AudioAdapter({
          autoplay: false
        });
      } catch (e) {
        log.error('AudioAdapter init failed, error:', e);
        this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] AudioAdapter init failed', e);
      }

      const frameRate = Number(
        this.options?.frameRate
        ?? sessionData?.config?.frame_rate
        ?? sessionData?.config?.fps
        ?? 24
      ) || 24;
      if (this.resourceManager && gl && canvas) {
        const bodyRenderer = new BodyRendererMP({
          resourceManager: this.resourceManager,
          gl,
          canvas,
          frameRate,
          onMessage: (msg) => this.emitMessage(EErrorCode.INIT_FAILED, msg)
        });
        this.renderScheduler = new RenderSchedulerMP({
          resourceManager: this.resourceManager,
          bodyRenderer,
          canvas,
          frameRate,
        });
        this.avatarRenderer = new AvatarRendererMP({
          bodyRenderer,
          resourceManager: this.resourceManager,
          dataCacheQueue: this.renderScheduler.getDataCacheQueue(),
          gl,
          canvas,
        });
        this.renderScheduler.setAvatarRenderer(this.avatarRenderer);
      }

      const connected = await this.connectTtsa();
      if (!connected) {
        return false;
      }

      return true;
    } catch (error) {
      this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] start_session request failed', error);
      return false;
    }
  }

  /**
   * 连接 TTSA WebSocket（熵减：单一职责，只负责连接与 enter_room）
   */
  private connectTtsa(): Promise<boolean> {
    const si = this.sessionInfo;
    if (!si?.socket_io_url || !si.token || !si.room) {
      this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] sessionInfo missing for TTSA connect');
      return Promise.resolve(false);
    }
    // 显式初始化 proto，避免仅依赖 import side-effect 的不确定性
    try {
      initFaceProto();
    } catch (err) {
      this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] initFaceProto failed', String(err));
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] TTSA first_start_timestamp timeout (15s)');
          resolve(false);
        }
      }, 15000);

      let resolved = false;
      const finish = (ok: boolean) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(ok);
        }
      };

      const socket = io(si.socket_io_url, {
        query: { token: si.token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 50,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 15000,
      });

      this.ttsaSocket = socket;

      let hasConnectedBefore = false;
      socket.on('connect', () => {
        socket.emit('enter_room', {
          room: si.room,
          client_type: 'web',
          invisible_mode: false,
        });
        // 重连成功后通知外部
        if (hasConnectedBefore) {
          log.info('TTSA reconnected, re-entered room');
          this.emitMessage(EErrorCode.WEBSOCKET_CONNECT_ERROR, '[XmovAvatarMP] TTSA reconnected');
        }
        hasConnectedBefore = true;
      });

      socket.on('first_start_timestamp', async (e: any) => {
        const serverTime = e?.server_time;
        if (typeof serverTime === 'number') {
          const clientTime = Date.now() / 1000;
          socket.emit('first_start_timestamp', {
            server_time: serverTime,
            client_time: clientTime,
          });
        }
        socket.emit('state_change', { state: 'interactive_idle', params: {} });

        // 后台加载 face_ani_char_data（不阻塞 onTtsaReady）
        if (this.resourceManager?.resource_pack?.face_ani_char_data) {
          this.resourceManager.loadMouthShapeLib().then(() => {
            this.avatarRenderer?.init();
          }).catch(() => {});
        }

        // 启动渲染调度（首帧时间 = 当前时间）
        this.renderScheduler?.setFirstStartTime(Date.now());
        this.avatarRenderer?.init();
        this.renderScheduler?.start();

        const onTtsaReady = this.options?.onTtsaReady;
        if (typeof onTtsaReady === 'function') {
          try {
            onTtsaReady(e);
          } catch (err) {
            this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] onTtsaReady callback failed', String(err));
          }
        }
        finish(true);
      });

      socket.on('tts_audio', (e: any) => { this.handleTtsAudio(e); });

      socket.on('face_data', (e: any) => {
        const onFaceData = this.options?.onFaceData;
        try {
          const protoVersion = this.sessionInfo?.config?.framedata_proto_version
            ?? this.sessionInfo?.resource_pack?.config?.framedata_proto_version
            ?? this.options?.config?.framedata_proto_version ?? 2;
          const decoded = decodeFaceData(e, protoVersion) as ITtsFaceFrameData[];
          const arr = Array.isArray(decoded) ? decoded : [];
          this.renderScheduler?.handleFaceData(arr);
          if (typeof onFaceData === 'function') onFaceData(arr);
        } catch (err) {
          this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] onFaceData decode/callback failed', String(err));
        }
      });

      socket.on('body_data', (e: any) => {
        const onBodyData = this.options?.onBodyData;
        try {
          const decoded = decodeBodyData(e) as IRawBodyFrameData[];
          const arr = Array.isArray(decoded) ? decoded : [];
          this.renderScheduler?.handleBodyData(arr);
          if (typeof onBodyData === 'function') {
            onBodyData(arr);
          }
        } catch (err) {
          this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] onBodyData decode/callback failed', String(err));
        }
      });

      // Web SDK: ws.on("state_change", ...) — 服务端在 speak 结束、idle 切换等场景下发此事件。
      // 缺少此监听会导致：
      // 1. 若服务端发送 state_change 带 Ack 请求，客户端无法回复 Ack，
      //    服务端可能认为客户端未确认状态转换，内部状态机卡在 "speak"，拒绝后续 send_text。
      // 2. 客户端无法追踪当前服务端状态（speak/idle/interactive_idle 等）。
      socket.on('state_change', (e: any, ack?: Function) => {
        log.info('state_change from server:', JSON.stringify(e));
        const onStateChange = this.options?.onStateChange;
        if (typeof onStateChange === 'function') {
          try { onStateChange(e); } catch {}
        }
        // 回复 Ack（如果服务端请求了）——这是修复第二次 speak 无响应的关键
        if (typeof ack === 'function') {
          try { ack(); } catch {}
        }
      });

      socket.on('event_data', (e: any) => {
        try {
          let arr: IRawEventFrameData[];
          // 兜底：服务端有时直接下发已解码的 JSON 数组（如开发工具模拟环境）
          if (Array.isArray(e) && e.length > 0 && e[0] != null && typeof e[0] === 'object' && 'e' in e[0]) {
            arr = e as IRawEventFrameData[];
          } else {
            // 标准路径：msgpack 编码，需先标准化原始字节（兼容 [ArrayBuffer]、Uint8Array、base64 等格式）
            const normalized = normalizeRawInput(e);
            if (!normalized) {
              return;
            }
            const decoded = msgpackDecode(normalized) as IRawEventFrameData[];
            arr = Array.isArray(decoded) ? decoded : [decoded];
          }
          const onEventData = this.options?.onEventData;
          if (typeof onEventData === 'function') {
            try {
              onEventData(arr);
            } catch (err) {
              this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] onEventData callback failed', String(err));
            }
          }
          this.emitWidgetEvents(arr);
        } catch (err) {
          this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] event_data decode failed', String(err));
        }
      });

      socket.on('connect_error', (err: any) => {
        log.error('TTSA connect_error:', err);
        this.emitMessage(EErrorCode.WEBSOCKET_CONNECT_ERROR, '[XmovAvatarMP] TTSA connect_error', err);
        finish(false);
      });

      socket.on('error', (err: any) => {
        log.error('TTSA socket error:', err);
        this.emitMessage(EErrorCode.WEBSOCKET_CONNECT_ERROR, '[XmovAvatarMP] TTSA error', err);
        if (!resolved) finish(false);
      });

      socket.on('disconnect', (reason: any) => {
        log.warn('TTSA disconnected, reason:', reason);
        this.emitMessage(EErrorCode.WEBSOCKET_CONNECT_ERROR, '[XmovAvatarMP] TTSA disconnected', reason);
      });
    });
  }

  private async stopSessionIfNeeded(): Promise<void> {
    if (!this.sessionStarted) {
      return;
    }
    if (this.ttsaSocket) {
      this.ttsaSocket.disconnect();
      this.ttsaSocket = null;
    }
    const gatewayServer = this.options?.gatewayServer;
    const sessionId = this.sessionInfo?.session_id;
    if (!gatewayServer || !sessionId) {
      return;
    }
    try {
      const appId = this.options?.appId;
      const appSecret = this.options?.appSecret;
      const data = { session_id: sessionId, stop_reason: 'user_stop' };
      const { headers: signHeaders, data: signedData } = appId && appSecret
        ? headersNeedSign(appId, appSecret, 'DELETE', gatewayServer, data)
        : { headers: {} as Record<string, string>, data };
      const headers = {
        'content-type': 'application/json',
        ...signHeaders,
        ...(this.options?.headers || {})
      };
      await mpRequest(gatewayServer, {
        method: 'DELETE',
        headers,
        body: JSON.stringify(signedData)
      });
    } catch (error) {
      this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] stop_session request failed', error);
    } finally {
      this.sessionStarted = false;
      this.sessionInfo = null;
    }
  }

  // ================================================================
  // 音频队列实现
  // 架构：tts_audio(msgpack) → decode → 按 sid 累积 chunks →
  //       sid 变化或 150ms 无新包 → 合并写临时文件 → 顺序播放
  // ================================================================
  /** speak() 调用时的时间戳，用于测量端到端延迟 */
  private _speakCalledAt = 0;

  /**
   * 从 msgpack decode 后的 `ad` 字段中提取音频字节
   * ad 可能是 Uint8Array / ArrayBuffer / number[] / ArrayBufferView
   */
  private extractAudioBytes(ad: any): Uint8Array | null {
    if (!ad) return null;
    if (ad instanceof Uint8Array) return ad;
    if (ad instanceof ArrayBuffer) return new Uint8Array(ad);
    if (Array.isArray(ad)) return new Uint8Array(ad);
    if (ArrayBuffer.isView(ad)) {
      const v = ad as ArrayBufferView;
      return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    }
    return null;
  }

  /**
   * 通过前几字节的魔数检测音频格式，返回扩展名
   * WebM/Matroska: 0x1A 0x45 0xDF 0xA3
   * MP3 ID3:       0x49 0x44 0x33
   * MP3 sync:      0xFF 0xEx / 0xFF 0xFx
   * AAC ADTS:      0xFF 0xF1 / 0xFF 0xF9
   */
  private detectAudioExt(bytes: Uint8Array): string {
    if (bytes.length < 4) return 'mp3';
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) return 'webm';
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'mp3';
    if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) return 'mp3';
    if (bytes[0] === 0xFF && (bytes[1] & 0xF6) === 0xF0) return 'aac';
    if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'ogg';
    return 'mp3';
  }

  private pcmToWav(pcm: Uint8Array, sampleRate: number = 24000, channels: number = 1, bitsPerSample: number = 16): ArrayBuffer {
    const headerSize = 44;
    const dataSize = pcm.byteLength;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);
    let offset = 0;
    const writeString = (s: string) => {
      for (let i = 0; i < s.length; i++) {
        view.setUint8(offset++, s.charCodeAt(i));
      }
    };
    writeString('RIFF');
    view.setUint32(offset, 36 + dataSize, true); offset += 4;
    writeString('WAVE');
    writeString('fmt ');
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, channels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    view.setUint32(offset, byteRate, true); offset += 4;
    const blockAlign = channels * bitsPerSample / 8;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, bitsPerSample, true); offset += 2;
    writeString('data');
    view.setUint32(offset, dataSize, true); offset += 4;
    new Uint8Array(buffer, headerSize).set(pcm);
    return buffer;
  }

  /**
   * socket.on('tts_audio') 入口
   * 步骤：标准化字节 → msgpack decode → 提取 ad 字节 → 按 sid 累积
   */
  private handleTtsAudio(e: any): void {
    try {
      const normalized = normalizeRawInput(e);
      if (!normalized) return;
      const decoded = msgpackDecode(normalized) as IRawAudioFrameData[];
      const arr = Array.isArray(decoded) ? decoded : [decoded];

      for (const item of arr) {
        const sid: number = item.sid ?? 0;
        const adBytes = this.extractAudioBytes(item.ad);
        if (!adBytes || adBytes.byteLength === 0) continue;

        // sid 变化说明前一段音频的所有包已经到齐，立即 flush
        if (sid !== this.lastIncomingAudioSid && this.lastIncomingAudioSid >= 0) {
          this.flushAudioSid(this.lastIncomingAudioSid);
        }
        this.lastIncomingAudioSid = sid;

        if (!this.ttsAudioChunks.has(sid)) this.ttsAudioChunks.set(sid, []);
        this.ttsAudioChunks.get(sid)!.push(adBytes);
      }

      // 一段时间无新包 → 视为当前 sid 的音频已全部到达
      if (this.ttsAudioFlushTimer != null) clearTimeout(this.ttsAudioFlushTimer);
      this.ttsAudioFlushTimer = setTimeout(() => {
        this.ttsAudioFlushTimer = null;
        if (this.lastIncomingAudioSid >= 0 && this.ttsAudioChunks.has(this.lastIncomingAudioSid)) {
          this.flushAudioSid(this.lastIncomingAudioSid);
        }
      }, this.audioFlushDelayMs);

      // 透传给外部回调
      const onTtsAudio = this.options?.onTtsAudio;
      if (typeof onTtsAudio === 'function') {
        try { onTtsAudio(arr); } catch {}
      }
    } catch (err) {
      log.error('tts_audio decode error:', err, 'raw type:', Object.prototype.toString.call(e));
      this.emitMessage(EErrorCode.AUDIO_PLAYBACK_ERROR, '[XmovAvatarMP] tts_audio decode failed', String(err));
    }
  }

  /**
   * 合并指定 sid 的所有 chunks，写入临时文件，加入播放队列
   */
  private flushAudioSid(sid: number): void {
    const chunks = this.ttsAudioChunks.get(sid);
    this.ttsAudioChunks.delete(sid);
    if (!chunks || chunks.length === 0) return;

    // 合并所有 chunk
    const totalBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const rawAudio = this.options?.config?.raw_audio ?? this.sessionInfo?.config?.raw_audio ?? this.resourceManager?.config?.raw_audio;
    const ext = rawAudio ? 'wav' : this.detectAudioExt(merged);
    const tempPath = `${wx.env.USER_DATA_PATH}/tts_${sid}_${Date.now()}.${ext}`;

    try {
      // writeFileSync 需要 ArrayBuffer，精确裁剪避免因 byteOffset 引起多余字节
      const buf = rawAudio ? this.pcmToWav(merged) : merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
      wx.getFileSystemManager().writeFileSync(tempPath, buf, 'binary');
      this.audioPlayQueue.push({ path: tempPath, sid });
      this.playNextAudio();
    } catch (err) {
      log.error('tts_audio writeFileSync error:', err);
      this.emitMessage(EErrorCode.AUDIO_PLAYBACK_ERROR, '[XmovAvatarMP] tts_audio write file failed', String(err));
    }
  }

  /**
   * 顺序播放队列中下一条音频
   * 通过 ended / error 回调链式触发，直到队列为空
   */
  private playNextAudio(): void {
    if (this.audioPlaying || this.audioPlayQueue.length === 0 || !this.audioAdapter) return;
    const item = this.audioPlayQueue.shift()!;
    this.audioPlaying = true;

    const cleanup = () => {
      this.audioAdapter?.off('ended');
      this.audioAdapter?.off('error');
      this.audioAdapter?.off('canplay');
      this.audioPlaying = false;
      try { wx.getFileSystemManager().unlinkSync(item.path); } catch {}
      this.playNextAudio();
    };

    this.audioAdapter.off('ended');
    this.audioAdapter.off('error');
    this.audioAdapter.off('canplay');
    this.audioAdapter.on('ended', cleanup);
    this.audioAdapter.on('error', (err: any) => {
      log.error('tts_audio InnerAudioContext error:', err, 'path:', item.path);
      cleanup();
    });
    this.audioAdapter.on('canplay', () => {
      this.audioAdapter?.play();
    });

    this.audioAdapter.src = item.path;
  }

  /**
   * 清空音频队列并停止当前播放（用于 speak 打断）
   */
  private clearAudioQueue(): void {
    if (this.ttsAudioFlushTimer != null) {
      clearTimeout(this.ttsAudioFlushTimer);
      this.ttsAudioFlushTimer = null;
    }
    this.ttsAudioChunks.clear();
    this.lastIncomingAudioSid = -1;

    const fs = wx.getFileSystemManager();
    for (const item of this.audioPlayQueue) {
      try { fs.unlinkSync(item.path); } catch {}
    }
    this.audioPlayQueue = [];

    if (this.audioPlaying) {
      this.audioAdapter?.off('ended');
      this.audioAdapter?.off('error');
      this.audioAdapter?.stop();
      this.audioPlaying = false;
    }
  }

  private emitMessage(code: EErrorCode, message: string, details?: any) {
    const onMessage = this.options?.onMessage;
    if (typeof onMessage === 'function') {
      onMessage({
        code,
        message,
        timestamp: Date.now(),
        details
      });
    }
  }

  private emitWidgetEvents(frames: IRawEventFrameData[]) {
    const onWidgetEvent = this.options?.onWidgetEvent;
    const proxyWidget = this.options?.proxyWidget;
    if (!onWidgetEvent && !proxyWidget) return;
    for (const frame of frames || []) {
      const events = frame?.e || [];
      for (const item of events) {
        if (proxyWidget && item?.type && typeof proxyWidget[item.type] === 'function') {
          try {
            proxyWidget[item.type](item);
          } catch (err) {
            this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] proxyWidget handler failed', String(err));
          }
        }
        if (typeof onWidgetEvent === 'function') {
          try {
            onWidgetEvent(item);
          } catch (err) {
            this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] onWidgetEvent callback failed', String(err));
          }
        }
      }
    }
  }

  private emitStatus(nextStatus: string) {
    const onStatusChange = this.options?.onStatusChange;
    if (typeof onStatusChange === 'function') {
      try {
        onStatusChange(nextStatus);
      } catch (err) {
        const onMessage = this.options?.onMessage;
        if (typeof onMessage === 'function') {
          this.emitMessage(EErrorCode.INIT_FAILED, '[XmovAvatarMP] onStatusChange callback failed', String(err));
        }
      }
    }
  }
}

// 默认导出
export default XmovAvatarMP;
