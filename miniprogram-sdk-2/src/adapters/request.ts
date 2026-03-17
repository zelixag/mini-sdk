/**
 * Request Adapter for Mini Program
 * 封装 wx.request，提供 fetch 兼容接口
 */

declare const wx: any;

export interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS' | 'HEAD';
  headers?: Record<string, string>;
  body?: any;
  dataType?: 'json' | 'text' | 'base64';
  responseType?: 'text' | 'arraybuffer';
  timeout?: number;
}

export interface RequestResponse {
  data: any;
  statusCode: number;
  header: Record<string, string>;
  cookies: string[];
}

export interface RequestTask {
  abort: () => void;
  onChunkReceived: (callback: (res: any) => void) => void;
  offChunkReceived: (callback: (res: any) => void) => void;
  onProgressUpdate: (callback: (res: any) => void) => void;
  offProgressUpdate: (callback: (res: any) => void) => void;
}

/**
 * 发送网络请求
 */
export function request(options: RequestOptions): Promise<RequestResponse> {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    dataType = 'json',
    responseType = 'text',
    timeout = 30000
  } = options;

  return new Promise((resolve, reject) => {
    const task = wx.request({
      url,
      method,
      header: headers,
      data: body,
      dataType,
      responseType,
      timeout,
      success: (res: RequestResponse) => {
        // 添加 json 方法，兼容 fetch API
        res.json = () => {
          if (typeof res.data === 'string') {
            return Promise.resolve(JSON.parse(res.data));
          }
          return Promise.resolve(res.data);
        };

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res);
        } else {
          reject(new Error(`Request failed with status ${res.statusCode}`));
        }
      },
      fail: (err: any) => {
        reject(err);
      }
    });

    // 返回任务对象
    return {
      abort: () => task.abort(),
      onChunkReceived: (callback) => task.onChunkReceived(callback),
      offChunkReceived: (callback) => task.offChunkReceived(callback),
      onProgressUpdate: (callback) => task.onProgressUpdate(callback),
      offProgressUpdate: (callback) => task.offProgressUpdate(callback)
    };
  });
}

/**
 * GET 请求
 */
export function get(url: string, options?: Partial<RequestOptions>): Promise<RequestResponse> {
  return request({
    url,
    method: 'GET',
    ...options
  });
}

/**
 * POST 请求
 */
export function post(url: string, data?: any, options?: Partial<RequestOptions>): Promise<RequestResponse> {
  return request({
    url,
    method: 'POST',
    body: data,
    ...options
  });
}

/**
 * PUT 请求
 */
export function put(url: string, data?: any, options?: Partial<RequestOptions>): Promise<RequestResponse> {
  return request({
    url,
    method: 'PUT',
    body: data,
    ...options
  });
}

/**
 * DELETE 请求
 */
export function del(url: string, options?: Partial<RequestOptions>): Promise<RequestResponse> {
  return request({
    url,
    method: 'DELETE',
    ...options
  });
}

/**
 * 全局请求配置
 */
let globalHeaders: Record<string, string> = {};
let globalTimeout: number = 30000;

export function setGlobalHeaders(headers: Record<string, string>): void {
  globalHeaders = headers;
}

export function setGlobalTimeout(timeout: number): void {
  globalTimeout = timeout;
}

/**
 * mpRequest - 主要使用的请求函数
 * 封装签名等逻辑
 */
export async function mpRequest(url: string, options: RequestOptions): Promise<RequestResponse> {
  const headers = {
    ...globalHeaders,
    ...options.headers
  };

  return request({
    ...options,
    url,
    headers,
    timeout: options.timeout || globalTimeout
  });
}

// 导出 AbortController 兼容
export class AbortController {
  aborted = false;

  abort(): void {
    this.aborted = true;
  }
}

export class AbortError extends Error {
  constructor(message = 'The operation was aborted.') {
    super(message);
    this.name = 'AbortError';
  }
}

export default {
  request,
  get,
  post,
  put,
  delete: del,
  mpRequest,
  setGlobalHeaders,
  setGlobalTimeout,
  AbortController,
  AbortError
};
