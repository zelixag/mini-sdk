import { IWidgetSlideshow } from "../../types/event";
import BaseTrack from "./base-track";
export default class ImageTrack extends BaseTrack {
    data: IWidgetSlideshow;
    constructor(data: IWidgetSlideshow);
    render(): void;
}
