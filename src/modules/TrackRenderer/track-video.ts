import { IWidgetVideo } from "../../types/event";
import BaseTrack from "./base-track";

export default class ImageTrack extends BaseTrack {
  data: IWidgetVideo;

  constructor(data: IWidgetVideo) {
    super();
    this.data = data;
  }

  render() {
  }
}
