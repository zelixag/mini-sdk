/**
 * 请求签名工具
 * 用于 start_session / stop_session 的 X-APP-ID、X-TOKEN、X-TIMESTAMP 签名
 */

// 简化版 md5（实际项目中需要使用 blueimp-md5）
function md5(string: string): string {
  // 简化实现，仅作占位
  // 实际项目中需要引入真正的 md5 库
  let hash = 0;
  for (let i = 0; i < string.length; i++) {
    const char = string.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

export interface Headers {
  [key: string]: string;
}

function parseUrlPathWithQuery(url: string): string {
  const idx = url.indexOf('://');
  if (idx !== -1) {
    const after = url.slice(idx + 3);
    const slashIdx = after.indexOf('/');
    return slashIdx === -1 ? '/' : after.slice(slashIdx);
  }
  return url.startsWith('/') ? url : '/' + url;
}

export function headersNeedSign(
  ak: string,
  sk: string,
  method: string,
  url: string,
  data: Record<string, any>
): { headers: Headers; data: Record<string, any> } {
  const headers: Headers = {};
  const t = Math.floor(Date.now() / 1000);
  const urlPathQuery = parseUrlPathWithQuery(url);

  function sortObjectKeys(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(sortObjectKeys);
    if (typeof obj !== 'object') return obj;
    const sorted: Record<string, any> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortObjectKeys(obj[key]);
    }
    return sorted;
  }

  const sortedData = sortObjectKeys(data);
  const dataStr = JSON.stringify(sortedData).replace(/ /g, '');
  const oriSign = `${urlPathQuery.toLowerCase()}${method.toLowerCase()}${dataStr}${sk}${t}`;
  const sign = md5(oriSign);

  headers['X-APP-ID'] = ak;
  headers['X-TOKEN'] = sign;
  headers['X-TIMESTAMP'] = t.toString();
  return { headers, data: sortedData };
}
