/**
 * Fetch Polyfill for Mini Program
 * 基于 wx.request 封装 fetch API
 */
export interface RequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string | FormData | URLSearchParams;
    mode?: string;
    credentials?: string;
    cache?: string;
}
export interface FetchResponse {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Headers;
    text(): Promise<string>;
    json(): Promise<any>;
    blob(): Promise<Blob>;
    arrayBuffer(): Promise<ArrayBuffer>;
}
declare class Headers {
    private headers;
    constructor(init?: Record<string, string>);
    get(name: string): string | null;
    set(name: string, value: string): void;
    has(name: string): boolean;
    delete(name: string): boolean;
    forEach(callback: (value: string, key: string) => void): void;
}
export declare function fetch(url: string | Request, options?: RequestOptions): Promise<FetchResponse>;
export declare function initFetchPolyfill(): void;
export default fetch;
