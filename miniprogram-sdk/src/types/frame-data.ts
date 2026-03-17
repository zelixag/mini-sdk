/**
 * 帧数据类型定义（熵减：单一数据契约）
 *
 * 说明：与主项目 frame-data 保持一致，作为 body_data / face_data 解码后的结构化契约。
 * 解码器产出此类数据，下游消费方（渲染、队列）依赖此契约，不依赖原始字节格式。
 *
 * 设计原则：
 * 1. 信息密度：仅定义必要字段，避免冗余
 * 2. 系统秩序：与主项目类型对齐，便于后续桥接
 * 3. 可替换：若协议变更，只需更新解码器，类型契约保持稳定
 */

export enum EFrameDataType {
  AUDIO = 'tts_audio',
  BODY = 'body_data',
  FACE = 'face_data',
  EVENT = 'event_data',
  AA_FRAME = 'aa_frame',
}

/** socket.io 原始帧基础格式 */
export interface IRawBaseFrameData {
  sf: number;
  ef: number;
}

/** body_data 解码后结构（msgpack） */
export interface IRawBodyFrameData extends IRawBaseFrameData {
  hfd: boolean;
  aef: number;
  asf: number;
  id: number;
  n: string;
  s: string;
  body_id: number;
  x_offset: Uint8Array | number[];
}

/** face_data 解码后结构（msgpack v0 / protobuf v2 统一产出格式） */
export interface ITtsFaceFrameData {
  body_id: number;
  bsw: number[];
  ef: number;
  htmi?: number[];
  htpw?: number[];
  id: number;
  mjt?: number[][];
  s: string;
  sf: number;
  ttmi?: number[];
  ttpw?: number[];
  ms: {
    index: number;
    weights: number[];
  }[];
  js: {
    translate: number[];
    rotate: number[];
  }[];
  face_frame_type: number;
}

/** Web 同构后的 face 帧（对齐 RenderScheduler.handleFaceData 产物） */
export interface IAlignedFaceFrameData extends IRawBaseFrameData {
  FaceFrameData: {
    mesh: {
      blendshapeWeights: number[];
      textureModelIndex: number;
      texturePCAWeights: number[];
    }[];
    movableJointTransforms: any[];
    blendshapeWeights: number[];
  };
  frameIndex: number;
  state: string;
  id: number;
  body_id: number;
  face_frame_type: number;
}
