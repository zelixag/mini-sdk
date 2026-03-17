/**
 * 网络请求适配器包装器（熵减优化）
 * 包装 request-adapter.ts，提供与 Web SDK 兼容的接口
 * 
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，仅做接口转换
 * 2. 系统秩序：清晰的接口映射关系
 * 3. 抽象层次：隐藏适配器细节，提供 Web SDK 兼容接口
 * 4. 负熵实现：最小化包装层，避免重复逻辑
 */

import { mpRequest, setGlobalFetch, setRequestAdapterOptions, getRequestAdapterOptions } from './request-adapter';
import type { RequestAdapterOptions } from './request-adapter';

// 导出与 Web SDK 兼容的 request 函数
export default async function request(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
    data?: Record<string, any>;
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  const { method = 'GET', data, headers = {} } = options;

  // 转换 options 为 RequestInit
  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  // 处理 GET 请求的查询参数
  if (method === 'GET' && data) {
    const params = new URLSearchParams(data as any).toString();
    url += `${url.includes('?') ? '&' : '?'}${params}`;
  }

  // 处理非 GET 请求的 body
  if (method !== 'GET' && data) {
    requestInit.body = JSON.stringify(data);
  }

  // 调用适配器
  return mpRequest(url, requestInit);
}

// 导出配置函数
export { setGlobalFetch, setRequestAdapterOptions, getRequestAdapterOptions };
export type { RequestAdapterOptions };
