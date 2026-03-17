/**
 * 环境检测与 Polyfill
 *
 * 微信小程序没有 window、document、DOM API。
 * 此模块提供：
 * - 小程序环境检测
 * - requestAnimationFrame polyfill（基于 canvas 或 setTimeout 降级）
 * - TextDecoder polyfill
 * - 系统信息获取
 */

// ---------- 环境检测 ----------

export function isMiniProgram(): boolean {
  return typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function'
}

// ---------- requestAnimationFrame / cancelAnimationFrame ----------

let _raf: ((cb: FrameRequestCallback) => number) | null = null
let _caf: ((id: number) => void) | null = null

/**
 * 使用 canvas node 初始化 RAF。
 * 小程序中只有 canvas.requestAnimationFrame 才能与屏幕刷新率同步，
 * 必须在获取到 canvas node 后尽早调用。
 */
export function initRAF(canvas: any): void {
  if (canvas && typeof canvas.requestAnimationFrame === 'function') {
    _raf = (cb) => canvas.requestAnimationFrame(cb)
    _caf = (id) => {
      if (typeof canvas.cancelAnimationFrame === 'function') {
        canvas.cancelAnimationFrame(id)
      }
    }
  } else {
    // 降级到 setTimeout ~60fps
    _raf = (cb) => setTimeout(() => cb(Date.now()), 16) as unknown as number
    _caf = (id) => clearTimeout(id)
  }
}

/**
 * 跨平台 requestAnimationFrame。
 * 如果尚未调用 initRAF，自动使用 setTimeout 降级。
 */
export function raf(cb: FrameRequestCallback): number {
  if (!_raf) {
    return setTimeout(() => cb(Date.now()), 16) as unknown as number
  }
  return _raf(cb)
}

/**
 * 跨平台 cancelAnimationFrame
 */
export function caf(id: number): void {
  if (_caf) {
    _caf(id)
  } else {
    clearTimeout(id)
  }
}

// ---------- TextDecoder polyfill ----------

/**
 * 获取 TextDecoder 实例。
 * 部分基础库版本缺少 TextDecoder，这里提供一个仅支持 UTF-8 的简易 polyfill。
 */
export function getTextDecoder(encoding: string = 'utf-8'): { decode(input: ArrayBuffer | Uint8Array): string } {
  // 优先使用原生
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder(encoding)
  }

  // 简易 UTF-8 polyfill
  return {
    decode(input: ArrayBuffer | Uint8Array): string {
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
      const len = bytes.length
      let result = ''
      let i = 0

      while (i < len) {
        const byte1 = bytes[i++]
        if (byte1 < 0x80) {
          result += String.fromCharCode(byte1)
        } else if (byte1 < 0xe0) {
          const byte2 = bytes[i++] & 0x3f
          result += String.fromCharCode(((byte1 & 0x1f) << 6) | byte2)
        } else if (byte1 < 0xf0) {
          const byte2 = bytes[i++] & 0x3f
          const byte3 = bytes[i++] & 0x3f
          result += String.fromCharCode(((byte1 & 0x0f) << 12) | (byte2 << 6) | byte3)
        } else {
          // 4-byte sequence -> surrogate pair
          const byte2 = bytes[i++] & 0x3f
          const byte3 = bytes[i++] & 0x3f
          const byte4 = bytes[i++] & 0x3f
          const codePoint = ((byte1 & 0x07) << 18) | (byte2 << 12) | (byte3 << 6) | byte4
          const offset = codePoint - 0x10000
          result += String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff))
        }
      }

      return result
    },
  }
}

// ---------- 系统信息 ----------

let _cachedSystemInfo: WechatMiniprogram.SystemInfo | null = null

/**
 * 获取系统信息（带缓存，避免重复同步调用）
 */
export function getSystemInfo(): WechatMiniprogram.SystemInfo {
  if (!_cachedSystemInfo) {
    _cachedSystemInfo = wx.getSystemInfoSync()
  }
  return _cachedSystemInfo
}

/**
 * 清除系统信息缓存（在需要刷新时调用，如屏幕旋转后）
 */
export function clearSystemInfoCache(): void {
  _cachedSystemInfo = null
}

/**
 * 获取设备像素比
 */
export function getDevicePixelRatio(): number {
  return getSystemInfo().pixelRatio || 2
}

/**
 * 判断是否为 iOS 设备
 */
export function isIOS(): boolean {
  const sys = getSystemInfo()
  return sys.platform === 'ios'
}

/**
 * 判断是否为开发者工具
 */
export function isDevTools(): boolean {
  const sys = getSystemInfo()
  return sys.platform === 'devtools'
}
