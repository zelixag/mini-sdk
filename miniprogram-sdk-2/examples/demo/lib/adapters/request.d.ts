/**
 * Request Adapter for Mini Program
 * 封装 wx.request，提供 fetch 兼容接口
 */
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
export declare function request(options: RequestOptions): Promise<RequestResponse>;
/**
 * GET 请求
 */
export declare function get(url: string, options?: Partial<RequestOptions>): Promise<RequestResponse>;
/**
 * POST 请求
 */
export declare function post(url: string, data?: any, options?: Partial<RequestOptions>): Promise<RequestResponse>;
/**
 * PUT 请求
 */
export declare function put(url: string, data?: any, options?: Partial<RequestOptions>): Promise<RequestResponse>;
/**
 * DELETE 请求
 */
export declare function del(url: string, options?: Partial<RequestOptions>): Promise<RequestResponse>;
export declare function setGlobalHeaders(headers: Record<string, string>): void;
export declare function setGlobalTimeout(timeout: number): void;
/**
 * mpRequest - 主要使用的请求函数
 * 封装签名等逻辑
 */
export declare function mpRequest(url: string, options: RequestOptions): Promise<RequestResponse>;
export declare class AbortController {
    aborted: boolean;
    abort(): void;
}
export declare class AbortError extends Error {
    constructor(message?: string);
}
declare const _default: {
    request: typeof request;
    get: typeof get;
    post: typeof post;
    put: typeof put;
    delete: typeof del;
    mpRequest: typeof mpRequest;
    setGlobalHeaders: typeof setGlobalHeaders;
    setGlobalTimeout: typeof setGlobalTimeout;
    AbortController: typeof AbortController;
    AbortError: typeof AbortError;
};
export default _default;
