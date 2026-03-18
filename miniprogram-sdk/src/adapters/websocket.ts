/**
 * WebSocket 适配层 - 小程序版本（熵减优化）
 * 使用 wx.connectSocket 替代 socket.io-client
 * 
 * 设计原则：
 * 1. 协议兼容：Engine.IO + Socket.IO 协议
 * 2. 事件系统：on、off、emit、onAny
 * 3. 重连机制：自动重连、指数退避
 * 4. 心跳机制：ping/pong 自动处理
 */

/// <reference path="../types/wechat.d.ts" />

import { ErrorHandler, SDKError } from '../utils/ErrorHandler';
import { EErrorCode } from '../types/error';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('WebSocketAdapter');

export interface WebSocketOptions {
  url: string;
  protocols?: string[];
  header?: Record<string, string>;
  timeout?: number;
  query?: Record<string, string>; // socket.io 兼容：查询参数
  transports?: string[]; // socket.io 兼容：传输方式
  reconnection?: boolean; // socket.io 兼容：是否自动重连
  reconnectionAttempts?: number; // socket.io 兼容：最大重连次数
  reconnectionDelay?: number; // socket.io 兼容：重连延迟
  reconnectionDelayMax?: number; // socket.io 兼容：最大重连延迟
  randomizationFactor?: number; // socket.io 兼容：随机因子
}

export interface WebSocketMessage {
  type: string;
  data: any;
}

/**
 * Engine.IO 包类型：0=open(握手), 1=close, 2=ping, 3=pong, 4=message
 * socket.io 在 type 4 下：2=event([eventName, ...args])，5=binaryEvent，格式 5N-[...]（N 为附件数）
 */
function parseEngineIOPacket(raw: string): {
  type: string;
  data?: any;
  emitEvent?: string;
  emitPayload?: any;
  binaryEvent?: boolean;
  attachments?: number;
  ackId?: number;
  id?: number; // 服务端请求的 Ack ID
} | null {
  if (!raw || typeof raw !== 'string' || raw.length < 1) return null;
  const code = raw.charAt(0);
  const rest = raw.slice(1);
  if (code === '0') {
    try {
      const data = rest ? JSON.parse(rest) : {};
      return { type: 'open', data };
    } catch {
      return { type: 'open' };
    }
  }
  if (code === '2') return { type: 'ping' };
  if (code === '3') return { type: 'pong' };
  if (code === '4') {
    // 42: event, 43: ack
    const subType = rest.charAt(0);
    
    // Ack: 43[ackId][...data]
    if (subType === '3') {
      const match = /^3(\d+)(.*)$/s.exec(rest);
      if (match) {
        try {
          const ackId = parseInt(match[1], 10);
          const payloadStr = match[2];
          const payload = payloadStr ? JSON.parse(payloadStr) : [];
          return { type: 'ack', ackId, emitPayload: payload };
        } catch {
          return { type: 'ack' };
        }
      }
    }

    if (subType === '2') {
      try {
        // S4: 剥离可能的命名空间前缀 42/nsp,["event",data]
        let body = rest.slice(1); // 去掉 '2'
        if (body.startsWith('/')) {
          const commaIdx = body.indexOf(',');
          if (commaIdx !== -1) body = body.slice(commaIdx + 1);
        }

        // 尝试匹配 ackId: ackId + [...]
        const matchAck = /^(\d+)(\[.*)$/s.exec(body);
        if (matchAck) {
            const ackId = parseInt(matchAck[1], 10);
            const arr = JSON.parse(matchAck[2]) as any[];
            const eventName = arr && arr[0];
            const payload = arr && arr.length > 1 ? arr[1] : undefined;
            return { type: 'message', emitEvent: eventName, emitPayload: payload, id: ackId };
        }

        // 无 ackId: [...]
        const arr = JSON.parse(body) as any[];
        const eventName = arr && arr[0];
        const payload = arr && arr.length > 1 ? arr[1] : undefined;
        // console.log('[WebSocket] Parsed EVENT:', eventName);
        return { type: 'message', emitEvent: eventName, emitPayload: payload };
      } catch (e) {
        console.error('[WebSocket] Parse EVENT error:', e, rest);
        return { type: 'message' };
      }
    }
    if (rest.charAt(0) === '5') {
      // S4: 剥离可能的命名空间前缀 45/nsp,1-["event",data]
      let binaryBody = rest.slice(1); // 去掉 '5'
      if (binaryBody.startsWith('/')) {
        const commaIdx = binaryBody.indexOf(',');
        if (commaIdx !== -1) binaryBody = binaryBody.slice(commaIdx + 1);
      }
      const match = /^(\d+)-(.+)$/s.exec(binaryBody);
      if (match) {
        try {
          const attachments = parseInt(match[1], 10);
          const arr = JSON.parse(match[2]) as any[];
          const eventName = arr && arr[0];
          const payload = arr && arr.length > 1 ? arr[1] : undefined;
          return {
            type: 'message',
            binaryEvent: true,
            attachments,
            emitEvent: eventName,
            emitPayload: payload,
          };
        } catch {
          return { type: 'message' };
        }
      }
    }
    return { type: 'message' };
  }
  return null;
}

/** 将 payload 中的占位符 { _placeholder: true, num: i } 替换为 buffers[i]，返回重组后的新对象 */
function reconstructPayload(data: any, buffers: ArrayBuffer[]): any {
  if (data == null) return data;
  if (data && typeof data === 'object' && data._placeholder === true && typeof data.num === 'number') {
    if (data.num >= 0 && data.num < buffers.length) return buffers[data.num];
    return data;
  }
  if (Array.isArray(data)) {
    const out: any[] = [];
    for (let i = 0; i < data.length; i++) out.push(reconstructPayload(data[i], buffers));
    return out;
  }
  if (typeof data === 'object') {
    const out: Record<string, any> = {};
    for (const key of Object.keys(data)) out[key] = reconstructPayload(data[key], buffers);
    return out;
  }
  return data;
}

/**
 * 小程序 WebSocket 封装（熵减优化版）
 * 兼容 socket.io 的部分 API
 */
export class MiniProgramWebSocket {
  private socketTask: WechatMiniprogram.SocketTask | null = null;
  private url: string;
  private protocols?: string[];
  private header?: Record<string, string>;
  private timeout?: number;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectDelayMax = 5000;
  private randomizationFactor = 0.5;
  private reconnectTimer: number | null = null;
  private isManualClose = false;
  private listeners: Map<string, Set<Function>> = new Map();
  private anyListeners: Set<Function> = new Set(); // socket.io 的 onAny 监听器
  private messageQueue: any[] = [];
  private query?: Record<string, string>;
  
  // Ack 相关
  private ackId = 0;
  private acks: Map<number, Function> = new Map();

  /** Socket.IO 二进制事件队列：支持服务端并发下发多个二进制事件头（face_data + tts_audio 同时进行）
   * 每条记录对应一个等待收齐附件的二进制事件，按到达顺序排队，每个二进制帧分配给队首 */
  private binaryQueue: Array<{ attachments: number; emitEvent: string; emitPayload: any; buffers: ArrayBuffer[]; createdAt: number }> = [];
  private errorHandler: ErrorHandler;

  // 客户端心跳：检测死连接（服务端可能不发 ping 或网络已中断但 onClose 未触发）
  private heartbeatTimer: any = null;
  private lastServerActivity = 0;
  /** 心跳检测间隔（ms），超过此时间无服务端活动则主动关闭重连 */
  private heartbeatIntervalMs = 45000;
  /** 服务端无活动超时（ms） */
  private heartbeatTimeoutMs = 90000;

  // 兼容 socket.io 的属性
  public connected = false;
  public disconnected = true;
  public id: string | null = null;

  constructor(options: WebSocketOptions, errorHandler?: ErrorHandler) {
    this.errorHandler = errorHandler || new ErrorHandler();
    
    // 协议：http(s) -> ws(s)
    let base = options.url.replace(/^http:\/\//i, 'wss://').replace(/^https:\/\//i, 'wss://');
    // 去掉已有 query，只保留 origin + path
    const baseWithoutQuery = base.split('?')[0].replace(/\/$/, '');
    // socket.io 要求路径为 /socket.io/，且 query 含 EIO=4&transport=websocket
    const hasSocketIoPath = baseWithoutQuery.includes('/socket.io');
    const baseWithPath = hasSocketIoPath
      ? (baseWithoutQuery.endsWith('/') ? baseWithoutQuery : baseWithoutQuery + '/')
      : baseWithoutQuery + '/socket.io/';
    this.query = { ...options.query, EIO: '4', transport: 'websocket' };
    const queryString = Object.entries(this.query)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    this.url = queryString ? `${baseWithPath}?${queryString}` : baseWithPath;
    this.protocols = options.protocols;
    this.header = options.header;
    this.timeout = options.timeout || 90000;
    
    // socket.io 兼容选项
    if (options.reconnection !== undefined) {
      if (!options.reconnection) {
        this.maxReconnectAttempts = 0;
      }
    }
    if (options.reconnectionAttempts !== undefined) {
      this.maxReconnectAttempts = options.reconnectionAttempts === Infinity ? 999999 : options.reconnectionAttempts;
    }
    if (options.reconnectionDelay !== undefined) {
      this.reconnectDelay = options.reconnectionDelay;
    }
    if (options.reconnectionDelayMax !== undefined) {
      this.reconnectDelayMax = options.reconnectionDelayMax;
    }
    if (options.randomizationFactor !== undefined) {
      this.randomizationFactor = options.randomizationFactor;
    }
  }

  /**
   * 连接 WebSocket
   */
  connect(): void {
    this.isManualClose = false;
    this._connect();
  }

  private _connect(): void {
    try {
      log.debug('_connect wxApi', this.url);
      this.socketTask = wx.connectSocket({
        url: this.url,
        protocols: this.protocols,
        header: this.header,
        timeout: this.timeout
      });

      if (!this.socketTask || typeof this.socketTask.onOpen !== 'function') {
        const error = this.errorHandler.handle({
          code: EErrorCode.WEBSOCKET_CONNECT_ERROR,
          message: 'SocketTask undefined',
          timestamp: Date.now()
        }, {
          module: 'WebSocketAdapter',
          method: '_connect',
          params: { url: this.url }
        });
        log.error('wx.connectSocket 未返回有效 SocketTask，请确认在小程序环境中且已配置 socket 合法域名');
        this._emit('connect_error', error);
        return;
      }

      this.socketTask.onOpen(() => {
        // S5: 重连时清空残留状态，防止旧连接的二进制事件/ack 回调污染新连接
        this.binaryQueue = [];
        this.acks.clear();
        this.messageQueue = [];
      });

      this.socketTask.onMessage((res: WechatMiniprogram.SocketMessageCallbackResult) => {
        this._handleSocketMessage(res);
      });

      this.socketTask.onError((err: WechatMiniprogram.GeneralCallbackResult) => {
        log.error('WebSocket error:', err);
        const error = this.errorHandler.handle({
          code: EErrorCode.WEBSOCKET_CONNECT_ERROR,
          message: err.errMsg || 'WebSocket error',
          timestamp: Date.now(),
          details: err
        }, {
          module: 'WebSocketAdapter',
          method: 'onError',
          params: { url: this.url }
        });
        this._emit('error', error);
        this._emit('connect_error', error);
      });

      this.socketTask.onClose((res: WechatMiniprogram.SocketCloseCallbackResult) => {
        this.connected = false;
        this.disconnected = true;
        this._stopHeartbeat();
        this._emit('disconnect', res);

        if (!this.isManualClose) {
          this._handleReconnect();
        }
      });
    } catch (err) {
      const error = this.errorHandler.handle(err, {
        module: 'WebSocketAdapter',
        method: '_connect',
        params: { url: this.url }
      });
      log.error('Connect error:', error);
    }
  }

  /**
   * 处理服务端下发的包：Engine.IO 握手(0)、ping(2)、socket.io 事件(42[...]、51-[...] 二进制事件)
   * 二进制事件先发占位符 51-[event,{_placeholder:true,num:0}]，再发 N 个二进制帧；需收齐后重组再 emit
   * 43-[ackId, ...args]：Ack 响应
   */
  private _handleSocketMessage(res: { data: string | ArrayBuffer }): void {
    // 记录服务端活动时间（用于心跳超时检测）
    this.lastServerActivity = Date.now();

    try {
      if (typeof res.data === 'string') {
        // 原始帧诊断日志（帮助排查 tts_audio 等事件是否到达客户端）
        const rawPreview = res.data.length <= 400 ? res.data : res.data.slice(0, 400) + '…';
        log.debug('[WS Raw Text]', rawPreview);

        const packet = parseEngineIOPacket(res.data);
        if (packet) {
          if (packet.type === 'open') {
            // 只有收到 Engine.IO 'open' 包才算真正连接成功
            this.connected = true;
            this.disconnected = false;
            this.reconnectAttempts = 0;
            this.id = Math.random().toString(36).substring(7);

            // S5: 重连时清空残留状态，防止旧连接的 pending 事件干扰新连接
            this.binaryQueue = [];
            this.acks.clear();

            // 启动客户端心跳检测
            this._startHeartbeat();

            this.send('40'); // Socket.IO connect
            while (this.messageQueue.length > 0) {
              const item = this.messageQueue.shift();
              this.send(item.data, item.ackId);
            }
            this._emit('connect');
            return;
          }
          if (packet.type === 'ping') {
            // Engine.IO pong 必须立即发送，绕过 readyState 检查
            // 否则 pong 可能被排队，导致服务端 keepalive ping timeout
            try {
              this.socketTask!.send({ data: '3' });
            } catch (e) {
              log.error('Failed to send pong:', e);
            }
            return;
          }
          if (packet.type === 'ack') {
            const ackId = packet.ackId;
            const callback = this.acks.get(ackId!);
            if (callback) {
              this.acks.delete(ackId!);
              callback(packet.emitPayload);
            }
            return;
          }
          if (packet.type === 'message' && packet.emitEvent != null) {
            if (packet.binaryEvent && packet.attachments != null && packet.attachments > 0) {
              // 二进制事件：加入队列等待收齐所有附件
              // 使用队列而非单对象，防止服务端并发下发多个二进制头（如 face_data + tts_audio 交叉）时覆盖
              // S3: 加入 createdAt 用于超时清理
              this.binaryQueue.push({
                attachments: packet.attachments,
                emitEvent: packet.emitEvent,
                emitPayload: packet.emitPayload,
                buffers: [],
                createdAt: Date.now(),
              });
              return;
            }
            
            if (packet.id !== undefined) {
                // 需要 Ack：服务端 emit(event, data, callback) 期望客户端回复确认
                let ackSent = false;
                const ackCallback = (...args: any[]) => {
                    if (!ackSent) {
                      ackSent = true;
                      this.sendAck(packet.id!, args);
                    }
                };
                this._emit(packet.emitEvent, packet.emitPayload, ackCallback);
                // 兜底：如果没有 listener 调用 ack（或者根本没注册 listener），自动回复空 Ack
                // 这是修复"第二次 speak 无响应"的关键：若服务端发 state_change 带 Ack 但客户端
                // 没有 listener 回复，服务端状态机会卡住，拒绝后续 send_text
                if (!ackSent) {
                  this.sendAck(packet.id!, []);
                }
            } else {
                this._emit(packet.emitEvent, packet.emitPayload);
            }
            return;
          }
        }
        let data: any;
        try {
          data = JSON.parse(res.data);
        } catch {
          this._emit('message', res.data);
          return;
        }
        if (data && typeof data === 'object') {
          if (data.type) {
            this._emit(data.type, data.data ?? data);
          } else if (Array.isArray(data) && data.length >= 2) {
            this._emit(data[0], data[1]);
          } else {
            this._emit('message', data);
          }
        } else {
          this._emit('message', data);
        }
        return;
      }
      if (res.data instanceof ArrayBuffer) {
        // S3: 超时清理 — 队首等待超过 5 秒说明数据帧丢失，丢弃以防阻塞后续事件
        while (this.binaryQueue.length > 0 && Date.now() - this.binaryQueue[0].createdAt > 5000) {
          const stale = this.binaryQueue.shift()!;
          log.warn('binaryQueue head timeout, dropping:', stale.emitEvent, 'expected:', stale.attachments, 'got:', stale.buffers.length);
        }
        if (this.binaryQueue.length > 0) {
          // 分配给队首的待收事件
          const pending = this.binaryQueue[0];
          pending.buffers.push(res.data);
          if (pending.buffers.length >= pending.attachments) {
            this.binaryQueue.shift(); // 移出队首
            const { emitEvent, emitPayload, buffers } = pending;
            const payload = reconstructPayload(emitPayload, buffers);
            this._emit(emitEvent, payload);
          }
          return;
        }
        // 未预期的二进制帧（无对应头），用于诊断
        log.debug('[WS Raw Binary] orphaned binary frame, byteLength=', (res.data as ArrayBuffer).byteLength, 'binaryQueue empty');
        this._emit('message', res.data);
        return;
      }
      this._emit('message', res.data);
    } catch (err) {
      const error = this.errorHandler.handle(err, {
        module: 'WebSocketAdapter',
        method: '_handleSocketMessage',
        params: { data: res.data }
      });
      log.error('Parse message error:', error);
      this.binaryQueue = []; // 解析出错时清空队列，避免状态不一致
      this._emit('message', res.data);
    }
  }

  /** 启动客户端心跳检测（仅监控服务端活动，不主动发 ping） */
  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this.lastServerActivity = Date.now();
    this.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastServerActivity;
      if (elapsed > this.heartbeatTimeoutMs) {
        log.warn('Server heartbeat timeout (' + elapsed + 'ms), closing for reconnect');
        this._stopHeartbeat();
        // 触发重连：关闭当前连接（onClose 会调用 _handleReconnect）
        if (this.socketTask) {
          try {
            this.socketTask.close({ code: 4000, reason: 'Heartbeat timeout' });
          } catch {}
        }
      }
    }, this.heartbeatIntervalMs);
  }

  /** 停止心跳检测 */
  private _stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 重连处理（指数退避）
   */
  private _handleReconnect(): void {
    if (this.isManualClose || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    
    // socket.io 兼容的重连延迟计算（指数退避）
    const baseDelay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.reconnectDelayMax
    );
    const randomDelay = baseDelay * (1 + Math.random() * this.randomizationFactor);
    const delay = Math.floor(randomDelay);

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      log.info(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      this._connect();
    }, delay) as any;
  }

  /**
   * 发送 Ack 响应 (43)
   */
  sendAck(ackId: number, data: any[]): void {
    if (!this.socketTask || !this.connected) return;
    try {
        const message = '43' + ackId + JSON.stringify(data);
        this.socketTask.send({ data: message });
    } catch (err) {
        log.error('Send Ack error:', err);
    }
  }

  /**
   * 发送消息
   * Socket.IO 事件包需带前缀 42（Engine.IO type 4 + Socket.IO type 2 EVENT），否则服务端不认会 1006 断开
   * 支持 Ack：42 + ackId + [...]
   */
  send(data: any, ackId?: number): void {
    if (!this.socketTask || !this.connected) {
      log.warn('[send] socketTask or connected is false, queueing. socketTask:', !!this.socketTask, 'connected:', this.connected);
      this.messageQueue.push({ data, ackId });
      return;
    }

    // 检查 SocketTask.readyState，确保连接真正打开
    // readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
    // 注：某些微信版本 SocketTask 没有 readyState 属性，此时跳过检查
    const readyState = this.socketTask.readyState;
    if (readyState !== undefined && readyState !== 1) { // 1 = OPEN
      log.warn('send: SocketTask.readyState is not OPEN, current:', readyState, 'queueing message');
      this.messageQueue.push({ data, ackId });
      return;
    }

    try {
      let message: string | ArrayBuffer;
      if (typeof data === 'string') {
        message = data;
      } else if (data instanceof ArrayBuffer) {
        message = data;
      } else if (Array.isArray(data)) {
        // 事件包：42 + [ackId] + json
        let prefix = '42';
        if (ackId !== undefined) {
          prefix += ackId;
        }
        message = prefix + JSON.stringify(data);
      } else {
        message = JSON.stringify(data);
      }

      this.socketTask.send({
        data: message
      });
    } catch (err) {
      const error = this.errorHandler.handle(err, {
        module: 'WebSocketAdapter',
        method: 'send',
        params: { data }
      });
      log.error('Send error:', error);
    }
  }

  /**
   * 发送事件（兼容 socket.io）
   */
  emit(event: string, data?: any, callback?: Function): void {
    let ackId: number | undefined;
    if (typeof callback === 'function') {
      ackId = this.ackId++;
      this.acks.set(ackId, callback);
    }

    if (event === 'message') {
      this.send(data, ackId);
    } else {
      // socket.io 格式: [eventName, payload]
      this.send([event, data], ackId);
    }
  }

  /**
   * 监听事件
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * 移除监听
   */
  off(event: string, callback?: Function): void {
    if (!this.listeners.has(event)) return;

    if (callback) {
      this.listeners.get(event)!.delete(callback);
    } else {
      this.listeners.delete(event);
    }
  }

  /**
   * 触发事件（内部方法）
   */
  private _emit(event: string, data?: any, ack?: Function): void {
    // 触发 onAny 监听器
    this.anyListeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (err) {
        this.errorHandler.handle(err, {
          module: 'WebSocketAdapter',
          method: '_emit.onAny',
          params: { event, data }
        });
      }
    });
    
    // 触发特定事件监听器
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data, ack);
        } catch (err) {
          this.errorHandler.handle(err, {
            module: 'WebSocketAdapter',
            method: '_emit',
            params: { event, data }
          });
        }
      });
    }
  }
  
  /**
   * 监听所有事件（socket.io 兼容）
   */
  onAny(callback: (event: string, ...args: any[]) => void): void {
    this.anyListeners.add(callback);
  }
  
  /**
   * 移除 onAny 监听器
   */
  offAny(callback?: Function): void {
    if (callback) {
      this.anyListeners.delete(callback);
    } else {
      this.anyListeners.clear();
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.isManualClose = true;
    this.reconnectAttempts = this.maxReconnectAttempts; // 阻止重连
    this._stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socketTask) {
      this.socketTask.close({
        code: 1000,
        reason: 'Manual close'
      });
      this.socketTask = null;
    }

    this.connected = false;
    this.disconnected = true;
    this.listeners.clear();
    this.messageQueue = [];
    this.binaryQueue = [];
  }

  /**
   * 关闭连接（别名）
   */
  close(): void {
    this.disconnect();
  }
}

/**
 * 创建 WebSocket 连接（兼容 socket.io 的 io() 函数）
 */
export function createWebSocket(url: string, options?: Partial<WebSocketOptions>): MiniProgramWebSocket {
  const socket = new MiniProgramWebSocket({
    url,
    ...options
  });
  socket.connect();
  return socket;
}

/**
 * socket.io 兼容的 io 函数
 */
export function io(url: string, options?: Partial<WebSocketOptions>): MiniProgramWebSocket {
  return createWebSocket(url, options);
}
