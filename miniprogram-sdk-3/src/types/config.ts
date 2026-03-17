export interface IInitParams {
  appId: string
  appSecret: string
  gatewayServer: string
  containerId?: string
  width?: number
  height?: number
  debug?: boolean
  tag?: string
  config?: Record<string, any>
  initModel?: InitModel
  onEvent?: (event: SDKEvent) => void
}

export enum InitModel {
  visible = 'visible',
  invisible = 'invisible',
}

export enum AvatarStatus {
  online = 'online',
  offline = 'offline',
  visible = 'visible',
  invisible = 'invisible',
  network_on = 'network_on',
  network_off = 'network_off',
  close = 'close',
}

export enum RenderState {
  init = 'init',
  rendering = 'rendering',
  pausing = 'pausing',
  paused = 'paused',
  resumed = 'resumed',
  stopped = 'stopped',
}

export interface SDKEvent {
  type: string
  data?: any
}

// Session response from server
export interface ISessionResponse {
  session_id: string
  room: string
  token: string
  socket_io_url: string
  resource_pack: {
    body_data_dir: string
    face_ani_char_data: string
    face_ani_preload_data?: string
    offline_idle?: IOfflineIdle[]
    blendshape_map?: number[][]
  }
  config: {
    raw_audio: boolean
    resolution: { width: number; height: number }
    framedata_proto_version: number
    layout?: ILayout
    walk_config?: any
    init_events?: any[]
  }
}

export interface IOfflineIdle {
  n: string // video name
  sf: number
  ef: number
}

export interface ILayout {
  h_align?: 'left' | 'center' | 'right'
  v_align?: 'top' | 'middle' | 'bottom'
  offset_x?: number
  offset_y?: number
  scale?: number
}
