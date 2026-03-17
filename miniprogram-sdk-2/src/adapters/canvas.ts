/**
 * Canvas Adapter for Mini Program
 * 封装微信小程序 canvas 相关 API，提供 WebGL 渲染支持
 */

declare const wx: any;

export interface CanvasAdapterOptions {
  type?: '2d' | 'webgl' | 'webgl2';
  canvasId: string;
  componentInstance?: any;
}

export interface CanvasContext {
  canvas: any;
  getContext: (type: string) => any;
  width: number;
  height: number;
}

/**
 * 创建 Canvas 适配器
 */
export function createCanvasAdapter(options: CanvasAdapterOptions): CanvasContext {
  const { canvasId } = options;

  // 小程序使用 createSelectorQuery 获取 canvas 节点
  const query = wx.createSelectorQuery();
  query.select(`#${canvasId}`).node();

  return {
    canvas: null, // 需要异步获取
    getContext: (type: string) => null,
    width: 0,
    height: 0
  };
}

/**
 * 获取 WebGL 上下文
 */
export async function getWebGLContext(canvasId: string): Promise<WebGLRenderingContext | WebGL2RenderingContext | null> {
  return new Promise((resolve, reject) => {
    const query = wx.createSelectorQuery();
    query.select(`#${canvasId}`).node().exec((res: any[]) => {
      if (!res || !res[0] || !res[0].node) {
        reject(new Error('Canvas node not found'));
        return;
      }

      const canvas = res[0].node;
      const glOpts = {
        alpha: true,
        antialias: true,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance' as const
      };

      // 先尝试 webgl2，失败则回退到 webgl
      const gl = canvas.getContext('webgl2', glOpts) || canvas.getContext('webgl', glOpts);

      if (!gl) {
        reject(new Error('WebGL not available'));
        return;
      }

      resolve(gl);
    });
  });
}

/**
 * 获取 Canvas 节点和尺寸
 */
export async function getCanvasNode(canvasId: string): Promise<{ canvas: any; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const query = wx.createSelectorQuery();

    // 获取 canvas 节点
    query.select(`#${canvasId}`).node().exec((res: any[]) => {
      if (!res || !res[0] || !res[0].node) {
        reject(new Error('Canvas node not found'));
        return;
      }

      const canvas = res[0].node;

      // 获取尺寸
      const sizeQuery = wx.createSelectorQuery();
      sizeQuery.select(`#${canvasId}`).boundingClientRect();
      sizeQuery.exec((sizeRes: any[]) => {
        if (sizeRes && sizeRes[0]) {
          resolve({
            canvas,
            width: sizeRes[0].width || 375,
            height: sizeRes[0].height || 667
          });
        } else {
          resolve({
            canvas,
            width: 375,
            height: 667
          });
        }
      });
    });
  });
}

/**
 * Canvas Adapter 类
 */
export class CanvasAdapter {
  private canvasId: string;
  private componentInstance: any;
  private canvas: any = null;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private width: number = 0;
  private height: number = 0;

  constructor(options: CanvasAdapterOptions) {
    this.canvasId = options.canvasId;
    this.componentInstance = options.componentInstance;
  }

  /**
   * 初始化 canvas
   */
  async init(): Promise<void> {
    const query = this.componentInstance
      ? this.componentInstance.createSelectorQuery()
      : wx.createSelectorQuery();

    return new Promise((resolve, reject) => {
      query.select(`#${this.canvasId}`).node().exec((res: any[]) => {
        if (!res || !res[0] || !res[0].node) {
          reject(new Error('Canvas node not found'));
          return;
        }

        this.canvas = res[0].node;

        // 获取尺寸
        const sizeQuery = this.componentInstance
          ? this.componentInstance.createSelectorQuery()
          : wx.createSelectorQuery();
        sizeQuery.select(`#${this.canvasId}`).boundingClientRect();
        sizeQuery.exec((sizeRes: any[]) => {
          if (sizeRes && sizeRes[0]) {
            this.width = sizeRes[0].width || 375;
            this.height = sizeRes[0].height || 667;
          }
          resolve();
        });
      });
    });
  }

  /**
   * 获取 WebGL 上下文
   */
  async getGL(): Promise<WebGLRenderingContext | WebGL2RenderingContext | null> {
    if (this.gl) return this.gl;

    if (!this.canvas) {
      await this.init();
    }

    // 先尝试 webgl2，失败则回退到 webgl
    this.gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance'
    }) || this.canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance'
    });

    return this.gl;
  }

  getCanvas(): any {
    return this.canvas;
  }

  getWidth(): number {
    return this.width;
  }

  getHeight(): number {
    return this.height;
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }
}

export default CanvasAdapter;
