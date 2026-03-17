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
import './utils/window-polyfill';
import './utils/api-polyfill';
import './utils/blob-polyfill';
import './utils/module-polyfill';
import './utils/request-adapter-wrapper';
export { CanvasAdapter, createCanvasAdapter } from './adapters/canvas';
export { AudioAdapter, createAudioAdapter } from './adapters/audio';
export { MiniProgramWebSocket, createWebSocket, io } from './adapters/websocket';
export { mpRequest, setGlobalFetch, AbortController } from './utils/request-adapter';
export { ErrorHandler, errorHandler } from './utils/ErrorHandler';
export { logger, createModuleLogger, LogLevel } from './utils/logger';
export { EErrorCode } from './types/error';
export type { SDKError } from './types/error';
export { AvatarStatus, RenderState } from './types/index';
/**
 * XmovAvatarMP - 小程序版数字人 SDK（待实现）
 *
 * 这是一个占位导出，实际实现需要：
 * 1. 创建 core/XmovAvatarMP.ts
 * 2. 包装 Web SDK 的 XmovAvatar 类
 * 3. 适配小程序 Canvas/WebGL 获取方式
 */
export declare class XmovAvatarMP {
    constructor(options: any);
}
export default XmovAvatarMP;
