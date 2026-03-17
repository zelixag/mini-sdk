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
import { ErrorHandler } from '../utils/ErrorHandler';
export interface WebSocketOptions {
    url: string;
    protocols?: string[];
    header?: Record<string, string>;
    timeout?: number;
    query?: Record<string, string>;
    transports?: string[];
    reconnection?: boolean;
    reconnectionAttempts?: number;
    reconnectionDelay?: number;
    reconnectionDelayMax?: number;
    randomizationFactor?: number;
}
export interface WebSocketMessage {
    type: string;
    data: any;
}
/**
 * 小程序 WebSocket 封装（熵减优化版）
 * 兼容 socket.io 的部分 API
 */
export declare class MiniProgramWebSocket {
    private socketTask;
    private url;
    private protocols?;
    private header?;
    private timeout?;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private reconnectDelayMax;
    private randomizationFactor;
    private reconnectTimer;
    private isManualClose;
    private listeners;
    private anyListeners;
    private messageQueue;
    private query?;
    /** Socket.IO 二进制事件：先收到占位符包，再收齐 N 个二进制帧后重组并 emit */
    private binaryPending;
    private errorHandler;
    private pingTimer;
    private pongTimeoutTimer;
    private readonly PING_INTERVAL;
    private readonly PONG_TIMEOUT;
    connected: boolean;
    disconnected: boolean;
    id: string | null;
    constructor(options: WebSocketOptions, errorHandler?: ErrorHandler);
    /**
     * 连接 WebSocket
     */
    connect(): void;
    private _connect;
    /**
     * 启动心跳机制
     */
    private _startHeartbeat;
    /**
     * 停止心跳机制
     */
    private _stopHeartbeat;
    /**
     * 处理服务端下发的包：Engine.IO 握手(0)、ping(2)、socket.io 事件(42[...]、51-[...] 二进制事件)
     * 二进制事件先发占位符 51-[event,{_placeholder:true,num:0}]，再发 N 个二进制帧；需收齐后重组再 emit
     */
    private _handleSocketMessage;
    /**
     * 重连处理（指数退避）
     */
    private _handleReconnect;
    /**
     * 发送消息
     * Socket.IO 事件包需带前缀 42（Engine.IO type 4 + Socket.IO type 2 EVENT），否则服务端不认会 1006 断开
     */
    send(data: any): void;
    /**
     * 发送事件（兼容 socket.io）
     */
    emit(event: string, data?: any): void;
    /**
     * 监听事件
     */
    on(event: string, callback: Function): void;
    /**
     * 移除监听
     */
    off(event: string, callback?: Function): void;
    /**
     * 触发事件（内部方法）
     */
    private _emit;
    /**
     * 监听所有事件（socket.io 兼容）
     */
    onAny(callback: (event: string, ...args: any[]) => void): void;
    /**
     * 移除 onAny 监听器
     */
    offAny(callback?: Function): void;
    /**
     * 断开连接
     */
    disconnect(): void;
    /**
     * 关闭连接（别名）
     */
    close(): void;
}
/**
 * 创建 WebSocket 连接（兼容 socket.io 的 io() 函数）
 */
export declare function createWebSocket(url: string, options?: Partial<WebSocketOptions>): MiniProgramWebSocket;
/**
 * socket.io 兼容的 io 函数
 */
export declare function io(url: string, options?: Partial<WebSocketOptions>): MiniProgramWebSocket;
