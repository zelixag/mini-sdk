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
import { ErrorHandler, SDKError } from './ErrorHandler';
export type RequestInterceptor = (url: string, options?: RequestInit) => [string, RequestInit?] | Promise<[string, RequestInit?]>;
export type ResponseInterceptor = (response: Response) => Response | Promise<Response>;
export type ErrorInterceptor = (error: SDKError) => SDKError | Promise<SDKError>;
export interface RequestAdapterOptions {
    timeout?: number;
    retryCount?: number;
    retryDelay?: number;
    retryableStatusCodes?: number[];
    requestInterceptors?: RequestInterceptor[];
    responseInterceptors?: ResponseInterceptor[];
    errorInterceptors?: ErrorInterceptor[];
    errorHandler?: ErrorHandler;
}
/**
 * 设置全局配置
 */
export declare function setRequestAdapterOptions(options: Partial<RequestAdapterOptions>): void;
/**
 * 获取全局配置
 */
export declare function getRequestAdapterOptions(): Required<RequestAdapterOptions>;
/**
 * 小程序网络请求适配器（核心实现）
 */
export declare function mpRequest(url: string, options?: RequestInit, adapterOptions?: Partial<RequestAdapterOptions>): Promise<Response>;
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
export declare class AbortController {
    private _aborted;
    private _signal;
    constructor();
    get signal(): AbortSignal;
    abort(): void;
}
/**
 * 设置全局 fetch（小程序环境）
 */
export declare function setGlobalFetch(): void;
