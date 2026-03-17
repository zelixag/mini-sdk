export enum EFrameDataType {
  AUDIO = 'tts_audio',
  BODY = 'body_data',
  FACE = 'face_data',
  EVENT = 'event_data',
  AA_FRAME = 'aa_frame',
}

export interface IRawBaseFrameData {
  sf: number // start frame
  ef: number // end frame
}

export interface IRawBodyFrameData extends IRawBaseFrameData {
  hfd: boolean
  aef: number
  asf: number
  id: number
  n: string // video name
  s: string // state
  body_id: number
  x_offset: Uint8Array
}

export interface ITtsFaceFrameData {
  body_id: number
  bsw: number[] // blendshape weights
  ef: number
  htmi?: number[]
  htpw?: number[]
  id: number
  mjt?: number[][] // movable joint transforms
  s: string // state
  sf: number
  ttmi?: number[]
  ttpw?: number[]
  ms: { index: number; weights: number[] }[] // mesh data
  js: { translate: number[]; rotate: number[] }[] // joint data
  face_frame_type: number // 0=realtime, 1=idle
}

export interface IRawFaceFrameData extends IRawBaseFrameData {
  FaceFrameData: any // IBRAnimationFrameData_NN
  frameIndex: number
  state: string
  id: number
  body_id: number
  face_frame_type: number
}

export interface IRawAudioFrameData extends IRawBaseFrameData {
  ad: any
  id: number
  sid: number
  multi_turn_conversation_id: string
}

export interface IRawWidgetData {
  type: string
  data?: any
  text?: string
  speech_id?: number
  client_speak_id?: string
}

export interface IRawEventFrameData extends IRawBaseFrameData {
  id: number
  s: string
  e: IRawWidgetData[]
}

export type IRawFrameData =
  | IRawBodyFrameData
  | ITtsFaceFrameData
  | IRawFaceFrameData
  | IRawAudioFrameData
  | IRawEventFrameData

export interface bodyFile {
  name: string
  id: number
  frameState: string
  start: number
  end: number
  data: ArrayBuffer
  hfd: boolean
  startFrameIndex: number
  endFrameIndex: number
  body_id: number
  x_offset: any
}

export interface StateChangeInfo {
  state: string
  params: Record<string, any>
  start_frame: number
}

// Body frame after video decode
export interface IBodyFrame {
  frameIndex: number
  body_id: number
  videoName?: string  // 视频名称（用于 VideoDecoder）
  data: Uint8Array // YUV/RGBA pixel data
  width: number
  height: number
}
