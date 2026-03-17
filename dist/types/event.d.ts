export type TWidgetType = 'widget_pic' | 'widget_slideshow' | 'subtitle_on' | 'subtitle_off' | 'widget_text' | 'widget_video' | any;
/** UI 控件位置 */
export interface IWidgetCommon {
    axis_id: number;
    'x_location'?: number;
    'y_location'?: number;
    width?: number;
    height?: number;
}
export interface IWidgetPic extends IWidgetCommon {
    image: string;
}
export interface IWidgetSlideshow extends IWidgetCommon {
    images: Array<string>;
}
export interface IWidgetSubtitle extends IWidgetCommon {
    text: string;
    axis_id: number;
    type: TWidgetType;
}
export interface IWidgetText extends IWidgetCommon {
    text_content: string;
}
export interface IWidgetVideo extends IWidgetCommon {
    video: string;
    cover: string;
}
export type IWidget = IWidgetPic | IWidgetSlideshow | IWidgetSubtitle | IWidgetText | IWidgetVideo | any;
export interface ISetCharacterCanvasAnchor {
    type: string;
    'x_location': number;
    'y_location': number;
    width: number;
    height: number;
}
