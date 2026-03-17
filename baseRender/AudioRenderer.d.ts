/**
 * 音频渲染
 * 使用 AudioContext 控制
 */
import { DataCacheQueue } from "../control/DataCacheQueue";
type Option = {
    dataCacheQueue: DataCacheQueue;
};
export default class AudioRender {
    private TAG;
    private options;
    audioCtx: AudioContext;
    source: AudioBufferSourceNode | null;
    isPlaying: boolean;
    constructor(options: Option);
    render(frameIndex: number): Promise<void>;
    stop(): void;
}
export {};
