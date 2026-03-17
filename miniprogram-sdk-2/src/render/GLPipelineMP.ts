/**
 * GLPipelineMP - WebGL 渲染管线 for Mini Program
 * 实现 IBR (Image-Based Rendering) 渲染管线
 */

import { logger } from '../utils/logger';
import { GLDeviceMP } from './GLDeviceMP';

export interface GLPipelineOptions {
  device: GLDeviceMP;
}

/**
 * 字符数据接口
 */
export interface GLPipelineCharData {
  char: any;           // 字符信息
  LUT?: any;           // Look-Up Table
  transform?: {
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
  };
  multisample?: number;
}

/**
 * IBR 动画帧数据
 */
export interface IBRAnimationFrameData {
  mesh: any[];
  blendshapeWeights: number[];
  movableJointTransforms: any[];
  textureModelIndex: number;
  texturePCAWeights: number[];
}

/**
 * GLPipelineMP - WebGL 渲染管线
 * 负责 IBR 渲染，包括:
 * - 身体纹理渲染
 * - 表情混合形状 (Blendshape)
 * - 骨骼动画 (Skeleton Animation)
 * - 网格纹理融合
 */
export class GLPipelineMP {
  private TAG = '[GLPipelineMP]';
  private device: GLDeviceMP;

  // 着色器程序
  private bodyProgram: WebGLProgram | null = null;
  private meshProgram: WebGLProgram | null = null;

  // 缓冲区
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;

  // 纹理
  private bodyTexture: WebGLTexture | null = null;
  private meshColorTexture: WebGLTexture | null = null;
  private meshAlphaTexture: WebGLTexture | null = null;

  // 字符数据
  private charData: GLPipelineCharData | null = null;
  private isCharDataSet: boolean = false;

  // 渲染状态
  private isInitialized: boolean = false;

  constructor(options: GLPipelineOptions) {
    this.device = options.device;
    this.init();
    logger.info(this.TAG, 'Created');
  }

  /**
   * 初始化
   */
  private init(): void {
    if (!this.device?.gl) {
      logger.error(this.TAG, 'No WebGL context');
      return;
    }

    try {
      this.initShaders();
      this.initBuffers();
      this.isInitialized = true;
      logger.info(this.TAG, 'Initialized');
    } catch (e) {
      logger.error(this.TAG, 'Init error:', e);
    }
  }

  /**
   * 初始化着色器
   */
  private initShaders(): void {
    const gl = this.device.gl;
    if (!gl) return;

    // 身体渲染着色器 (简单版)
    const bodyVS = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const bodyFS = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform float u_opacity;

      void main() {
        vec4 color = texture2D(u_texture, v_texCoord);
        gl_FragColor = vec4(color.rgb, color.a * u_opacity);
      }
    `;

    this.bodyProgram = this.createProgram(bodyVS, bodyFS);

    // 网格渲染着色器
    const meshVS = `
      attribute vec3 a_position;
      attribute vec2 a_texCoord;
      uniform mat4 u_projMat;
      varying vec2 v_texCoord;

      void main() {
        gl_Position = u_projMat * vec4(a_position, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const meshFS = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_colorTexture;
      uniform sampler2D u_alphaTexture;

      void main() {
        vec4 color = texture2D(u_colorTexture, v_texCoord);
        float alpha = texture2D(u_alphaTexture, v_texCoord).r;
        gl_FragColor = vec4(color.rgb * alpha, alpha);
      }
    `;

    this.meshProgram = this.createProgram(meshVS, meshFS);

    logger.debug(this.TAG, 'Shaders created');
  }

  /**
   * 创建着色器程序
   */
  private createProgram(vsSource: string, fsSource: string): WebGLProgram | null {
    const gl = this.device.gl;
    if (!gl) return null;

    // 顶点着色器
    const vs = gl.createShader(gl.VERTEX_SHADER);
    if (!vs) return null;
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);

    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      logger.error(this.TAG, 'VS error:', gl.getShaderInfoLog(vs));
      return null;
    }

    // 片元着色器
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fs) return null;
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      logger.error(this.TAG, 'FS error:', gl.getShaderInfoLog(fs));
      return null;
    }

    // 程序
    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      logger.error(this.TAG, 'Program error:', gl.getProgramInfoLog(program));
      return null;
    }

    return program;
  }

  /**
   * 初始化缓冲区
   */
  private initBuffers(): void {
    const gl = this.device.gl;
    if (!gl) return;

    // 顶点缓冲区 (全屏四边形)
    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1
    ]);

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // 索引缓冲区
    const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    logger.debug(this.TAG, 'Buffers created');
  }

  /**
   * 设置字符数据
   */
  setCharData(data: GLPipelineCharData): void {
    this.charData = data;
    this.isCharDataSet = true;
    logger.info(this.TAG, 'Char data set');
  }

  /**
   * 设置同步媒体
   */
  setSyncMedia(): void {
    logger.debug(this.TAG, 'Sync media set');
    // TODO: 实现同步媒体逻辑
  }

  /**
   * 渲染身体纹理
   */
  renderBody(image: any): void {
    const gl = this.device.gl;
    if (!gl || !this.bodyProgram || !image) return;

    // 创建/更新纹理
    if (!this.bodyTexture) {
      this.bodyTexture = gl.createTexture();
    }

    gl.bindTexture(gl.TEXTURE_2D, this.bodyTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // 渲染
    gl.viewport(0, 0, this.device.getWidth(), this.device.getHeight());
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.bodyProgram);

    // 绑定顶点
    const posLoc = gl.getAttribLocation(this.bodyProgram, 'a_position');
    const texLoc = gl.getAttribLocation(this.bodyProgram, 'a_texCoord');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

    // 绑定纹理
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bodyTexture);
    const texUniform = gl.getUniformLocation(this.bodyProgram, 'u_texture');
    gl.uniform1i(texUniform, 0);

    // 设置不透明度
    const opacityUniform = gl.getUniformLocation(this.bodyProgram, 'u_opacity');
    gl.uniform1f(opacityUniform, 1.0);

    // 绘制
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    logger.debug(this.TAG, 'Body rendered');
  }

  /**
   * 渲染 IBR 帧
   */
  renderIBRFrame(frameData: IBRAnimationFrameData): void {
    // TODO: 实现完整的 IBR 渲染
    // 包括:
    // 1. Blendshape 混合
    // 2. 骨骼变换
    // 3. 网格纹理合成

    logger.debug(this.TAG, 'IBR frame:', frameData);
  }

  /**
   * 重新初始化
   */
  reinitialize(): void {
    this.destroy();
    this.init();
    logger.info(this.TAG, 'Reinitialized');
  }

  /**
   * 销毁
   */
  destroy(): void {
    const gl = this.device.gl;
    if (!gl) return;

    // 清理程序
    if (this.bodyProgram) {
      gl.deleteProgram(this.bodyProgram);
      this.bodyProgram = null;
    }

    if (this.meshProgram) {
      gl.deleteProgram(this.meshProgram);
      this.meshProgram = null;
    }

    // 清理缓冲区
    if (this.vertexBuffer) {
      gl.deleteBuffer(this.vertexBuffer);
      this.vertexBuffer = null;
    }

    if (this.indexBuffer) {
      gl.deleteBuffer(this.indexBuffer);
      this.indexBuffer = null;
    }

    // 清理纹理
    if (this.bodyTexture) {
      gl.deleteTexture(this.bodyTexture);
      this.bodyTexture = null;
    }

    if (this.meshColorTexture) {
      gl.deleteTexture(this.meshColorTexture);
      this.meshColorTexture = null;
    }

    if (this.meshAlphaTexture) {
      gl.deleteTexture(this.meshAlphaTexture);
      this.meshAlphaTexture = null;
    }

    this.isInitialized = false;
    logger.info(this.TAG, 'Destroyed');
  }
}

export default GLPipelineMP;
