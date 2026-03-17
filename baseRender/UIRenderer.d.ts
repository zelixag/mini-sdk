/**
 * UI 控件渲染，所有轨道的元素
 */
import { DataCacheQueue } from "../control/DataCacheQueue";
import TrackerRenderer from '../modules/TrackRenderer/index';
type Option = {
    dataCacheQueue: DataCacheQueue;
};
export default class UIRenderer {
    private TAG;
    options: Option;
    trackerRenderer?: TrackerRenderer;
    root: HTMLDivElement;
    constructor(options: Option);
    style(): void;
    render(frame: number): void | HTMLDivElement;
    stop(): void;
}
export {};
