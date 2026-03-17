import { IRawAudioFrameData, IRawFaceFrameData, IRawBodyFrameData, IRawEventFrameData, IRawFrameData } from "../types/frame-data";
export interface IBodyFrame {
    imageBitmap: ImageBitmap;
    frameIndex: number;
    frameState: string;
    videoId: string;
}
export declare class DataCacheQueue {
    private TAG;
    private _mp4Queue;
    private _bodyQueue;
    private _facialQueue;
    private audioQueue;
    private eventQueue;
    private _currentPlayState;
    constructor();
    set currentPlayState(state: string);
    get currentPlayState(): string;
    _updateBody(data: Array<IRawBodyFrameData>): void;
    get mp4Queue(): IRawBodyFrameData[];
    get bodyQueue(): IBodyFrame[];
    _updateBodyImageBitmap(data: IBodyFrame): void;
    /**
     * 获取指定帧并从Map中删除
     * @param frameIndex 要获取的帧索引
     * @returns 找到的帧数据（未找到则返回undefined）
     */
    _getBodyImageBitmap(frameIndex: number): IBodyFrame | undefined;
    _getFaceImageBitmap(frameIndex: number): IRawFaceFrameData | undefined;
    _updateFacial(data: Array<IRawFaceFrameData>): void;
    get facialQueue(): IRawFaceFrameData[];
    _updateAudio(data: Array<IRawAudioFrameData>): void;
    _getAudio(frameIndex: number): IRawAudioFrameData | undefined;
    _updateUiEvent(data: Array<IRawEventFrameData>): void;
    _getEvent(frame: number): IRawEventFrameData | undefined;
    /**
     * 检查数据是否因seek等原因失效，并清理缓存。
     * @param data 新的数据帧数组
     * @param type 数据类型
     */
    checkValidData(data: Array<IRawFrameData>, type: string): void;
}
