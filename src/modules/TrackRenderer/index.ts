/**
 * 具体的 track 内容渲染
 */
import {
  IWidgetPic,
  IWidgetSlideshow,
  IWidgetSubtitle,
  IWidgetText,
  IWidgetVideo
} from '../../types/event';
import { IRawWidgetData } from '../../types/frame-data';
import TrackPic from './track-pic';
import TrackSlideshow from './track-slideshow';
import TrackSubtitle from './track-subtitle';
import TrackText from './track-text';
import TrackVideo from './track-video';
import DefaultRender from './render-implements';

export default class TrackRenderer {
  private TAG = '[TrackRenderer]';
  tracker!: TrackText | TrackPic | TrackSlideshow | TrackVideo | TrackSubtitle;
  private instance?: any; // 实例引用，用于区分不同数字人实例

  constructor(event: IRawWidgetData, instance?: any) {
    this.instance = instance;
    const { type, data, text = '' } = event
    if (type === 'widget_pic') {
      this.tracker = new TrackPic(data as IWidgetPic, instance);
    }
    if (type === 'widget_slideshow') {
      this.tracker = new TrackSlideshow(data as IWidgetSlideshow);
    }
    if (type === 'subtitle_on' || type === 'subtitle_off') {
      this.tracker = new TrackSubtitle({type, text, axis_id: data?.axis_id ?? 1000} as IWidgetSubtitle, instance);
    }
    if (type === 'widget_text') {
      this.tracker = new TrackText(data as IWidgetText);
    }
    if (type === 'widget_video') {
      this.tracker = new TrackVideo(data as IWidgetVideo);
    }
  }

  render() {
    return this.tracker?.render()
  }

  stop() {
    this.tracker.stop()
  }

  destroy() {
    DefaultRender.destroy(this.instance);
  }
}