/**
 * Canvas 适配器
 *
 * 通过 wx.createSelectorQuery 获取 canvas node，
 * 创建 WebGL2（或 WebGL1 降级）上下文，管理画布尺寸。
 */

import { createModuleLogger } from '../utils/logger'

const log = createModuleLogger('Canvas')

export interface CanvasInfo {
  /** 微信 canvas node 对象 */
  canvas: any
  /** WebGL 渲染上下文 */
  gl: WebGL2RenderingContext | WebGLRenderingContext
  /** CSS 逻辑宽度（px） */
  width: number
  /** CSS 逻辑高度（px） */
  height: number
  /** 设备像素比 */
  dpr: number
  /** 是否为 WebGL2 */
  isWebGL2: boolean
}

/** WebGL 上下文创建参数 */
const GL_CONTEXT_ATTRS = {
  alpha: true,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
}

/**
 * 从组件/页面上下文中获取 canvas node 并初始化 WebGL。
 *
 * @param componentCtx - 自定义组件实例（this），如果在 Page 中使用则传 null
 * @param canvasId      - canvas 选择器，如 '#myCanvas'
 * @returns CanvasInfo
 */
export function getCanvasNode(
  componentCtx: any,
  canvasId: string,
): Promise<CanvasInfo> {
  return new Promise((resolve, reject) => {
    const query = componentCtx
      ? componentCtx.createSelectorQuery()
      : wx.createSelectorQuery()

    // 先获取 canvas node
    query
      .select(`#${canvasId}`)
      .node()
      .exec((res: any) => {
        if (!res || !res[0] || !res[0].node) {
          const msg = `Canvas node not found: ${canvasId}`
          log.error(msg)
          reject(new Error(msg))
          return
        }

        const canvasNode = res[0].node

        // 再获取尺寸
        const sizeQuery = componentCtx
          ? componentCtx.createSelectorQuery()
          : wx.createSelectorQuery()
        sizeQuery
          .select(`#${canvasId}`)
          .boundingClientRect()
          .exec((sizeRes: any) => {
            const dpr = (wx.getWindowInfo?.() ?? wx.getSystemInfoSync()).pixelRatio || 2
            const width = sizeRes && sizeRes[0] ? sizeRes[0].width : 300
            const height = sizeRes && sizeRes[0] ? sizeRes[0].height : 400

            // 尝试 WebGL2
            let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null
            let isWebGL2 = false

            gl = canvasNode.getContext('webgl2', GL_CONTEXT_ATTRS)
            if (gl) {
              isWebGL2 = true
            } else {
              gl = canvasNode.getContext('webgl', GL_CONTEXT_ATTRS)
              if (gl) {
                log.warn('WebGL2 不可用，降级到 WebGL1')
              }
            }

            if (!gl) {
              const msg = '当前设备不支持 WebGL'
              log.error(msg)
              reject(new Error(msg))
              return
            }

            // 设置 canvas buffer 物理尺寸
            canvasNode.width = width * dpr
            canvasNode.height = height * dpr

            log.info(
              `Canvas 就绪: ${width}x${height}, dpr=${dpr}, WebGL${isWebGL2 ? '2' : '1'}`,
            )

            resolve({ canvas: canvasNode, gl, width, height, dpr, isWebGL2 })
          })
      })
  })
}

/**
 * 更新 canvas 尺寸（页面 resize / onShow 时调用）
 */
export function updateCanvasSize(
  canvasInfo: CanvasInfo,
  width: number,
  height: number,
): void {
  canvasInfo.width = width
  canvasInfo.height = height
  canvasInfo.canvas.width = width * canvasInfo.dpr
  canvasInfo.canvas.height = height * canvasInfo.dpr
  canvasInfo.gl.viewport(0, 0, canvasInfo.canvas.width, canvasInfo.canvas.height)

  log.info(`Canvas 尺寸更新: ${width}x${height}`)
}

/**
 * 从 canvas node 创建离屏画布（用于纹理上传等场景）。
 * 部分基础库版本可能不支持 createOffscreenCanvas。
 */
export function createOffscreenCanvas(
  width: number,
  height: number,
): any | null {
  if (typeof wx.createOffscreenCanvas === 'function') {
    try {
      const offscreen = wx.createOffscreenCanvas({ type: '2d', width, height })
      return offscreen
    } catch (e) {
      log.warn('createOffscreenCanvas 失败:', e)
      return null
    }
  }
  return null
}
