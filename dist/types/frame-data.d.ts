import type { IWidget } from "./event";
import { IBRAnimationFrameData_NN } from "../utils/DataInterface";
export declare enum EFrameDataType {
    AUDIO = "tts_audio",
    BODY = "body_data",
    FACE = "face_data",
    EVENT = "event_data",
    AA_FRAME = "aa_frame"
}
/** socket.io 原数据格式 */
export interface IRawBaseFrameData {
    sf: number;
    ef: number;
}
export interface IRawBodyFrameData extends IRawBaseFrameData {
    hfd: boolean;
    aef: number;
    asf: number;
    id: number;
    n: string;
    s: string;
    body_id: number;
    x_offset: Uint8Array;
}
/**
 * tts下发的face数据
 */
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
export interface IRawFaceFrameData extends IRawBaseFrameData {
    FaceFrameData: IBRAnimationFrameData_NN;
    frameIndex: number;
    state: string;
    id: number;
    body_id: number;
    face_frame_type: number;
}
export interface IRawAudioFrameData extends IRawBaseFrameData {
    ad: any;
    id: number;
    sid: number;
    multi_turn_conversation_id: string;
}
export interface IRawWidgetData {
    type: string;
    data?: IWidget;
    text?: string;
    speech_id?: number;
}
export interface IRawEventFrameData extends IRawBaseFrameData {
    id: number;
    s: string;
    e: IRawWidgetData[];
}
export type IRawFrameData = IRawBodyFrameData | ITtsFaceFrameData | IRawFaceFrameData | IRawAudioFrameData | IRawEventFrameData;
export type bodyFile = {
    name: string;
    id: number;
    frameState: string;
    start: number;
    end: number;
    data: ArrayBuffer;
    hfd: boolean;
    startFrameIndex: number;
    endFrameIndex: number;
    body_id: number;
    x_offset: any;
};
export interface StateChangeInfo {
    state: string;
    params: object;
    start_frame: number;
}
