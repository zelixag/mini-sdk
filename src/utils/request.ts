type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'

interface RequestOptions {
  method?: HttpMethod
  data?: Record<string, any>
  headers?: Record<string, string>
}

interface ErrorResponse {
  status: number
  statusText: string
  message: string
}

const TAG = '[REQUEST]'
export default async function request(
  url: string,
  options: RequestOptions = {}
) {
  const { method = 'GET', data, headers = {} } = options

  const config: RequestInit = {
    method,
    // headers,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  }

  if (method === 'GET' && data) {
    const params = new URLSearchParams(data).toString()
    url += `${url.includes('?') ? '&' : '?'}${params}`
  }

  if (method !== 'GET' && data) {
    config.body = JSON.stringify(data)
  }

  try {
    const response = await fetch(url, config)

    if (!response.ok) {
      const error: ErrorResponse = {
        status: response.status,
        statusText: response.statusText,
        message: `HTTP error! status: ${response.status}`,
      }
      throw error
    }
    return response
  } catch (error) {
    if (error instanceof Error) {
      throw {
        message: error.message,
        status: 500,
        statusText: 'Client Error',
      } as ErrorResponse
    }
    throw error
  }
}

/**
 * 资源下载请求
 * @returns {Promise<[isError: boolean, data: ArrayBuffer | string]>}
 * */
export function XMLRequest(options: {
  url: string
  cache?: {
    enable: boolean
  }
  onProgress: (progress: number) => void
}): Promise<[boolean, ArrayBuffer | string]> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', options.url);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        const arrayBuffer = xhr.response;
        resolve([false, arrayBuffer]);
      } else if (xhr.status !== 200) {
        reject([true, xhr.statusText]);
      }
    };
    xhr.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        options.onProgress(percent);
      }
    };
    xhr.send();
  });
}