import { IWidgetText } from "../../types/event";
import BaseTrack from "./base-track";

export default class ImageTrack extends BaseTrack {
  data: IWidgetText;

  constructor(data: IWidgetText) {
    super();
    this.data = data;
  }

  render() {
  }
}
