/**
 * Fetch Polyfill for Mini Program
 * 基于 wx.request 封装 fetch API
 */

declare const wx: any;

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

class Headers {
  private headers: Record<string, string> = {};

  constructor(init?: Record<string, string>) {
    if (init) {
      Object.keys(init).forEach(key => {
        this.headers[key.toLowerCase()] = init[key];
      });
    }
  }

  get(name: string): string | null {
    return this.headers[name.toLowerCase()] || null;
  }

  set(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }

  has(name: string): boolean {
    return name.toLowerCase() in this.headers;
  }

  delete(name: string): boolean {
    const key = name.toLowerCase();
    if (key in this.headers) {
      delete this.headers[key];
      return true;
    }
    return false;
  }

  forEach(callback: (value: string, key: string) => void): void {
    Object.keys(this.headers).forEach(key => {
      callback(this.headers[key], key);
    });
  }
}

function parseHeaders(rawHeaders: Record<string, string>): Headers {
  const headers = new Headers();
  Object.keys(rawHeaders).forEach(key => {
    headers.set(key, rawHeaders[key]);
  });
  return headers;
}

export async function fetch(url: string | Request, options?: RequestOptions): Promise<FetchResponse> {
  let urlStr: string;
  let fetchOptions: RequestOptions = options || {};

  // 处理 Request 对象
  if (url instanceof Request) {
    urlStr = url.url;
    if (!fetchOptions.method) fetchOptions.method = url.method;
    if (!fetchOptions.headers) fetchOptions.headers = {};
    if (!fetchOptions.body) fetchOptions.body = (await url.clone().blob()) as any;
  } else {
    urlStr = url;
  }

  // 转换 fetch options 为 wx.request options
  const wxOptions: any = {
    url: urlStr,
    method: (fetchOptions.method || 'GET').toUpperCase(),
    header: fetchOptions.headers || {},
    success: () => {},
    fail: () => {}
  };

  // 处理 body
  if (fetchOptions.body) {
    if (fetchOptions.body instanceof FormData) {
      wxOptions.header['Content-Type'] = 'multipart/form-data';
      // FormData 处理
      const formData = new FormData();
      fetchOptions.body.forEach((value, key) => {
        formData.append(key, value);
      });
      wxOptions.data = formData;
    } else if (fetchOptions.body instanceof URLSearchParams) {
      wxOptions.header['Content-Type'] = 'application/x-www-form-urlencoded';
      wxOptions.data = fetchOptions.body.toString();
    } else if (typeof fetchOptions.body === 'string') {
      if (!wxOptions.header['Content-Type']) {
        wxOptions.header['Content-Type'] = 'application/json';
      }
      wxOptions.data = fetchOptions.body;
    } else {
      wxOptions.data = fetchOptions.body;
    }
  }

  return new Promise((resolve, reject) => {
    wxOptions.success = (res: any) => {
      const response: FetchResponse = {
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        statusText: res.statusCode === 200 ? 'OK' : 'Error',
        headers: parseHeaders(res.header || res.headers || {}),
        text: async () => res.data,
        json: async () => typeof res.data === 'string' ? JSON.parse(res.data) : res.data,
        blob: async () => res.data,
        arrayBuffer: async () => res.data
      };
      resolve(response);
    };

    wxOptions.fail = (err: any) => {
      reject(new Error(err.errMsg || 'Network request failed'));
    };

    wx.request(wxOptions);
  });
}

// 导出全局 fetch
export function initFetchPolyfill(): void {
  if (typeof (globalThis as any).fetch !== 'function') {
    (globalThis as any).fetch = fetch;
  }
  if (typeof (globalThis as any).Headers !== 'function') {
    (globalThis as any).Headers = Headers;
  }
}

export default fetch;
