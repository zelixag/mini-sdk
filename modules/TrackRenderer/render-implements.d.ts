/**
 * widget_xx 的默认实现
 */
import { IWidgetPic, IWidgetSlideshow, IWidgetSubtitle, IWidgetText, IWidgetVideo } from "types/event";
import { IRawWidgetData } from "types/frame-data";
declare const WidgetDefaultRenderer: {
    _el(axis_id?: number): HTMLDivElement;
    WIDGET_PIC(data: IWidgetPic): void | HTMLDivElement;
    WIDGET_SLIDESHOW(data: IWidgetSlideshow): void | HTMLDivElement;
    WIDGET_SUBTITLE(data: IWidgetSubtitle): void | HTMLDivElement;
    WIDGET_TEXT(data: IWidgetText): void | HTMLDivElement;
    WIDGET_VIDEO(data: IWidgetVideo): void | HTMLDivElement;
    CUSTOM_WIDGET?(data: IRawWidgetData): void;
};
export default WidgetDefaultRenderer;
