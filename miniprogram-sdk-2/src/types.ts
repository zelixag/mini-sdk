/**
 * Type Definitions for XmovAvatarMP
 * 类型定义 - 与 Web SDK 保持兼容
 */

/**
 * Avatar 状态
 */
export enum AvatarStatus {
  online = 'online',
  offline = 'offline',
  network_on = 'network_on',
  network_off = 'network_off',
  close = 'close',
  visible = 'visible',
  invisible = 'invisible',
  stopped = 'stopped'
}

/**
 * 渲染状态
 */
export enum RenderState {
  init = 'init',
  rendering = 'rendering',
  paused = 'paused',
  resumed = 'resumed',
  stopped = 'stopped'
}

/**
 * 初始化模式
 */
export enum InitModel {
  normal = 'normal',
  invisible = 'invisible'
}

/**
 * SDK 配置选项
 */
export interface IAvatarOptions {
  containerId: string;
  canvas?: any;
  gl?: any;
  appId: string;
  appSecret: string;
  gatewayServer: string;
  cacheServer?: string;
  tag?: string;
  headers?: Record<string, string>;
  env?: string;
  config?: any;
  hardwareAcceleration?: string;
  enableClientInterrupt?: boolean;
  enableLogger?: boolean;
  enableDebugger?: boolean;
  onMessage?: (error: SDKError) => void;
  onStateChange?: (state: string) => void;
  onStatusChange?: (status: AvatarStatus) => void;
  onDownloadProgress?: (progress: number) => void;
  onSpeakStateChange?: (state: string, client_speak_id: string | number) => void;
  onRenderChange?: (state: RenderState) => void;
  onVoiceStateChange?: (state: string, duration?: number) => void;
  onWalkStateChange?: (state: string) => void;
  onNetworkInfo?: (info: INetworkInfo) => void;
  onWidgetEvent?: (data: any) => void;
}

/**
 * 初始化参数
 */
export interface IInitParams {
  initModel?: InitModel;
  onDownloadProgress?: (progress: number) => void;
  onWarning?: (message: string) => void;
}

/**
 * 网络信息
 */
export interface INetworkInfo {
  downlink: number;
  rtt: number;
}

/**
 * 布局配置
 */
export interface Layout {
  container: {
    size: number[];
  };
  avatar: {
    v_align: 'left' | 'center' | 'right';
    h_align: 'top' | 'center' | 'bottom';
    scale: number;
    offset_x: number;
    offset_y: number;
  };
}

/**
 * 行走配置
 */
export interface WalkConfig {
  min_x_offset: number;
  max_x_offset: number;
  walk_points: {
    [key: string]: number;
  };
  init_point?: number;
}

/**
 * SDK 错误
 */
export interface SDKError {
  code: string;
  message: string;
  e?: any;
}

/**
 * 帧数据类型
 */
export enum EFrameDataType {
  BODY = 'body',
  FACE = 'face',
  AUDIO = 'audio',
  EVENT = 'event'
}
