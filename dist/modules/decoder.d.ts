import { bodyFile, IRawBodyFrameData } from "../types/frame-data";
import ResourceManager, { IOfflineIdle } from "./ResourceManager";
import SaveAndDownload from "../control/SaveAndDownload";
import { DataCacheQueue } from "../control/DataCacheQueue";
import { EErrorCode } from "../types/error";
export default class ParallelDecoder {
    private tasks;
    private queue;
    private maxParallel;
    private currentParallel;
    private _locked;
    private currentTaskId;
    private resourceManager;
    private onFrame;
    private onDone;
    private isFirstDecode;
    private pendingAbort;
    private abortAfterEf;
    private pendingNewQueue;
    private currentDecodedFrameIndex;
    private abortAfterFrame;
    private cacheVideoCount;
    private saveAndDownload;
    private dataCacheQueue;
    private bodyFrameCountMap;
    private maxVideoCount;
    private hardwareAcceleration;
    private MAX_LOAD_VIDEO_TIMEOUT_MS;
    _offlineLastFrame: number;
    _offlineIdle: IOfflineIdle[];
    _offlineIdleIndex: number;
    reportMessage: (message: {
        code: EErrorCode;
        message: string;
        e?: object;
    }) => void;
    constructor(options: {
        hardwareAcceleration: string;
        resourceManager: ResourceManager;
        saveAndDownload: SaveAndDownload;
        dataCacheQueue: DataCacheQueue;
        reportMessage: (message: {
            code: EErrorCode;
            message: string;
            e?: object;
        }) => void;
    });
    getRandomTaskId(): string;
    decode(files: Array<IRawBodyFrameData>, onFrame: (file: bodyFile, frame: any, index: number) => void): void;
    updateQueue(files: Array<IRawBodyFrameData>): void;
    _isIOS(): boolean;
    getQueue(): {
        x_offset: never[];
        hfd: boolean;
        aef: number;
        asf: number;
        id: number;
        n: string;
        s: string;
        body_id: number;
        sf: number;
        ef: number;
    }[];
    timeoutPromise(ms: number, reason?: string): Promise<unknown>;
    loadVideoWithTimeout(videoKey: string): Promise<ArrayBuffer | null>;
    _tryStartNext(): Promise<void>;
    _startWorker(file: bodyFile): void;
    cacheVideo(): void;
    abort(): void;
    abortOne(id: string): void;
    destroy(): void;
    _handlePendingAbort(file: bodyFile, index: number): void;
    private _cleanupOldWorkers;
    syncDecode(currentFrameIndex: number): void;
    /** 进入正常模式 */
    _reload(): void;
    /** 进入离线，清空剩余身体数据 */
    _offLineMode(offlineIdle: IOfflineIdle[], currentFrame: number): void;
    _offlineRun(): void;
    /** 设置 idle 视频 */
    _putOfflineBodyData(idle: IOfflineIdle): void;
}
