import { IRawAudioFrameData, IRawFaceFrameData, IRawEventFrameData, IRawFrameData, StateChangeInfo } from "../types/frame-data";
export interface IBodyFrame {
    frame: any;
    frameIndex: number;
    frameState: string;
    id: number;
    name: string;
    body_id: number;
    hfd: boolean;
    sf: number;
    offset: number;
}
export declare class DataCacheQueue {
    private TAG;
    private _bodyQueue;
    private _facialQueue;
    private _realFacialQueue;
    private audioQueue;
    private eventQueue;
    private videoIdList;
    private _currentPlayState;
    private _currentTtsaState;
    constructor();
    set currentPlayState(state: string);
    get currentPlayState(): string;
    set currentTtsaState(state: StateChangeInfo | null);
    get currentTtsaState(): StateChangeInfo | null;
    get bodyQueue(): IBodyFrame[];
    _updateBodyImageBitmap(data: IBodyFrame): void;
    clearOldFrames(sf: number): void;
    setVideoIdList(videoId: string): void;
    getVideoIdList(): string[];
    /**
     * 获取指定帧并从Map中删除
     * @param frameIndex 要获取的帧索引
     * @returns 找到的帧数据（未找到则返回undefined）
     */
    _getBodyImageBitmap(frameIndex: number): IBodyFrame | undefined;
    getBodyVideoNameListLength(): number;
    _getFaceImageBitmap(frameIndex: number, body_id: number): IRawFaceFrameData | null;
    _updateFacial(data: Array<IRawFaceFrameData>): void;
    get facialQueue(): IRawFaceFrameData[];
    _getRealFaceImageBitmap(frameIndex: number, body_id: number): IRawFaceFrameData | null;
    _updateRealFacial(data: Array<IRawFaceFrameData>): void;
    get realFacialQueue(): IRawFaceFrameData[];
    /**
     * 清空所有表情数据（用于切换隐身模式时）
     */
    clearAllFaceData(): void;
    _updateAudio(data: Array<IRawAudioFrameData>): void;
    _clearAudio(speech_id: number): void;
    _getAudio(frameIndex: number): IRawAudioFrameData | undefined;
    _getAudioInterval(startFrame: number, endFrame: number): IRawAudioFrameData | undefined;
    _updateUiEvent(data: Array<IRawEventFrameData>): void;
    clearSubtitleOn(speech_id: number): void;
    _clearEvent(): void;
    _getEvent(frame: number): IRawEventFrameData | undefined;
    _getEventInterval(startFrame: number, endFrame: number): IRawEventFrameData | undefined;
    /**
     * 检查数据是否因seek等原因失效，并清理缓存。
     * @param data 新的数据帧数组
     * @param type 数据类型
     */
    checkValidData(data: Array<IRawFrameData>, type: string): void;
    destroy(): void;
}
