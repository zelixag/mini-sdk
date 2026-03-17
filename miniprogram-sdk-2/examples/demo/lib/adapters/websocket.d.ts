/**
 * WebSocket Adapter for Mini Program
 * 封装微信小程序 WebSocket API，支持 Socket.IO 协议
 */
export interface WebSocketOptions {
    url: string;
    protocols?: string[];
    timeout?: number;
}
export interface WebSocketMessage {
    data: string | ArrayBuffer;
}
/**
 * WebSocket 适配器类
 */
export declare class MiniProgramWebSocket {
    private socketTask;
    private url;
    private protocols;
    private isConnected;
    private isClosed;
    private onOpenCallback;
    private onMessageCallback;
    private onErrorCallback;
    private onCloseCallback;
    constructor(url: string, protocols?: string | string[]);
    /**
     * 连接到 WebSocket 服务器
     */
    connect(options?: {
        timeout?: number;
    }): Promise<void>;
    /**
     * 发送数据
     */
    send(data: string | ArrayBuffer): void;
    /**
     * 关闭连接
     */
    close(code?: number, reason?: string): void;
    /**
     * 设置打开回调
     */
    onOpen(callback: (event: any) => void): void;
    /**
     * 设置消息回调
     */
    onMessage(callback: (event: WebSocketMessage) => void): void;
    /**
     * 设置错误回调
     */
    onError(callback: (event: any) => void): void;
    /**
     * 设置关闭回调
     */
    onClose(callback: (event: any) => void): void;
    /**
     * 获取连接状态
     */
    getReadyState(): number;
    /**
     * 是否已连接
     */
    get isOpen(): boolean;
}
/**
 * 创建 WebSocket 连接
 */
export declare function createWebSocket(url: string, protocols?: string | string[]): MiniProgramWebSocket;
/**
 * Socket.IO 适配器
 * 基于原生 WebSocket 封装
 */
export declare class SocketIOAdapter {
    private ws;
    private url;
    private namespace;
    private connected;
    private eventHandlers;
    private ackCallbacks;
    private messageId;
    constructor(url: string, options?: {
        namespace?: string;
    });
    /**
     * 连接到 Socket.IO 服务器
     */
    connect(): Promise<void>;
    /**
     * 处理 Socket.IO 协议消息
     */
    private handleMessage;
    /**
     * 解析事件消息
     */
    private parseEvent;
    /**
     * 解析 Ack 响应
     */
    private parseAck;
    /**
     * 发送 Socket.IO 数据包
     */
    private sendPacket;
    /**
     * 监听事件
     */
    on(event: string, callback: Function): void;
    /**
     * 取消监听
     */
    off(event: string, callback?: Function): void;
    /**
     * 关闭连接
     */
    disconnect(): void;
    /**
     * 获取连接状态
     */
    get connected(): boolean;
}
export declare function io(url: string, options?: any): SocketIOAdapter;
declare const _default: {
    MiniProgramWebSocket: typeof MiniProgramWebSocket;
    createWebSocket: typeof createWebSocket;
    SocketIOAdapter: typeof SocketIOAdapter;
    io: typeof io;
};
export default _default;
