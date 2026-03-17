/**
 * Canvas 适配器 - 小程序版本（熵减优化）
 * 将小程序 Canvas 获取方式适配为 DOM Canvas 语义
 * 
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，纯适配逻辑，无业务逻辑
 * 2. 系统秩序：清晰的节点获取、上下文创建、尺寸管理流程
 * 3. 抽象层次：隐藏 wx.createSelectorQuery 细节，提供标准 Canvas API
 * 4. 负熵实现：统一错误处理、生命周期管理、资源释放
 */

/// <reference path="../types/wechat.d.ts" />

import { ErrorHandler, SDKError } from '../utils/ErrorHandler';
import { EErrorCode } from '../types/error';

export interface CanvasAdapterOptions {
  canvasId: string;
  componentInstance?: any; // 组件实例，用于 createSelectorQuery
  errorHandler?: ErrorHandler;
}

/**
 * Canvas 适配器类
 */
export class CanvasAdapter {
  private canvasId: string;
  private componentInstance?: any;
  private canvasNode: WechatMiniprogram.Canvas | null = null;
  private webglContext: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private errorHandler: ErrorHandler;
  private sizeObserver: WechatMiniprogram.NodesRef | null = null;
  private resizeCallback: ((width: number, height: number) => void) | null = null;
  private isDestroyed = false;

  constructor(options: CanvasAdapterOptions) {
    this.canvasId = options.canvasId;
    this.componentInstance = options.componentInstance;
    this.errorHandler = options.errorHandler || new ErrorHandler();
  }

  /** 检查 WebGL 能力 */
  getWebGLCapabilities(): { isWebGL2: boolean; support3DTexture: boolean; supportFloatTexture: boolean } {
    const gl = this.webglContext;
    if (!gl) return { isWebGL2: false, support3DTexture: false, supportFloatTexture: false };

    const isWebGL2 = typeof (gl as any).texImage3D === 'function';
    // 小程序通常不支持 3D 纹理
    const support3DTexture = isWebGL2 && !!gl.getExtension('WEBGL3D_consolidated_placeholder');
    const supportFloatTexture = !!gl.getExtension('OES_texture_float') || !!gl.getExtension('WEBGL_color_buffer_float');
    return { isWebGL2, support3DTexture, supportFloatTexture };
  }

  /**
   * 获取 Canvas 节点
   */
  async getCanvasNode(): Promise<WechatMiniprogram.Canvas> {
    if (this.canvasNode) {
      return this.canvasNode;
    }

    return new Promise((resolve, reject) => {
      try {
        const query = this.componentInstance
          ? this.componentInstance.createSelectorQuery()
          : wx.createSelectorQuery();

        query
          .select(`#${this.canvasId}`)
          .node()
          .exec((res: any) => {
            if (res && res[0] && res[0].node) {
              this.canvasNode = res[0].node;
              resolve(this.canvasNode!); // 非空断言：已检查 res[0].node 存在
            } else {
              const error = this.errorHandler.handle({
                code: EErrorCode.CANVAS_INIT_FAILED,
                message: `Canvas node not found: ${this.canvasId}`,
                timestamp: Date.now()
              }, {
                module: 'CanvasAdapter',
                method: 'getCanvasNode',
                params: { canvasId: this.canvasId }
              });
              reject(error);
            }
          });
      } catch (err) {
        const error = this.errorHandler.handle(err, {
          module: 'CanvasAdapter',
          method: 'getCanvasNode',
          params: { canvasId: this.canvasId }
        });
        reject(error);
      }
    });
  }

  /**
   * 创建 WebGL 上下文
   */
  async createWebGLContext(
    options?: WebGLContextAttributes
  ): Promise<WebGL2RenderingContext> {
    if (this.webglContext) {
      return this.webglContext;
    }

    try {
      const canvas = await this.getCanvasNode();
      // 必须使用 WebGL2：管线 shader 为 #version 300 es，LBS/LUT 等依赖 WebGL2，不降级到 webgl
      const opts = { antialias: true, alpha: false, ...options };
      const context = canvas.getContext('webgl2', opts);

      if (!context) {
        const error = this.errorHandler.handle({
          code: EErrorCode.CANVAS_INIT_FAILED,
          message: 'WebGL2 is required but not available. Please upgrade WeChat or use a device that supports WebGL2.',
          timestamp: Date.now()
        }, {
          module: 'CanvasAdapter',
          method: 'createWebGLContext',
          params: { canvasId: this.canvasId, options }
        });
        throw error;
      }

      this.webglContext = context as WebGL2RenderingContext;
      return this.webglContext;
    } catch (err) {
      const error = this.errorHandler.handle(err, {
        module: 'CanvasAdapter',
        method: 'createWebGLContext',
        params: { canvasId: this.canvasId, options }
      });
      throw error;
    }
  }

  /**
   * 创建 Canvas 2D 上下文（用于 putImageData 等简单渲染）
   */
  async createCanvas2DContext(): Promise<CanvasRenderingContext2D | null> {
    if (this.ctx2d) return this.ctx2d;

    try {
      const canvas = await this.getCanvasNode();
      const context = canvas.getContext?.('2d');
      if (!context) {
        const error = this.errorHandler.handle({
          code: EErrorCode.CANVAS_INIT_FAILED,
          message: 'Failed to create 2D context',
          timestamp: Date.now()
        }, {
          module: 'CanvasAdapter',
          method: 'createCanvas2DContext',
          params: { canvasId: this.canvasId }
        });
        throw error;
      }
      this.ctx2d = context;
      return this.ctx2d;
    } catch (err) {
      const error = this.errorHandler.handle(err, {
        module: 'CanvasAdapter',
        method: 'createCanvas2DContext',
        params: { canvasId: this.canvasId }
      });
      throw error;
    }
  }

  /**
   * 获取 Canvas 尺寸
   */
  async getCanvasSize(): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      try {
        const query = this.componentInstance
          ? this.componentInstance.createSelectorQuery()
          : wx.createSelectorQuery();

        query
          .select(`#${this.canvasId}`)
          .boundingClientRect()
          .exec((res: any) => {
            if (res && res[0]) {
              resolve({
                width: res[0].width || 0,
                height: res[0].height || 0
              });
            } else {
              const error = this.errorHandler.handle({
                code: EErrorCode.CANVAS_INIT_FAILED,
                message: `Failed to get canvas size: ${this.canvasId}`,
                timestamp: Date.now()
              }, {
                module: 'CanvasAdapter',
                method: 'getCanvasSize',
                params: { canvasId: this.canvasId }
              });
              reject(error);
            }
          });
      } catch (err) {
        const error = this.errorHandler.handle(err, {
          module: 'CanvasAdapter',
          method: 'getCanvasSize',
          params: { canvasId: this.canvasId }
        });
        reject(error);
      }
    });
  }

  /**
   * 设置 Canvas 尺寸
   */
  async setCanvasSize(width: number, height: number): Promise<void> {
    try {
      const canvas = await this.getCanvasNode();
      
      // 小程序 Canvas 节点通过 width/height 属性设置尺寸
      if (canvas.width !== undefined && canvas.height !== undefined) {
        canvas.width = width;
        canvas.height = height;
      }

      // 更新 WebGL 视口（如有）
      if (this.webglContext) {
        this.webglContext.viewport(0, 0, width, height);
      }
      // 2D 上下文无需额外设置
    } catch (err) {
      const error = this.errorHandler.handle(err, {
        module: 'CanvasAdapter',
        method: 'setCanvasSize',
        params: { canvasId: this.canvasId, width, height }
      });
      throw error;
    }
  }

  /**
   * 监听 Canvas 尺寸变化
   * 小程序环境通过页面生命周期事件触发检查
   */
  watchCanvasSize(callback: (width: number, height: number) => void): void {
    this.resizeCallback = callback;
    
    // 小程序不支持直接监听尺寸变化，需要通过页面生命周期事件触发
    // 这里提供一个检查函数，建议在页面 onResize 或 onShow 时调用
    const checkSize = async () => {
      if (this.isDestroyed) return;
      
      try {
        const size = await this.getCanvasSize();
        if (this.resizeCallback) {
          this.resizeCallback(size.width, size.height);
        }
      } catch (err) {
        // 忽略错误
        (window as any).avatarSDKLogger?.warn?.('[CanvasAdapter] Failed to get canvas size:', err);
      }
    };

    // 初始检查
    checkSize();
    
    // 保存检查函数，供外部调用（如页面 onResize 时）
    (this as any)._checkSize = checkSize;
  }

  /**
   * 手动触发尺寸检查（供页面生命周期调用）
   */
  checkSize(): void {
    if ((this as any)._checkSize) {
      (this as any)._checkSize();
    }
  }

  /**
   * 停止监听尺寸变化
   */
  unwatchCanvasSize(): void {
    this.resizeCallback = null;
  }

  /**
   * 处理页面显示（恢复渲染）
   */
  onShow(): void {
    // 小程序页面显示时，WebGL 上下文可能需要恢复
    // 检查尺寸变化并更新视口
    if (this.webglContext && this.canvasNode) {
      // 触发尺寸检查
      this.checkSize();
      
      // 更新 WebGL 视口（如果尺寸发生变化）
      this.getCanvasSize().then(size => {
        if (this.webglContext) {
          this.webglContext.viewport(0, 0, size.width, size.height);
        }
      }).catch(err => {
        (window as any).avatarSDKLogger?.warn?.('[CanvasAdapter] Failed to update viewport on show:', err);
      });
    }
  }

  /**
   * 处理页面隐藏（暂停渲染）
   */
  onHide(): void {
    // 小程序页面隐藏时，可以暂停渲染以节省资源
    // 注意：不要销毁 WebGL 上下文，因为小程序可能不支持恢复
    // 这里只是标记状态，实际渲染暂停由调用方控制
  }

  /**
   * 销毁适配器
   */
  destroy(): void {
    this.isDestroyed = true;
    this.unwatchCanvasSize();
    this.webglContext = null;
    this.ctx2d = null;
    this.canvasNode = null;
    this.sizeObserver = null;
    this.resizeCallback = null;
  }

  /**
   * 获取 Canvas 节点（同步，如果已获取）
   */
  getCanvasNodeSync(): WechatMiniprogram.Canvas | null {
    return this.canvasNode;
  }

  /**
   * 获取 WebGL 上下文（同步，如果已创建）
   */
  getWebGLContextSync(): WebGL2RenderingContext | null {
    return this.webglContext;
  }

  /**
   * 获取 2D 上下文（同步，如果已创建）
   */
  get2DContextSync(): CanvasRenderingContext2D | null {
    return this.ctx2d;
  }
}

/**
 * 创建 Canvas 适配器实例
 */
export function createCanvasAdapter(options: CanvasAdapterOptions): CanvasAdapter {
  return new CanvasAdapter(options);
}
