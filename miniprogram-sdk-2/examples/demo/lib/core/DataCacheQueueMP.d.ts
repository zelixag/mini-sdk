/**
 * DataCacheQueueMP - 数据缓存队列 for Mini Program
 * 借鉴 Web SDK DataCacheQueue 实现
 */
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
export interface IRawFaceFrameData {
    body_id: number;
    frameIndex: number;
    sf: number;
    ef: number;
    state: string;
    id: number;
    FaceFrameData: any;
}
export interface IRawAudioFrameData {
    sf: number;
    ef: number;
    ad: Uint8Array;
    sid: number;
}
export interface IRawEventFrameData {
    id: number;
    s: string;
    sf: number;
    ef: number;
    e: any[];
}
/**
 * DataCacheQueueMP - 数据缓存队列
 * 管理身体、脸部、音频、事件数据的缓存
 */
export declare class DataCacheQueueMP {
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
    set currentTtsaState(state: any);
    get currentTtsaState(): any;
    get bodyQueue(): IBodyFrame[];
    /**
     * 更新身体图像数据
     */
    _updateBodyImageBitmap(data: IBodyFrame): void;
    /**
     * 获取身体图像数据
     */
    _getBodyImageBitmap(frameIndex: number): IBodyFrame | undefined;
    /**
     * 清理过期帧
     */
    clearOldFrames(sf: number): void;
    /**
     * 设置视频 ID 列表
     */
    setVideoIdList(videoId: string): void;
    /**
     * 获取视频 ID 列表
     */
    getVideoIdList(): string[];
    /**
     * 更新表情数据
     */
    _updateFacial(data: IRawFaceFrameData[]): void;
    /**
     * 获取表情数据
     */
    _getFacial(frameIndex: number): IRawFaceFrameData | undefined;
    /**
     * 更新实时表情数据
     */
    _updateRealFacial(data: IRawFaceFrameData[]): void;
    /**
     * 获取实时表情数据
     */
    _getRealFacial(frameIndex: number): IRawFaceFrameData | undefined;
    /**
     * 清理所有表情数据
     */
    clearAllFaceData(): void;
    /**
     * 更新音频数据
     */
    _updateAudio(data: IRawAudioFrameData[]): void;
    /**
     * 获取音频数据
     */
    _getAudio(frameIndex: number): IRawAudioFrameData | undefined;
    /**
     * 清理音频数据
     */
    _clearAudio(speechId: number): void;
    /**
     * 更新 UI 事件
     */
    _updateUiEvent(data: IRawEventFrameData[]): void;
    /**
     * 获取 UI 事件
     */
    _getUiEvent(frameIndex: number): IRawEventFrameData[];
    /**
     * 清理事件数据
     */
    _clearEvent(): void;
    /**
     * 检查数据有效性
     */
    checkValidData(data: any[], type: string): void;
    /**
     * 释放帧资源
     */
    private disposeFrame;
    /**
     * 获取身体视频名称列表长度
     */
    getBodyVideoNameListLength(): number;
    /**
     * 获取队列大小
     */
    getQueueSize(): {
        body: number;
        face: number;
        audio: number;
        event: number;
    };
    /**
     * 清理所有数据
     */
    clear(): void;
    /**
     * 销毁
     */
    destroy(): void;
}
export default DataCacheQueueMP;
