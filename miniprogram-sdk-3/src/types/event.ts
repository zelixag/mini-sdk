export type TWidgetType =
  | 'widget_pic'
  | 'widget_slideshow'
  | 'subtitle_on'
  | 'subtitle_off'
  | 'widget_text'
  | 'widget_video'
  | string

export interface IWidgetCommon {
  axis_id: number
  x_location?: number
  y_location?: number
  width?: number
  height?: number
}

export interface IWidgetPic extends IWidgetCommon {
  image: string
}

export interface IWidgetSlideshow extends IWidgetCommon {
  images: string[]
}

export interface IWidgetSubtitle extends IWidgetCommon {
  text: string
  type: TWidgetType
}

export interface IWidgetText extends IWidgetCommon {
  text_content: string
}

export interface IWidgetVideo extends IWidgetCommon {
  video: string
  cover: string
}

export type IWidget =
  | IWidgetPic
  | IWidgetSlideshow
  | IWidgetSubtitle
  | IWidgetText
  | IWidgetVideo
