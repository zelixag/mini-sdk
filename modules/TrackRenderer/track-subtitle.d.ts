import { IWidgetSubtitle } from "types/event";
import BaseTrack from "./base-track";
export default class SubtitleTrack extends BaseTrack {
    data: IWidgetSubtitle;
    constructor(data: IWidgetSubtitle);
    render(): void;
}
