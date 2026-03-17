type HttpMethod = 'GET' | 'POST' | 'PUT'

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
      let message: string
      try {
        const errorData = await response.json()
        message = errorData.message || JSON.stringify(errorData)
      } catch (e) {
        message = `HTTP error! status: ${response.status}`
      }
      const error: ErrorResponse = {
        status: response.status,
        statusText: response.statusText,
        message,
      }
      throw error
    }

    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return response.json()
    }
    return response.text()
  } catch (error) {
    if ((error as ErrorResponse).status) {
      throw error
    }
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
