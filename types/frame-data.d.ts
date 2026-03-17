import { IWidget, TWidgetType } from "./event";
import { IBRAnimationFrameData_NN } from "utils/DataInterface";
export declare enum EFrameDataType {
    AUDIO = "tts_audio",
    BODY = "body_data",
    FACE = "face_data",
    EVENT = "event_data"
}
/** socket.io 原数据格式 */
export interface IRawBaseFrameData {
    sf: number;
    ef: number;
}
export interface IRawBodyFrameData extends IRawBaseFrameData {
    aef: number;
    asf: number;
    id: number;
    n: string;
    s: string;
}
export interface IRawFaceFrameData extends IRawBaseFrameData {
    FaceFrameData: IBRAnimationFrameData_NN;
    frameIndex?: number;
}
export interface IRawAudioFrameData extends IRawBaseFrameData {
    ad: any;
}
export interface IRawWidgetData {
    type: TWidgetType;
    data: IWidget;
}
export interface IRawEventFrameData extends IRawBaseFrameData {
    id: number;
    s: string;
    e: IRawWidgetData[];
}
export type IRawFrameData = IRawBodyFrameData | IRawFaceFrameData | IRawAudioFrameData | IRawEventFrameData;
