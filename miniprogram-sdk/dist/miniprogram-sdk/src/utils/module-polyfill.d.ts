/**
 * Module Polyfill - 小程序版本（熵减优化）
 * 提供 socket.io-client 等模块的适配器
 *
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，仅处理模块适配
 * 2. 系统秩序：清晰的模块映射关系
 * 3. 抽象层次：隐藏平台差异，提供统一接口
 * 4. 负熵实现：构建时桥接，运行时 polyfill
 */
import { createWebSocket, io } from '../adapters/websocket';
export { io, createWebSocket };
declare const _default: {
    io: typeof io;
    createWebSocket: typeof createWebSocket;
};
export default _default;
