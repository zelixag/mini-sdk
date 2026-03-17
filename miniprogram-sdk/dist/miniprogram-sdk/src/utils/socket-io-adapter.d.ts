/**
 * Socket.IO 适配器 - 小程序版本（熵减优化）
 *
 * 说明：这是构建时 Alias 替换的目标文件，实际实现位于 websocket.ts
 * 通过重新导出，确保 socket.io-client 的导入能正确映射到小程序 WebSocket 适配器
 *
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，仅处理模块导出
 * 2. 系统秩序：清晰的导出映射
 * 3. 抽象层次：隐藏实现细节
 * 4. 负熵实现：避免重复代码
 */
export { io, createWebSocket, MiniProgramWebSocket } from '../adapters/websocket';
export type { WebSocketOptions, WebSocketMessage } from '../adapters/websocket';
import { io, createWebSocket } from '../adapters/websocket';
declare const _default: {
    io: typeof io;
    createWebSocket: typeof createWebSocket;
};
export default _default;
