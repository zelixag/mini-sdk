// @ts-nocheck
/**
 * GLDevice - WebGL2 设备封装（小程序版）
 *
 * 与 Web SDK 的主要差异：
 * 1. 构造函数直接接收 WebGL2RenderingContext，不再从 canvas 创建
 * 2. 无 DOM 事件监听（webglcontextlost/restored）
 * 3. texImage2D 仅接受 TypedArray，不接受 HTMLImageElement/HTMLVideoElement
 * 4. 无 VideoFrameCallback，由外部 RAF 驱动
 * 5. 新增 uploadPixelTexture() 用于上传原始 RGBA 像素数据
 * 6. 无 Float16Array 支持（小程序环境不提供）
 */

import { createModuleLogger } from '../utils/logger'

const log = createModuleLogger('GLDevice')

export class GLDevice {
  gl: WebGL2RenderingContext
  canvas: any  // WX Canvas node

  private _ElementTypeMap_JS2GL!: { readonly [index: string]: number }
  private _FormatTypeMap_Ext2Int!: Map<number, Map<number, number>>
  private _FormatTypeMap_Ext2Str!: Map<number, string>
  private shaderStage!: { readonly [index: string]: number }
  private _destroyed = false

  constructor(gl: WebGL2RenderingContext, canvas: any) {
    this.gl = gl
    this.canvas = canvas
    this._initMaps()
  }

  private _initMaps(): void {
    const gl = this.gl

    this.shaderStage = {
      'vertex': gl.VERTEX_SHADER,
      'fragment': gl.FRAGMENT_SHADER
    }

    this._ElementTypeMap_JS2GL = {
      'Uint8Array': gl.UNSIGNED_BYTE,
      'Uint8ClampedArray': gl.UNSIGNED_BYTE,
      'Int8Array': gl.BYTE,
      'Uint16Array': gl.UNSIGNED_SHORT,
      'Int16Array': gl.SHORT,
      'Uint32Array': gl.UNSIGNED_INT,
      'Int32Array': gl.INT,
      'Float32Array': gl.FLOAT
    }

    // Build format map: elementType -> (externalFormat -> internalFormat)
    const _FormatTypeMap_Ext2Int_Raw: [number, [number, number][]][] = [
      [gl.UNSIGNED_BYTE, [
        [gl.RED, gl.R8], [gl.RED_INTEGER, gl.R8UI],
        [gl.RG, gl.RG8], [gl.RG_INTEGER, gl.RG8UI],
        [gl.RGB, gl.RGB8], [gl.RGB_INTEGER, gl.RGB8UI],
        [gl.RGBA, gl.RGBA8], [gl.RGBA_INTEGER, gl.RGBA8UI]
      ]],
      [gl.BYTE, [
        [gl.RED, gl.R8_SNORM], [gl.RED_INTEGER, gl.R8I],
        [gl.RG, gl.RG8_SNORM], [gl.RG_INTEGER, gl.RG8I],
        [gl.RGB, gl.RGB8_SNORM], [gl.RGB_INTEGER, gl.RGB8I],
        [gl.RGBA, gl.RGBA8_SNORM], [gl.RGBA_INTEGER, gl.RGBA8I]
      ]],
      [gl.UNSIGNED_SHORT, [
        [gl.RED_INTEGER, gl.R16UI], [gl.RG_INTEGER, gl.RG16UI],
        [gl.RGB_INTEGER, gl.RGB16UI], [gl.RGBA_INTEGER, gl.RGBA16UI],
        [gl.DEPTH_COMPONENT, gl.DEPTH_COMPONENT16]
      ]],
      [gl.SHORT, [
        [gl.RED_INTEGER, gl.R16I], [gl.RG_INTEGER, gl.RG16I],
        [gl.RGB_INTEGER, gl.RGB16I], [gl.RGBA_INTEGER, gl.RGBA16I]
      ]],
      [gl.UNSIGNED_INT, [
        [gl.RED_INTEGER, gl.R32UI], [gl.RG_INTEGER, gl.RG32UI],
        [gl.RGB_INTEGER, gl.RGB32UI], [gl.RGBA_INTEGER, gl.RGBA32UI],
        [gl.DEPTH_COMPONENT, gl.DEPTH_COMPONENT24]
      ]],
      [gl.INT, [
        [gl.RED_INTEGER, gl.R32I], [gl.RG_INTEGER, gl.RG32I],
        [gl.RGB_INTEGER, gl.RGB32I], [gl.RGBA_INTEGER, gl.RGBA32I]
      ]],
      [gl.FLOAT, [
        [gl.RED, gl.R32F], [gl.RG, gl.RG32F],
        [gl.RGB, gl.RGB32F], [gl.RGBA, gl.RGBA32F],
        [gl.DEPTH_COMPONENT, gl.DEPTH_COMPONENT32F]
      ]]
    ]
    this._FormatTypeMap_Ext2Int = new Map()
    for (const [elemType, formats] of _FormatTypeMap_Ext2Int_Raw) {
      const formatMap = new Map<number, number>()
      for (const [extFormat, intFormat] of formats) formatMap.set(extFormat, intFormat)
      this._FormatTypeMap_Ext2Int.set(elemType, formatMap)
    }

    const _FormatTypeMap_Ext2Str_Raw: { [name: string]: number } = {
      'GL_RED': gl.RED,
      'GL_RED_INTEGER': gl.RED_INTEGER,
      'GL_RG': gl.RG,
      'GL_RG_INTEGER': gl.RG_INTEGER,
      'GL_RGB': gl.RGB,
      'GL_RGB_INTEGER': gl.RGB_INTEGER,
      'GL_RGBA': gl.RGBA,
      'GL_RGBA_INTEGER': gl.RGBA_INTEGER,
      'GL_DEPTH_COMPONENT': gl.DEPTH_COMPONENT,
      'GL_DEPTH_STENCIL': gl.DEPTH_STENCIL
    }
    this._FormatTypeMap_Ext2Str = new Map()
    for (const [name, value] of Object.entries(_FormatTypeMap_Ext2Str_Raw)) {
      this._FormatTypeMap_Ext2Str.set(value, name)
    }
  }

  // ========== Shader compilation ==========

  compileShaderProgram(shaders: { readonly [index: string]: string }): WebGLProgram {
    const gl = this.gl
    const shaderProgram = gl.createProgram()
    if (!shaderProgram) throw new Error('WebGL shader program creation failed.')

    for (const [stage, code] of Object.entries(shaders)) {
      const shader = gl.createShader(this.shaderStage[stage])
      if (!shader) throw new Error('WebGL shader creation failed.')
      gl.shaderSource(shader, code)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const compileLog = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error('WebGL shader compile failed: ' + compileLog)
      }
      gl.attachShader(shaderProgram, shader)
    }

    gl.linkProgram(shaderProgram)
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      const linkLog = gl.getProgramInfoLog(shaderProgram)
      gl.deleteProgram(shaderProgram)
      throw new Error('WebGL shader link failed: ' + linkLog)
    }

    return shaderProgram
  }

  // ========== Uniform locations ==========

  getShaderProgramUniformLocation(program: WebGLProgram, attribNames: Array<string>): { [index: string]: WebGLUniformLocation } {
    const result: { [index: string]: WebGLUniformLocation } = {}
    for (const name of attribNames) result[name] = this.gl.getUniformLocation(program, name)!
    return result
  }

  getShaderProgramUniformBlockLocation(program: WebGLProgram, attribNames: Array<string>): { [index: string]: GLint } {
    const result: { [index: string]: GLint } = {}
    for (const name of attribNames) result[name] = this.gl.getUniformBlockIndex(program, name)!
    return result
  }

  getShaderProgramAttribLocation(program: WebGLProgram, attribNames: Array<string>): { [index: string]: GLint } {
    const result: { [index: string]: GLint } = {}
    for (const name of attribNames) result[name] = this.gl.getAttribLocation(program, name)!
    return result
  }

  // ========== Type / format mapping ==========

  getGLArrayElementType(arr: ArrayBufferView): number | null {
    const tag = arr[Symbol.toStringTag] as string
    if (tag in this._ElementTypeMap_JS2GL) return this._ElementTypeMap_JS2GL[tag]
    return null
  }

  getGLTexInternalFormat(externalFormat: number, elementType: number): number | null {
    const formats = this._FormatTypeMap_Ext2Int.get(elementType)
    if (formats) {
      const internalFormat = formats.get(externalFormat)
      if (internalFormat) return internalFormat
    }
    return null
  }

  // ========== Texture upload (TypedArray only, no HTMLImageElement) ==========

  /**
   * Upload 2D texture from TypedArray data.
   * This replaces the Web SDK's texImage2D which could accept HTMLImageElement.
   */
  texImage2D(target: number, level: number, width: number, height: number, format: number, srcData: ArrayBufferView): void {
    const elementType = this.getGLArrayElementType(srcData)
    if (!elementType) throw new Error(`Unsupported data format: ${srcData[Symbol.toStringTag] as string}`)
    const internalFormat = this.getGLTexInternalFormat(format, elementType)
    if (!internalFormat) throw new Error(`No available internal format for ${srcData[Symbol.toStringTag] as string} and ${this._FormatTypeMap_Ext2Str.get(format) ?? 'unknown'}.`)
    this.gl.texImage2D(target, level, internalFormat, width, height, 0, format, elementType, srcData)
  }

  /**
   * Upload 3D texture (TEXTURE_2D_ARRAY / TEXTURE_3D) from TypedArray.
   */
  texImage3D(target: number, level: number, width: number, height: number, depth: number, format: number, srcData: ArrayBufferView): void {
    const elementType = this.getGLArrayElementType(srcData)
    if (!elementType) throw new Error('Unsupported data format: ' + srcData[Symbol.toStringTag] as string)
    const internalFormat = this.getGLTexInternalFormat(format, elementType)
    if (!internalFormat) throw new Error(`No available internal format for ${srcData[Symbol.toStringTag] as string} and ${this._FormatTypeMap_Ext2Str.get(format) ?? 'unknown'}.`)
    this.gl.texImage3D(target, level, internalFormat, width, height, depth, 0, format, elementType, srcData)
  }

  /**
   * Upload raw RGBA pixel data as a TEXTURE_2D.
   * Convenience method for uploading decoded body video frame pixels.
   *
   * @param texture - target WebGL texture
   * @param data    - RGBA pixel data
   * @param width   - pixel width
   * @param height  - pixel height
   */
  uploadPixelTexture(texture: WebGLTexture, data: Uint8Array, width: number, height: number): void {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  }

  /**
   * Upload raw RGBA pixels to a texture using texSubImage2D (faster for same-size updates).
   */
  uploadPixelTextureSubImage(texture: WebGLTexture, data: Uint8Array, width: number, height: number): void {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data)
  }

  // ========== Frame readback ==========

  captureFrame(): { width: number; height: number; data: Uint8ClampedArray } {
    const width = this.canvas.width
    const height = this.canvas.height
    const pixelData = new Uint8ClampedArray(width * height * 4)
    this.gl.readPixels(0, 0, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixelData)
    return { width, height, data: pixelData }
  }

  // ========== Lifecycle ==========

  destroy(): void {
    if (this._destroyed || !this.gl) return
    this._destroyed = true

    try {
      const gl = this.gl
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
      gl.flush()

      // 尝试主动丢失上下文以释放GPU资源
      const loseExtension = gl.getExtension('WEBGL_lose_context')
      if (loseExtension) {
        loseExtension.loseContext()
      }
    } catch (e) {
      log.warn('GLDevice destroy error (ignored):', e)
    }

    this.gl = null as any
  }

  get isDestroyed(): boolean {
    return this._destroyed
  }
}
