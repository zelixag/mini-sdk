/**
 * 小程序网络请求适配器（熵减优化）
 * 
 * 说明：这是适配层，将小程序 API（wx.request）适配为 Web 标准 API（fetch）。
 * Web SDK 核心代码使用 fetch，但小程序环境不支持 fetch，因此我们提供这个适配器：
 * - 内部使用：wx.request（小程序 API）
 * - 对外暴露：fetch API（Web 标准）
 * - 目的：让 Web SDK 核心代码可以在小程序环境无缝运行
 * 
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，纯适配逻辑，无业务逻辑
 * 2. 系统秩序：清晰的配置管理、拦截器链、重试机制
 * 3. 抽象层次：隐藏 wx.request 细节，提供标准 fetch 接口给 Web SDK
 * 4. 负熵实现：统一错误处理、可配置、可扩展
 */

/// <reference path="../types/wechat.d.ts" />

import { ErrorHandler, SDKError } from './ErrorHandler';
import { EErrorCode } from '../types/error';

// 请求拦截器类型
export type RequestInterceptor = (url: string, options?: RequestInit) => [string, RequestInit?] | Promise<[string, RequestInit?]>;
export type ResponseInterceptor = (response: Response) => Response | Promise<Response>;
export type ErrorInterceptor = (error: SDKError) => SDKError | Promise<SDKError>;

// 请求配置
export interface RequestAdapterOptions {
  timeout?: number; // 超时时间（毫秒），默认 90000
  retryCount?: number; // 重试次数，默认 0
  retryDelay?: number; // 重试延迟（毫秒），默认 1000
  retryableStatusCodes?: number[]; // 可重试的状态码，默认 [408, 429, 500, 502, 503, 504]
  requestInterceptors?: RequestInterceptor[];
  responseInterceptors?: ResponseInterceptor[];
  errorInterceptors?: ErrorInterceptor[];
  errorHandler?: ErrorHandler;
}

// 默认配置
const DEFAULT_OPTIONS: Required<RequestAdapterOptions> = {
  timeout: 90000,
  retryCount: 0,
  retryDelay: 1000,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  requestInterceptors: [],
  responseInterceptors: [],
  errorInterceptors: [],
  errorHandler: new ErrorHandler()
};

// 全局配置
let globalOptions: Required<RequestAdapterOptions> = { ...DEFAULT_OPTIONS };

/**
 * 设置全局配置
 */
export function setRequestAdapterOptions(options: Partial<RequestAdapterOptions>): void {
  globalOptions = {
    ...globalOptions,
    ...options,
    requestInterceptors: options.requestInterceptors || globalOptions.requestInterceptors,
    responseInterceptors: options.responseInterceptors || globalOptions.responseInterceptors,
    errorInterceptors: options.errorInterceptors || globalOptions.errorInterceptors,
  };
}

/**
 * 获取全局配置
 */
export function getRequestAdapterOptions(): Required<RequestAdapterOptions> {
  return { ...globalOptions };
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(statusCode: number, retryableStatusCodes: number[]): boolean {
  return retryableStatusCodes.includes(statusCode);
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 指数退避重试延迟
 */
function getRetryDelay(attempt: number, baseDelay: number): number {
  return baseDelay * Math.pow(2, attempt);
}

/**
 * 创建兼容 Response 接口的纯对象（小程序无 Response/Headers，不依赖全局）
 */
function createResponseLike(body: string, status: number, statusText: string, header: Record<string, string>): { ok: boolean; status: number; statusText: string; headers: { get(name: string): string | null }; json(): Promise<any>; text(): Promise<string> } {
  const ok = status >= 200 && status < 300;
  const headersStore: Record<string, string> = header || {};
  return {
    ok,
    status,
    statusText,
    headers: {
      get(name: string): string | null {
        const key = String(name).toLowerCase();
        const v = headersStore[key];
        return v === undefined ? null : v;
      }
    },
    async json(): Promise<any> {
      if (!body) return null;
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    },
    async text(): Promise<string> {
      return body;
    }
  };
}

/**
 * 小程序网络请求适配器（核心实现）
 */
export async function mpRequest(
  url: string,
  options?: RequestInit,
  adapterOptions?: Partial<RequestAdapterOptions>
): Promise<Response> {
  const opts = { ...globalOptions, ...adapterOptions };
  const errorHandler = opts.errorHandler || new ErrorHandler();
  
  // 应用请求拦截器
  let finalUrl = url;
  let finalOptions = options || {};
  
  for (const interceptor of opts.requestInterceptors) {
    try {
      const result = await interceptor(finalUrl, finalOptions);
      const [newUrl, newOptions] = result;
      finalUrl = newUrl;
      if (newOptions !== undefined) {
        finalOptions = newOptions;
      }
    } catch (error) {
      const sdkError = errorHandler.handle(error, {
        module: 'RequestAdapter',
        method: 'requestInterceptor',
        params: { url, options }
      });
      throw sdkError;
    }
  }

  // 重试逻辑
  let lastError: SDKError | null = null;
  
  for (let attempt = 0; attempt <= opts.retryCount; attempt++) {
    try {
      // 创建超时 Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timeout after ${opts.timeout}ms`));
        }, opts.timeout);
      });

      // 创建请求 Promise
      const requestPromise = new Promise<Response>(async (resolve, reject) => {
        // 转换 RequestInit 为 wx.request 参数
        const wxOptions: WechatMiniprogram.RequestOption = {
          url: finalUrl,
          method: (finalOptions.method as any) || 'GET',
          header: finalOptions.headers as Record<string, string> || {},
          data: finalOptions.body ?? undefined,
          success: async (res) => {
            try {
              // 创建 Response 兼容对象（不依赖全局 Response/Headers）
              const bodyStr = res.data ? (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)) : '';
              const headerObj = (res.header as Record<string, string>) || {};
              const response = createResponseLike(bodyStr, res.statusCode, res.errMsg || 'OK', headerObj);

              // 应用响应拦截器
              let finalResponse = response;
              for (const interceptor of opts.responseInterceptors) {
                try {
                  finalResponse = await interceptor(finalResponse);
                } catch (error) {
                  const sdkError = errorHandler.handle(error, {
                    module: 'RequestAdapter',
                    method: 'responseInterceptor',
                    params: { url, response }
                  });
                  reject(sdkError);
                  return;
                }
              }

              resolve(finalResponse);
            } catch (error) {
              const sdkError = errorHandler.handle(error, {
                module: 'RequestAdapter',
                method: 'successHandler',
                params: { url, res }
              });
              reject(sdkError);
            }
          },
          fail: async (err: WechatMiniprogram.GeneralCallbackResult) => {
            const error = errorHandler.handle({
              code: EErrorCode.NETWORK_BREAK,
              message: err.errMsg || 'Request failed',
              timestamp: Date.now(),
              details: err
            }, {
              module: 'RequestAdapter',
              method: 'wx.request',
              params: { url: finalUrl, options: finalOptions }
            });

            // 应用错误拦截器
            let finalError = error;
            for (const interceptor of opts.errorInterceptors) {
              try {
                finalError = await interceptor(finalError);
              } catch (interceptorError) {
                // 拦截器错误不处理，使用原错误
                break;
              }
            }

            reject(finalError);
          }
        };

        wx.request(wxOptions);
      });

      // 等待请求完成或超时
      const response = await Promise.race([requestPromise, timeoutPromise]);

      // 检查响应状态
      if (!response.ok) {
        const statusCode = response.status;
        
        // 判断是否可重试
        if (attempt < opts.retryCount && isRetryableError(statusCode, opts.retryableStatusCodes)) {
          // 计算重试延迟
          const retryDelay = getRetryDelay(attempt, opts.retryDelay);
          await delay(retryDelay);
          continue; // 重试
        }

        // 不可重试或重试次数用完，抛出错误
        const error = errorHandler.handle({
          code: EErrorCode.NETWORK_BREAK,
          message: `HTTP error! status: ${statusCode}`,
          timestamp: Date.now(),
          details: { statusCode, statusText: response.statusText }
        }, {
          module: 'RequestAdapter',
          method: 'mpRequest',
          params: { url: finalUrl, statusCode }
        });

        throw error;
      }

      return response;

    } catch (error) {
      lastError = error as SDKError;

      // 判断是否可重试
      if (attempt < opts.retryCount) {
        // 计算重试延迟
        const retryDelay = getRetryDelay(attempt, opts.retryDelay);
        await delay(retryDelay);
        continue; // 重试
      }

      // 重试次数用完，抛出最后一个错误
      throw lastError;
    }
  }

  // 理论上不会执行到这里
  throw lastError || new Error('Request failed');
}

/**
 * 取消请求的 AbortController（小程序环境 polyfill）
 * 
 * 说明：小程序环境不支持 AbortController，但为了适配 Web SDK（需要 fetch + AbortSignal），
 * 我们提供这个 polyfill 实现。内部使用小程序 API，对外暴露 Web 标准 API。
 * 
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，仅处理请求取消逻辑
 * 2. 系统秩序：使用 Object.defineProperty 实现符合 Web 标准的 AbortSignal 接口
 * 3. 抽象层次：隐藏小程序平台差异，提供标准 Web API 给上层 Web SDK 使用
 * 4. 负熵实现：通过 getter 访问内部状态，确保类型安全，符合 Web 标准
 */
export class AbortController {
  private _aborted = false;
  private _signal: AbortSignal;

  constructor() {
    // 创建信号对象，使用 defineProperty 定义可写的 aborted 属性
    const signal = {} as AbortSignal;
    Object.defineProperty(signal, 'aborted', {
      get: () => this._aborted,
      enumerable: true,
      configurable: false
    });
    Object.defineProperty(signal, 'onabort', {
      value: null,
      writable: true,
      enumerable: true,
      configurable: true
    });
    this._signal = signal;
  }

  get signal(): AbortSignal {
    return this._signal;
  }

  abort(): void {
    if (this._aborted) return;
    this._aborted = true;
    // 触发 onabort 回调（标准 API 需要一个 Event 参数）
    if (this._signal.onabort) {
      const event = new Event('abort');
      this._signal.onabort.call(this._signal, event);
    }
  }
}

/**
 * 设置全局 fetch（小程序环境）
 */
export function setGlobalFetch(): void {
  if (typeof globalThis !== 'undefined') {
    // 保存原始的 fetch（如果存在）
    if (!(globalThis as any).__originalFetch) {
      (globalThis as any).__originalFetch = globalThis.fetch;
    }

    // 设置小程序适配的 fetch
    globalThis.fetch = mpRequest as any;
  }
}
