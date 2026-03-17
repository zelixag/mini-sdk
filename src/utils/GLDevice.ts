// @ts-nocheck

export class GLDevice {
  private _ElementTypeMap_JS2GL!: { readonly [index: string]: number };
  private _FormatTypeMap_Ext2Int!: Map<number, Map<number, number>>;
  private _FormatTypeMap_Ext2Str!: Map<number, string>;
  private shaderStage!: { readonly [index: string]: number };
  private running: boolean = true;
  private syncMedia: HTMLVideoElement | null = null;
  private syncMediaTime: DOMHighResTimeStamp | null = null;
  private _lost_context_sim: WEBGL_lose_context | null = null;
  canvas: HTMLCanvasElement;
  gl!: WebGL2RenderingContext;
  frameID: number | null;
  cbRender: (device: GLDevice) => void;
  private _isDestroyed: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.frameID = null;

    const initContext = () => {
      const gl = this.canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true });
      if (!gl) throw Error("WebGL context cannot be created."); else this.gl = gl;

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
        "Float16Array": this.gl.HALF_FLOAT,
        "Float32Array": this.gl.FLOAT
      };

      const _FormatTypeMap_Ext2Int_Raw: [number, [number, number][]][] = [
        [this.gl.UNSIGNED_BYTE, [[this.gl.RED, this.gl.R8], [this.gl.RED_INTEGER, this.gl.R8UI], [this.gl.RG, this.gl.RG8], [this.gl.RG_INTEGER, this.gl.RG8UI], [this.gl.RGB, this.gl.RGB8], [this.gl.RGB_INTEGER, this.gl.RGB8UI], [this.gl.RGBA, this.gl.RGBA8], [this.gl.RGBA_INTEGER, this.gl.RGBA8UI]]],
        [this.gl.BYTE, [[this.gl.RED, this.gl.R8_SNORM], [this.gl.RED_INTEGER, this.gl.R8I], [this.gl.RG, this.gl.RG8_SNORM], [this.gl.RG_INTEGER, this.gl.RG8I], [this.gl.RGB, this.gl.RGB8_SNORM], [this.gl.RGB_INTEGER, this.gl.RGB8I], [this.gl.RGBA, this.gl.RGBA8_SNORM], [this.gl.RGBA_INTEGER, this.gl.RGBA8I]]],
        [this.gl.UNSIGNED_SHORT, [[this.gl.RED_INTEGER, this.gl.R16UI], [this.gl.RG_INTEGER, this.gl.RG16UI], [this.gl.RGB_INTEGER, this.gl.RGB16UI], [this.gl.RGBA_INTEGER, this.gl.RGBA16UI], [this.gl.DEPTH_COMPONENT, this.gl.DEPTH_COMPONENT16]]],
        [this.gl.SHORT, [[this.gl.RED_INTEGER, this.gl.R16I], [this.gl.RG_INTEGER, this.gl.RG16I], [this.gl.RGB_INTEGER, this.gl.RGB16I], [this.gl.RGBA_INTEGER, this.gl.RGBA16I]]],
        [this.gl.UNSIGNED_INT, [[this.gl.RED_INTEGER, this.gl.R32UI], [this.gl.RG_INTEGER, this.gl.RG32UI], [this.gl.RGB_INTEGER, this.gl.RGB32UI], [this.gl.RGBA_INTEGER, this.gl.RGBA32UI], [this.gl.DEPTH_COMPONENT, this.gl.DEPTH_COMPONENT24]]],
        [this.gl.INT, [[this.gl.RED_INTEGER, this.gl.R32I], [this.gl.RG_INTEGER, this.gl.RG32I], [this.gl.RGB_INTEGER, this.gl.RGB32I], [this.gl.RGBA_INTEGER, this.gl.RGBA32I]]],
        [this.gl.HALF_FLOAT, [[this.gl.RED, this.gl.R16F], [this.gl.RG, this.gl.RG16F], [this.gl.RGB, this.gl.RGB16F], [this.gl.RGBA, this.gl.RGBA16F]]],
        [this.gl.FLOAT, [[this.gl.RED, this.gl.R32F], [this.gl.RG, this.gl.RG32F], [this.gl.RGB, this.gl.RGB32F], [this.gl.RGBA, this.gl.RGBA32F], [this.gl.DEPTH_COMPONENT, this.gl.DEPTH_COMPONENT32F]]],
        [this.gl.UNSIGNED_SHORT_5_6_5, [[this.gl.RGB, this.gl.RGB565]]],
        [this.gl.UNSIGNED_SHORT_4_4_4_4, [[this.gl.RGBA, this.gl.RGBA4]]],
        [this.gl.UNSIGNED_SHORT_5_5_5_1, [[this.gl.RGBA, this.gl.RGB5_A1]]],
        [this.gl.UNSIGNED_INT_2_10_10_10_REV, [[this.gl.RGBA, this.gl.RGB10_A2]]],
        [this.gl.UNSIGNED_INT_10F_11F_11F_REV, [[this.gl.RGB, this.gl.R11F_G11F_B10F]]],
        [this.gl.UNSIGNED_INT_5_9_9_9_REV, [[this.gl.RGB, this.gl.RGB9_E5]]],
        [this.gl.UNSIGNED_INT_24_8, [[this.gl.DEPTH_STENCIL, this.gl.DEPTH24_STENCIL8]]],
        [this.gl.FLOAT_32_UNSIGNED_INT_24_8_REV, [[this.gl.DEPTH_STENCIL, this.gl.DEPTH32F_STENCIL8]]]
      ];
      this._FormatTypeMap_Ext2Int = new Map();
      for (const [elemType, formats] of _FormatTypeMap_Ext2Int_Raw) {
        const formatMap = new Map<number, number>();
        for (const [extFormat, intFormat] of formats) formatMap.set(extFormat, intFormat);
        this._FormatTypeMap_Ext2Int.set(elemType, formatMap);
      }

      const _FormatTypeMap_Ext2Str_Raw: { [name: string]: number } = {
        "GL_RED": this.gl.RED,
        "GL_RED_INTEGER": this.gl.RED_INTEGER,
        "GL_RG": this.gl.RG,
        "GL_RG_INTEGER": this.gl.RG_INTEGER,
        "GL_RGB": this.gl.RGB,
        "GL_RGB_INTEGER": this.gl.RGB_INTEGER,
        "GL_RGBA": this.gl.RGBA,
        "GL_RGBA_INTEGER": this.gl.RGBA_INTEGER,
        "GL_DEPTH_COMPONENT": this.gl.DEPTH_COMPONENT,
        "GL_DEPTH_STENCIL": this.gl.DEPTH_STENCIL
      }
      this._FormatTypeMap_Ext2Str = new Map();
      for (const [name, value] of Object.entries(_FormatTypeMap_Ext2Str_Raw)) this._FormatTypeMap_Ext2Str.set(value, name);
    };

    this.frameID = null;
    this.cbRender = () => { };

    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.stop();
    }, false);
    this.canvas.addEventListener("webglcontextrestored", initContext, false);
    this.canvas.addEventListener("webglcontextcreationerror", (e) => { console.error((e as WebGLContextEvent).statusMessage || "WebGL context creation error: unknown error."); });

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
    for (const name of attribNames) result[name] = this.gl.getUniformBlockIndex(program, name)!;
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
    return null;
  }
  texImage2D(target: number, level: number, width: number, height: number, format: number, srcData: ArrayBufferView<ArrayBufferLike>) {
    const elementType = this.getGLArrayElementType(srcData);
    // @ts-ignore
    if (!elementType) throw new Error(`Unsupported data format: ${srcData[Symbol.toStringTag] as string}`);
    const internalFormat = this.getGLTexInternalFormat(format, elementType);
    // @ts-ignore
    if (!internalFormat) throw new Error(`No available internal format for ${srcData[Symbol.toStringTag] as string} and ${this._FormatTypeMap_Ext2Str.get(format) ?? "unknown"}.`);
    if (this.gl.HALF_FLOAT == elementType) srcData = new Uint16Array(srcData.buffer); // patch for Float16Array
    this.gl.texImage2D(target, level, internalFormat, width, height, 0, format, elementType, srcData);
  }
  texImage3D(target: number, level: number, width: number, height: number, depth: number, format: number, srcData: ArrayBufferView<ArrayBufferLike>) {
    const elementType = this.getGLArrayElementType(srcData);
    // @ts-ignore
    if (!elementType) throw new Error('Unsupported data format: ' + srcData[Symbol.toStringTag] as string);
    const internalFormat = this.getGLTexInternalFormat(format, elementType);
    // @ts-ignore
    if (!internalFormat) throw new Error(`No available internal format for ${srcData[Symbol.toStringTag] as string} and ${this._FormatTypeMap_Ext2Str.get(format) ?? "unknown"}.`);
    if (this.gl.HALF_FLOAT == elementType) srcData = new Uint16Array(srcData.buffer); // patch for Float16Array
    this.gl.texImage3D(target, level, internalFormat, width, height, depth, 0, format, elementType, srcData);
  }
  run(fn: (device: GLDevice) => void, syncMedia?: HTMLVideoElement) {
    this.running = true;
    this.cbRender = fn;
    if (syncMedia && syncMedia instanceof HTMLVideoElement) {
      this.syncMedia = syncMedia;
      const fnWrapper = (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
        if (this.running) {
          this.syncMediaTime = metadata.mediaTime;
          this.cbRender(this);
          this.frameID = syncMedia.requestVideoFrameCallback(fnWrapper);
        }
      };
      this.syncMediaTime = syncMedia.currentTime;
      this.cbRender(this);
      syncMedia.requestVideoFrameCallback(fnWrapper);
    }
    else {
      const fnWrapper = () => {
        if (this.running) {
          this.cbRender(this);
          this.frameID = requestAnimationFrame(fnWrapper);
        }
      };
      fnWrapper();
    }
  }
  refresh() { this.cbRender(this); }
  getSyncMediaTime(): number | null { return this.syncMediaTime; }
  stop() {
    if (null !== this.frameID) {
      if (this.syncMedia) {
        this.syncMedia.cancelVideoFrameCallback(this.frameID);
        this.syncMedia = null;
        this.syncMediaTime = null;
      }
      else cancelAnimationFrame(this.frameID);
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
    // 1. 防止重复销毁
    if (this._isDestroyed || !this.gl) {
      return;
    }

    const gl = this.gl;

    try {
      // 主动丢失WebGL上下文（关键：通知浏览器回收上下文）
      const loseExtension = gl.getExtension("WEBGL_lose_context");
      if (loseExtension) {
        loseExtension.loseContext(); // 触发上下文丢失，释放浏览器级资源
      }

      // 清理画布状态
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.flush(); // 确保所有渲染命令执行完毕

      // 清除DOM/引用（助力垃圾回收）
      if (this.canvas) {
        // 可选：从DOM移除画布（根据业务需求决定是否保留）
        // this.canvas.remove();
        // 清空画布内容
        const ctx2d = this.canvas.getContext("2d");
        if (ctx2d) {
          ctx2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
      }

      // 标记上下文为null，防止后续误调用
      this.gl = null;
      this._isDestroyed = true;

    } catch (error) {
      // 即使出错，也标记为销毁（避免重复尝试）
      this._isDestroyed = true;
    }
  }

}