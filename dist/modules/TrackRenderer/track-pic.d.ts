import { IWidgetPic } from "../../types/event";
import BaseTrack from "./base-track";
export default class ImageTrack extends BaseTrack {
    data: IWidgetPic;
    private instance?;
    constructor(data: IWidgetPic, instance?: any);
    render(): HTMLDivElement;
}
