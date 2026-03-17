'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/**
 * Window Polyfill for Mini Program
 * 将 window 映射到 globalThis
 */
// 保存原始的全局对象引用
const _global = typeof globalThis !== 'undefined' ? globalThis :
    typeof window !== 'undefined' ? window :
        typeof global !== 'undefined' ? global : {};
// 设置全局引用
if (typeof globalThis !== 'undefined') {
    globalThis.window = _global;
    globalThis.self = _global;
}
// 基础 window 属性
({
    // 定时器 (小程序有原生支持)
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    setInterval: setInterval.bind(globalThis),
    clearInterval: clearInterval.bind(globalThis),
    // requestAnimationFrame (需要适配小程序)
    requestAnimationFrame: (typeof globalThis.requestAnimationFrame !== 'undefined')
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : ((callback) => setTimeout(callback, 16)),
    cancelAnimationFrame: (typeof globalThis.cancelAnimationFrame !== 'undefined')
        ? globalThis.cancelAnimationFrame.bind(globalThis)
        : ((id) => clearTimeout(id))});

/**
 * Canvas Adapter for Mini Program
 * 封装微信小程序 canvas 相关 API，提供 WebGL 渲染支持
 */
/**
 * 创建 Canvas 适配器
 */
function createCanvasAdapter(options) {
    const { canvasId, width = 375, height = 667 } = options;
    // 小程序 canvas 组件
    const canvas = wx.createCanvas(canvasId, {
        type: options.type || 'webgl'
    });
    // 设置尺寸
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    return {
        canvas,
        getContext: (type) => {
            return canvas.getContext(type);
        },
        width: canvas.width,
        height: canvas.height
    };
}
/**
 * 获取 WebGL 上下文
 */
function getWebGLContext(canvas) {
    try {
        const gl = canvas.getContext('webgl', {
            alpha: true,
            antialias: true,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
        });
        if (!gl) {
            console.warn('[CanvasAdapter] WebGL not supported, trying webgl2');
            return canvas.getContext('webgl2', {
                alpha: true,
                antialias: true,
                depth: false,
                stencil: false,
                preserveDrawingBuffer: false,
                powerPreference: 'high-performance'
            });
        }
        return gl;
    }
    catch (e) {
        console.error('[CanvasAdapter] Failed to get WebGL context:', e);
        return null;
    }
}
/**
 * Canvas Adapter 类
 */
class CanvasAdapter {
    constructor(options) {
        this.gl = null;
        const { canvasId, width = 375, height = 667, type = 'webgl' } = options;
        // 创建离屏 canvas
        this.canvas = wx.createCanvas(canvasId, { type });
        // 设置尺寸
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
        // 获取 WebGL 上下文
        if (type === 'webgl' || type === 'webgl2') {
            this.gl = this.getContext(type);
        }
    }
    getContext(type) {
        try {
            return this.canvas.getContext(type, {
                alpha: true,
                antialias: true,
                depth: false,
                stencil: false,
                preserveDrawingBuffer: false,
                powerPreference: 'high-performance'
            });
        }
        catch (e) {
            console.error('[CanvasAdapter] getContext error:', e);
            return null;
        }
    }
    getGL() {
        return this.gl;
    }
    getCanvas() {
        return this.canvas;
    }
    getWidth() {
        return this.width;
    }
    getHeight() {
        return this.height;
    }
    setSize(width, height) {
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
    }
    /**
     * 渲染完成回调
     */
    draw(callback) {
        if (this.canvas.draw && callback) {
            this.canvas.draw(callback);
        }
        else if (callback) {
            callback();
        }
    }
}

/**
 * Audio Adapter for Mini Program
 * 封装微信小程序音频 API，支持 PCM 音频播放
 */
/**
 * 音频上下文管理器
 */
class AudioAdapter {
    constructor(options = {}) {
        this.audioContext = null;
        this.innerAudioContext = null;
        this.audioBuffer = null;
        this.sourceNode = null;
        this.gainNode = null;
        this.isPlaying = false;
        this.volume = 1.0;
        this.onEndedCallback = null;
        this.onErrorCallback = null;
        this.volume = options.volume ?? 1.0;
        this.initAudioContext();
    }
    /**
     * 初始化音频上下文
     */
    initAudioContext() {
        try {
            // 小程序音频管理器
            this.audioContext = wx.createInnerAudioContext();
            this.audioContext.volume = this.volume;
            // 事件监听
            this.audioContext.onEnded(() => {
                this.isPlaying = false;
                this.onEndedCallback?.();
            });
            this.audioContext.onError((err) => {
                console.error('[AudioAdapter] Audio error:', err);
                this.isPlaying = false;
                this.onErrorCallback?.(err);
            });
        }
        catch (e) {
            console.error('[AudioAdapter] Failed to create audio context:', e);
        }
    }
    /**
     * 设置音频源 (支持 PCM 或 URL)
     */
    setSource(src) {
        if (!this.audioContext)
            return;
        if (typeof src === 'string') {
            // URL 音频
            this.audioContext.src = src;
            this.audioContext.autoplay = false;
        }
        else {
            // PCM ArrayBuffer - 需要先解码
            this.decodeAudioData(src);
        }
    }
    /**
     * 解码 PCM 数据
     */
    async decodeAudioData(arrayBuffer) {
        try {
            // 小程序不支持 Web Audio API 的 decodeAudioData
            // 需要将 PCM 数据写入文件后播放
            const buffer = arrayBuffer;
            const tempFilePath = `${wx.env.USER_DATA_PATH}/temp_audio_${Date.now()}.pcm`;
            // 将 ArrayBuffer 写入本地文件
            const fs = wx.getFileSystemManager();
            await fs.writeFile({
                filePath: tempFilePath,
                data: buffer,
                encoding: 'binary'
            });
            this.audioContext.src = tempFilePath;
            this.audioContext.format = 'pcm';
            return null;
        }
        catch (e) {
            console.error('[AudioAdapter] Failed to decode audio data:', e);
            return null;
        }
    }
    /**
     * 播放音频
     */
    play() {
        if (!this.audioContext)
            return;
        try {
            this.audioContext.play();
            this.isPlaying = true;
        }
        catch (e) {
            console.error('[AudioAdapter] Play error:', e);
        }
    }
    /**
     * 暂停音频
     */
    pause() {
        if (!this.audioContext)
            return;
        try {
            this.audioContext.pause();
            this.isPlaying = false;
        }
        catch (e) {
            console.error('[AudioAdapter] Pause error:', e);
        }
    }
    /**
     * 停止音频
     */
    stop() {
        if (!this.audioContext)
            return;
        try {
            this.audioContext.stop();
            this.isPlaying = false;
        }
        catch (e) {
            console.error('[AudioAdapter] Stop error:', e);
        }
    }
    /**
     * 跳转
     */
    seek(time) {
        if (!this.audioContext)
            return;
        try {
            this.audioContext.seek(time);
        }
        catch (e) {
            console.error('[AudioAdapter] Seek error:', e);
        }
    }
    /**
     * 设置音量
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.audioContext) {
            this.audioContext.volume = this.volume;
        }
    }
    /**
     * 获取音量
     */
    getVolume() {
        return this.volume;
    }
    /**
     * 设置播放结束回调
     */
    onEnded(callback) {
        this.onEndedCallback = callback;
    }
    /**
     * 设置错误回调
     */
    onError(callback) {
        this.onErrorCallback = callback;
    }
    /**
     * 获取播放状态
     */
    getIsPlaying() {
        return this.isPlaying;
    }
    /**
     * 获取当前播放时间
     */
    getCurrentTime() {
        return this.audioContext?.currentTime || 0;
    }
    /**
     * 获取音频时长
     */
    getDuration() {
        return this.audioContext?.duration || 0;
    }
    /**
     * 销毁
     */
    destroy() {
        if (this.audioContext) {
            this.audioContext.stop();
            this.audioContext = null;
        }
        this.isPlaying = false;
        this.onEndedCallback = null;
        this.onErrorCallback = null;
    }
}

/**
 * WebSocket Adapter for Mini Program
 * 封装微信小程序 WebSocket API，支持 Socket.IO 协议
 */
/**
 * WebSocket 适配器类
 */
class MiniProgramWebSocket {
    constructor(url, protocols) {
        this.socketTask = null;
        this.url = '';
        this.protocols = [];
        this.isConnected = false;
        this.isClosed = false;
        // 事件回调
        this.onOpenCallback = null;
        this.onMessageCallback = null;
        this.onErrorCallback = null;
        this.onCloseCallback = null;
        this.url = url;
        this.protocols = Array.isArray(protocols) ? protocols : protocols ? [protocols] : [];
    }
    /**
     * 连接到 WebSocket 服务器
     */
    connect(options) {
        return new Promise((resolve, reject) => {
            if (this.socketTask) {
                resolve();
                return;
            }
            const task = wx.connectSocket({
                url: this.url,
                protocols: this.protocols.length > 0 ? this.protocols : undefined,
                timeout: options?.timeout || 30000
            });
            task.onOpen((event) => {
                this.isConnected = true;
                this.onOpenCallback?.(event);
                resolve();
            });
            task.onMessage((event) => {
                this.onMessageCallback?.(event);
            });
            task.onError((event) => {
                this.isConnected = false;
                this.onErrorCallback?.(event);
                reject(event);
            });
            task.onClose((event) => {
                this.isConnected = false;
                this.isClosed = true;
                this.onCloseCallback?.(event);
            });
            this.socketTask = task;
        });
    }
    /**
     * 发送数据
     */
    send(data) {
        if (!this.socketTask || !this.isConnected) {
            console.warn('[WebSocket] Not connected, cannot send message');
            return;
        }
        let sendData = data;
        // 如果是 ArrayBuffer，转换为 Uint8Array
        if (data instanceof ArrayBuffer) {
            sendData = new Uint8Array(data);
        }
        this.socketTask.send({
            data: sendData,
            fail: (err) => {
                console.error('[WebSocket] Send error:', err);
            }
        });
    }
    /**
     * 关闭连接
     */
    close(code, reason) {
        if (!this.socketTask)
            return;
        this.isConnected = false;
        this.isClosed = true;
        this.socketTask.close({
            code: code || 1000,
            reason: reason || 'Normal closure'
        });
        this.socketTask = null;
    }
    /**
     * 设置打开回调
     */
    onOpen(callback) {
        this.onOpenCallback = callback;
    }
    /**
     * 设置消息回调
     */
    onMessage(callback) {
        this.onMessageCallback = callback;
    }
    /**
     * 设置错误回调
     */
    onError(callback) {
        this.onErrorCallback = callback;
    }
    /**
     * 设置关闭回调
     */
    onClose(callback) {
        this.onCloseCallback = callback;
    }
    /**
     * 获取连接状态
     */
    getReadyState() {
        if (this.isClosed)
            return 3; // CLOSED
        if (this.isConnected)
            return 1; // OPEN
        return 0; // CONNECTING
    }
    /**
     * 是否已连接
     */
    get isOpen() {
        return this.isConnected && !this.isClosed;
    }
}
/**
 * 创建 WebSocket 连接
 */
function createWebSocket(url, protocols) {
    return new MiniProgramWebSocket(url, protocols);
}
/**
 * Socket.IO 适配器
 * 基于原生 WebSocket 封装
 */
class SocketIOAdapter {
    constructor(url, options) {
        this.ws = null;
        this.url = '';
        this.namespace = '/';
        this.connected = false;
        this.eventHandlers = new Map();
        this.ackCallbacks = new Map();
        this.messageId = 0;
        this.url = url;
        this.namespace = options?.namespace || '/';
    }
    /**
     * 连接到 Socket.IO 服务器
     */
    connect() {
        return new Promise((resolve, reject) => {
            // 构建 Socket.IO URL
            const socketUrl = `${this.url}?EIO=4&transport=websocket&t=${Date.now()}`;
            this.ws = new MiniProgramWebSocket(socketUrl);
            this.ws.onOpen(() => {
                this.connected = true;
                this.emit('connect');
                resolve();
            });
            this.ws.onMessage((event) => {
                this.handleMessage(event.data);
            });
            this.ws.onError((err) => {
                console.error('[SocketIO] Error:', err);
                reject(err);
            });
            this.ws.onClose(() => {
                this.connected = false;
                this.emit('disconnect');
            });
            this.ws.connect().catch(reject);
        });
    }
    /**
     * 处理 Socket.IO 协议消息
     */
    handleMessage(data) {
        // 解析 Socket.IO 协议
        // 格式: <message type><message id?>[<data>]
        const type = data.charAt(0);
        switch (type) {
            case '0': // Open
                break;
            case '2': // Ping
                this.sendPacket('3'); // Pong
                break;
            case '4': // Message
                const subtype = data.charAt(1);
                if (subtype === '0') { // Connect
                    this.emit('connect');
                }
                else if (subtype === '2') { // Disconnect
                    this.emit('disconnect');
                }
                else if (subtype === '4') { // Event
                    this.parseEvent(data.substring(2));
                }
                else if (subtype === '6') { // Ack
                    this.parseAck(data.substring(2));
                }
                break;
            default:
                console.log('[SocketIO] Unknown message type:', type);
        }
    }
    /**
     * 解析事件消息
     */
    parseEvent(data) {
        try {
            const parsed = JSON.parse(data);
            const eventName = parsed[0];
            const eventData = parsed[1];
            this.emit(eventName, eventData);
        }
        catch (e) {
            console.error('[SocketIO] Failed to parse event:', e);
        }
    }
    /**
     * 解析 Ack 响应
     */
    parseAck(data) {
        try {
            const parsed = JSON.parse(data);
            const ackId = parsed[0];
            const ackData = parsed[1];
            const callback = this.ackCallbacks.get(ackId);
            if (callback) {
                callback(ackData);
                this.ackCallbacks.delete(ackId);
            }
        }
        catch (e) {
            console.error('[SocketIO] Failed to parse ack:', e);
        }
    }
    /**
     * 发送 Socket.IO 数据包
     */
    sendPacket(type, data) {
        if (!this.ws || !this.connected) {
            console.warn('[SocketIO] Not connected');
            return;
        }
        this.ws.send(data ? `${type}${data}` : type);
    }
    /**
     * 发送事件
     */
    emit(event, data, callback) {
        if (!this.connected) {
            console.warn('[SocketIO] Not connected, cannot emit event:', event);
            return;
        }
        const packetId = ++this.messageId;
        const payload = [event];
        if (data !== undefined) {
            payload.push(data);
        }
        const packetData = JSON.stringify(packetId >= 0 ? [payload, packetId] : payload);
        this.sendPacket('42', packetData);
        // 注册 Ack 回调
        if (callback && packetId >= 0) {
            this.ackCallbacks.set(packetId, callback);
        }
    }
    /**
     * 监听事件
     */
    on(event, callback) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(callback);
    }
    /**
     * 取消监听
     */
    off(event, callback) {
        if (!callback) {
            this.eventHandlers.delete(event);
        }
        else {
            this.eventHandlers.get(event)?.delete(callback);
        }
    }
    /**
     * 触发事件
     */
    emit(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(callback => {
                try {
                    callback(data);
                }
                catch (e) {
                    console.error('[SocketIO] Event handler error:', e);
                }
            });
        }
    }
    /**
     * 关闭连接
     */
    disconnect() {
        if (this.ws) {
            this.sendPacket('1'); // Disconnect
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }
    /**
     * 获取连接状态
     */
    get connected() {
        return this.connected;
    }
}
// Socket.IO factory (兼容原有 API)
const socketIOInstances = new Map();
function io(url, options) {
    const key = options?.path || url;
    if (socketIOInstances.has(key)) {
        return socketIOInstances.get(key);
    }
    const instance = new SocketIOAdapter(url, options);
    socketIOInstances.set(key, instance);
    return instance;
}

/**
 * Request Adapter for Mini Program
 * 封装 wx.request，提供 fetch 兼容接口
 */
/**
 * 发送网络请求
 */
function request(options) {
    const { url, method = 'GET', headers = {}, body, dataType = 'json', responseType = 'text', timeout = 30000 } = options;
    return new Promise((resolve, reject) => {
        const task = wx.request({
            url,
            method,
            header: headers,
            data: body,
            dataType,
            responseType,
            timeout,
            success: (res) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(res);
                }
                else {
                    reject(new Error(`Request failed with status ${res.statusCode}`));
                }
            },
            fail: (err) => {
                reject(err);
            }
        });
        // 返回任务对象
        return {
            abort: () => task.abort(),
            onChunkReceived: (callback) => task.onChunkReceived(callback),
            offChunkReceived: (callback) => task.offChunkReceived(callback),
            onProgressUpdate: (callback) => task.onProgressUpdate(callback),
            offProgressUpdate: (callback) => task.offProgressUpdate(callback)
        };
    });
}
/**
 * GET 请求
 */
function get(url, options) {
    return request({
        url,
        method: 'GET',
        ...options
    });
}
/**
 * POST 请求
 */
function post(url, data, options) {
    return request({
        url,
        method: 'POST',
        body: data,
        ...options
    });
}
/**
 * 全局请求配置
 */
let globalHeaders = {};
let globalTimeout = 30000;
/**
 * mpRequest - 主要使用的请求函数
 * 封装签名等逻辑
 */
async function mpRequest(url, options) {
    const headers = {
        ...globalHeaders,
        ...options.headers
    };
    return request({
        ...options,
        url,
        headers,
        timeout: options.timeout || globalTimeout
    });
}
// 导出 AbortController 兼容
class AbortController {
    constructor() {
        this.aborted = false;
    }
    abort() {
        this.aborted = true;
    }
}

/**
 * Logger Utility for Mini Program SDK
 * 日志工具，支持多级别日志
 */
exports.LogLevel = void 0;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
    LogLevel[LogLevel["NONE"] = 4] = "NONE";
})(exports.LogLevel || (exports.LogLevel = {}));
class Logger {
    constructor(tag) {
        this.level = exports.LogLevel.INFO;
        this.enabled = true;
        this.tag = '[XmovAvatarMP]';
        if (tag) {
            this.tag = tag;
        }
    }
    setLevel(level) {
        this.level = level;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    setTag(tag) {
        this.tag = tag;
    }
    debug(...args) {
        if (this.enabled && this.level <= exports.LogLevel.DEBUG) {
            console.debug(this.tag, ...args);
        }
    }
    log(...args) {
        if (this.enabled && this.level <= exports.LogLevel.INFO) {
            console.log(this.tag, ...args);
        }
    }
    info(...args) {
        if (this.enabled && this.level <= exports.LogLevel.INFO) {
            console.info(this.tag, ...args);
        }
    }
    warn(...args) {
        if (this.enabled && this.level <= exports.LogLevel.WARN) {
            console.warn(this.tag, ...args);
        }
    }
    error(...args) {
        if (this.enabled && this.level <= exports.LogLevel.ERROR) {
            console.error(this.tag, ...args);
        }
    }
}
// 全局 logger 实例
const globalLogger = new Logger('[XmovAvatarMP]');
function createModuleLogger(tag) {
    return new Logger(`[XmovAvatarMP] ${tag}`);
}
const logger = globalLogger;

/**
 * Math Utils for Mini Program SDK
 * 数学工具函数
 */
/**
 * 矩阵乘法
 */
function mmul(a, b) {
    const rows = a.length;
    const cols = b[0]?.length || 1;
    const result = new Array(rows * cols).fill(0);
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            for (let k = 0; k < cols; k++) {
                result[i * cols + j] += a[i * cols + k] * b[k * cols + j];
            }
        }
    }
    return result;
}
/**
 * 矩阵转置
 */
function transpose(m) {
    const rows = m.length;
    const cols = m[0]?.length || 1;
    const result = new Array(rows * cols);
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            result[j * rows + i] = m[i * cols + j];
        }
    }
    return result;
}
/**
 * 展平多维数组
 */
function flatten(arr) {
    const result = [];
    for (const item of arr) {
        if (Array.isArray(item)) {
            result.push(...flatten(item));
        }
        else {
            result.push(item);
        }
    }
    return result;
}
/**
 * 4x4 矩阵乘法
 */
function mat4Multiply(a, b) {
    const result = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) {
                sum += a[i * 4 + k] * b[k * 4 + j];
            }
            result[i * 4 + j] = sum;
        }
    }
    return result;
}
/**
 * 创建单位矩阵
 */
function createIdentityMatrix() {
    return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ]);
}
/**
 * 创建透视投影矩阵
 */
function createPerspectiveMatrix(fov, aspect, near, far) {
    const f = 1.0 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
    ]);
}
/**
 * 创建正交投影矩阵
 */
function createOrthographicMatrix(left, right, bottom, top, near, far) {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    return new Float32Array([
        -2 * lr, 0, 0, 0,
        0, -2 * bt, 0, 0,
        0, 0, 2 * nf, 0,
        (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1
    ]);
}
/**
 * 3D 旋转矩阵 (绕 X 轴)
 */
function rotateX(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Float32Array([
        1, 0, 0, 0,
        0, c, s, 0,
        0, -s, c, 0,
        0, 0, 0, 1
    ]);
}
/**
 * 3D 旋转矩阵 (绕 Y 轴)
 */
function rotateY(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Float32Array([
        c, 0, -s, 0,
        0, 1, 0, 0,
        s, 0, c, 0,
        0, 0, 0, 1
    ]);
}
/**
 * 3D 旋转矩阵 (绕 Z 轴)
 */
function rotateZ(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Float32Array([
        c, s, 0, 0,
        -s, c, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ]);
}
/**
 * 平移矩阵
 */
function translate(x, y, z) {
    return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        x, y, z, 1
    ]);
}
/**
 * 缩放矩阵
 */
function scale(x, y, z) {
    return new Float32Array([
        x, 0, 0, 0,
        0, y, 0, 0,
        0, 0, z, 0,
        0, 0, 0, 1
    ]);
}
/**
 * 线性插值
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}
/**
 * 角度转弧度
 */
function degToRad(degrees) {
    return degrees * Math.PI / 180;
}
/**
 * 弧度转角度
 */
function radToDeg(radians) {
    return radians * 180 / Math.PI;
}
/**
 * 限制数值范围
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
/**
 * 平滑过渡
 */
function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

/**
 * RenderSchedulerMP - 渲染调度器 for Mini Program
 * 借鉴 Web SDK RenderScheduler 实现
 */
/**
 * RenderSchedulerMP - 渲染调度器
 * 负责帧动画驱动、数据路由、渲染协调
 */
class RenderSchedulerMP {
    constructor(options) {
        this.dataCacheQueue = null;
        this.bodyRenderer = null;
        this.avatarRenderer = null;
        this.frameRate = 24;
        this.currentFrame = 0;
        this.isPlaying = false;
        this.renderState = 'init';
        this.animationFrameId = 0;
        this.lastFrameTime = 0;
        this.frameInterval = 1000 / 24;
        // 回调
        this.onFrameCallback = null;
        this.onStateChangeCallback = null;
        this.onRenderChangeCallback = null;
        // 外部注入
        this.bodyRendererImpl = null;
        this.avatarRendererImpl = null;
        this.options = options;
        this.frameRate = options.frameRate || 24;
        this.frameInterval = 1000 / this.frameRate;
        this.onStateChangeCallback = options.onStateChange;
        this.onRenderChangeCallback = options.onRenderChange;
        logger.info('[RenderSchedulerMP] Created with frameRate:', this.frameRate);
    }
    /**
     * 初始化
     */
    init(dataCacheQueue) {
        this.dataCacheQueue = dataCacheQueue;
        this.renderState = 'init';
        logger.info('[RenderSchedulerMP] Initialized');
    }
    /**
     * 设置身体渲染器
     */
    setBodyRenderer(renderer) {
        this.bodyRenderer = renderer;
    }
    /**
     * 设置数字人渲染器
     */
    setAvatarRenderer(renderer) {
        this.avatarRenderer = renderer;
    }
    /**
     * 获取数据缓存队列
     */
    getDataCacheQueue() {
        return this.dataCacheQueue;
    }
    /**
     * 开始渲染
     */
    start() {
        if (this.isPlaying)
            return;
        this.isPlaying = true;
        this.renderState = 'rendering';
        this.lastFrameTime = performance.now();
        this.startRenderLoop();
        this.onRenderChangeCallback?.('rendering');
        this.onStateChangeCallback?.('playing');
        logger.info('[RenderSchedulerMP] Started');
    }
    /**
     * 停止渲染
     */
    stop() {
        if (!this.isPlaying)
            return;
        this.isPlaying = false;
        this.renderState = 'stopped';
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = 0;
        }
        this.onRenderChangeCallback?.('stopped');
        this.onStateChangeCallback?.('stopped');
        logger.info('[RenderSchedulerMP] Stopped');
    }
    /**
     * 暂停渲染
     */
    pause() {
        if (!this.isPlaying)
            return;
        this.isPlaying = false;
        this.renderState = 'paused';
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = 0;
        }
        this.onRenderChangeCallback?.('paused');
        logger.info('[RenderSchedulerMP] Paused');
    }
    /**
     * 恢复渲染
     */
    resume() {
        if (this.isPlaying || this.renderState !== 'paused')
            return;
        this.isPlaying = true;
        this.renderState = 'rendering';
        this.lastFrameTime = performance.now();
        this.startRenderLoop();
        this.onRenderChangeCallback?.('resumed');
        logger.info('[RenderSchedulerMP] Resumed');
    }
    /**
     * 启动渲染循环
     */
    startRenderLoop() {
        const loop = () => {
            if (!this.isPlaying)
                return;
            const now = performance.now();
            const elapsed = now - this.lastFrameTime;
            if (elapsed >= this.frameInterval) {
                this.renderFrame();
                this.lastFrameTime = now - (elapsed % this.frameInterval);
            }
            this.animationFrameId = requestAnimationFrame(loop);
        };
        this.animationFrameId = requestAnimationFrame(loop);
    }
    /**
     * 渲染单帧
     */
    renderFrame() {
        this.currentFrame++;
        // 触发帧回调
        this.onFrameCallback?.(this.currentFrame);
        // 获取当前帧数据
        const bodyFrame = this.dataCacheQueue?._getBodyImageBitmap(this.currentFrame);
        const faceFrame = this.dataCacheQueue?._getFacial?.(this.currentFrame);
        const audioFrame = this.dataCacheQueue?._getAudio?.(this.currentFrame);
        // 渲染身体
        if (bodyFrame && this.bodyRenderer) {
            this.bodyRenderer.render(bodyFrame);
        }
        // 渲染数字人（脸部 + 身体融合）
        if (this.avatarRenderer) {
            this.avatarRenderer.render({
                frame: this.currentFrame,
                bodyFrame,
                faceFrame,
                audioFrame
            });
        }
    }
    /**
     * 处理数据（从 TTSA 接收）
     */
    handleData(data, type) {
        if (!this.dataCacheQueue)
            return;
        switch (type) {
            case 'body':
                // 处理身体数据
                this.handleBodyData(data);
                break;
            case 'face':
                // 处理脸部数据
                this.handleFaceData(data);
                break;
            case 'audio':
                // 处理音频数据
                this.handleAudioData(data);
                break;
            case 'event':
                // 处理事件数据
                this.handleEventData(data);
                break;
            default:
                logger.warn('[RenderSchedulerMP] Unknown data type:', type);
        }
    }
    /**
     * 处理身体数据
     */
    handleBodyData(data) {
        data.forEach(item => {
            const frameData = {
                frame: item.frame,
                frameIndex: item.frameIndex || item.sf,
                frameState: item.frameState || 'default',
                id: item.id || 0,
                name: item.name || '',
                body_id: item.body_id || 0,
                hfd: item.hfd || false,
                sf: item.sf || 0,
                offset: item.offset || 0
            };
            this.dataCacheQueue?._updateBodyImageBitmap(frameData);
        });
    }
    /**
     * 处理脸部数据
     */
    handleFaceData(data) {
        this.dataCacheQueue?._updateFacial?.(data);
    }
    /**
     * 处理音频数据
     */
    handleAudioData(data) {
        this.dataCacheQueue?._updateAudio?.(data);
    }
    /**
     * 处理事件数据
     */
    handleEventData(data) {
        this.dataCacheQueue?._updateUiEvent?.(data);
    }
    /**
     * 设置帧回调
     */
    setFrameCallback(callback) {
        this.onFrameCallback = callback;
    }
    /**
     * 获取当前帧
     */
    getCurrentFrame() {
        return this.currentFrame;
    }
    /**
     * 设置当前帧
     */
    setCurrentFrame(frame) {
        this.currentFrame = frame;
    }
    /**
     * 获取渲染状态
     */
    getRenderState() {
        return this.renderState;
    }
    /**
     * 强制同步解码器
     */
    forceSyncDecoder() {
        // TODO: 实现强制同步解码
        logger.debug('[RenderSchedulerMP] Force sync decoder');
    }
    /**
     * 清理所有脸部数据（暂停时）
     */
    clearAllFaceData() {
        this.dataCacheQueue?.clearAllFaceData?.();
    }
    /**
     * 销毁
     */
    destroy() {
        this.stop();
        if (this.dataCacheQueue) {
            this.dataCacheQueue.destroy?.();
            this.dataCacheQueue = null;
        }
        this.bodyRenderer = null;
        this.avatarRenderer = null;
        logger.info('[RenderSchedulerMP] Destroyed');
    }
}

/**
 * DataCacheQueueMP - 数据缓存队列 for Mini Program
 * 借鉴 Web SDK DataCacheQueue 实现
 */
/**
 * DataCacheQueueMP - 数据缓存队列
 * 管理身体、脸部、音频、事件数据的缓存
 */
class DataCacheQueueMP {
    constructor() {
        this.TAG = '[DataCacheQueueMP]';
        // Body 视频抽帧缓存 (使用 Map 优化查找)
        this._bodyQueue = new Map();
        // 表情数据队列
        this._facialQueue = [];
        this._realFacialQueue = [];
        // 音频队列
        this.audioQueue = [];
        // UI 事件队列
        this.eventQueue = [];
        // 当前视频 ID 列表
        this.videoIdList = [];
        // 当前播放状态
        this._currentPlayState = 'idle';
        // 当前 TTSA 状态
        this._currentTtsaState = null;
        logger.info(this.TAG, 'Created');
    }
    // ===== 属性 getter/setter =====
    set currentPlayState(state) {
        this._currentPlayState = state;
    }
    get currentPlayState() {
        return this._currentPlayState;
    }
    set currentTtsaState(state) {
        this._currentTtsaState = state;
    }
    get currentTtsaState() {
        return this._currentTtsaState;
    }
    get bodyQueue() {
        return Array.from(this._bodyQueue.values());
    }
    // ===== Body 数据操作 =====
    /**
     * 更新身体图像数据
     */
    _updateBodyImageBitmap(data) {
        // 清理旧帧
        const old = this._bodyQueue.get(data.frameIndex);
        if (old && old.frame) {
            this.disposeFrame(old.frame);
        }
        // 清理过期帧
        for (const [curIndex, curFrame] of this._bodyQueue.entries()) {
            if (curFrame.body_id < data.body_id && curFrame.frameIndex >= data.frameIndex) {
                this.disposeFrame(curFrame.frame);
                this._bodyQueue.delete(curIndex);
            }
        }
        this._bodyQueue.set(data.frameIndex, data);
        logger.debug(this.TAG, 'Body frame updated:', data.frameIndex);
    }
    /**
     * 获取身体图像数据
     */
    _getBodyImageBitmap(frameIndex) {
        const frame = this._bodyQueue.get(frameIndex);
        // 清理过期帧
        for (const [curIndex, curFrame] of this._bodyQueue.entries()) {
            if (curIndex < frameIndex) {
                this.disposeFrame(curFrame.frame);
                this._bodyQueue.delete(curIndex);
            }
        }
        return frame;
    }
    /**
     * 清理过期帧
     */
    clearOldFrames(sf) {
        for (const [curIndex, curFrame] of this._bodyQueue.entries()) {
            if (curIndex >= sf) {
                this.disposeFrame(curFrame.frame);
                this._bodyQueue.delete(curIndex);
            }
        }
    }
    /**
     * 设置视频 ID 列表
     */
    setVideoIdList(videoId) {
        if (!this.videoIdList.includes(videoId)) {
            this.videoIdList.push(videoId);
        }
    }
    /**
     * 获取视频 ID 列表
     */
    getVideoIdList() {
        return this.videoIdList;
    }
    // ===== Face 数据操作 =====
    /**
     * 更新表情数据
     */
    _updateFacial(data) {
        this._facialQueue = data;
    }
    /**
     * 获取表情数据
     */
    _getFacial(frameIndex) {
        return this._facialQueue.find(item => item.sf <= frameIndex && item.ef >= frameIndex);
    }
    /**
     * 更新实时表情数据
     */
    _updateRealFacial(data) {
        this._realFacialQueue = data;
    }
    /**
     * 获取实时表情数据
     */
    _getRealFacial(frameIndex) {
        return this._realFacialQueue.find(item => item.sf <= frameIndex && item.ef >= frameIndex);
    }
    /**
     * 清理所有表情数据
     */
    clearAllFaceData() {
        this._facialQueue = [];
        this._realFacialQueue = [];
        logger.debug(this.TAG, 'All face data cleared');
    }
    // ===== Audio 数据操作 =====
    /**
     * 更新音频数据
     */
    _updateAudio(data) {
        // 保留最新的音频数据
        this.audioQueue = data;
    }
    /**
     * 获取音频数据
     */
    _getAudio(frameIndex) {
        // 查找当前帧对应的音频数据
        return this.audioQueue.find(item => item.sf <= frameIndex && item.ef >= frameIndex);
    }
    /**
     * 清理音频数据
     */
    _clearAudio(speechId) {
        // 清理指定 speechId 的音频数据
        this.audioQueue = this.audioQueue.filter(item => item.sid > speechId);
    }
    // ===== Event 数据操作 =====
    /**
     * 更新 UI 事件
     */
    _updateUiEvent(data) {
        this.eventQueue.push(...data);
    }
    /**
     * 获取 UI 事件
     */
    _getUiEvent(frameIndex) {
        return this.eventQueue.filter(item => item.sf <= frameIndex && item.ef >= frameIndex);
    }
    /**
     * 清理事件数据
     */
    _clearEvent() {
        this.eventQueue = [];
    }
    // ===== 数据验证 =====
    /**
     * 检查数据有效性
     */
    checkValidData(data, type) {
        if (!data || data.length === 0)
            return;
        const first = data[0];
        const currentFrame = 0; // TODO: 获取当前帧
        if (first.sf < currentFrame) {
            logger.warn(this.TAG, `${type} data expired: sf=${first.sf}, current=${currentFrame}`);
        }
    }
    // ===== 工具方法 =====
    /**
     * 释放帧资源
     */
    disposeFrame(frame) {
        if (frame && typeof frame.close === 'function') {
            frame.close();
        }
        else if (frame && typeof frame.release === 'function') {
            frame.release();
        }
    }
    /**
     * 获取身体视频名称列表长度
     */
    getBodyVideoNameListLength() {
        const list = [];
        this.bodyQueue.forEach(item => {
            if (!list.includes(item.name)) {
                list.push(item.name);
            }
        });
        return list.length;
    }
    /**
     * 获取队列大小
     */
    getQueueSize() {
        return {
            body: this._bodyQueue.size,
            face: this._facialQueue.length,
            audio: this.audioQueue.length,
            event: this.eventQueue.length
        };
    }
    /**
     * 清理所有数据
     */
    clear() {
        // 清理 body
        for (const [, frame] of this._bodyQueue) {
            this.disposeFrame(frame.frame);
        }
        this._bodyQueue.clear();
        // 清理 face
        this._facialQueue = [];
        this._realFacialQueue = [];
        // 清理 audio
        this.audioQueue = [];
        // 清理 event
        this.eventQueue = [];
        this.videoIdList = [];
        logger.info(this.TAG, 'All queues cleared');
    }
    /**
     * 销毁
     */
    destroy() {
        this.clear();
        logger.info(this.TAG, 'Destroyed');
    }
}

/**
 * GLDeviceMP - WebGL Device Adapter for Mini Program
 * 基于微信小程序 canvas 的 WebGL 设备封装
 */
class GLDeviceMP {
    constructor(options) {
        this.gl = null;
        this.isWebGL2 = false;
        this.contextLost = false;
        this.canvas = options.canvas;
        this.initWebGL(options);
    }
    /**
     * 初始化 WebGL 上下文
     */
    initWebGL(options) {
        if (!this.canvas) {
            logger.error('[GLDeviceMP] Canvas is null');
            return;
        }
        const contextOptions = {
            alpha: options.alpha ?? true,
            antialias: options.antialias ?? true,
            depth: options.depth ?? false,
            stencil: options.stencil ?? false,
            premultipliedAlpha: options.premultipliedAlpha ?? true,
            preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
            powerPreference: options.powerPreference ?? 'high-performance'
        };
        // 尝试获取 WebGL2 上下文
        try {
            this.gl = this.canvas.getContext('webgl2', contextOptions);
            if (this.gl) {
                this.isWebGL2 = true;
                logger.info('[GLDeviceMP] WebGL2 context created');
                return;
            }
        }
        catch (e) {
            logger.warn('[GLDeviceMP] WebGL2 not available:', e);
        }
        // 回退到 WebGL1
        try {
            this.gl = this.canvas.getContext('webgl', contextOptions) ||
                this.canvas.getContext('experimental-webgl', contextOptions);
            if (this.gl) {
                this.isWebGL2 = false;
                logger.info('[GLDeviceMP] WebGL1 context created');
                return;
            }
        }
        catch (e) {
            logger.error('[GLDeviceMP] Failed to create WebGL context:', e);
        }
        logger.error('[GLDeviceMP] WebGL is not supported');
    }
    /**
     * 获取 WebGL 版本
     */
    getVersion() {
        return this.isWebGL2 ? 'WebGL2' : 'WebGL1';
    }
    /**
     * 检查上下文是否有效
     */
    isValid() {
        return this.gl !== null && !this.contextLost;
    }
    /**
     * 获取画布宽度
     */
    getWidth() {
        return this.canvas?.width || 0;
    }
    /**
     * 获取画布高度
     */
    getHeight() {
        return this.canvas?.height || 0;
    }
    /**
     * 设置视口
     */
    viewport(x, y, width, height) {
        if (this.gl) {
            this.gl.viewport(x, y, width, height);
        }
    }
    /**
     * 清除颜色
     */
    clearColor(r, g, b, a) {
        if (this.gl) {
            this.gl.clearColor(r, g, b, a);
        }
    }
    /**
     * 清除缓冲区
     */
    clear(mask) {
        if (this.gl) {
            this.gl.clear(mask);
        }
    }
    /**
     * 创建着色器
     */
    createShader(type) {
        if (!this.gl)
            return null;
        return this.gl.createShader(type);
    }
    /**
     * 编译着色器
     */
    compileShader(shader, source) {
        if (!this.gl)
            return false;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            logger.error('[GLDeviceMP] Shader compile error:', this.gl.getShaderInfoLog(shader));
            return false;
        }
        return true;
    }
    /**
     * 创建着色器程序
     */
    createProgram() {
        if (!this.gl)
            return null;
        return this.gl.createProgram();
    }
    /**
     * 链接着色器程序
     */
    linkProgram(program) {
        if (!this.gl)
            return false;
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            logger.error('[GLDeviceMP] Program link error:', this.gl.getProgramInfoLog(program));
            return false;
        }
        return true;
    }
    /**
     * 使用着色器程序
     */
    useProgram(program) {
        if (this.gl) {
            this.gl.useProgram(program);
        }
    }
    /**
     * 创建缓冲区
     */
    createBuffer() {
        if (!this.gl)
            return null;
        return this.gl.createBuffer();
    }
    /**
     * 绑定缓冲区
     */
    bindBuffer(target, buffer) {
        if (this.gl) {
            this.gl.bindBuffer(target, buffer);
        }
    }
    /**
     * 设置缓冲区数据
     */
    bufferData(target, data, usage) {
        if (this.gl) {
            this.gl.bufferData(target, data, usage);
        }
    }
    /**
     * 创建纹理
     */
    createTexture() {
        if (!this.gl)
            return null;
        return this.gl.createTexture();
    }
    /**
     * 绑定纹理
     */
    bindTexture(target, texture) {
        if (this.gl) {
            this.gl.bindTexture(target, texture);
        }
    }
    /**
     * 设置纹理参数
     */
    texParameteri(target, pname, param) {
        if (this.gl) {
            this.gl.texParameteri(target, pname, param);
        }
    }
    /**
     * 上传纹理图像
     */
    texImage2D(target, level, internalformat, format, type, image) {
        if (!this.gl)
            return;
        // 小程序可能需要特殊处理
        if (image && image.width && image.height) {
            this.gl.texImage2D(target, level, internalformat, format, type, image);
        }
        else {
            this.gl.texImage2D(target, level, internalformat, internalformat, type, image);
        }
    }
    /**
     * 创建顶点数组对象 (WebGL2)
     */
    createVertexArray() {
        if (!this.gl || !this.isWebGL2)
            return null;
        return this.gl.createVertexArray();
    }
    /**
     * 绑定顶点数组 (WebGL2)
     */
    bindVertexArray(vertexArray) {
        if (!this.gl || !this.isWebGL2)
            return;
        this.gl.bindVertexArray(vertexArray);
    }
    /**
     * 启用混合
     */
    enable(cap) {
        if (this.gl) {
            this.gl.enable(cap);
        }
    }
    /**
     * 禁用混合
     */
    disable(cap) {
        if (this.gl) {
            this.gl.disable(cap);
        }
    }
    /**
     * 设置混合函数
     */
    blendFunc(sfactor, dfactor) {
        if (this.gl) {
            this.gl.blendFunc(sfactor, dfactor);
        }
    }
    /**
     * 开启深度测试
     */
    enableDepthTest() {
        if (this.gl) {
            this.gl.enable(this.gl.DEPTH_TEST);
        }
    }
    /**
     * 销毁设备
     */
    destroy() {
        this.contextLost = true;
        this.gl = null;
        this.canvas = null;
        logger.info('[GLDeviceMP] Device destroyed');
    }
}

/**
 * GLPipelineMP - WebGL 渲染管线 for Mini Program
 * 实现 IBR (Image-Based Rendering) 渲染管线
 */
/**
 * GLPipelineMP - WebGL 渲染管线
 * 负责 IBR 渲染，包括:
 * - 身体纹理渲染
 * - 表情混合形状 (Blendshape)
 * - 骨骼动画 (Skeleton Animation)
 * - 网格纹理融合
 */
class GLPipelineMP {
    constructor(options) {
        this.TAG = '[GLPipelineMP]';
        // 着色器程序
        this.bodyProgram = null;
        this.meshProgram = null;
        // 缓冲区
        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.texCoordBuffer = null;
        // 纹理
        this.bodyTexture = null;
        this.meshColorTexture = null;
        this.meshAlphaTexture = null;
        // 字符数据
        this.charData = null;
        this.isCharDataSet = false;
        // 渲染状态
        this.isInitialized = false;
        this.device = options.device;
        this.init();
        logger.info(this.TAG, 'Created');
    }
    /**
     * 初始化
     */
    init() {
        if (!this.device?.gl) {
            logger.error(this.TAG, 'No WebGL context');
            return;
        }
        try {
            this.initShaders();
            this.initBuffers();
            this.isInitialized = true;
            logger.info(this.TAG, 'Initialized');
        }
        catch (e) {
            logger.error(this.TAG, 'Init error:', e);
        }
    }
    /**
     * 初始化着色器
     */
    initShaders() {
        const gl = this.device.gl;
        if (!gl)
            return;
        // 身体渲染着色器 (简单版)
        const bodyVS = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;
        const bodyFS = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform float u_opacity;

      void main() {
        vec4 color = texture2D(u_texture, v_texCoord);
        gl_FragColor = vec4(color.rgb, color.a * u_opacity);
      }
    `;
        this.bodyProgram = this.createProgram(bodyVS, bodyFS);
        // 网格渲染着色器
        const meshVS = `
      attribute vec3 a_position;
      attribute vec2 a_texCoord;
      uniform mat4 u_projMat;
      varying vec2 v_texCoord;

      void main() {
        gl_Position = u_projMat * vec4(a_position, 1.0);
        v_texCoord = a_texCoord;
      }
    `;
        const meshFS = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_colorTexture;
      uniform sampler2D u_alphaTexture;

      void main() {
        vec4 color = texture2D(u_colorTexture, v_texCoord);
        float alpha = texture2D(u_alphaTexture, v_texCoord).r;
        gl_FragColor = vec4(color.rgb * alpha, alpha);
      }
    `;
        this.meshProgram = this.createProgram(meshVS, meshFS);
        logger.debug(this.TAG, 'Shaders created');
    }
    /**
     * 创建着色器程序
     */
    createProgram(vsSource, fsSource) {
        const gl = this.device.gl;
        if (!gl)
            return null;
        // 顶点着色器
        const vs = gl.createShader(gl.VERTEX_SHADER);
        if (!vs)
            return null;
        gl.shaderSource(vs, vsSource);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            logger.error(this.TAG, 'VS error:', gl.getShaderInfoLog(vs));
            return null;
        }
        // 片元着色器
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        if (!fs)
            return null;
        gl.shaderSource(fs, fsSource);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            logger.error(this.TAG, 'FS error:', gl.getShaderInfoLog(fs));
            return null;
        }
        // 程序
        const program = gl.createProgram();
        if (!program)
            return null;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            logger.error(this.TAG, 'Program error:', gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    }
    /**
     * 初始化缓冲区
     */
    initBuffers() {
        const gl = this.device.gl;
        if (!gl)
            return;
        // 顶点缓冲区 (全屏四边形)
        const vertices = new Float32Array([
            -1, -1, 0, 0,
            1, -1, 1, 0,
            -1, 1, 0, 1,
            1, 1, 1, 1
        ]);
        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        // 索引缓冲区
        const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        logger.debug(this.TAG, 'Buffers created');
    }
    /**
     * 设置字符数据
     */
    setCharData(data) {
        this.charData = data;
        this.isCharDataSet = true;
        logger.info(this.TAG, 'Char data set');
    }
    /**
     * 设置同步媒体
     */
    setSyncMedia() {
        logger.debug(this.TAG, 'Sync media set');
        // TODO: 实现同步媒体逻辑
    }
    /**
     * 渲染身体纹理
     */
    renderBody(image) {
        const gl = this.device.gl;
        if (!gl || !this.bodyProgram || !image)
            return;
        // 创建/更新纹理
        if (!this.bodyTexture) {
            this.bodyTexture = gl.createTexture();
        }
        gl.bindTexture(gl.TEXTURE_2D, this.bodyTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        // 渲染
        gl.viewport(0, 0, this.device.getWidth(), this.device.getHeight());
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.bodyProgram);
        // 绑定顶点
        const posLoc = gl.getAttribLocation(this.bodyProgram, 'a_position');
        const texLoc = gl.getAttribLocation(this.bodyProgram, 'a_texCoord');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(texLoc);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
        // 绑定纹理
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.bodyTexture);
        const texUniform = gl.getUniformLocation(this.bodyProgram, 'u_texture');
        gl.uniform1i(texUniform, 0);
        // 设置不透明度
        const opacityUniform = gl.getUniformLocation(this.bodyProgram, 'u_opacity');
        gl.uniform1f(opacityUniform, 1.0);
        // 绘制
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        logger.debug(this.TAG, 'Body rendered');
    }
    /**
     * 渲染 IBR 帧
     */
    renderIBRFrame(frameData) {
        // TODO: 实现完整的 IBR 渲染
        // 包括:
        // 1. Blendshape 混合
        // 2. 骨骼变换
        // 3. 网格纹理合成
        logger.debug(this.TAG, 'IBR frame:', frameData);
    }
    /**
     * 重新初始化
     */
    reinitialize() {
        this.destroy();
        this.init();
        logger.info(this.TAG, 'Reinitialized');
    }
    /**
     * 销毁
     */
    destroy() {
        const gl = this.device.gl;
        if (!gl)
            return;
        // 清理程序
        if (this.bodyProgram) {
            gl.deleteProgram(this.bodyProgram);
            this.bodyProgram = null;
        }
        if (this.meshProgram) {
            gl.deleteProgram(this.meshProgram);
            this.meshProgram = null;
        }
        // 清理缓冲区
        if (this.vertexBuffer) {
            gl.deleteBuffer(this.vertexBuffer);
            this.vertexBuffer = null;
        }
        if (this.indexBuffer) {
            gl.deleteBuffer(this.indexBuffer);
            this.indexBuffer = null;
        }
        // 清理纹理
        if (this.bodyTexture) {
            gl.deleteTexture(this.bodyTexture);
            this.bodyTexture = null;
        }
        if (this.meshColorTexture) {
            gl.deleteTexture(this.meshColorTexture);
            this.meshColorTexture = null;
        }
        if (this.meshAlphaTexture) {
            gl.deleteTexture(this.meshAlphaTexture);
            this.meshAlphaTexture = null;
        }
        this.isInitialized = false;
        logger.info(this.TAG, 'Destroyed');
    }
}

/**
 * AvatarRendererMP - 数字人渲染器 for Mini Program
 * 负责身体和脸部数据的融合渲染
 */
/**
 * AvatarRendererMP - 数字人渲染器
 * 整合身体渲染和脸部渲染，实现 IBR (Image-Based Rendering) 效果
 */
class AvatarRendererMP {
    constructor(options) {
        this.TAG = '[AvatarRendererMP]';
        this.gl = null;
        this.device = null;
        // 渲染状态
        this.isInitialized = false;
        this.isRendering = false;
        this.currentBodyFrame = null;
        this.lastFaceFrame = null;
        // 纹理
        this.bodyTexture = null;
        this.meshTexture = null;
        // Shader 程序
        this.program = null;
        // 顶点数据
        this.quadVertices = new Float32Array([
            // position, texCoord
            -1, -1, 0, 0,
            1, -1, 1, 0,
            -1, 1, 0, 1,
            1, 1, 1, 1
        ]);
        this.vertexBuffer = null;
        this.options = options;
        this.canvas = options.canvas;
        this.gl = options.gl;
        this.dataCacheQueue = options.dataCacheQueue;
        this.resourceManager = options.resourceManager;
        this.onMessageCallback = options.onMessage;
        this.initDevice();
        logger.info(this.TAG, 'Created');
    }
    /**
     * 初始化 WebGL 设备
     */
    initDevice() {
        try {
            this.device = new GLDeviceMP({
                canvas: this.canvas,
                alpha: true,
                antialias: true,
                premultipliedAlpha: true,
                powerPreference: 'high-performance'
            });
            this.gl = this.device.gl;
            if (!this.gl) {
                this.emitError('WebGL context not available');
                return;
            }
            this.initShaders();
            this.initBuffers();
            this.isInitialized = true;
            logger.info(this.TAG, 'Initialized');
        }
        catch (e) {
            logger.error(this.TAG, 'Init error:', e);
            this.emitError(String(e));
        }
    }
    /**
     * 初始化着色器
     */
    initShaders() {
        if (!this.gl)
            return;
        const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;
        const fsSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_bodyTexture;
      uniform sampler2D u_meshTexture;
      uniform float u_opacity;

      void main() {
        vec4 bodyColor = texture2D(u_bodyTexture, v_texCoord);
        vec4 meshColor = texture2D(u_meshTexture, v_texCoord);

        // 简单的 alpha 混合
        vec3 finalColor = mix(bodyColor.rgb, meshColor.rgb, meshColor.a * u_opacity);
        float finalAlpha = max(bodyColor.a, meshColor.a * u_opacity);

        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `;
        // 创建顶点着色器
        const vs = this.gl.createShader(this.gl.VERTEX_SHADER);
        if (!vs)
            return;
        this.gl.shaderSource(vs, vsSource);
        this.gl.compileShader(vs);
        if (!this.gl.getShaderParameter(vs, this.gl.COMPILE_STATUS)) {
            logger.error(this.TAG, 'VS compile error:', this.gl.getShaderInfoLog(vs));
            return;
        }
        // 创建片元着色器
        const fs = this.gl.createShader(this.gl.FRAGMENT_SHADER);
        if (!fs)
            return;
        this.gl.shaderSource(fs, fsSource);
        this.gl.compileShader(fs);
        if (!this.gl.getShaderParameter(fs, this.gl.COMPILE_STATUS)) {
            logger.error(this.TAG, 'FS compile error:', this.gl.getShaderInfoLog(fs));
            return;
        }
        // 创建程序
        this.program = this.gl.createProgram();
        if (!this.program)
            return;
        this.gl.attachShader(this.program, vs);
        this.gl.attachShader(this.program, fs);
        this.gl.linkProgram(this.program);
        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            logger.error(this.TAG, 'Program link error:', this.gl.getProgramInfoLog(this.program));
            return;
        }
        logger.info(this.TAG, 'Shaders initialized');
    }
    /**
     * 初始化缓冲区
     */
    initBuffers() {
        if (!this.gl || !this.program)
            return;
        this.vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.quadVertices, this.gl.STATIC_DRAW);
        // 获取 attribute 位置
        const positionLoc = this.gl.getAttribLocation(this.program, 'a_position');
        const texCoordLoc = this.gl.getAttribLocation(this.program, 'a_texCoord');
        this.gl.enableVertexAttribArray(positionLoc);
        this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 16, 0);
        this.gl.enableVertexAttribArray(texCoordLoc);
        this.gl.vertexAttribPointer(texCoordLoc, 2, this.gl.FLOAT, false, 16, 8);
        logger.debug(this.TAG, 'Buffers initialized');
    }
    /**
     * 创建纹理
     */
    createTexture(image) {
        if (!this.gl)
            return null;
        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        // 设置纹理参数
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        // 上传图像
        if (image) {
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
        }
        return texture;
    }
    /**
     * 渲染帧
     */
    render(data) {
        if (!this.isInitialized || !this.gl || !this.program)
            return;
        const { bodyFrame, faceFrame } = data;
        // 更新身体纹理
        if (bodyFrame?.frame) {
            this.updateBodyTexture(bodyFrame.frame);
        }
        // 更新脸部数据
        if (faceFrame) {
            this.lastFaceFrame = faceFrame;
        }
        // 执行渲染
        this.doRender();
    }
    /**
     * 更新身体纹理
     */
    updateBodyTexture(frame) {
        if (!frame)
            return;
        // 释放旧纹理
        if (this.bodyTexture) {
            this.gl?.deleteTexture(this.bodyTexture);
        }
        // 创建新纹理
        this.bodyTexture = this.createTexture(frame);
        this.currentBodyFrame = frame;
        logger.debug(this.TAG, 'Body texture updated');
    }
    /**
     * 执行渲染
     */
    doRender() {
        if (!this.gl || !this.program)
            return;
        // 清空画布
        this.gl.viewport(0, 0, this.canvas.width || 375, this.canvas.height || 667);
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        // 启用混合
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        // 使用程序
        this.gl.useProgram(this.program);
        // 绑定身体纹理
        if (this.bodyTexture) {
            this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.bodyTexture);
            const bodyLoc = this.gl.getUniformLocation(this.program, 'u_bodyTexture');
            this.gl.uniform1i(bodyLoc, 0);
        }
        // 绑定网格纹理
        if (this.meshTexture) {
            this.gl.activeTexture(this.gl.TEXTURE1);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.meshTexture);
            const meshLoc = this.gl.getUniformLocation(this.program, 'u_meshTexture');
            this.gl.uniform1i(meshLoc, 1);
        }
        // 设置不透明度
        const opacityLoc = this.gl.getUniformLocation(this.program, 'u_opacity');
        this.gl.uniform1f(opacityLoc, 1.0);
        // 绘制
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
    /**
     * 设置网格纹理
     */
    setMeshTexture(texture) {
        this.meshTexture = texture;
    }
    /**
     * 设置面部对齐参数
     */
    setFaceAlignmentConfig(config) {
        logger.info(this.TAG, 'Face alignment config updated:', config);
        // TODO: 实现面部对齐参数设置
    }
    /**
     * 重置脸部帧状态
     */
    resetFaceFrameState() {
        this.lastFaceFrame = null;
        logger.debug(this.TAG, 'Face frame state reset');
    }
    /**
     * 设置画布尺寸
     */
    setCanvasSize(width, height) {
        if (this.canvas) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.gl?.viewport(0, 0, width, height);
        }
    }
    /**
     * 设置画布可见性
     */
    setCanvasVisibility(visible) {
        // TODO: 实现画布显隐控制
        logger.debug(this.TAG, 'Canvas visibility:', visible);
    }
    /**
     * 获取当前身体帧信息
     */
    _getCurrentBodyFrameInfo(frame) {
        return this.currentBodyFrame;
    }
    /**
     * 获取 WebGL 上下文
     */
    getGL() {
        return this.gl;
    }
    /**
     * 获取渲染状态
     */
    getRenderState() {
        return this.isRendering ? 'rendering' : 'idle';
    }
    /**
     * 发送错误
     */
    emitError(message) {
        logger.error(this.TAG, message);
        this.onMessageCallback?.(message);
    }
    /**
     * 销毁
     */
    destroy() {
        this.isRendering = false;
        this.isInitialized = false;
        // 清理纹理
        if (this.bodyTexture && this.gl) {
            this.gl.deleteTexture(this.bodyTexture);
            this.bodyTexture = null;
        }
        if (this.meshTexture && this.gl) {
            this.gl.deleteTexture(this.meshTexture);
            this.meshTexture = null;
        }
        // 清理缓冲区
        if (this.vertexBuffer && this.gl) {
            this.gl.deleteBuffer(this.vertexBuffer);
            this.vertexBuffer = null;
        }
        // 清理程序
        if (this.program && this.gl) {
            this.gl.deleteProgram(this.program);
            this.program = null;
        }
        // 清理设备
        this.device?.destroy();
        this.device = null;
        this.gl = null;
        logger.info(this.TAG, 'Destroyed');
    }
}

/**
 * ResourceManagerMP - 资源管理器 for Mini Program
 * 负责资源加载、缓存和管理
 */
/**
 * 资源管理器
 * 负责:
 * - 资源包解析
 * - 资源配置
 * - 资源预加载
 */
class ResourceManagerMP {
    constructor(options) {
        this.TAG = '[ResourceManagerMP]';
        // 资源包
        this.resource_pack = {};
        // 配置
        this.config = {};
        // 会话 ID
        this.session_id = '';
        this.options = options;
        this.onMessageCallback = options.onMessage;
        this.init(options.resource_pack, options.config);
        logger.info(this.TAG, 'Created');
    }
    /**
     * 初始化
     */
    init(resourcePack, config) {
        this.resource_pack = resourcePack || {};
        this.config = {
            framedata_proto_version: 2,
            ...(config || {})
        };
        logger.info(this.TAG, 'Initialized with config:', this.config);
    }
    /**
     * 获取字符信息
     */
    getCharInfo() {
        return this.resource_pack.char_info || null;
    }
    /**
     * 获取口型库
     */
    getMouthShapeLib() {
        return {
            char_info: this.resource_pack.char_info || null,
            blendshape_map: this.resource_pack.blendshape_map || []
        };
    }
    /**
     * 获取 blendshape 映射
     */
    getBlendshapeMap() {
        return this.resource_pack.blendshape_map || [];
    }
    /**
     * 获取配置
     */
    getConfig() {
        return this.config;
    }
    /**
     * 获取帧率
     */
    getFrameRate() {
        return this.config.frame_rate || this.config.fps || 24;
    }
    /**
     * 获取分辨率
     */
    getResolution() {
        return this.config.resolution || { width: 1080, height: 1920 };
    }
    /**
     * 设置会话 ID
     */
    setSessionId(id) {
        this.session_id = id;
    }
    /**
     * 获取会话 ID
     */
    getSessionId() {
        return this.session_id;
    }
    /**
     * 获取资源 URL
     */
    getResourceUrl() {
        return this.resource_pack.resource_url || '';
    }
    /**
     * 获取 app info
     */
    getAppInfo() {
        return {
            appId: this.config.appId,
            appSecret: this.config.appSecret,
            session_id: this.session_id
        };
    }
    /**
     * 预加载资源
     */
    async preload(resources) {
        logger.info(this.TAG, 'Preloading resources:', resources.length);
        // TODO: 实现资源预加载
    }
    /**
     * 获取缓存路径
     */
    getCachePath(key) {
        // 小程序缓存路径
        const fs = wx?.getFileSystemManager?.();
        if (fs) {
            return `${wx.env.USER_DATA_PATH}/${key}`;
        }
        return key;
    }
    /**
     * 检查资源是否存在
     */
    async checkResourceExists(path) {
        try {
            const fs = wx?.getFileSystemManager?.();
            if (fs) {
                await fs.access({ path });
                return true;
            }
        }
        catch (e) {
            // 文件不存在
        }
        return false;
    }
    /**
     * 清理缓存
     */
    async clearCache() {
        logger.info(this.TAG, 'Clearing cache');
        // TODO: 实现缓存清理
    }
    /**
     * 获取离线空闲数据
     */
    _getOfflineIdle() {
        return this.config.offline_idle || null;
    }
    /**
     * 销毁
     */
    destroy() {
        this.resource_pack = {};
        this.config = {};
        this.session_id = '';
        logger.info(this.TAG, 'Destroyed');
    }
}

/**
 * Decoder - 视频解码器 for Mini Program
 * 负责从视频 URL 解码出帧图像
 */
/**
 * Decoder - 视频解码器
 * 使用小程序视频组件解码视频帧
 */
class Decoder {
    constructor(options = {}) {
        this.TAG = '[Decoder]';
        // 正在解码的任务
        this.decodingTasks = new Map();
        // 解码配置
        this.maxParallelDecodes = 2;
        this.decodeQueue = [];
        this.options = options;
        logger.info(this.TAG, 'Created');
    }
    /**
     * 解码视频帧
     */
    decode(videoData, frameCallback, doneCallback) {
        this.getTaskId(videoData);
        logger.info(this.TAG, 'Decoding video:', videoData.name, 'frames:', videoData.sf, '-', videoData.ef);
        // 创建视频上下文（小程序方式）
        this.decodeWithVideoContext(videoData, frameCallback, doneCallback);
    }
    /**
     * 使用小程序视频上下文解码
     */
    decodeWithVideoContext(videoData, frameCallback, doneCallback) {
        const { url, sf, ef, startFrameIndex, endFrameIndex, frameRate = 24 } = videoData;
        // 计算帧时间间隔
        const frameDuration = 1 / frameRate;
        // 小程序视频解码
        const video = wx.createVideoContext?.('decoder-video');
        if (!video) {
            logger.error(this.TAG, 'Failed to create video context');
            doneCallback?.(videoData);
            return;
        }
        // 设置视频源
        video.src = url;
        // 等待视频加载
        video.onReady(() => {
            // 逐帧抽取
            this.extractFrames(video, sf, ef, startFrameIndex, frameDuration, frameCallback, () => {
                doneCallback?.(videoData);
            });
        });
    }
    /**
     * 提取帧
     */
    extractFrames(video, startFrame, endFrame, startIndex, frameDuration, frameCallback, doneCallback) {
        let currentFrame = startFrame;
        const extractNext = () => {
            if (currentFrame > endFrame) {
                doneCallback();
                return;
            }
            const seekTime = currentFrame * frameDuration;
            video.seek(seekTime);
            // 等待 seek 完成
            video.onSeek(() => {
                // 获取当前帧图像
                // 小程序无法直接获取帧图像，需要使用 canvas
                const frameData = this.captureFrame(video, startIndex + (currentFrame - startFrame));
                if (frameData) {
                    frameCallback({}, frameData, startIndex + (currentFrame - startFrame));
                }
                currentFrame++;
                extractNext();
            });
        };
        extractNext();
    }
    /**
     * 捕获帧
     */
    captureFrame(video, index) {
        // 小程序中使用 canvas 绘制视频帧
        // 这里需要结合 CanvasAdapter 使用
        // TODO: 实现帧捕获
        return null;
    }
    /**
     * 取消解码
     */
    abort(taskId) {
        if (taskId) {
            const task = this.decodingTasks.get(taskId);
            if (task) {
                task.abort = true;
                this.decodingTasks.delete(taskId);
            }
        }
    }
    /**
     * 取消单个视频解码
     */
    abortOne(taskId) {
        this.abort(taskId);
    }
    /**
     * 获取任务 ID
     */
    getTaskId(data) {
        return `${data.body_id || data.id}_${data.name}`;
    }
    /**
     * 同步解码（用于断线重连）
     */
    syncDecode(frameIndex) {
        // TODO: 实现同步解码
        logger.debug(this.TAG, 'Sync decode at frame:', frameIndex);
    }
    /**
     * 离线模式解码
     */
    _offLineMode(offlineData, frame) {
        // TODO: 实现离线模式解码
        logger.debug(this.TAG, 'Offline mode decode');
    }
    /**
     * 离线模式运行
     */
    _offlineRun() {
        // TODO: 实现离线模式运行
        logger.debug(this.TAG, 'Offline run');
    }
    /**
     * 重新加载
     */
    _reload() {
        // 取消所有正在进行的解码
        this.decodeQueue = [];
        for (const [id, task] of this.decodingTasks) {
            task.abort = true;
        }
        this.decodingTasks.clear();
        logger.info(this.TAG, 'Reloaded');
    }
    /**
     * 销毁
     */
    destroy() {
        this.abort();
        this.decodeQueue = [];
        logger.info(this.TAG, 'Destroyed');
    }
}
/**
 * ParallelDecoder - 并行解码器
 * 支持多视频并行解码
 */
class ParallelDecoder {
    constructor(options = {}) {
        this.TAG = '[ParallelDecoder]';
        this.activeDecodes = 0;
        this.decoder = new Decoder(options);
        logger.info(this.TAG, 'Created');
    }
    /**
     * 解码视频
     */
    decode(videoList, frameCallback, doneCallback) {
        videoList.forEach(videoData => {
            this.decoder.decode(videoData, frameCallback, doneCallback);
        });
    }
    /**
     * 尝试开始下一个解码任务
     */
    _tryStartNext() {
        // TODO: 实现队列调度
    }
    /**
     * 同步解码
     */
    syncDecode(frameIndex) {
        this.decoder.syncDecode(frameIndex);
    }
    /**
     * 取消所有解码
     */
    abort() {
        this.decoder.abort();
    }
    /**
     * 取消单个解码
     */
    abortOne(taskId) {
        this.decoder.abortOne(taskId);
    }
    /**
     * 重新加载
     */
    _reload() {
        this.decoder._reload();
    }
    /**
     * 离线模式
     */
    _offLineMode(data, frame) {
        this.decoder._offLineMode(data, frame);
    }
    /**
     * 离线运行
     */
    _offlineRun() {
        this.decoder._offlineRun();
    }
    /**
     * 销毁
     */
    destroy() {
        this.decoder.destroy();
        logger.info(this.TAG, 'Destroyed');
    }
}

/**
 * AudioRenderer - 音频渲染器 for Mini Program
 * 负责 TTS 音频的播放控制
 */
/**
 * AudioRenderer - 音频渲染器
 * 负责:
 * - 音频数据缓存
 * - 音频播放控制
 * - 音量管理
 */
class AudioRenderer {
    constructor(options = {}) {
        this.TAG = '[AudioRenderer]';
        // 音频适配器
        this.audioAdapter = null;
        // 音频数据缓存
        this.audioQueue = [];
        this.currentAudio = null;
        // 播放状态
        this.isPlaying = false;
        this.volume = 1.0;
        this.speech_id = -1;
        // 当前帧
        this.currentFrame = 0;
        this.options = options;
        this.initAudio();
        logger.info(this.TAG, 'Created');
    }
    /**
     * 初始化音频
     */
    initAudio() {
        try {
            this.audioAdapter = new AudioAdapter({
                autoplay: false,
                volume: this.volume
            });
            // 设置播放结束回调
            this.audioAdapter.onEnded(() => {
                this.onAudioEnded();
            });
            this.audioAdapter.onError((err) => {
                logger.error(this.TAG, 'Audio error:', err);
                this.isPlaying = false;
            });
        }
        catch (e) {
            logger.error(this.TAG, 'Audio init error:', e);
        }
    }
    /**
     * 更新音频数据
     */
    updateAudioData(data) {
        if (!data || data.length === 0)
            return;
        // 更新队列
        this.audioQueue = data;
        // 找到当前帧对应的音频
        const currentAudio = this.findAudioForFrame(this.currentFrame);
        if (currentAudio && currentAudio.sid !== (this.currentAudio?.sid || -1)) {
            // 新音频，开始播放
            this.playAudio(currentAudio);
        }
    }
    /**
     * 查找当前帧对应的音频
     */
    findAudioForFrame(frame) {
        for (const audio of this.audioQueue) {
            if (audio.sf <= frame && audio.ef >= frame) {
                return audio;
            }
        }
        return null;
    }
    /**
     * 播放音频
     */
    playAudio(audio) {
        if (!this.audioAdapter)
            return;
        // 设置音频源
        if (audio.ad) {
            // PCM 数据
            const buffer = audio.ad.buffer.slice(audio.ad.byteOffset, audio.ad.byteOffset + audio.ad.byteLength);
            this.audioAdapter.setSource(buffer);
        }
        // 更新状态
        this.currentAudio = audio;
        this.speech_id = audio.sid;
        this.isPlaying = true;
        // 开始播放
        this.audioAdapter.play();
        // 触发开始回调
        const duration = (audio.ef - audio.sf) / 24; // 假设 24fps
        this.onVoiceStartCallback?.(duration, audio.sid);
        logger.info(this.TAG, 'Playing audio:', audio.sid);
    }
    /**
     * 音频播放结束
     */
    onAudioEnded() {
        this.isPlaying = false;
        if (this.speech_id !== -1) {
            this.onVoiceEndCallback?.(this.speech_id);
            this.speech_id = -1;
        }
        // 尝试播放队列中的下一个音频
        this.playNextAudio();
    }
    /**
     * 播放下一个音频
     */
    playNextAudio() {
        // 清理已过期的音频
        this.audioQueue = this.audioQueue.filter(a => a.ef > this.currentFrame);
        if (this.audioQueue.length > 0) {
            const nextAudio = this.audioQueue[0];
            this.playAudio(nextAudio);
        }
    }
    /**
     * 设置音量
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.audioAdapter) {
            this.audioAdapter.setVolume(this.volume);
        }
    }
    /**
     * 获取音量
     */
    getVolume() {
        return this.volume;
    }
    /**
     * 停止播放
     */
    stop(speech_id = -1) {
        if (speech_id === -1 || speech_id === this.speech_id) {
            this.audioAdapter?.stop();
            this.isPlaying = false;
            this.currentAudio = null;
            if (speech_id !== -1) {
                this.onVoiceEndCallback?.(speech_id);
            }
        }
        // 清理对应 speech_id 的音频数据
        if (speech_id !== -1) {
            this.audioQueue = this.audioQueue.filter(a => a.sid !== speech_id);
        }
    }
    /**
     * 暂停
     */
    pause() {
        this.audioAdapter?.pause();
        this.isPlaying = false;
    }
    /**
     * 恢复播放
     */
    resume() {
        if (this.currentAudio) {
            this.audioAdapter?.play();
            this.isPlaying = true;
        }
    }
    /**
     * 设置当前帧
     */
    setCurrentFrame(frame) {
        this.currentFrame = frame;
        // 检查是否需要切换音频
        if (this.isPlaying) {
            const audio = this.findAudioForFrame(frame);
            if (audio && audio.sid !== this.currentAudio?.sid) {
                this.playAudio(audio);
            }
        }
    }
    /**
     * 设置语音开始回调
     */
    onVoiceStart(callback) {
        this.onVoiceStartCallback = callback;
    }
    /**
     * 设置语音结束回调
     */
    onVoiceEnd(callback) {
        this.onVoiceEndCallback = callback;
    }
    /**
     * 获取播放状态
     */
    getIsPlaying() {
        return this.isPlaying;
    }
    /**
     * 获取当前语音 ID
     */
    getSpeechId() {
        return this.speech_id;
    }
    /**
     * 销毁
     */
    destroy() {
        this.stop();
        this.audioAdapter?.destroy();
        this.audioAdapter = null;
        this.audioQueue = [];
        logger.info(this.TAG, 'Destroyed');
    }
}

/**
 * UIRenderer - UI 渲染器 for Mini Program
 * 负责字幕、事件等 UI 元素的渲染
 */
/**
 * UIRenderer - UI 渲染器
 * 负责:
 * - 字幕渲染
 * - 事件处理
 * - 行走状态管理
 */
class UIRenderer {
    constructor(options = {}) {
        this.TAG = '[UIRenderer]';
        // 容器
        this.container = null;
        // 事件队列
        this.eventQueue = [];
        this.currentEvent = null;
        // 字幕元素
        this.subtitleElement = null;
        // 状态
        this.currentFrame = 0;
        this.isInterrupt = false;
        this.options = options;
        this.onWalkStateChangeCallback = options.onWalkStateChange;
        this.onVoiceStartCallback = options.onVoiceStart;
        this.onVoiceEndCallback = options.onVoiceEnd;
        this.onSpeakStateChangeCallback = options.onSpeakStateChange;
        this.clearSubtitleOnCallback = options.clearSubtitleOn;
        this.initContainer();
        logger.info(this.TAG, 'Created');
    }
    /**
     * 初始化容器
     */
    initContainer() {
        if (this.options.container) {
            this.container = this.options.container;
            this.createSubtitleElement();
        }
    }
    /**
     * 创建字幕元素
     */
    createSubtitleElement() {
        // 小程序中字幕通常通过 cover-view 或自定义组件实现
        // 这里预留接口，实际由调用方提供
        logger.debug(this.TAG, 'Creating subtitle element');
    }
    /**
     * 更新 UI 事件
     */
    updateUiEvent(events) {
        this.eventQueue.push(...events);
        this.processEvents();
    }
    /**
     * 处理事件
     */
    processEvents() {
        // 查找当前帧对应的事件
        const event = this.eventQueue.find(e => e.sf <= this.currentFrame && e.ef >= this.currentFrame);
        if (event !== this.currentEvent) {
            // 事件变化，处理旧事件
            if (this.currentEvent) {
                this.handleEventEnd(this.currentEvent);
            }
            // 处理新事件
            this.currentEvent = event;
            if (event) {
                this.handleEventStart(event);
            }
        }
        // 处理当前事件
        if (event) {
            this.handleEventUpdate(event);
        }
    }
    /**
     * 处理事件开始
     */
    handleEventStart(event) {
        for (const e of event.e) {
            switch (e.type) {
                case 'subtitle_on':
                    this.showSubtitle(e.content || '');
                    break;
                case 'subtitle_off':
                    this.hideSubtitle();
                    break;
                case 'voice_start':
                    this.onVoiceStartCallback?.(event.ef - event.sf, event.id);
                    break;
                case 'voice_end':
                    this.onVoiceEndCallback?.(event.id);
                    break;
                case 'walk_start':
                    this.onWalkStateChangeCallback?.('walking');
                    break;
                case 'walk_stop':
                    this.onWalkStateChangeCallback?.('idle');
                    break;
                case 'speak_start':
                    this.onSpeakStateChangeCallback?.('speaking', e.client_speak_id || '');
                    break;
                case 'speak_end':
                    this.onSpeakStateChangeCallback?.('idle', e.client_speak_id || '');
                    break;
                default:
                    logger.debug(this.TAG, 'Unknown event type:', e.type);
            }
        }
    }
    /**
     * 处理事件更新
     */
    handleEventUpdate(event) {
        for (const e of event.e) {
            if (e.type === 'subtitle_update') {
                this.updateSubtitle(e.content || '');
            }
        }
    }
    /**
     * 处理事件结束
     */
    handleEventEnd(event) {
        for (const e of event.e) {
            switch (e.type) {
                case 'subtitle_on':
                case 'subtitle_off':
                    this.hideSubtitle();
                    break;
            }
        }
    }
    /**
     * 显示字幕
     */
    showSubtitle(content) {
        if (this.subtitleElement) {
            // 更新字幕内容
            this.subtitleElement.text = content;
            this.subtitleElement.visible = true;
        }
        // TODO: 通过事件通知外部渲染字幕
        logger.debug(this.TAG, 'Show subtitle:', content);
    }
    /**
     * 更新字幕
     */
    updateSubtitle(content) {
        if (this.subtitleElement) {
            this.subtitleElement.text = content;
        }
    }
    /**
     * 隐藏字幕
     */
    hideSubtitle() {
        if (this.subtitleElement) {
            this.subtitleElement.visible = false;
        }
    }
    /**
     * 清理字幕
     */
    clearSubtitle(speech_id) {
        this.hideSubtitle();
        this.clearSubtitleOnCallback?.(speech_id);
    }
    /**
     * 设置当前帧
     */
    setCurrentFrame(frame) {
        this.currentFrame = frame;
        this.processEvents();
    }
    /**
     * 设置中断
     */
    setInterrupt(speech_id) {
        this.isInterrupt = true;
        this.clearSubtitle(speech_id);
    }
    /**
     * 获取事件队列
     */
    getEventQueue() {
        return this.eventQueue;
    }
    /**
     * 清理事件
     */
    clearEvents() {
        this.eventQueue = [];
        this.currentEvent = null;
    }
    /**
     * 销毁
     */
    destroy() {
        this.clearEvents();
        this.container = null;
        this.subtitleElement = null;
        logger.info(this.TAG, 'Destroyed');
    }
}

/**
 * Type Definitions for XmovAvatarMP
 * 类型定义 - 与 Web SDK 保持兼容
 */
/**
 * Avatar 状态
 */
var AvatarStatus;
(function (AvatarStatus) {
    AvatarStatus["online"] = "online";
    AvatarStatus["offline"] = "offline";
    AvatarStatus["network_on"] = "network_on";
    AvatarStatus["network_off"] = "network_off";
    AvatarStatus["close"] = "close";
    AvatarStatus["visible"] = "visible";
    AvatarStatus["invisible"] = "invisible";
    AvatarStatus["stopped"] = "stopped";
})(AvatarStatus || (AvatarStatus = {}));
/**
 * 渲染状态
 */
var RenderState;
(function (RenderState) {
    RenderState["init"] = "init";
    RenderState["rendering"] = "rendering";
    RenderState["paused"] = "paused";
    RenderState["resumed"] = "resumed";
    RenderState["stopped"] = "stopped";
})(RenderState || (RenderState = {}));
/**
 * 初始化模式
 */
var InitModel;
(function (InitModel) {
    InitModel["normal"] = "normal";
    InitModel["invisible"] = "invisible";
})(InitModel || (InitModel = {}));
/**
 * 帧数据类型
 */
exports.EFrameDataType = void 0;
(function (EFrameDataType) {
    EFrameDataType["BODY"] = "body";
    EFrameDataType["FACE"] = "face";
    EFrameDataType["AUDIO"] = "audio";
    EFrameDataType["EVENT"] = "event";
})(exports.EFrameDataType || (exports.EFrameDataType = {}));

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
/**
 * Avatar 状态枚举
 */
exports.AvatarStatus = void 0;
(function (AvatarStatus) {
    AvatarStatus["online"] = "online";
    AvatarStatus["offline"] = "offline";
    AvatarStatus["network_on"] = "network_on";
    AvatarStatus["network_off"] = "network_off";
    AvatarStatus["close"] = "close";
    AvatarStatus["visible"] = "visible";
    AvatarStatus["invisible"] = "invisible";
    AvatarStatus["stopped"] = "stopped";
})(exports.AvatarStatus || (exports.AvatarStatus = {}));
/**
 * 渲染状态枚举
 */
exports.RenderState = void 0;
(function (RenderState) {
    RenderState["init"] = "init";
    RenderState["rendering"] = "rendering";
    RenderState["paused"] = "paused";
    RenderState["resumed"] = "resumed";
    RenderState["stopped"] = "stopped";
})(exports.RenderState || (exports.RenderState = {}));
/**
 * 初始化模式
 */
exports.InitModel = void 0;
(function (InitModel) {
    InitModel["normal"] = "normal";
    InitModel["invisible"] = "invisible";
})(exports.InitModel || (exports.InitModel = {}));
/**
 * XmovAvatarMP - 微信小程序数字人 SDK 主类
 */
class XmovAvatarMP {
    constructor(options) {
        this.status = exports.AvatarStatus.stopped;
        this.sessionInfo = null;
        this.sessionStarted = false;
        this.destroyed = false;
        // 渲染组件
        this.audioAdapter = null;
        this.ttsaSocket = null;
        // 渲染相关
        this.renderScheduler = null;
        this.avatarRenderer = null;
        this.resourceManager = null;
        // 内部状态
        this.avatarCanvasVisible = true;
        this.pendingInvisibleMode = false;
        this.isInitialized = false;
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
    initAudio() {
        try {
            this.audioAdapter = new AudioAdapter({ autoplay: false, volume: 1.0 });
        }
        catch (e) {
            logger.error('[XmovAvatarMP] Audio init error:', e);
        }
    }
    async init(params) {
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
        this.updateStatus(exports.AvatarStatus.stopped);
        logger.info('[XmovAvatarMP] Initialized');
        return true;
    }
    async start() {
        if (this.destroyed || !this.isInitialized) {
            return false;
        }
        const ok = await this.startSession();
        if (!ok) {
            return false;
        }
        this.status = exports.AvatarStatus.visible;
        this.updateStatus(exports.AvatarStatus.visible);
        logger.info('[XmovAvatarMP] Started');
        return true;
    }
    async startSession() {
        if (this.sessionStarted) {
            return true;
        }
        const { appId, appSecret, gatewayServer, tag, config } = this.options;
        try {
            const payload = {
                ...(tag ? { tag } : {}),
                config: { framedata_proto_version: 2, ...(config || {}) }
            };
            const response = await mpRequest(gatewayServer, {
                method: 'POST',
                headers: this.options.headers,
                body: JSON.stringify(payload)
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
        }
        catch (error) {
            logger.error('[XmovAvatarMP] Start session error:', error);
            this.emitError('INIT_FAILED', String(error));
            return false;
        }
    }
    async connectTtsa() {
        if (!this.sessionInfo)
            return false;
        try {
            const { socket_io_url } = this.sessionInfo;
            this.ttsaSocket = io(socket_io_url);
            return new Promise((resolve) => {
                this.ttsaSocket.on('connect', () => {
                    logger.info('[XmovAvatarMP] TTSA connected');
                    resolve(true);
                });
                this.ttsaSocket.on('connect_error', (err) => {
                    logger.error('[XmovAvatarMP] TTSA connection error:', err);
                    resolve(false);
                });
                this.ttsaSocket.on('message', (data) => {
                    this.handleTtsaData(data);
                });
                this.ttsaSocket.connect();
            });
        }
        catch (error) {
            logger.error('[XmovAvatarMP] Connect TTSA error:', error);
            return false;
        }
    }
    handleTtsaData(data) {
        logger.debug('[XmovAvatarMP] TTSA data:', data);
    }
    pause() {
        if (this.status !== exports.AvatarStatus.visible) {
            return false;
        }
        this.status = exports.AvatarStatus.invisible;
        this.updateStatus(exports.AvatarStatus.invisible);
        logger.info('[XmovAvatarMP] Paused');
        return true;
    }
    async stop() {
        if (this.destroyed) {
            return false;
        }
        if (this.renderScheduler) {
            this.renderScheduler.stop();
        }
        await this.stopSession();
        this.status = exports.AvatarStatus.stopped;
        this.updateStatus(exports.AvatarStatus.stopped);
        logger.info('[XmovAvatarMP] Stopped');
        return true;
    }
    async stopSession() {
        if (this.ttsaSocket) {
            this.ttsaSocket.disconnect();
            this.ttsaSocket = null;
        }
        this.sessionStarted = false;
    }
    async destroy() {
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
    speak(ssml, is_start = true, is_end = true, extra) {
        return this.sendText(ssml, { isStart: is_start, isEnd: is_end });
    }
    sendText(text, options) {
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
    idle() { this.stateChange('idle'); }
    listen() { this.stateChange('listen'); }
    think() { this.stateChange('think'); }
    interactiveidle() { this.stateChange('interactive_idle'); }
    stateChange(state) {
        if (!this.ttsaSocket)
            return;
        this.ttsaSocket.emit('state_change', { state, params: {} });
    }
    setVolume(volume) {
        if (this.audioAdapter) {
            this.audioAdapter.setVolume(volume);
        }
    }
    changeAvatarVisible(visible) {
        this.avatarCanvasVisible = visible;
        logger.info('[XmovAvatarMP] Avatar visible:', visible);
    }
    changeLayout(layout) {
        if (this.ttsaSocket) {
            this.ttsaSocket.emit('change_layout', layout);
        }
    }
    changeWalkConfig(walkConfig) {
        if (this.ttsaSocket) {
            this.ttsaSocket.emit('walk_config', walkConfig);
        }
    }
    getStatus() {
        return this.status;
    }
    getSessionId() {
        return this.sessionInfo?.session_id || null;
    }
    getSessionInfo() {
        return this.sessionInfo;
    }
    isDestroyed() {
        return this.destroyed;
    }
    getTag() {
        return this.options.tag;
    }
    get businessENV() {
        return this.options.env || 'production';
    }
    getUniqueSpeakId() {
        return `${Date.now()}-${this.sessionInfo?.session_id || 'unknown'}`;
    }
    showDebugInfo() { }
    hideDebugInfo() { }
    updateStatus(status) {
        if (this.status === status)
            return;
        this.status = status;
        this._onStatusChange?.(status);
    }
    emitError(code, message) {
        const error = { code, message };
        this.options.onMessage?.(error);
        logger.error('[XmovAvatarMP] Error:', error);
    }
}

exports.AbortController = AbortController;
exports.AudioAdapter = AudioAdapter;
exports.AudioRenderer = AudioRenderer;
exports.AvatarRendererMP = AvatarRendererMP;
exports.CanvasAdapter = CanvasAdapter;
exports.DataCacheQueueMP = DataCacheQueueMP;
exports.Decoder = Decoder;
exports.GLDeviceMP = GLDeviceMP;
exports.GLPipelineMP = GLPipelineMP;
exports.MiniProgramWebSocket = MiniProgramWebSocket;
exports.ParallelDecoder = ParallelDecoder;
exports.RenderSchedulerMP = RenderSchedulerMP;
exports.ResourceManagerMP = ResourceManagerMP;
exports.UIRenderer = UIRenderer;
exports.XmovAvatarMP = XmovAvatarMP;
exports.clamp = clamp;
exports.createCanvasAdapter = createCanvasAdapter;
exports.createIdentityMatrix = createIdentityMatrix;
exports.createModuleLogger = createModuleLogger;
exports.createOrthographicMatrix = createOrthographicMatrix;
exports.createPerspectiveMatrix = createPerspectiveMatrix;
exports.createWebSocket = createWebSocket;
exports.default = XmovAvatarMP;
exports.degToRad = degToRad;
exports.flatten = flatten;
exports.get = get;
exports.getWebGLContext = getWebGLContext;
exports.io = io;
exports.lerp = lerp;
exports.logger = logger;
exports.mat4Multiply = mat4Multiply;
exports.mmul = mmul;
exports.mpRequest = mpRequest;
exports.post = post;
exports.radToDeg = radToDeg;
exports.request = request;
exports.rotateX = rotateX;
exports.rotateY = rotateY;
exports.rotateZ = rotateZ;
exports.scale = scale;
exports.smoothstep = smoothstep;
exports.translate = translate;
exports.transpose = transpose;
//# sourceMappingURL=index.js.map
