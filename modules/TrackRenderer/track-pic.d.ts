import { IWidgetPic } from "types/event";
import BaseTrack from "./base-track";
export default class ImageTrack extends BaseTrack {
    data: IWidgetPic;
    constructor(data: IWidgetPic);
    render(): void;
}
