export enum EErrorCode {
  // Network
  NETWORK_DOWN = 1000,
  NETWORK_TIMEOUT = 1001,
  // Canvas
  CANVAS_NOT_FOUND = 2001,
  CANVAS_INIT_FAILED = 2002,
  WEBGL_NOT_SUPPORTED = 2003,
  // Session
  SESSION_START_FAILED = 3001,
  SESSION_EXPIRED = 3002,
  // WebSocket
  WEBSOCKET_CONNECT_ERROR = 4001,
  WEBSOCKET_TIMEOUT = 4002,
  // Render
  RENDER_BODY_ERROR = 5001,
  RENDER_FACE_ERROR = 5002,
  BODY_DATA_EXPIRED = 5003,
  PIPELINE_INIT_FAILED = 5004,
  // Audio
  AUDIO_PLAYBACK_ERROR = 6001,
  // Resource
  RESOURCE_LOAD_FAILED = 7001,
  // Video
  VIDEO_DECODE_ERROR = 8001,
}

export interface SDKError {
  code: EErrorCode
  message: string
  timestamp: number
  originalError?: any
}

export function createError(
  code: EErrorCode,
  message: string,
  originalError?: any
): SDKError {
  return { code, message, timestamp: Date.now(), originalError }
}
