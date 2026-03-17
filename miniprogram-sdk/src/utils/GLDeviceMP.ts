// @ts-nocheck

export class GLDeviceMP {
  /** 记录 WebGL 能力检测结果 */
  private static webGLCapabilities: {
    isWebGL2: boolean;
    support3DTexture: boolean;
    supportFloatTexture: boolean;
    supportFloatVertex: boolean;
    supportVAO: boolean;
    supportInstancedArrays: boolean;
    supportDepthTexture: boolean;
  } | null = null;

  /** 获取 WebGL 能力检测结果 */
  static getWebGLCapabilities(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    if (this.webGLCapabilities) return this.webGLCapabilities;

    const isWebGL2 = typeof (gl as any).texImage3D === 'function';
    const support3DTexture = isWebGL2 && !!(gl as any).createTexture ? (() => {
      try {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, tex);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, 1, 1, 1, gl.RED, gl.UNSIGNED_BYTE, null);
        gl.deleteTexture(tex);
        return true;
      } catch(e) { return false; }
    })() : false;
    // 检测 Float 纹理支持
    let supportFloatTexture = false;
    try {
      supportFloatTexture = !!gl.getExtension('OES_texture_float');
      // 尝试实际创建 Float 纹理验证
      if (supportFloatTexture) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
        const err = gl.getError();
        if (err !== 0) supportFloatTexture = false;
        gl.deleteTexture(tex);
      }
    } catch {
      supportFloatTexture = false;
    }
    const supportFloatVertex = !!(gl.getExtension('OES_vertex_array_object') || isWebGL2);
    const supportVAO = isWebGL2 || !!gl.getExtension('OES_vertex_array_object');
    const supportInstancedArrays = isWebGL2 || !!gl.getExtension('ANGLE_instanced_arrays');
    const supportDepthTexture = isWebGL2 || !!gl.getExtension('WEBGL_depth_texture');

    this.webGLCapabilities = {
      isWebGL2,
      support3DTexture,
      supportFloatTexture,
      supportFloatVertex,
      supportVAO,
      supportInstancedArrays,
      supportDepthTexture
    };
    return this.webGLCapabilities;
  }
  private _ElementTypeMap_JS2GL!: { readonly [index: string]: number };
  private _FormatTypeMap_Ext2Int!: Map<number, Map<number, number>>;
  private _FormatTypeMap_Ext2Str!: Map<number, string>;
  private shaderStage!: { readonly [index: string]: number };
  private running: boolean = true;
  private _lost_context_sim: any | null = null;
  canvas: any;
  gl!: WebGL2RenderingContext | WebGLRenderingContext; // 支持 WebGL1/2
  frameID: number | null;
  cbRender: (device: GLDeviceMP) => void;
  private _isDestroyed: boolean = false;

  constructor(gl: WebGL2RenderingContext | WebGLRenderingContext, canvas: any) {
    this.gl = gl;
    this.canvas = canvas;
    this.frameID = null;

    // 检测 WebGL 能力
    GLDeviceMP.getWebGLCapabilities(gl);

    const initContext = () => {
      // 小程序中 gl 由外部传入，这里不再重新 getContext
      // const gl = this.canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true });
      
      this._lost_context_sim = this.gl.getExtension("WEBGL_lose_context");

      this.shaderStage = {
        "vertex": this.gl.VERTEX_SHADER,
        "fragment": this.gl.FRAGMENT_SHADER
      }

      this._ElementTypeMap_JS2GL = {
        "Uint8Array": this.gl.UNSIGNED_BYTE,
        "Uint8ClampedArray": this.gl.UNSIGNED_BYTE,
        "Int8Array": this.gl.BYTE,
        "Uint16Array": this.gl.UNSIGNED_SHORT,
        "Int16Array": this.gl.SHORT,
        "Uint32Array": this.gl.UNSIGNED_INT,
        "Int32Array": this.gl.INT,
        // WebGL1 可能不支持 FLOAT 纹理，但在小程序里通常都有 OES_texture_float
        "Float32Array": this.gl.FLOAT 
      };
      
      // WebGL2 特性检查（避免直接访问全局 WebGL2RenderingContext，防止 ReferenceError）
      // 方法1: 检查 gl.constructor.name
      // 方法2: 检查是否存在 WebGL2 独有的方法，例如 texImage3D
      // @ts-ignore
      const isWebGL2 = typeof this.gl.texImage3D === 'function';

      if (isWebGL2) {
          // @ts-ignore
          // 仅当环境支持 WebGL2RenderingContext 时才使用它，否则用硬编码值或跳过
          if (typeof WebGL2RenderingContext !== 'undefined') {
              this._ElementTypeMap_JS2GL["Float16Array"] = WebGL2RenderingContext.HALF_FLOAT;
          } else {
              // 某些环境下可能支持 webgl2 但没有全局变量，手动补充常量
              this._ElementTypeMap_JS2GL["Float16Array"] = 0x140B; // HALF_FLOAT
          }
      }

      // 简化的格式映射，适配小程序环境
      // 注意：这里保留了 Web SDK 的完整映射表，但在 WebGL1 环境下部分格式可能不可用
      // 实际使用时需要注意 format 兼容性
      const _FormatTypeMap_Ext2Int_Raw: [number, [number, number][]][] = [
        [this.gl.UNSIGNED_BYTE, [[this.gl.RED, this.gl.R8], [this.gl.RED_INTEGER, this.gl.R8UI], [this.gl.RG, this.gl.RG8], [this.gl.RG_INTEGER, this.gl.RG8UI], [this.gl.RGB, this.gl.RGB8], [this.gl.RGB_INTEGER, this.gl.RGB8UI], [this.gl.RGBA, this.gl.RGBA8], [this.gl.RGBA_INTEGER, this.gl.RGBA8UI]]],
        [this.gl.BYTE, [[this.gl.RED, this.gl.R8_SNORM], [this.gl.RED_INTEGER, this.gl.R8I], [this.gl.RG, this.gl.RG8_SNORM], [this.gl.RG_INTEGER, this.gl.RG8I], [this.gl.RGB, this.gl.RGB8_SNORM], [this.gl.RGB_INTEGER, this.gl.RGB8I], [this.gl.RGBA, this.gl.RGBA8_SNORM], [this.gl.RGBA_INTEGER, this.gl.RGBA8I]]],
        [this.gl.UNSIGNED_SHORT, [[this.gl.RED_INTEGER, this.gl.R16UI], [this.gl.RG_INTEGER, this.gl.RG16UI], [this.gl.RGB_INTEGER, this.gl.RGB16UI], [this.gl.RGBA_INTEGER, this.gl.RGBA16UI], [this.gl.DEPTH_COMPONENT, this.gl.DEPTH_COMPONENT16]]],
        [this.gl.SHORT, [[this.gl.RED_INTEGER, this.gl.R16I], [this.gl.RG_INTEGER, this.gl.RG16I], [this.gl.RGB_INTEGER, this.gl.RGB16I], [this.gl.RGBA_INTEGER, this.gl.RGBA16I]]],
        [this.gl.UNSIGNED_INT, [[this.gl.RED_INTEGER, this.gl.R32UI], [this.gl.RG_INTEGER, this.gl.RG32UI], [this.gl.RGB_INTEGER, this.gl.RGB32UI], [this.gl.RGBA_INTEGER, this.gl.RGBA32UI], [this.gl.DEPTH_COMPONENT, this.gl.DEPTH_COMPONENT24]]],
        [this.gl.INT, [[this.gl.RED_INTEGER, this.gl.R32I], [this.gl.RG_INTEGER, this.gl.RG32I], [this.gl.RGB_INTEGER, this.gl.RGB32I], [this.gl.RGBA_INTEGER, this.gl.RGBA32I]]],
        // [this.gl.HALF_FLOAT, [[this.gl.RED, this.gl.R16F], [this.gl.RG, this.gl.RG16F], [this.gl.RGB, this.gl.RGB16F], [this.gl.RGBA, this.gl.RGBA16F]]],
        [this.gl.FLOAT, [[this.gl.RED, this.gl.R32F], [this.gl.RG, this.gl.RG32F], [this.gl.RGB, this.gl.RGB32F], [this.gl.RGBA, this.gl.RGBA32F], [this.gl.DEPTH_COMPONENT, this.gl.DEPTH_COMPONENT32F]]],
        [this.gl.UNSIGNED_SHORT_5_6_5, [[this.gl.RGB, this.gl.RGB565]]],
        [this.gl.UNSIGNED_SHORT_4_4_4_4, [[this.gl.RGBA, this.gl.RGBA4]]],
        [this.gl.UNSIGNED_SHORT_5_5_5_1, [[this.gl.RGBA, this.gl.RGB5_A1]]],
        // WebGL2 formats
        // [this.gl.UNSIGNED_INT_2_10_10_10_REV, [[this.gl.RGBA, this.gl.RGB10_A2]]],
        // [this.gl.UNSIGNED_INT_10F_11F_11F_REV, [[this.gl.RGB, this.gl.R11F_G11F_B10F]]],
        // [this.gl.UNSIGNED_INT_5_9_9_9_REV, [[this.gl.RGB, this.gl.RGB9_E5]]],
        [this.gl.UNSIGNED_INT_24_8, [[this.gl.DEPTH_STENCIL, this.gl.DEPTH24_STENCIL8]]],
        // [this.gl.FLOAT_32_UNSIGNED_INT_24_8_REV, [[this.gl.DEPTH_STENCIL, this.gl.DEPTH32F_STENCIL8]]]
      ];
      
      // 如果是 WebGL2，补充更多格式
      if (isWebGL2) {
          const gl2 = this.gl as WebGL2RenderingContext;
          _FormatTypeMap_Ext2Int_Raw.push([gl2.HALF_FLOAT, [[gl2.RED, gl2.R16F], [gl2.RG, gl2.RG16F], [gl2.RGB, gl2.RGB16F], [gl2.RGBA, gl2.RGBA16F]]]);
          _FormatTypeMap_Ext2Int_Raw.push([gl2.UNSIGNED_INT_2_10_10_10_REV, [[gl2.RGBA, gl2.RGB10_A2]]]);
          _FormatTypeMap_Ext2Int_Raw.push([gl2.UNSIGNED_INT_10F_11F_11F_REV, [[gl2.RGB, gl2.R11F_G11F_B10F]]]);
          _FormatTypeMap_Ext2Int_Raw.push([gl2.UNSIGNED_INT_5_9_9_9_REV, [[gl2.RGB, gl2.RGB9_E5]]]);
          _FormatTypeMap_Ext2Int_Raw.push([gl2.FLOAT_32_UNSIGNED_INT_24_8_REV, [[gl2.DEPTH_STENCIL, gl2.DEPTH32F_STENCIL8]]]);
      }

      this._FormatTypeMap_Ext2Int = new Map();
      for (const [elemType, formats] of _FormatTypeMap_Ext2Int_Raw) {
        const formatMap = new Map<number, number>();
        for (const [extFormat, intFormat] of formats) formatMap.set(extFormat, intFormat);
        this._FormatTypeMap_Ext2Int.set(elemType, formatMap);
      }

      const _FormatTypeMap_Ext2Str_Raw: { [name: string]: number } = {
        "GL_RED": this.gl.RED,
        // "GL_RED_INTEGER": this.gl.RED_INTEGER,
        "GL_RG": this.gl.RG,
        // "GL_RG_INTEGER": this.gl.RG_INTEGER,
        "GL_RGB": this.gl.RGB,
        // "GL_RGB_INTEGER": this.gl.RGB_INTEGER,
        "GL_RGBA": this.gl.RGBA,
        // "GL_RGBA_INTEGER": this.gl.RGBA_INTEGER,
        "GL_DEPTH_COMPONENT": this.gl.DEPTH_COMPONENT,
        "GL_DEPTH_STENCIL": this.gl.DEPTH_STENCIL
      }
      this._FormatTypeMap_Ext2Str = new Map();
      for (const [name, value] of Object.entries(_FormatTypeMap_Ext2Str_Raw)) this._FormatTypeMap_Ext2Str.set(value, name);
    };

    this.cbRender = () => { };

    // 小程序 canvas 不支持 addEventListener
    // this.canvas.addEventListener("webglcontextlost", ...);

    initContext();
  }
  
  compileShaderProgram(shaders: { readonly [index: string]: string }): WebGLProgram {
    let shaderProgram = this.gl.createProgram();
    if (!shaderProgram) throw new Error('WebGL shader program creation failed.');

    for (const [stage, code] of Object.entries(shaders)) {
      const shader = this.gl.createShader(this.shaderStage[stage]);
      if (!shader) throw new Error('WebGL shader creation failed.');
      this.gl.shaderSource(shader, code)
      this.gl.compileShader(shader)
      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        const compile_log = this.gl.getShaderInfoLog(shader);
        this.gl.deleteShader(shader);
        throw new Error('WebGL shader compile failed:' + compile_log);
      }
      this.gl.attachShader(shaderProgram, shader);
    }

    this.gl.linkProgram(shaderProgram);
    if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
      const link_log = this.gl.getProgramInfoLog(shaderProgram);
      this.gl.deleteProgram(shaderProgram);
      throw new Error('WebGL shader compile failed:' + link_log);
    }

    return shaderProgram;
  }
  getShaderProgramUniformLocation(program: WebGLProgram, attribNames: Array<string>): { [index: string]: WebGLUniformLocation } {
    let result: { [index: string]: WebGLUniformLocation } = {};
    for (const name of attribNames) result[name] = this.gl.getUniformLocation(program, name)!;
    return result;
  }
  getShaderProgramUniformBlockLocation(program: WebGLProgram, attribNames: Array<string>): { [index: string]: GLint } {
    let result: { [index: string]: GLint } = {};
    // getUniformBlockIndex 是 WebGL2 API，WebGL1 不支持
    // @ts-ignore
    if (typeof this.gl.getUniformBlockIndex === 'function') {
        const gl2 = this.gl as WebGL2RenderingContext;
        for (const name of attribNames) result[name] = gl2.getUniformBlockIndex(program, name)!;
    }
    return result;
  }
  getShaderProgramAttribLocation(program: WebGLProgram, attribNames: Array<string>): { [index: string]: GLint } {
    let result: { [index: string]: GLint } = {};
    for (const name of attribNames) result[name] = this.gl.getAttribLocation(program, name)!;
    return result;
  }
  getGLArrayElementType(arr: ArrayBufferView<ArrayBufferLike>): number | null {
    // @ts-ignore
    const tag = arr[Symbol.toStringTag] as string;
    if (tag in this._ElementTypeMap_JS2GL) return this._ElementTypeMap_JS2GL[tag]; else return null;
  }
  getGLTexInternalFormat(externalFormat: number, elementType: number): number | null {
    const formats = this._FormatTypeMap_Ext2Int.get(elementType);
    if (formats) {
      const internalFormat = formats.get(externalFormat);
      if (internalFormat) return internalFormat;
    }
    // 降级策略：如果找不到 WebGL2 的 internalFormat，尝试直接返回 externalFormat (WebGL1 行为)
    return externalFormat;
  }
  texImage2D(target: number, level: number, width: number, height: number, format: number, srcData: ArrayBufferView<ArrayBufferLike>) {
    const tag = (srcData as any)[Symbol.toStringTag];
    let elementType = this.getGLArrayElementType(srcData);
    // @ts-ignore
    if (!elementType) throw new Error(`Unsupported data format: ${tag}`);

    // WebGL2 requires the sized internal format (e.g. RGBA32F for float, RGBA8 for ubyte).
    // Using the unsized external format as internal format is INVALID_OPERATION in WebGL2.
    const internalFormat = this.getGLTexInternalFormat(format, elementType) ?? format;

    // @ts-ignore
    if (this.gl.HALF_FLOAT == elementType) srcData = new Uint16Array(srcData.buffer); // patch for Float16Array
    this.gl.texImage2D(target, level, internalFormat, width, height, 0, format, elementType, srcData);
  }
  texImage3D(target: number, level: number, width: number, height: number, depth: number, format: number, srcData: ArrayBufferView<ArrayBufferLike>) {
    // WebGL1 不支持 texImage3D
    // @ts-ignore
    if (typeof this.gl.texImage3D !== 'function') return;
    
    const elementType = this.getGLArrayElementType(srcData);
    // @ts-ignore
    if (!elementType) throw new Error('Unsupported data format: ' + srcData[Symbol.toStringTag] as string);
    const internalFormat = this.getGLTexInternalFormat(format, elementType);
    // @ts-ignore
    if (!internalFormat) throw new Error(`No available internal format for ${srcData[Symbol.toStringTag] as string} and ${this._FormatTypeMap_Ext2Str.get(format) ?? "unknown"}.`);
    if (this.gl.HALF_FLOAT == elementType) srcData = new Uint16Array(srcData.buffer); // patch for Float16Array
    this.gl.texImage3D(target, level, internalFormat, width, height, depth, 0, format, elementType, srcData);
  }
  
  // 移除了 run 方法，因为小程序没有 HTMLVideoElement 且渲染循环由外部控制
  
  refresh() { this.cbRender(this); }
  getSyncMediaTime(): number | null { return null; }
  
  stop() {
    if (null !== this.frameID) {
      // @ts-ignore
      cancelAnimationFrame(this.frameID);
      this.frameID = null;
    }
    this.running = false;
  }
  simulateContextFault(contextAvailable: boolean) {
    if (this._lost_context_sim) {
      contextAvailable ? this._lost_context_sim.restoreContext() : this._lost_context_sim.loseContext();
    }
  }
  captureFrame() {
    const width = this.canvas.width
    const height = this.canvas.height
    const pixelData = new Uint8ClampedArray(width * height * 4)
    this.gl.readPixels(0, 0, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixelData);

    return {
      width,
      height,
      data: pixelData
    }
  }
  destroy(): void {
    if (this._isDestroyed || !this.gl) {
      return;
    }

    const gl = this.gl;

    try {
      const loseExtension = gl.getExtension("WEBGL_lose_context");
      if (loseExtension) {
        loseExtension.loseContext();
      }

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.flush();

      // 小程序不需要移除 DOM
      
      this.gl = null;
      this._isDestroyed = true;

    } catch (error) {
      this._isDestroyed = true;
    }
  }

}
