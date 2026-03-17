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

// 设置 socket.io-client 适配器
if (typeof globalThis !== 'undefined') {
  // 将 socket.io-client 的 io 函数设置到 globalThis
  (globalThis as any).__socketIOAdapter = io;
  
  // 确保 createWebSocket 可用
  (globalThis as any).__createWebSocket = createWebSocket;
}

// 导出 socket.io 兼容的 io 函数
export { io, createWebSocket };

// 默认导出（兼容 socket.io-client 的导入方式）
export default {
  io,
  createWebSocket
};
