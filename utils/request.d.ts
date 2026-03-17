type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
interface RequestOptions {
    method?: HttpMethod;
    data?: Record<string, any>;
    headers?: Record<string, string>;
}
export default function request(url: string, options?: RequestOptions): Promise<Response>;
/**
 * 资源下载请求
 * @returns {Promise<[isError: boolean, data: ArrayBuffer | string]>}
 * */
export declare function XMLRequest(options: {
    url: string;
    onProgress: (progress: number) => void;
}): Promise<[boolean, ArrayBuffer | string]>;
export {};
