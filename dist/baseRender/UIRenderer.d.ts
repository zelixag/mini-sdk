/**
 * UI 控件渲染，所有轨道的元素
 */
import { DataCacheQueue } from "../control/DataCacheQueue";
import TrackerRenderer from "../modules/TrackRenderer/index";
import ResourceManager from "../modules/ResourceManager";
import XmovAvatar from "../index";
type Option = {
    sdk: XmovAvatar;
    dataCacheQueue: DataCacheQueue;
    resourceManager: ResourceManager;
    enableClientInterrupt: boolean;
    onVoiceEnd: (speech_id: number) => void;
    onVoiceStart: (duration: number, speech_id: number) => void;
    onWalkStateChange: (state: string) => void;
    clearSubtitleOn: (speech_id: number) => void;
    sendSdkPoint: (type: string, data: any, extra?: any) => void;
    onSpeakStateChange: (state: string, client_speak_id: number | string) => void;
};
export default class UIRenderer {
    private TAG;
    options: Option;
    trackerRenderer: TrackerRenderer[];
    root: HTMLDivElement;
    lastFrameIndex: number;
    onVoiceEnd: (speech_id: number) => void;
    onVoiceStart: (duration: number, speech_id: number) => void;
    onWalkStateChange: (state: string) => void;
    clearSubtitleOn: (speech_id: number) => void;
    initEventsRendered: boolean;
    interruptSpeechId: number;
    enableClientInterrupt: boolean;
    onSpeakStateChange: (state: string, client_speak_id: number | string) => void;
    constructor(options: Option);
    render(frame: number): TrackerRenderer[] | undefined;
    clearTrackerRenderer(): void;
    setInterrupt(speech_id: number): void;
    destroy(): void;
}
export {};
