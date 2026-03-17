/**
 * API Polyfill - 小程序版本（熵减优化）
 * 
 * 说明：这是适配层，为 Web SDK 提供 Web 标准 API 的 polyfill。
 * 小程序环境不支持某些 Web API（如 Event、fetch），但 Web SDK 需要这些 API。
 * 因此我们提供这些 polyfill，内部使用小程序 API（wx.request、wx.getImageInfo 等），
 * 对外暴露 Web 标准接口，让 Web SDK 核心代码可以无缝运行。
 * 
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，仅处理 API 兼容性
 * 2. 系统秩序：清晰的 API 映射关系（小程序 API → Web API）
 * 3. 抽象层次：隐藏小程序平台差异，提供标准 Web API 给 Web SDK 使用
 * 4. 负熵实现：按需 polyfill，避免不必要的实现
 */

/// <reference path="../types/wechat.d.ts" />

import { setGlobalFetch } from './request-adapter';

// Headers Polyfill（小程序环境通常缺失）
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).Headers === 'undefined') {
  (globalThis as any).Headers = class Headers {
    private _store: Record<string, string>;

    constructor(init?: Record<string, string> | [string, string][]) {
      this._store = {};
      if (Array.isArray(init)) {
        init.forEach(([k, v]) => this.set(k, v));
      } else if (init && typeof init === 'object') {
        Object.keys(init).forEach((k) => this.set(k, (init as Record<string, string>)[k]));
      }
    }

    append(name: string, value: string): void {
      const key = String(name).toLowerCase();
      if (this._store[key]) {
        this._store[key] = `${this._store[key]}, ${value}`;
      } else {
        this._store[key] = String(value);
      }
    }

    set(name: string, value: string): void {
      this._store[String(name).toLowerCase()] = String(value);
    }

    get(name: string): string | null {
      const value = this._store[String(name).toLowerCase()];
      return value === undefined ? null : value;
    }

    has(name: string): boolean {
      return this.get(name) !== null;
    }

    delete(name: string): void {
      delete this._store[String(name).toLowerCase()];
    }

    forEach(callback: (value: string, key: string) => void): void {
      Object.keys(this._store).forEach((key) => callback(this._store[key], key));
    }
  };
}

// Response Polyfill（小程序环境通常缺失）
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).Response === 'undefined') {
  (globalThis as any).Response = class Response {
    private _text: string;
    public status: number;
    public statusText: string;
    public headers: Headers;
    public ok: boolean;

    constructor(body?: string, init?: { status?: number; statusText?: string; headers?: Headers | Record<string, string> }) {
      this._text = body || '';
      this.status = init?.status ?? 200;
      this.statusText = init?.statusText ?? 'OK';
      this.headers = init?.headers instanceof (globalThis as any).Headers
        ? init.headers
        : new (globalThis as any).Headers((init?.headers || {}) as Record<string, string>);
      this.ok = this.status >= 200 && this.status < 300;
    }

    async json(): Promise<any> {
      if (!this._text) return null;
      try {
        return JSON.parse(this._text);
      } catch {
        return this._text;
      }
    }

    async text(): Promise<string> {
      return this._text;
    }
  };
}

// Event Polyfill（小程序环境不支持，但 Web SDK 需要）
// 提供简化版 Event 实现，满足 Web SDK 的基本需求
if (typeof globalThis !== 'undefined' && typeof globalThis.Event === 'undefined') {
  (globalThis as any).Event = class Event {
    public type: string;
    public bubbles: boolean = false;
    public cancelable: boolean = false;
    public defaultPrevented: boolean = false;
    public timeStamp: number = Date.now();
    public target: any = null;
    public currentTarget: any = null;

    constructor(type: string, eventInitDict?: { bubbles?: boolean; cancelable?: boolean }) {
      this.type = type;
      if (eventInitDict) {
        this.bubbles = eventInitDict.bubbles || false;
        this.cancelable = eventInitDict.cancelable || false;
      }
    }

    preventDefault(): void {
      if (this.cancelable) {
        this.defaultPrevented = true;
      }
    }

    stopPropagation(): void {
      // 小程序环境简化实现
    }

    stopImmediatePropagation(): void {
      // 小程序环境简化实现
    }
  };
}

// 设置全局 fetch（如果尚未设置）
if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'undefined') {
  setGlobalFetch();
}

// Blob Polyfill（小程序已有，但确保可用）
if (typeof globalThis !== 'undefined' && typeof globalThis.Blob === 'undefined') {
  // 小程序已支持 Blob，这里只是确保存在
  // 如果小程序不支持，可以使用 wx.getFileSystemManager 实现
}

// URL Polyfill
if (typeof globalThis !== 'undefined' && typeof globalThis.URL === 'undefined') {
  (globalThis as any).URL = class URL {
    private _url: string;
    private _base?: string;

    constructor(url: string, base?: string) {
      this._url = url;
      this._base = base;
    }

    toString(): string {
      return this._url;
    }

    get href(): string {
      return this._url;
    }

    set href(value: string) {
      this._url = value;
    }

    static createObjectURL(object: Blob | File): string {
      // 小程序不支持 createObjectURL，返回临时 URL
      // 实际使用中应该使用 wx.getFileSystemManager 保存文件并返回本地路径
      return `blob:${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }

    static revokeObjectURL(url: string): void {
      // 小程序不支持 revokeObjectURL，这里只是占位
      // 实际使用中应该清理对应的文件
    }
  };
}

// Image Polyfill（使用私有属性避免循环引用）
if (typeof globalThis !== 'undefined' && typeof globalThis.Image === 'undefined') {
  (globalThis as any).Image = class Image {
    private _src: string = '';
    public width: number = 0;
    public height: number = 0;
    public naturalWidth: number = 0;
    public naturalHeight: number = 0;
    public complete: boolean = false;
    public onload: ((this: Image, ev: Event) => any) | null = null;
    public onerror: ((this: Image, ev: Event | string) => any) | null = null;

    constructor(width?: number, height?: number) {
      this.width = width || 0;
      this.height = height || 0;
    }

    // 小程序使用 wx.getImageInfo 加载图片
    load(): void {
      if (!this._src) {
        if (this.onerror) {
          this.onerror.call(this, 'Image src is empty');
        }
        return;
      }

      wx.getImageInfo({
        src: this._src,
        success: (res: WechatMiniprogram.GetImageInfoSuccessCallbackResult) => {
          this.width = res.width;
          this.height = res.height;
          this.naturalWidth = res.width;
          this.naturalHeight = res.height;
          this.complete = true;
          if (this.onload) {
            this.onload.call(this, new Event('load'));
          }
        },
        fail: (err: WechatMiniprogram.GeneralCallbackResult) => {
          this.complete = true;
          if (this.onerror) {
            this.onerror.call(this, err.errMsg || 'Image load failed');
          }
        }
      });
    }

    // 获取 src
    get src(): string {
      return this._src;
    }

    // 设置 src 时自动加载
    set src(value: string) {
      this._src = value;
      if (value) {
        this.load();
      }
    }
  };
}

// ImageBitmap Polyfill（小程序版本）
// 说明：小程序环境可能不支持 ImageBitmap API，需要提供 polyfill
// 优先使用 wx.createImageBitmap（如果支持），否则降级到直接使用 VideoFrame
if (typeof globalThis !== 'undefined' && typeof globalThis.createImageBitmap === 'undefined') {
  // 检查是否支持 wx.createImageBitmap
  const hasWxCreateImageBitmap = typeof (wx as any)?.createImageBitmap === 'function';
  
  (globalThis as any).createImageBitmap = async function(
    source: ImageBitmapSource | VideoFrame,
    sx?: number,
    sy?: number,
    sw?: number,
    sh?: number
  ): Promise<ImageBitmap> {
    // 如果支持 wx.createImageBitmap，优先使用
    if (hasWxCreateImageBitmap) {
      try {
        if (sx !== undefined && sy !== undefined && sw !== undefined && sh !== undefined) {
          return await (wx as any).createImageBitmap(source, sx, sy, sw, sh);
        } else {
          return await (wx as any).createImageBitmap(source);
        }
      } catch (error) {
        // 如果 wx.createImageBitmap 失败，降级到直接返回 VideoFrame
        (window as any).avatarSDKLogger?.warn?.('[ImageBitmap] wx.createImageBitmap failed, using VideoFrame directly:', error);
      }
    }

    // 降级方案：如果 source 是 VideoFrame，直接返回（小程序可能支持直接使用 VideoFrame）
    if (source && typeof (source as any).displayWidth !== 'undefined' && typeof (source as any).close === 'function') {
      // VideoFrame 在小程序环境中可能可以直接用于 WebGL texImage2D
      return source as any as ImageBitmap;
    }

    // 其他情况：抛出错误
    throw new Error('createImageBitmap: Unsupported source type in miniprogram environment');
  };
}

// createWorkerAdapter：小程序不支持 Worker，replaceGlobals 将 new Worker() 替换为此函数
// 返回空实现，主线程解码时会走其他分支
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).createWorkerAdapter === 'undefined') {
  (globalThis as any).createWorkerAdapter = function createWorkerAdapter(): { postMessage: (msg: any) => void; terminate: () => void } {
    return {
      postMessage() {},
      terminate() {},
    };
  };
}

// ImageBitmap 接口类型定义（如果不存在）
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).ImageBitmap === 'undefined') {
  // ImageBitmap 是一个接口，不能直接实例化
  // 这里只是确保类型定义存在
  (globalThis as any).ImageBitmap = class ImageBitmap {
    public width: number = 0;
    public height: number = 0;
    
    close(): void {
      // 释放资源
    }
  };
}
