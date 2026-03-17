/**
 * GLDeviceMP - WebGL Device Adapter for Mini Program
 * 基于微信小程序 canvas 的 WebGL 设备封装
 */

import { logger } from '../utils/logger';

export interface GLDeviceOptions {
  canvas: any;
  alpha?: boolean;
  antialias?: boolean;
  depth?: boolean;
  stencil?: boolean;
  premultipliedAlpha?: boolean;
  preserveDrawingBuffer?: boolean;
  powerPreference?: 'default' | 'low-power' | 'high-performance';
}

export class GLDeviceMP {
  public canvas: any;
  public gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  public isWebGL2: boolean = false;
  private contextLost: boolean = false;

  constructor(options: GLDeviceOptions) {
    this.canvas = options.canvas;
    this.initWebGL(options);
  }

  /**
   * 初始化 WebGL 上下文
   */
  private initWebGL(options: GLDeviceOptions): void {
    if (!this.canvas) {
      logger.error('[GLDeviceMP] Canvas is null');
      return;
    }

    const contextOptions: WebGLContextAttributes = {
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
    } catch (e) {
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
    } catch (e) {
      logger.error('[GLDeviceMP] Failed to create WebGL context:', e);
    }

    logger.error('[GLDeviceMP] WebGL is not supported');
  }

  /**
   * 获取 WebGL 版本
   */
  getVersion(): string {
    return this.isWebGL2 ? 'WebGL2' : 'WebGL1';
  }

  /**
   * 检查上下文是否有效
   */
  isValid(): boolean {
    return this.gl !== null && !this.contextLost;
  }

  /**
   * 获取画布宽度
   */
  getWidth(): number {
    return this.canvas?.width || 0;
  }

  /**
   * 获取画布高度
   */
  getHeight(): number {
    return this.canvas?.height || 0;
  }

  /**
   * 设置视口
   */
  viewport(x: number, y: number, width: number, height: number): void {
    if (this.gl) {
      this.gl.viewport(x, y, width, height);
    }
  }

  /**
   * 清除颜色
   */
  clearColor(r: number, g: number, b: number, a: number): void {
    if (this.gl) {
      this.gl.clearColor(r, g, b, a);
    }
  }

  /**
   * 清除缓冲区
   */
  clear(mask: number): void {
    if (this.gl) {
      this.gl.clear(mask);
    }
  }

  /**
   * 创建着色器
   */
  createShader(type: number): WebGLShader | null {
    if (!this.gl) return null;
    return this.gl.createShader(type);
  }

  /**
   * 编译着色器
   */
  compileShader(shader: WebGLShader, source: string): boolean {
    if (!this.gl) return false;

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
  createProgram(): WebGLProgram | null {
    if (!this.gl) return null;
    return this.gl.createProgram();
  }

  /**
   * 链接着色器程序
   */
  linkProgram(program: WebGLProgram): boolean {
    if (!this.gl) return false;

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
  useProgram(program: WebGLProgram): void {
    if (this.gl) {
      this.gl.useProgram(program);
    }
  }

  /**
   * 创建缓冲区
   */
  createBuffer(): WebGLBuffer | null {
    if (!this.gl) return null;
    return this.gl.createBuffer();
  }

  /**
   * 绑定缓冲区
   */
  bindBuffer(target: number, buffer: WebGLBuffer | null): void {
    if (this.gl) {
      this.gl.bindBuffer(target, buffer);
    }
  }

  /**
   * 设置缓冲区数据
   */
  bufferData(target: number, data: ArrayBufferView, usage: number): void {
    if (this.gl) {
      this.gl.bufferData(target, data, usage);
    }
  }

  /**
   * 创建纹理
   */
  createTexture(): WebGLTexture | null {
    if (!this.gl) return null;
    return this.gl.createTexture();
  }

  /**
   * 绑定纹理
   */
  bindTexture(target: number, texture: WebGLTexture | null): void {
    if (this.gl) {
      this.gl.bindTexture(target, texture);
    }
  }

  /**
   * 设置纹理参数
   */
  texParameteri(target: number, pname: number, param: number): void {
    if (this.gl) {
      this.gl.texParameteri(target, pname, param);
    }
  }

  /**
   * 上传纹理图像
   */
  texImage2D(target: number, level: number, internalformat: number, format: number, type: number, image: any): void {
    if (!this.gl) return;

    // 小程序可能需要特殊处理
    if (image && image.width && image.height) {
      this.gl.texImage2D(target, level, internalformat, format, type, image);
    } else {
      this.gl.texImage2D(target, level, internalformat, internalformat, type, image);
    }
  }

  /**
   * 创建顶点数组对象 (WebGL2)
   */
  createVertexArray(): WebGLVertexArrayObject | null {
    if (!this.gl || !this.isWebGL2) return null;
    return (this.gl as WebGL2RenderingContext).createVertexArray();
  }

  /**
   * 绑定顶点数组 (WebGL2)
   */
  bindVertexArray(vertexArray: WebGLVertexArrayObject | null): void {
    if (!this.gl || !this.isWebGL2) return;
    (this.gl as WebGL2RenderingContext).bindVertexArray(vertexArray);
  }

  /**
   * 启用混合
   */
  enable(cap: number): void {
    if (this.gl) {
      this.gl.enable(cap);
    }
  }

  /**
   * 禁用混合
   */
  disable(cap: number): void {
    if (this.gl) {
      this.gl.disable(cap);
    }
  }

  /**
   * 设置混合函数
   */
  blendFunc(sfactor: number, dfactor: number): void {
    if (this.gl) {
      this.gl.blendFunc(sfactor, dfactor);
    }
  }

  /**
   * 开启深度测试
   */
  enableDepthTest(): void {
    if (this.gl) {
      this.gl.enable(this.gl.DEPTH_TEST);
    }
  }

  /**
   * 销毁设备
   */
  destroy(): void {
    this.contextLost = true;
    this.gl = null;
    this.canvas = null;
    logger.info('[GLDeviceMP] Device destroyed');
  }
}

export default GLDeviceMP;
