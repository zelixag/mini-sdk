import md5 from 'blueimp-md5';

function encodeWithMd5(s: string): string {
  return md5(s);
}

export interface Headers {
  [key: string]: string;
}

function parseUrlWithoutBase(url: string): { isAbsolute: boolean; pathWithQuery: string } {
  try {
    // 尝试直接解析为绝对 URL（不含基准）
    const urlObj = new URL(url);
    // 若是绝对 URL，返回标记+完整路径+查询
    return {
      isAbsolute: true,
      pathWithQuery: urlObj.pathname + urlObj.search
    };
  } catch {
    // 解析失败，视为相对路径（path+query）
    // 处理开头可能的斜杠，确保统一格式（如 "path" → "/path"）
    let path = url.trim();
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    return {
      isAbsolute: false,
      pathWithQuery: path
    };
  }
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
  const urlPathQuery = parseUrlWithoutBase(url).pathWithQuery;

  // 递归排序对象的所有 key（包括嵌套对象）
  function sortObjectKeys(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => sortObjectKeys(item));
    }
    if (typeof obj !== 'object') {
      return obj;
    }
    const sortedKeys = Object.keys(obj).sort();
    const sortedObj: Record<string, any> = {};
    for (const key of sortedKeys) {
      sortedObj[key] = sortObjectKeys(obj[key]);
    }
    return sortedObj;
  }

  // 对象按 key 排序并去除空格
  const sortedData = sortObjectKeys(data);

  const dataStr = JSON.stringify(sortedData).replace(/ /g, '');

  const oriSign = `${urlPathQuery.toLowerCase()}${method.toLowerCase()}${dataStr}${sk}${t}`;
  const sign = encodeWithMd5(oriSign);

  headers['X-APP-ID'] = ak;
  headers['X-TOKEN'] = sign;
  headers['X-TIMESTAMP'] = t.toString();
  return {
    headers,
    data: sortedData,
  };
}
