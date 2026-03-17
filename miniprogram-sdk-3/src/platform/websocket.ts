/**
 * Socket.IO 兼容的 WebSocket 客户端（微信小程序版）
 *
 * 在 wx.connectSocket 之上实现完整的 Engine.IO v4 + Socket.IO v4 协议：
 * - Engine.IO 握手（type 0: open -> sid, pingInterval, pingTimeout）
 * - 心跳保活（收到 type 2 ping -> 回复 type 3 pong）
 * - Socket.IO 命名空间连接（发送 "40" / "40/ns,"）
 * - 文本事件：42["event", data]
 * - Ack：42<id>["event", data] / 43<id>[data]
 * - 二进制事件：451-["event", {_placeholder:true,num:0}] + ArrayBuffer 帧
 * - 自动重连（指数退避 + 随机抖动）
 * - 兼容 socket.io-client 的 on / emit / onAny / off API
 */

import { createModuleLogger } from '../utils/logger'

const log = createModuleLogger('WebSocket')

// ===================== 类型定义 =====================

export interface SocketOptions {
  /** 基础 URL，如 https://example.com */
  url: string
  /** Socket.IO query 参数 */
  query?: Record<string, string>
  /** 传输方式，小程序下只支持 websocket */
  transports?: string[]
  /** 额外 header（部分基础库版本支持） */
  header?: Record<string, string>
  /** 命名空间，默认 '/' */
  namespace?: string
  /** 连接超时，默认 90000ms */
  timeout?: number
  /** 是否自动重连，默认 true */
  reconnection?: boolean
  /** 最大重连次数，默认 5 */
  reconnectionAttempts?: number
  /** 初始重连延迟 ms，默认 1000 */
  reconnectionDelay?: number
  /** 最大重连延迟 ms，默认 5000 */
  reconnectionDelayMax?: number
  /** 随机抖动因子 0-1，默认 0.5 */
  randomizationFactor?: number
}

// ===================== Engine.IO 包解析 =====================

interface EnginePacket {
  /** open | ping | pong | message | close | upgrade | noop */
  type: string
  data?: any
}

interface SIOPacket {
  /** connect | disconnect | event | ack | connect_error | binary_event | binary_ack */
  type: string
  namespace?: string
  /** Socket.IO 事件名 */
  eventName?: string
  /** 事件负载 */
  payload?: any
  /** Ack ID */
  id?: number
  /** 二进制附件数 */
  attachments?: number
}

/**
 * 解析 Engine.IO 包（第一个字符是 type）
 */
function parseEnginePacket(raw: string): EnginePacket | null {
  if (!raw || raw.length < 1) return null
  const code = raw.charCodeAt(0) - 48 // '0' = 48
  switch (code) {
    case 0: { // open
      try {
        return { type: 'open', data: JSON.parse(raw.slice(1)) }
      } catch {
        return { type: 'open' }
      }
    }
    case 1: return { type: 'close' }
    case 2: return { type: 'ping' }
    case 3: return { type: 'pong' }
    case 4: return { type: 'message', data: raw.slice(1) }
    case 5: return { type: 'upgrade' }
    case 6: return { type: 'noop' }
    default: return null
  }
}

/**
 * 解析 Socket.IO 包（Engine.IO message 的 data 部分）
 *
 * Socket.IO packet types:
 *   0 = CONNECT          "0" or "0/ns,"
 *   1 = DISCONNECT       "1"
 *   2 = EVENT            "2[...]" or "2<id>[...]"
 *   3 = ACK              "3<id>[...]"
 *   4 = CONNECT_ERROR    "4{...}"
 *   5 = BINARY_EVENT     "5<attachments>-[...]" or "5<attachments>-<id>[...]"
 *   6 = BINARY_ACK       "6<attachments>-<id>[...]"
 */
function parseSIOPacket(raw: string): SIOPacket | null {
  if (!raw || raw.length < 1) return null
  const code = raw.charCodeAt(0) - 48
  const rest = raw.slice(1)

  switch (code) {
    case 0: { // CONNECT
      let namespace = '/'
      let data: any = undefined
      if (rest.length > 0) {
        const commaIdx = rest.indexOf(',')
        if (rest.startsWith('/')) {
          namespace = commaIdx >= 0 ? rest.slice(0, commaIdx) : rest
          if (commaIdx >= 0 && commaIdx + 1 < rest.length) {
            try { data = JSON.parse(rest.slice(commaIdx + 1)) } catch {}
          }
        } else {
          try { data = JSON.parse(rest) } catch {}
        }
      }
      return { type: 'connect', namespace, payload: data }
    }
    case 1: return { type: 'disconnect' }
    case 2: return parseEventPacket(rest, 'event')
    case 3: return parseAckPacket(rest)
    case 4: { // CONNECT_ERROR
      try {
        return { type: 'connect_error', payload: JSON.parse(rest) }
      } catch {
        return { type: 'connect_error', payload: rest }
      }
    }
    case 5: return parseBinaryEventPacket(rest, 'binary_event')
    case 6: return parseBinaryEventPacket(rest, 'binary_ack')
    default: return null
  }
}

/**
 * 解析事件包（type=2）的内容：可选 namespace + 可选 ackId + JSON array
 * 格式示例：
 *   ["event", data]
 *   /ns,["event", data]
 *   /ns,42["event", data]
 *   42["event", data]
 */
function parseEventPacket(raw: string, type: string): SIOPacket | null {
  let str = raw
  let namespace: string | undefined

  // 提取 namespace
  if (str.startsWith('/')) {
    const commaIdx = str.indexOf(',')
    if (commaIdx >= 0) {
      namespace = str.slice(0, commaIdx)
      str = str.slice(commaIdx + 1)
    }
  }

  // 提取可选 ackId
  let id: number | undefined
  const idMatch = /^(\d+)(\[.*)$/s.exec(str)
  if (idMatch) {
    id = parseInt(idMatch[1], 10)
    str = idMatch[2]
  }

  try {
    const arr = JSON.parse(str) as any[]
    return {
      type,
      namespace,
      eventName: arr[0],
      payload: arr.length > 2 ? arr.slice(1) : arr[1],
      id,
    }
  } catch {
    return { type, namespace }
  }
}

/**
 * 解析 ACK 包（type=3）
 */
function parseAckPacket(raw: string): SIOPacket | null {
  let str = raw
  let namespace: string | undefined

  if (str.startsWith('/')) {
    const commaIdx = str.indexOf(',')
    if (commaIdx >= 0) {
      namespace = str.slice(0, commaIdx)
      str = str.slice(commaIdx + 1)
    }
  }

  const match = /^(\d+)(.*)$/s.exec(str)
  if (!match) return { type: 'ack', namespace }

  const id = parseInt(match[1], 10)
  let payload: any
  try {
    payload = match[2] ? JSON.parse(match[2]) : []
  } catch {
    payload = []
  }

  return { type: 'ack', namespace, id, payload }
}

/**
 * 解析二进制事件包（type=5 或 6）
 * 格式：<attachments>-[可选 namespace,][可选 ackId][JSON array]
 */
function parseBinaryEventPacket(raw: string, type: string): SIOPacket | null {
  const dashIdx = raw.indexOf('-')
  if (dashIdx < 0) return { type }

  const attachments = parseInt(raw.slice(0, dashIdx), 10)
  let str = raw.slice(dashIdx + 1)
  let namespace: string | undefined
  let id: number | undefined

  if (str.startsWith('/')) {
    const commaIdx = str.indexOf(',')
    if (commaIdx >= 0) {
      namespace = str.slice(0, commaIdx)
      str = str.slice(commaIdx + 1)
    }
  }

  const idMatch = /^(\d+)(\[.*)$/s.exec(str)
  if (idMatch) {
    id = parseInt(idMatch[1], 10)
    str = idMatch[2]
  }

  try {
    const arr = JSON.parse(str) as any[]
    return {
      type,
      namespace,
      eventName: arr[0],
      payload: arr.length > 2 ? arr.slice(1) : arr[1],
      id,
      attachments,
    }
  } catch {
    return { type, namespace, attachments }
  }
}

// ===================== 二进制重组 =====================

/**
 * 将 payload 中的 { _placeholder: true, num: N } 替换为 buffers[N]
 */
function reconstructPayload(data: any, buffers: ArrayBuffer[]): any {
  if (data == null) return data
  if (
    typeof data === 'object' &&
    data._placeholder === true &&
    typeof data.num === 'number'
  ) {
    return data.num >= 0 && data.num < buffers.length ? buffers[data.num] : data
  }
  if (Array.isArray(data)) {
    return data.map((item) => reconstructPayload(item, buffers))
  }
  if (typeof data === 'object') {
    const out: Record<string, any> = {}
    for (const key of Object.keys(data)) {
      out[key] = reconstructPayload(data[key], buffers)
    }
    return out
  }
  return data
}

// ===================== MiniProgramSocket =====================

type EventCallback = (...args: any[]) => void

/**
 * 微信小程序 Socket.IO 兼容客户端
 */
export class MiniProgramSocket {
  // ---------- 连接参数 ----------
  private readonly _url: string
  private readonly _namespace: string
  private readonly _header?: Record<string, string>
  private readonly _timeout: number

  // ---------- 重连参数 ----------
  private readonly _reconnection: boolean
  private readonly _maxReconnectAttempts: number
  private readonly _reconnectDelay: number
  private readonly _reconnectDelayMax: number
  private readonly _randomizationFactor: number

  // ---------- 运行时状态 ----------
  private _socketTask: WechatMiniprogram.SocketTask | null = null
  private _reconnectAttempts = 0
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _isManualClose = false

  /** Engine.IO session id */
  public id: string | null = null
  public connected = false
  public disconnected = true

  // ---------- 心跳 ----------
  private _pingInterval = 25000
  private _pingTimeout = 20000
  private _pingTimer: ReturnType<typeof setTimeout> | null = null

  // ---------- 事件 ----------
  private _listeners: Map<string, Set<EventCallback>> = new Map()
  private _anyListeners: Set<(event: string, ...args: any[]) => void> = new Set()

  // ---------- Ack ----------
  private _ackCounter = 0
  private _acks: Map<number, EventCallback> = new Map()

  // ---------- 消息队列（连接前缓存） ----------
  private _sendQueue: string[] = []

  // ---------- 二进制帧缓存 ----------
  private _binaryPending: {
    attachments: number
    eventName: string
    payload: any
    id?: number
    buffers: ArrayBuffer[]
  } | null = null

  constructor(options: SocketOptions) {
    // 构造 WebSocket URL
    let base = options.url
      .replace(/^http:\/\//i, 'ws://')
      .replace(/^https:\/\//i, 'wss://')
      .split('?')[0]
      .replace(/\/$/, '')

    if (!base.includes('/socket.io')) {
      base += '/socket.io/'
    } else if (!base.endsWith('/')) {
      base += '/'
    }

    const query: Record<string, string> = {
      ...options.query,
      EIO: '4',
      transport: 'websocket',
    }
    const qs = Object.entries(query)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    this._url = qs ? `${base}?${qs}` : base
    this._namespace = options.namespace || '/'
    this._header = options.header
    this._timeout = options.timeout || 90000

    this._reconnection = options.reconnection !== false
    this._maxReconnectAttempts = options.reconnectionAttempts ?? 5
    this._reconnectDelay = options.reconnectionDelay ?? 1000
    this._reconnectDelayMax = options.reconnectionDelayMax ?? 5000
    this._randomizationFactor = options.randomizationFactor ?? 0.5
  }

  // ==================== 连接管理 ====================

  /**
   * 发起连接
   */
  connect(): this {
    this._isManualClose = false
    this._reconnectAttempts = 0
    this._doConnect()
    return this
  }

  private _doConnect(): void {
    log.info('连接中...', this._url)

    try {
      this._socketTask = wx.connectSocket({
        url: this._url,
        header: this._header,
        timeout: this._timeout,
      })
    } catch (e) {
      log.error('wx.connectSocket 异常:', e)
      this._fireEvent('connect_error', e)
      this._scheduleReconnect()
      return
    }

    if (!this._socketTask || typeof this._socketTask.onOpen !== 'function') {
      log.error('wx.connectSocket 未返回有效 SocketTask，请检查合法域名配置')
      this._fireEvent('connect_error', new Error('SocketTask unavailable'))
      this._scheduleReconnect()
      return
    }

    this._socketTask.onOpen(() => {
      log.info('WebSocket 已打开，等待 Engine.IO 握手')
      // Engine.IO open 包由服务端主动推送，这里不做额外操作
    })

    this._socketTask.onMessage((res: { data: string | ArrayBuffer }) => {
      this._handleMessage(res)
    })

    this._socketTask.onError((err: any) => {
      log.error('WebSocket 错误:', err.errMsg || err)
      this._fireEvent('connect_error', err)
    })

    this._socketTask.onClose((res: any) => {
      log.info('WebSocket 已关闭:', res.code, res.reason)
      const wasConnected = this.connected
      this.connected = false
      this.disconnected = true
      this._clearPingTimer()

      if (wasConnected) {
        this._fireEvent('disconnect', res.reason || 'transport close')
      }

      if (!this._isManualClose) {
        this._scheduleReconnect()
      }
    })
  }

  // ==================== 消息处理 ====================

  private _handleMessage(res: { data: string | ArrayBuffer }): void {
    // ---------- 二进制帧 ----------
    if (res.data instanceof ArrayBuffer) {
      if (this._binaryPending) {
        this._binaryPending.buffers.push(res.data)
        if (this._binaryPending.buffers.length >= this._binaryPending.attachments) {
          const { eventName, payload, id, buffers } = this._binaryPending
          this._binaryPending = null
          const reconstructed = reconstructPayload(payload, buffers)
          this._dispatchEvent(eventName, reconstructed, id)
        }
      } else {
        // 非预期的二进制帧
        this._fireEvent('message', res.data)
      }
      return
    }

    // ---------- 文本帧：Engine.IO 包 ----------
    const raw = res.data as string
    const eioPacket = parseEnginePacket(raw)
    if (!eioPacket) {
      log.warn('无法解析 Engine.IO 包:', raw.slice(0, 100))
      return
    }

    switch (eioPacket.type) {
      case 'open':
        this._handleOpen(eioPacket.data)
        break
      case 'close':
        this._closeTransport()
        break
      case 'ping':
        this._sendRaw('3') // pong
        this._resetPingTimer()
        break
      case 'pong':
        // 通常客户端不主动 ping，忽略
        break
      case 'message':
        this._handleSIOMessage(eioPacket.data)
        break
      default:
        break
    }
  }

  /**
   * Engine.IO open 握手
   */
  private _handleOpen(data: any): void {
    if (data) {
      this.id = data.sid || null
      this._pingInterval = data.pingInterval || 25000
      this._pingTimeout = data.pingTimeout || 20000
    }

    log.info(`Engine.IO 握手完成: sid=${this.id}, pingInterval=${this._pingInterval}`)

    // 发送 Socket.IO CONNECT
    if (this._namespace && this._namespace !== '/') {
      this._sendRaw(`40${this._namespace},`)
    } else {
      this._sendRaw('40')
    }

    this._resetPingTimer()
  }

  /**
   * 处理 Socket.IO 层消息
   */
  private _handleSIOMessage(raw: string): void {
    const packet = parseSIOPacket(raw)
    if (!packet) {
      log.warn('无法解析 Socket.IO 包:', raw.slice(0, 100))
      return
    }

    switch (packet.type) {
      case 'connect':
        this.connected = true
        this.disconnected = false
        this._reconnectAttempts = 0
        if (packet.payload?.sid) {
          this.id = packet.payload.sid
        }
        log.info('Socket.IO 连接成功, sid:', this.id)
        // 刷新发送队列
        this._flushSendQueue()
        this._fireEvent('connect')
        break

      case 'disconnect':
        this.connected = false
        this.disconnected = true
        this._fireEvent('disconnect', 'server disconnect')
        break

      case 'event':
        if (packet.eventName) {
          this._dispatchEvent(packet.eventName, packet.payload, packet.id)
        }
        break

      case 'ack':
        if (packet.id !== undefined) {
          const ackFn = this._acks.get(packet.id)
          if (ackFn) {
            this._acks.delete(packet.id)
            ackFn(packet.payload)
          }
        }
        break

      case 'connect_error':
        log.error('Socket.IO connect_error:', packet.payload)
        this._fireEvent('connect_error', packet.payload)
        break

      case 'binary_event':
        if (packet.attachments && packet.attachments > 0) {
          this._binaryPending = {
            attachments: packet.attachments,
            eventName: packet.eventName || 'message',
            payload: packet.payload,
            id: packet.id,
            buffers: [],
          }
        }
        break

      case 'binary_ack':
        if (packet.attachments && packet.attachments > 0 && packet.id !== undefined) {
          this._binaryPending = {
            attachments: packet.attachments,
            eventName: '__ack__',
            payload: packet.payload,
            id: packet.id,
            buffers: [],
          }
        }
        break
    }
  }

  /**
   * 分发事件给监听器
   */
  private _dispatchEvent(eventName: string, payload: any, ackId?: number): void {
    // 如果服务端请求 ack，构造 ack 回调
    let ackFn: EventCallback | undefined
    if (ackId !== undefined) {
      ackFn = (...args: any[]) => {
        this._sendRaw(`43${ackId}${JSON.stringify(args)}`)
      }
    }
    this._fireEvent(eventName, payload, ackFn)
  }

  // ==================== 心跳 ====================

  private _resetPingTimer(): void {
    this._clearPingTimer()
    // 如果超过 pingInterval + pingTimeout 未收到 ping，认为连接已断开
    const deadline = this._pingInterval + this._pingTimeout
    this._pingTimer = setTimeout(() => {
      log.warn('心跳超时，关闭连接')
      this._closeTransport()
    }, deadline)
  }

  private _clearPingTimer(): void {
    if (this._pingTimer) {
      clearTimeout(this._pingTimer)
      this._pingTimer = null
    }
  }

  // ==================== 重连 ====================

  private _scheduleReconnect(): void {
    if (this._isManualClose || !this._reconnection) return
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      log.error(`已达最大重连次数 (${this._maxReconnectAttempts})`)
      this._fireEvent('reconnect_failed')
      return
    }

    this._reconnectAttempts++
    const base = Math.min(
      this._reconnectDelay * Math.pow(2, this._reconnectAttempts - 1),
      this._reconnectDelayMax,
    )
    const jitter = base * (1 + Math.random() * this._randomizationFactor)
    const delay = Math.floor(jitter)

    log.info(
      `${delay}ms 后尝试第 ${this._reconnectAttempts}/${this._maxReconnectAttempts} 次重连`,
    )

    this._fireEvent('reconnect_attempt', this._reconnectAttempts)

    if (this._reconnectTimer) clearTimeout(this._reconnectTimer)
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null
      this._doConnect()
    }, delay)
  }

  // ==================== 发送 ====================

  /**
   * 发送原始字符串（Engine.IO 层）
   */
  private _sendRaw(data: string | ArrayBuffer): void {
    if (!this._socketTask) return
    try {
      this._socketTask.send({ data })
    } catch (e) {
      log.error('发送失败:', e)
    }
  }

  /**
   * 刷新连接前缓存的发送队列
   */
  private _flushSendQueue(): void {
    while (this._sendQueue.length > 0) {
      const msg = this._sendQueue.shift()!
      this._sendRaw(msg)
    }
  }

  /**
   * 发送 Socket.IO 事件，未连接时自动缓存。
   *
   * @param event    事件名
   * @param data     事件数据
   * @param callback Ack 回调
   */
  emit(event: string, data?: any, callback?: EventCallback): this {
    let idPart = ''
    if (typeof callback === 'function') {
      const ackId = this._ackCounter++
      this._acks.set(ackId, callback)
      idPart = String(ackId)
    }

    // 命名空间前缀
    let nsPart = ''
    if (this._namespace && this._namespace !== '/') {
      nsPart = this._namespace + ','
    }

    const payload = data !== undefined ? [event, data] : [event]
    const msg = `42${nsPart}${idPart}${JSON.stringify(payload)}`

    if (this.connected) {
      this._sendRaw(msg)
    } else {
      this._sendQueue.push(msg)
    }

    return this
  }

  // ==================== 事件系统 ====================

  /**
   * 监听事件
   */
  on(event: string, callback: EventCallback): this {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event)!.add(callback)
    return this
  }

  /**
   * 监听一次
   */
  once(event: string, callback: EventCallback): this {
    const wrapped: EventCallback = (...args) => {
      this.off(event, wrapped)
      callback(...args)
    }
    return this.on(event, wrapped)
  }

  /**
   * 移除监听
   */
  off(event: string, callback?: EventCallback): this {
    if (!callback) {
      this._listeners.delete(event)
    } else {
      this._listeners.get(event)?.delete(callback)
    }
    return this
  }

  /**
   * 监听所有事件（socket.io 兼容）
   */
  onAny(callback: (event: string, ...args: any[]) => void): this {
    this._anyListeners.add(callback)
    return this
  }

  /**
   * 移除 onAny 监听器
   */
  offAny(callback?: (event: string, ...args: any[]) => void): this {
    if (callback) {
      this._anyListeners.delete(callback)
    } else {
      this._anyListeners.clear()
    }
    return this
  }

  /**
   * 触发事件
   */
  private _fireEvent(event: string, ...args: any[]): void {
    // onAny
    for (const cb of this._anyListeners) {
      try {
        cb(event, ...args)
      } catch (e) {
        log.error('onAny 回调异常:', e)
      }
    }

    // 具名监听
    const cbs = this._listeners.get(event)
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(...args)
        } catch (e) {
          log.error(`事件 "${event}" 回调异常:`, e)
        }
      }
    }
  }

  // ==================== 断开与销毁 ====================

  /**
   * 主动关闭底层传输
   */
  private _closeTransport(): void {
    this._clearPingTimer()
    if (this._socketTask) {
      try {
        this._socketTask.close({ code: 1000, reason: 'client close' })
      } catch (_) {
        // ignore
      }
      this._socketTask = null
    }
  }

  /**
   * 断开连接
   */
  disconnect(): this {
    this._isManualClose = true
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    this._clearPingTimer()

    // 发送 Socket.IO disconnect (type=1)
    if (this.connected) {
      try {
        this._sendRaw('41')
      } catch (_) {}
    }

    this._closeTransport()
    this.connected = false
    this.disconnected = true
    this._sendQueue = []
    this._binaryPending = null
    this._acks.clear()

    return this
  }

  /**
   * close 别名
   */
  close(): this {
    return this.disconnect()
  }

  /**
   * 完全销毁，清理所有监听器
   */
  destroy(): void {
    this.disconnect()
    this._listeners.clear()
    this._anyListeners.clear()
  }
}

// ===================== 工厂函数 =====================

/**
 * 创建 Socket.IO 兼容连接（自动调用 connect）
 *
 * 用法与 socket.io-client 的 io() 一致：
 * ```ts
 * const socket = io('https://example.com', { query: { token: '...' } })
 * socket.on('connect', () => { ... })
 * socket.emit('hello', { data: 1 })
 * ```
 */
export function io(url: string, options?: Partial<Omit<SocketOptions, 'url'>>): MiniProgramSocket {
  const socket = new MiniProgramSocket({ url, ...options })
  socket.connect()
  return socket
}

/**
 * createWebSocket 别名，与旧版 API 兼容
 */
export const createWebSocket = io
