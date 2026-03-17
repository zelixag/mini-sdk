/**
 * 音频渲染
 * 使用 AudioContext 控制
 */
import ResourceManager from "modules/ResourceManager";
import { DataCacheQueue } from "../control/DataCacheQueue";
import AudioWorklet from "./AudioWorklet";
import XmovAvatar from "../index";
type Option = {
    sdk: XmovAvatar;
    dataCacheQueue: DataCacheQueue;
    resourceManager: ResourceManager;
};
export default class AudioRender {
    private TAG;
    private options;
    audioCtx: AudioContext;
    source: AudioBufferSourceNode | null;
    isPlaying: boolean;
    gainNode: GainNode | null;
    lastFrameIndex: number;
    offset: number;
    audio: AudioWorklet | null;
    firstFrameIndex: number;
    resourceManager: ResourceManager;
    valume: number;
    speech_id: number;
    cacheFirstFrameIndex: number;
    cacheAudioData: Uint8Array[];
    oldSpeechId: number;
    private mseAudioPlayer;
    constructor(options: Option);
    updateAudioData(audioList: any): void;
    _updateAudio(audioList: any): void;
    render(frameIndex: number): Promise<void>;
    resume(): void;
    pause(): void;
    stop(speech_id: number): void;
    setVolume(valume: number): void;
    destroy(): void;
}
export {};
