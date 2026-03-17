/**
 * Window Polyfill - 小程序版本（熵减优化）
 * 将 window 对象映射到 globalThis
 * 
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，仅处理 window 映射
 * 2. 系统秩序：清晰的全局对象关系
 * 3. 抽象层次：隐藏平台差异
 * 4. 负熵实现：最小化 polyfill，避免副作用
 */

if (typeof globalThis !== 'undefined' && typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}

// 确保 window 指向 globalThis（使用类型断言避免声明前使用错误）
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}

// 导出 window（如果不存在）
export const window = globalThis as any;

/**
 * 初始化 Window Polyfill
 * 主要是为了挂载 requestAnimationFrame 到全局
 * 
 * @param canvas 小程序 Canvas 实例（通过 wx.createSelectorQuery 获取）
 */
export function initWindowPolyfill(canvas?: any) {
  if (canvas && typeof canvas.requestAnimationFrame === 'function') {
    (globalThis as any).requestAnimationFrame = canvas.requestAnimationFrame.bind(canvas);
    (globalThis as any).cancelAnimationFrame = canvas.cancelAnimationFrame.bind(canvas);
  } else if (!(globalThis as any).requestAnimationFrame) {
    // 降级实现
    (globalThis as any).requestAnimationFrame = function(callback: FrameRequestCallback) {
      return setTimeout(() => {
        callback(Date.now());
      }, 16);
    };
    (globalThis as any).cancelAnimationFrame = function(id: number) {
      clearTimeout(id);
    };
  }
}
