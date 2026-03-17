import { EFrameDataType, IRawFrameData, StateChangeInfo } from "../types/frame-data";
import XmovAvatar from "index";
import { Layout, WalkConfig } from "../types";
import { IResumeParams } from "../modules/ResourceManager";
import '../proto/protobuf.min';
import '../proto/face_data_pb';
interface ITtsaOptions {
    sdkInstance: XmovAvatar;
    url: string;
    room: string;
    session_id: string;
    token: string;
    appInfo: {
        appId: string;
        appSecret: string;
        env: string;
    };
    framedata_proto_version: number;
    onReady(): void;
    handleMessage: (type: EFrameDataType, data: IRawFrameData[]) => void;
    handleAAFrame: (data: any) => void;
    runStartFrameIndex: (server_time: number) => void;
    ttsaStateChangeHandle: (state: StateChangeInfo) => void;
    reloadSuccess: () => void;
    enterOfflineMode: () => void;
    reStartSDK: () => void;
    reconnect_client_timeout: number;
    sendVoiceEnd: () => void;
}
export default class Ttsa {
    private TAG;
    private ws;
    private room;
    private session_id;
    private token;
    private framedata_proto_version;
    private getResumeInfo?;
    private runStartFrameIndex;
    private ttsaStateChangeHandle;
    private sdk;
    private reloadSuccess;
    private _lastSessionId;
    private _uniqueSpeakId;
    private session_speak_req_id;
    private enterOfflineMode;
    private reStartSDK;
    private reconnect_client_timeout;
    private reconnectTimer;
    private wsConnectTimer;
    private WS_NO_DATA_TIMEOUT;
    private enterOfflineFlag;
    private sendVoiceEnd;
    /**
     * 清除WebSocket重连定时器
     */
    clearReconnectTimer(): void;
    private _isResume;
    private appInfo;
    constructor(options: ITtsaOptions);
    clearOldWsTimeoutTimer: () => void;
    initWsTimeoutTimer: () => void;
    start(): void;
    idle(): void;
    listen(): void;
    think(): void;
    interactiveidle(): void;
    /**
     * 通知后端进入隐身模式
     */
    enterInvisibleMode(): void;
    /**
     * 通知后端退出隐身模式
     */
    exitInvisibleMode(): void;
    firstStartTimestamp(server_time: number): void;
    sendText(ssml: string, is_start: boolean, is_end: boolean, extra?: {
        client_speak_id: string;
    }): string | undefined;
    sendSdkPoint(name: string, params?: any, extra?: any): void;
    stateChange(state: string, params?: object): void;
    sendPerfLog(payload: object): void;
    changeLayout(layout: Layout): void;
    changeWalkConfig(walkConfig: WalkConfig): void;
    private send;
    getStatus(): boolean;
    _setResumeInfoCallback(lastSessionId: string, _getResumeInfo: () => IResumeParams): void;
    _getResumeInfo(): IResumeParams | null;
    updateUniqueSpeakId(): void;
    getUniqueSpeakId(): string;
    close(): void;
    connect(): void;
}
export {};
