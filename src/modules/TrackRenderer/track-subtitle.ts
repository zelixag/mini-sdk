import { IWidgetSubtitle } from "../../types/event";
import BaseTrack from "./base-track";
import DefaultRender from './render-implements';

export default class SubtitleTrack extends BaseTrack {
  data: IWidgetSubtitle;
  private instance?: any; // 实例引用，用于区分不同数字人实例
  constructor(data: IWidgetSubtitle, instance?: any) {
    super();
    this.data = data;
    this.instance = instance;
  }
  render() {
    return DefaultRender.WIDGET_SUBTITLE(this.data, this.instance);
  }
}
