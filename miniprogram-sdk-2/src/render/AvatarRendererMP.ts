/**
 * AvatarRendererMP - 数字人渲染器 for Mini Program
 * 负责身体和脸部数据的融合渲染
 */

import { logger } from '../utils/logger';
import { GLDeviceMP } from './GLDeviceMP';
import type { IBodyFrame } from '../core/DataCacheQueueMP';

export interface AvatarRendererOptions {
  canvas: any;
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  dataCacheQueue: any;
  resourceManager: any;
  onMessage?: (message: string) => void;
}

export interface RenderFrameData {
  frame: number;
  bodyFrame?: IBodyFrame;
  faceFrame?: any;
  audioFrame?: any;
}

/**
 * AvatarRendererMP - 数字人渲染器
 * 整合身体渲染和脸部渲染，实现 IBR (Image-Based Rendering) 效果
 */
export class AvatarRendererMP {
  private TAG = '[AvatarRendererMP]';
  private options: AvatarRendererOptions;

  private canvas: any;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private device: GLDeviceMP | null = null;
  private dataCacheQueue: any;
  private resourceManager: any;

  // 渲染状态
  private isInitialized: boolean = false;
  private isRendering: boolean = false;
  private currentBodyFrame: any = null;
  private lastFaceFrame: any = null;

  // 纹理
  private bodyTexture: WebGLTexture | null = null;
  private meshTexture: WebGLTexture | null = null;

  // Shader 程序
  private program: WebGLProgram | null = null;

  // 顶点数据
  private quadVertices: Float32Array = new Float32Array([
    // position, texCoord
    -1, -1, 0, 0,
     1, -1, 1, 0,
    -1,  1, 0, 1,
     1,  1, 1, 1
  ]);

  private vertexBuffer: WebGLBuffer | null = null;

  // 回调
  private onMessageCallback?: (message: string) => void;

  constructor(options: AvatarRendererOptions) {
    this.options = options;
    this.canvas = options.canvas;
    this.gl = options.gl;
    this.dataCacheQueue = options.dataCacheQueue;
    this.resourceManager = options.resourceManager;
    this.onMessageCallback = options.onMessage;

    this.initDevice();
    logger.info(this.TAG, 'Created');
  }

  /**
   * 初始化 WebGL 设备
   */
  private initDevice(): void {
    try {
      this.device = new GLDeviceMP({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
        powerPreference: 'high-performance'
      });

      this.gl = this.device.gl;

      if (!this.gl) {
        this.emitError('WebGL context not available');
        return;
      }

      this.initShaders();
      this.initBuffers();

      this.isInitialized = true;
      logger.info(this.TAG, 'Initialized');
    } catch (e) {
      logger.error(this.TAG, 'Init error:', e);
      this.emitError(String(e));
    }
  }

  /**
   * 初始化着色器
   */
  private initShaders(): void {
    if (!this.gl) return;

    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_bodyTexture;
      uniform sampler2D u_meshTexture;
      uniform float u_opacity;

      void main() {
        vec4 bodyColor = texture2D(u_bodyTexture, v_texCoord);
        vec4 meshColor = texture2D(u_meshTexture, v_texCoord);

        // 简单的 alpha 混合
        vec3 finalColor = mix(bodyColor.rgb, meshColor.rgb, meshColor.a * u_opacity);
        float finalAlpha = max(bodyColor.a, meshColor.a * u_opacity);

        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `;

    // 创建顶点着色器
    const vs = this.gl.createShader(this.gl.VERTEX_SHADER);
    if (!vs) return;
    this.gl.shaderSource(vs, vsSource);
    this.gl.compileShader(vs);

    if (!this.gl.getShaderParameter(vs, this.gl.COMPILE_STATUS)) {
      logger.error(this.TAG, 'VS compile error:', this.gl.getShaderInfoLog(vs));
      return;
    }

    // 创建片元着色器
    const fs = this.gl.createShader(this.gl.FRAGMENT_SHADER);
    if (!fs) return;
    this.gl.shaderSource(fs, fsSource);
    this.gl.compileShader(fs);

    if (!this.gl.getShaderParameter(fs, this.gl.COMPILE_STATUS)) {
      logger.error(this.TAG, 'FS compile error:', this.gl.getShaderInfoLog(fs));
      return;
    }

    // 创建程序
    this.program = this.gl.createProgram();
    if (!this.program) return;

    this.gl.attachShader(this.program, vs);
    this.gl.attachShader(this.program, fs);
    this.gl.linkProgram(this.program);

    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      logger.error(this.TAG, 'Program link error:', this.gl.getProgramInfoLog(this.program));
      return;
    }

    logger.info(this.TAG, 'Shaders initialized');
  }

  /**
   * 初始化缓冲区
   */
  private initBuffers(): void {
    if (!this.gl || !this.program) return;

    this.vertexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.quadVertices, this.gl.STATIC_DRAW);

    // 获取 attribute 位置
    const positionLoc = this.gl.getAttribLocation(this.program, 'a_position');
    const texCoordLoc = this.gl.getAttribLocation(this.program, 'a_texCoord');

    this.gl.enableVertexAttribArray(positionLoc);
    this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 16, 0);

    this.gl.enableVertexAttribArray(texCoordLoc);
    this.gl.vertexAttribPointer(texCoordLoc, 2, this.gl.FLOAT, false, 16, 8);

    logger.debug(this.TAG, 'Buffers initialized');
  }

  /**
   * 创建纹理
   */
  private createTexture(image: any): WebGLTexture | null {
    if (!this.gl) return null;

    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

    // 设置纹理参数
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

    // 上传图像
    if (image) {
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        image
      );
    }

    return texture;
  }

  /**
   * 渲染帧
   */
  render(data: RenderFrameData): void {
    if (!this.isInitialized || !this.gl || !this.program) return;

    const { bodyFrame, faceFrame } = data;

    // 更新身体纹理
    if (bodyFrame?.frame) {
      this.updateBodyTexture(bodyFrame.frame);
    }

    // 更新脸部数据
    if (faceFrame) {
      this.lastFaceFrame = faceFrame;
    }

    // 执行渲染
    this.doRender();
  }

  /**
   * 更新身体纹理
   */
  private updateBodyTexture(frame: any): void {
    if (!frame) return;

    // 释放旧纹理
    if (this.bodyTexture) {
      this.gl?.deleteTexture(this.bodyTexture);
    }

    // 创建新纹理
    this.bodyTexture = this.createTexture(frame);
    this.currentBodyFrame = frame;

    logger.debug(this.TAG, 'Body texture updated');
  }

  /**
   * 执行渲染
   */
  private doRender(): void {
    if (!this.gl || !this.program) return;

    // 清空画布
    this.gl.viewport(0, 0, this.canvas.width || 375, this.canvas.height || 667);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    // 启用混合
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    // 使用程序
    this.gl.useProgram(this.program);

    // 绑定身体纹理
    if (this.bodyTexture) {
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.bodyTexture);
      const bodyLoc = this.gl.getUniformLocation(this.program, 'u_bodyTexture');
      this.gl.uniform1i(bodyLoc, 0);
    }

    // 绑定网格纹理
    if (this.meshTexture) {
      this.gl.activeTexture(this.gl.TEXTURE1);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.meshTexture);
      const meshLoc = this.gl.getUniformLocation(this.program, 'u_meshTexture');
      this.gl.uniform1i(meshLoc, 1);
    }

    // 设置不透明度
    const opacityLoc = this.gl.getUniformLocation(this.program, 'u_opacity');
    this.gl.uniform1f(opacityLoc, 1.0);

    // 绘制
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * 设置网格纹理
   */
  setMeshTexture(texture: WebGLTexture | null): void {
    this.meshTexture = texture;
  }

  /**
   * 设置面部对齐参数
   */
  setFaceAlignmentConfig(config: any): void {
    logger.info(this.TAG, 'Face alignment config updated:', config);
    // TODO: 实现面部对齐参数设置
  }

  /**
   * 重置脸部帧状态
   */
  resetFaceFrameState(): void {
    this.lastFaceFrame = null;
    logger.debug(this.TAG, 'Face frame state reset');
  }

  /**
   * 设置画布尺寸
   */
  setCanvasSize(width: number, height: number): void {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl?.viewport(0, 0, width, height);
    }
  }

  /**
   * 设置画布可见性
   */
  setCanvasVisibility(visible: boolean): void {
    // TODO: 实现画布显隐控制
    logger.debug(this.TAG, 'Canvas visibility:', visible);
  }

  /**
   * 获取当前身体帧信息
   */
  _getCurrentBodyFrameInfo(frame: number): any {
    return this.currentBodyFrame;
  }

  /**
   * 获取 WebGL 上下文
   */
  getGL(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.gl;
  }

  /**
   * 获取渲染状态
   */
  getRenderState(): string {
    return this.isRendering ? 'rendering' : 'idle';
  }

  /**
   * 发送错误
   */
  private emitError(message: string): void {
    logger.error(this.TAG, message);
    this.onMessageCallback?.(message);
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.isRendering = false;
    this.isInitialized = false;

    // 清理纹理
    if (this.bodyTexture && this.gl) {
      this.gl.deleteTexture(this.bodyTexture);
      this.bodyTexture = null;
    }

    if (this.meshTexture && this.gl) {
      this.gl.deleteTexture(this.meshTexture);
      this.meshTexture = null;
    }

    // 清理缓冲区
    if (this.vertexBuffer && this.gl) {
      this.gl.deleteBuffer(this.vertexBuffer);
      this.vertexBuffer = null;
    }

    // 清理程序
    if (this.program && this.gl) {
      this.gl.deleteProgram(this.program);
      this.program = null;
    }

    // 清理设备
    this.device?.destroy();
    this.device = null;
    this.gl = null;

    logger.info(this.TAG, 'Destroyed');
  }
}

export default AvatarRendererMP;
