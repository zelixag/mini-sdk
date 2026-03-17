import { IWidgetSubtitle } from "../../types/event";
import BaseTrack from "./base-track";
export default class SubtitleTrack extends BaseTrack {
    data: IWidgetSubtitle;
    private instance?;
    constructor(data: IWidgetSubtitle, instance?: any);
    render(): HTMLDivElement | null;
}
