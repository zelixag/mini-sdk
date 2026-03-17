/**
 * 网络请求适配器
 *
 * 基于 wx.request / wx.downloadFile 封装 Promise 风格的 HTTP 请求，
 * 并提供网络状态监听能力。
 */

import { createModuleLogger } from '../utils/logger'

const log = createModuleLogger('Network')

// ---------- 类型定义 ----------

export interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  headers?: Record<string, string>
  responseType?: 'text' | 'arraybuffer'
  timeout?: number
}

export interface RequestResponse<T = any> {
  statusCode: number
  data: T
  header: Record<string, string>
}

// ---------- HTTP 请求 ----------

/**
 * Promise 风格的 HTTP 请求
 */
export function request<T = any>(options: RequestOptions): Promise<RequestResponse<T>> {
  return new Promise((resolve, reject) => {
    const reqTask = wx.request({
      url: options.url,
      method: (options.method || 'GET') as any,
      data: options.data,
      header: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      responseType: options.responseType || 'text',
      timeout: options.timeout || 180000,  // 3分钟
      success(res: any) {
        resolve({
          statusCode: res.statusCode,
          data: res.data as T,
          header: res.header || {},
        })
      },
      fail(err: any) {
        log.error('请求失败:', options.url, err.errMsg || err)
        reject(err)
      },
    })

    // 返回的 reqTask 可用于 abort，暂不暴露
    void reqTask
  })
}

/**
 * GET 请求快捷方式
 */
export function get<T = any>(
  url: string,
  headers?: Record<string, string>,
  timeout?: number,
): Promise<RequestResponse<T>> {
  return request<T>({ url, method: 'GET', headers, timeout })
}

/**
 * POST 请求快捷方式
 */
export function post<T = any>(
  url: string,
  data?: any,
  headers?: Record<string, string>,
  timeout?: number,
): Promise<RequestResponse<T>> {
  return request<T>({ url, method: 'POST', data, headers, timeout })
}

// ---------- 文件下载 ----------

/**
 * 下载文件到临时路径
 */
export function downloadFile(
  url: string,
  headers?: Record<string, string>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      header: headers,
      success(res: any) {
        if (res.statusCode === 200) {
          resolve(res.tempFilePath)
        } else {
          reject(new Error(`下载失败，状态码: ${res.statusCode}`))
        }
      },
      fail(err: any) {
        log.error('下载失败:', url, err.errMsg || err)
        reject(err)
      },
    })
  })
}

/**
 * 下载文件并以 ArrayBuffer 形式返回
 */
export function downloadAsBuffer(
  url: string,
  timeout: number = 180000,  // 3分钟
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout,
      success(res: any) {
        if (res.statusCode === 200) {
          resolve(res.data as ArrayBuffer)
        } else {
          reject(new Error(`下载失败，状态码: ${res.statusCode}`))
        }
      },
      fail(err: any) {
        log.error('下载 ArrayBuffer 失败:', url, err.errMsg || err)
        reject(err)
      },
    })
  })
}

// ---------- 网络状态 ----------

/**
 * 获取当前网络类型
 * @returns 'wifi' | '2g' | '3g' | '4g' | '5g' | 'unknown' | 'none'
 */
export function getNetworkType(): Promise<string> {
  return new Promise((resolve) => {
    wx.getNetworkType({
      success(res: any) {
        resolve(res.networkType)
      },
      fail() {
        resolve('none')
      },
    })
  })
}

/**
 * 监听网络状态变化
 */
export function onNetworkChange(
  callback: (isConnected: boolean, networkType: string) => void,
): void {
  wx.onNetworkStatusChange((res: any) => {
    log.info(`网络状态变化: ${res.networkType}, 已连接: ${res.isConnected}`)
    callback(res.isConnected, res.networkType)
  })
}

/**
 * 判断当前是否有网络
 */
export async function isOnline(): Promise<boolean> {
  const type = await getNetworkType()
  return type !== 'none'
}
