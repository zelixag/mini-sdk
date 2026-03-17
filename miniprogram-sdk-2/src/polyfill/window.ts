/**
 * Window Polyfill for Mini Program
 * 将 window 映射到 globalThis
 */

declare const wx: any;
declare const my: any;

// 保存原始的全局对象引用
const _global = typeof globalThis !== 'undefined' ? globalThis :
                typeof window !== 'undefined' ? window :
                typeof global !== 'undefined' ? global : {};

// 设置全局引用
if (typeof globalThis !== 'undefined') {
  (globalThis as any).window = _global;
  (globalThis as any).self = _global;
}

// 基础 window 属性
const windowShim = {
  // 全局对象引用
  window: _global,
  self: _global,
  global: _global,
  globalThis: _global,

  // 基础属性
  document: undefined,  // 小程序没有 document
  location: {
    href: '',
    protocol: 'https:',
    host: '',
    pathname: '/'
  },
  navigator: {
    userAgent: 'MiniProgram',
    onLine: true
  },

  // 定时器 (小程序有原生支持)
  setTimeout: setTimeout.bind(globalThis),
  clearTimeout: clearTimeout.bind(globalThis),
  setInterval: setInterval.bind(globalThis),
  clearInterval: clearInterval.bind(globalThis),

  // requestAnimationFrame (需要适配小程序)
  requestAnimationFrame: (typeof globalThis.requestAnimationFrame !== 'undefined')
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : ((callback: FrameRequestCallback) => setTimeout(callback, 16)),
  cancelAnimationFrame: (typeof globalThis.cancelAnimationFrame !== 'undefined')
    ? globalThis.cancelAnimationFrame.bind(globalThis)
    : ((id: number) => clearTimeout(id)),

  // Console
  console: console || {
    log: () => {},
    warn: () => {},
    error: () => {},
    info: () => {}
  }
};

// 导出初始化函数
export function initWindowPolyfill(canvas?: any): void {
  // 设置 requestAnimationFrame 为小程序版本
  if (canvas) {
    (globalThis as any).canvas = canvas;
  }
}

export default windowShim;
