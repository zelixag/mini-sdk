import { EFrameDataType, IRawFrameData } from "types/frame-data";
interface ITtsaOptions {
    url: string;
    room: string;
    onReady(): void;
    handleMessage: (type: EFrameDataType, data: IRawFrameData[]) => void;
    runStartFrameIndex: (server_time: number) => void;
    stateChangeHandle: (state: string) => void;
}
export default class Ttsa {
    private TAG;
    private ws;
    private room;
    private runStartFrameIndex;
    private stateChangeHandle;
    constructor(options: ITtsaOptions);
    start(): void;
    faceDetect(): void;
    wakeUp(): void;
    listen(): void;
    think(): void;
    firstStartTimestamp(server_time: number): void;
    sendText(ssml: string, is_end: boolean): void;
    stateChange(state: string): void;
    private send;
    close(): void;
}
export {};
