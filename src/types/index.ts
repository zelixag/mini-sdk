import type XmovAvatar from "../index"
import type { IRawWidgetData } from "./frame-data"
import type { SDKError } from "./error"
import type { TDownloadProgress } from "../modules/ResourceManager"

export enum AvatarStatus {
  // initialized,
  online,      // 在线可见状态（合并了原来的 playing）
  offline,
  network_on,
  network_off,
  close,
  visible,    // 可见状态
  invisible,   // 隐身状态（原来的 paused）
  stopped,     // 停止状态
}

/**
 * 渲染状态枚举
 * 用于表示渲染器的状态，与数字人状态（AvatarStatus）分离
 */
export enum RenderState {
  init = 'init',              // 开始渲染（初始状态，准备开始）
  rendering = 'rendering',     // 渲染中（正在渲染）
  pausing = 'pausing',          // 暂停渲染中（正在暂停渲染）
  paused = 'paused',          // 暂停渲染（暂停但保留数据）
  resumed = 'resumed',        // 恢复渲染（从暂停恢复）
  stopped = 'stopped',        // 渲染停止（完全停止）
}


/**
 * 网络情况
 * @params downlink 下载速率（Mbps）
 * @params rtt 延迟（毫秒）
 */
export interface INetworkInfo {
  downlink: number
  rtt: number
}

export enum InitModel {
  normal = 'normal',
  invisible = 'invisible',
}

export interface IInitParams {
  initModel?: InitModel
  onDownloadProgress: TDownloadProgress;
  onWarning?: (message: string) => void;
}
export interface IAvatarOptions {
  sdkInstance?: XmovAvatar
  containerId: string
  // width: number
  // height: number
  appId: string
  appSecret: string
  tag?: string // 标签 指定特定房间
  gatewayServer: string // back
  headers?: Record<string, string> // 自定义请求头
  cacheServer?: string
  backgroundMode?: 'cover' | 'contain' | 'fill'
  invisibleMode?: boolean
  env?: string
  config?: any
  hardwareAcceleration?: string
  enableClientInterrupt?: boolean
  onMessage: (error: SDKError) => void
  onStartSessionWarning?: (message: Object) => void
  onAAFrameHandle?: (data: any) => void
  onNetworkInfo?(networkInfo: INetworkInfo): void
  onWidgetEvent?(data: IRawWidgetData): void
  // onWidgetPic?(data: IWidgetPic): void
  // onWidgetSlideshow?(data: IWidgetSlideshow): void
  // onWidgetSubtile?(data: IWidgetSubtitle): void
  // onWidgetText?(data: IWidgetText): void
  // onWidgetVideo?(data: IWidgetVideo): void
  enableRecording?: boolean // 是否启用录屏功能
  enableLogger?: boolean // 是否启用日志
  onStateChange?(state: string): void;
  onSpeakStateChange?(state: string, client_speak_id: number | string): void;
  onRenderChange?(state: RenderState): void;
  onVoiceStateChange?(state: string, duration?: number): void;
  onStatusChange?(status: AvatarStatus): void;
  onStateRenderChange?(state: string, duration: number): void;
  onWalkStateChange?(state: string): void;
  enableDebugger?: boolean // 是否启用调试模式
  proxyWidget?: {
    [key: string]: (data: any) => void
  }
}

export interface Layout {
  container: {
    size: number[]
  },
  avatar: {
    v_align: string //'left' | 'center' | 'right'
    h_align: string //'top' | 'center' | 'bottom'
    scale: number
    offset_x: number
    offset_y: number
  }
}

export interface WalkConfig {
  min_x_offset: number
  max_x_offset: number
  walk_points: {
    [key: string]: number
  }
  init_point?: number
}