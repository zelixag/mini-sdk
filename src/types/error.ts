/**
 * @file 错误码和定义
 */

export enum EErrorCode {
  // 初始化错误
  // 容器不存在
  CONTAINER_NOT_FOUND = 10001,
  // socket连接错误
  CONNECT_SOCKET_ERROR = 10002,
  // 会话错误，start_session进入catch（/api/session的接口数据异常，均使用response.error_code）
  START_SESSION_ERROR = 10003,
  // 会话错误，stop_session进入catch
  STOP_SESSION_ERROR = 10004,

  // 前端处理逻辑错误
  // 视频抽帧错误
  VIDEO_FRAME_EXTRACT_ERROR = 20001,
  // 初始化视频抽帧WORKER错误
  INIT_WORKER_ERROR = 20002,
  // 抽帧视频流处理错误
  PROCESS_VIDEO_STREAM_ERROR = 20003,
  // 表情处理错误
  FACE_PROCESSING_ERROR = 20004,
  // 渲染错误
  RENDER_BODY_ERROR = 20005,
  RENDER_FACE_ERROR = 20006,

  // 资源管理错误
  // 背景图片加载错误
  BACKGROUND_IMAGE_LOAD_ERROR = 30001,
  // 表情数据加载错误
  FACE_BIN_LOAD_ERROR = 30002,
  // body数据无Name
  INVALID_BODY_NAME = 30003,
  // 视频下载错误
  VIDEO_DOWNLOAD_ERROR = 30004,
  // 身体数据过期
  BODY_DATA_EXPIRED = 30005,

  // sdk 获取ttsa数据解压缩错误
  AUDIO_DECODE_ERROR = 40001, // 音频解码错误
  FACE_DECODE_ERROR = 40002, // 表情解码错误
  VIDEO_DECODE_ERROR = 40003, // 身体视频解码错误
  EVENT_DECODE_ERROR = 40004, // 事件解码错误
  INVALID_DATA_STRUCTURE = 40005, // ttsa返回数据类型错误，非audio、body、face、event等
  TTSA_ERROR = 40006, // ttsa下行发送异常信息
  AUDIO_DATA_EXPIRED = 40007, // ttsa下发音频数据过期

  // 网络错误
  NETWORK_DOWN = 50001, // 离线模式
  NETWORK_UP = 50002, // 在线模式
  NETWORK_RETRY = 50003, // 网络重试
  NETWORK_BREAK = 50004, // 网络断开
}

export interface SDKError {
  code: EErrorCode;
  message: string;
  timestamp: number;
  originalError?: any; // 可选的原始错误对象
}