/**
 * 请求签名工具
 *
 * 签名算法：
 * 1. 解析 URL 得到 path+query
 * 2. 递归排序所有对象 key
 * 3. JSON.stringify（无空格）
 * 4. MD5(pathWithQuery.toLowerCase() + method.toLowerCase() + jsonStr + sk + timestamp)
 * 5. 返回 X-APP-ID, X-TOKEN, X-TIMESTAMP headers
 *
 * 注意：小程序环境无法使用 blueimp-md5，此处内嵌轻量 MD5 实现
 */

export interface SignHeaders {
  'X-APP-ID': string
  'X-TOKEN': string
  'X-TIMESTAMP': string
}

// ============================================================================
// 内嵌 MD5 实现（RFC 1321）
// ============================================================================

function md5(input: string): string {
  // 将字符串转为 UTF-8 字节数组
  const bytes = utf8Encode(input)
  // 预处理：填充 + 追加长度
  const padded = md5Pad(bytes)
  // 初始化 MD5 缓冲区
  let a0 = 0x67452301
  let b0 = 0xEFCDAB89
  let c0 = 0x98BADCFE
  let d0 = 0x10325476

  // 处理每个 512 位（64 字节）块
  for (let i = 0; i < padded.length; i += 64) {
    const M = new Array<number>(16)
    for (let j = 0; j < 16; j++) {
      M[j] =
        padded[i + j * 4] |
        (padded[i + j * 4 + 1] << 8) |
        (padded[i + j * 4 + 2] << 16) |
        (padded[i + j * 4 + 3] << 24)
    }

    let A = a0
    let B = b0
    let C = c0
    let D = d0

    for (let j = 0; j < 64; j++) {
      let F: number
      let g: number

      if (j < 16) {
        F = (B & C) | (~B & D)
        g = j
      } else if (j < 32) {
        F = (D & B) | (~D & C)
        g = (5 * j + 1) % 16
      } else if (j < 48) {
        F = B ^ C ^ D
        g = (3 * j + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * j) % 16
      }

      F = (F + A + K[j] + M[g]) >>> 0
      A = D
      D = C
      C = B
      B = (B + rotateLeft(F, S[j])) >>> 0
    }

    a0 = (a0 + A) >>> 0
    b0 = (b0 + B) >>> 0
    c0 = (c0 + C) >>> 0
    d0 = (d0 + D) >>> 0
  }

  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0)
}

function rotateLeft(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0
}

function toHex(n: number): string {
  let s = ''
  for (let i = 0; i < 4; i++) {
    const byte = (n >>> (i * 8)) & 0xff
    s += (byte < 16 ? '0' : '') + byte.toString(16)
  }
  return s
}

function utf8Encode(str: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i)
    if (c < 0x80) {
      bytes.push(c)
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
      const c2 = str.charCodeAt(++i)
      const cp = ((c - 0xd800) << 10) + (c2 - 0xdc00) + 0x10000
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      )
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    }
  }
  return bytes
}

function md5Pad(bytes: number[]): number[] {
  const originalBitLen = bytes.length * 8
  // 追加 0x80
  bytes.push(0x80)
  // 填充零字节直到 length % 64 === 56
  while (bytes.length % 64 !== 56) {
    bytes.push(0)
  }
  // 追加原始长度（64位小端序，取低32位即可，高32位为0）
  for (let i = 0; i < 4; i++) {
    bytes.push((originalBitLen >>> (i * 8)) & 0xff)
  }
  // 高 32 位（对于常规字符串长度始终为 0）
  const highBits = Math.floor(originalBitLen / 0x100000000)
  for (let i = 0; i < 4; i++) {
    bytes.push((highBits >>> (i * 8)) & 0xff)
  }
  return bytes
}

// MD5 常量 K[i] = floor(2^32 * abs(sin(i + 1)))
const K: number[] = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
  0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
  0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
  0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
  0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
  0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
  0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
  0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]

// 每轮移位量
const S: number[] = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

// ============================================================================
// URL 解析
// ============================================================================

function parseUrlPathWithQuery(url: string): string {
  // 处理绝对 URL：提取 path + query
  const protoIdx = url.indexOf('://')
  if (protoIdx !== -1) {
    const afterProto = url.slice(protoIdx + 3)
    const slashIdx = afterProto.indexOf('/')
    return slashIdx === -1 ? '/' : afterProto.slice(slashIdx)
  }
  // 相对路径
  return url.startsWith('/') ? url : '/' + url
}

// ============================================================================
// 递归排序对象 key
// ============================================================================

function sortObjectKeys(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(sortObjectKeys)
  if (typeof obj !== 'object') return obj
  const sorted: Record<string, any> = {}
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys(obj[key])
  }
  return sorted
}

// ============================================================================
// 签名函数
// ============================================================================

export function signRequest(
  appId: string,
  appSecret: string,
  method: string,
  url: string,
  data: Record<string, any>
): { headers: SignHeaders; data: Record<string, any> } {
  const timestamp = Math.floor(Date.now() / 1000)
  const urlPathQuery = parseUrlPathWithQuery(url)

  const sortedData = sortObjectKeys(data)
  const dataStr = JSON.stringify(sortedData).replace(/ /g, '')

  const oriSign = `${urlPathQuery.toLowerCase()}${method.toLowerCase()}${dataStr}${appSecret}${timestamp}`
  const sign = md5(oriSign)

  return {
    headers: {
      'X-APP-ID': appId,
      'X-TOKEN': sign,
      'X-TIMESTAMP': timestamp.toString(),
    },
    data: sortedData,
  }
}

/**
 * 兼容旧版 API 签名 —— headersNeedSign 别名
 */
export function headersNeedSign(
  ak: string,
  sk: string,
  method: string,
  url: string,
  data: Record<string, any>
): { headers: Record<string, string>; data: Record<string, any> } {
  return signRequest(ak, sk, method, url, data)
}
