import { IWidgetPic } from "../../types/event";
import BaseTrack from "./base-track";
import DefaultRender from './render-implements';

export default class ImageTrack extends BaseTrack {
  data: IWidgetPic;
  private instance?: any; // 实例引用，用于区分不同数字人实例

  constructor(data: IWidgetPic, instance?: any) {
    super();
    this.data = data;
    this.instance = instance;
  }

  render() {
    return DefaultRender.WIDGET_PIC(this.data, this.instance);
  }
}
