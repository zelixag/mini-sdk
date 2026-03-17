export type TWidgetType =
  // | 'ka_intent'
  // | 'ka'
  | 'widget_pic' // 单个图片
  | 'widget_slideshow' // 轮播
  | 'subtitle_on' // 字幕
  | 'subtitle_off' // 字幕
  | 'widget_text' // 文本
  | 'widget_video' // 视频
  | any

/** UI 控件位置 */
export interface IWidgetCommon {
  axis_id: number
  'x_location'?: number
  'y_location'?: number
  width?: number
  height?: number
}

export interface IWidgetPic extends IWidgetCommon {
  image: string
}
export interface IWidgetSlideshow extends IWidgetCommon {
  images: Array<string>
}
export interface IWidgetSubtitle extends IWidgetCommon {
  text: string
  axis_id: number
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
  | any



// export interface IUIEvent<T extends any = any> {
//   start_frame: number
//   end_frame: number
//   callback_info: {
//     type: TWidgetType // event 类型
//     data: T // event 数据
//   }
// }

export interface ISetCharacterCanvasAnchor {
  type: string
  'x_location': number
  'y_location': number
  width: number
  height: number
}
