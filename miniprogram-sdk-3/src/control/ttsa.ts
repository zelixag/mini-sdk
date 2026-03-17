/**
 * TTSA WebSocket 连接管理器
 *
 * 基于 Socket.IO 协议与 TTSA 服务端通信，处理：
 * - 连接生命周期（connect → enter_room → first_start_timestamp → disconnect）
 * - 数据事件（body_data, face_data, tts_audio, event_data, state_change）
 * - 客户端指令（stateChange, sendText, idle, listen, think, interrupt）
 * - 隐身模式（enterInvisibleMode / exitInvisibleMode）
 * - SDK 埋点（sendSdkPoint）
 * - 30 秒无数据超时检测
 */

import { io, type MiniProgramSocket } from '../platform/websocket'
import { decode as msgpackDecode } from '../protocol/msgpack-lite'
import { decodeFaceData } from '../decoder/face-decoder'
import { decodeBodyData } from '../decoder/body-decoder'
import { createModuleLogger } from '../utils/logger'

const log = createModuleLogger('TTSA')

/** 无数据超时阈值（毫秒） */
const WS_DATA_TIMEOUT = 30000

export interface TtsaOptions {
  /** Socket.IO 服务地址 */
  url: string
  /** 鉴权 token */
  token: string
  /** 房间 ID */
  room: string
  /** 会话 ID */
  sessionId: string
  /** face data protobuf 版本号 */
  protoVersion: number
  /** 统一数据回调（type + 解码后数据） */
  handleMessage: (type: string, data: any[]) => void
  /** 连接就绪回调（携带起始帧号） */
  onReady: (startFrame: number) => void
  /** 连接断开回调 */
  onDisconnect: (reason: string) => void
  /** 服务端状态切换通知 */
  onStateChange: (state: string, params: any, startFrame: number) => void
  /** 错误回调 */
  onError: (error: any) => void
}

export class Ttsa {
  private ws: MiniProgramSocket | null = null
  private options: TtsaOptions
  private _uniqueSpeakId = 0
  private sessionSpeakReqId = 0
  private wsTimeoutTimer: ReturnType<typeof setTimeout> | null = null
  private _destroyed = false

  constructor(options: TtsaOptions) {
    this.options = options
  }

  // ======================== 连接生命周期 ========================

  start(): void {
    if (this._destroyed) return

    this.ws = io(this.options.url, {
      query: { token: this.options.token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    this.ws.on('connect', () => {
      log.info('已连接 TTSA')
      this.ws!.emit('enter_room', {
        room: this.options.room,
        session_id: this.options.sessionId,
        client_type: 'web',
        invisible_mode: false,
      })
      this._resetWsTimeout()
    })

    this.ws.on('first_start_timestamp', (data: any) => {
      const serverTime = data?.server_time
      // 回复服务端的时间戳确认（关键！否则服务端不会下发数据）
      if (typeof serverTime === 'number') {
        const clientTime = Date.now() / 1000
        this.ws!.emit('first_start_timestamp', {
          server_time: serverTime,
          client_time: clientTime,
        })
      }
      // 发送状态变更通知
      this.ws!.emit('state_change', { state: 'interactive_idle', params: {} })
      const startFrame = data?.start_frame || 0
      log.info('就绪，起始帧:', startFrame)
      this.options.onReady(startFrame)
    })

    // ---------- 数据事件 ----------

    this.ws.on('body_data', (data: any) => {
      this._resetWsTimeout()
      try {
        const raw = data instanceof ArrayBuffer ? data : (data as any)
        const decoded = decodeBodyData(raw)
        this.options.handleMessage('body_data', decoded)
      } catch (e) {
        log.error('Body 解码错误:', e)
      }
    })

    this.ws.on('face_data', (data: any) => {
      this._resetWsTimeout()
      try {
        const raw = data instanceof ArrayBuffer ? data : (data as any)
        const decoded = decodeFaceData(raw, this.options.protoVersion)
        this.options.handleMessage('face_data', decoded)
      } catch (e) {
        log.error('Face 解码错误:', e)
      }
    })

    this.ws.on('tts_audio', (data: any) => {
      this._resetWsTimeout()
      try {
        const raw = data instanceof ArrayBuffer ? data : (data as any)
        const decoded = msgpackDecode(raw) as any[]
        this.options.handleMessage('tts_audio', decoded)
      } catch (e) {
        log.error('Audio 解码错误:', e)
      }
    })

    this.ws.on('event_data', (data: any) => {
      this._resetWsTimeout()
      try {
        const raw = data instanceof ArrayBuffer ? data : (data as any)
        const decoded = msgpackDecode(raw) as any[]
        this.options.handleMessage('event_data', decoded)
      } catch (e) {
        log.error('Event 解码错误:', e)
      }
    })

    // ---------- 状态变更 ----------

    this.ws.on('state_change', (data: any) => {
      this._resetWsTimeout()
      const state = data?.state || ''
      const params = data?.params || {}
      const startFrame = data?.start_frame || 0
      this.options.onStateChange(state, params, startFrame)
    })

    // ---------- 连接异常 ----------

    this.ws.on('disconnect', (reason: string) => {
      log.warn('连接断开:', reason)
      this._clearWsTimeout()
      this.options.onDisconnect(reason)
    })

    this.ws.on('client_quit', (data: any) => {
      log.warn('客户端被踢出:', data)
    })

    this.ws.on('connect_error', (err: any) => {
      log.error('连接错误:', err)
      this.options.onError(err)
    })
  }

  // ======================== 客户端指令 ========================

  stateChange(state: string, params: Record<string, any> = {}): void {
    this.ws?.emit('state_change', { state, params })
  }

  idle(): void {
    this.stateChange('idle')
  }

  listen(): void {
    this.stateChange('listen')
  }

  think(): void {
    this.stateChange('think')
  }

  interactiveIdle(): void {
    this.stateChange('interactive_idle')
  }

  /**
   * 发送文本进行 TTS 合成
   * @returns 唯一对话 ID
   */
  sendText(
    ssml: string,
    isStart: boolean,
    isEnd: boolean,
    extra: Record<string, any> = {},
  ): string {
    const uniqueId = this._getUniqueSpeakId()
    this.ws?.emit('send_text', {
      ssml,
      is_start: isStart,
      is_end: isEnd,
      extra,
      multi_turn_conversation_id: uniqueId,
      session_speak_req_id: this.sessionSpeakReqId++,
    })
    return uniqueId
  }

  /**
   * 打断当前语音
   */
  interrupt(type: string = 'manual'): void {
    this.ws?.emit('interrupt', { type })
  }

  // ======================== 隐身模式 ========================

  enterInvisibleMode(): void {
    this.ws?.emit('switch_invisible_mode', { invisible_mode: true })
  }

  exitInvisibleMode(): void {
    this.ws?.emit('switch_invisible_mode', { invisible_mode: false })
  }

  // ======================== SDK 埋点 ========================

  sendSdkPoint(name: string, params: Record<string, any> = {}): void {
    this.ws?.emit('sdk_burial_point', {
      ...params,
      burial_type: 1,
      session_id: this.options.sessionId,
      event_en_name: name,
      timestamp: Date.now(),
    })
  }

  // ======================== 内部方法 ========================

  private _getUniqueSpeakId(): string {
    this._uniqueSpeakId++
    return `${this._uniqueSpeakId}-${this.options.sessionId}`
  }

  private _resetWsTimeout(): void {
    this._clearWsTimeout()
    this.wsTimeoutTimer = setTimeout(() => {
      log.warn('WebSocket 数据超时 (30s)')
      this.ws?.disconnect()
    }, WS_DATA_TIMEOUT)
  }

  private _clearWsTimeout(): void {
    if (this.wsTimeoutTimer) {
      clearTimeout(this.wsTimeoutTimer)
      this.wsTimeoutTimer = null
    }
  }

  // ======================== 销毁 ========================

  destroy(): void {
    this._destroyed = true
    this._clearWsTimeout()
    if (this.ws) {
      this.ws.disconnect()
      this.ws.destroy()
      this.ws = null
    }
  }
}
