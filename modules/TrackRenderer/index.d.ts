import { IRawEventFrameData } from 'types/frame-data';
import TrackPic from './track-pic';
import TrackSlideshow from './track-slideshow';
import TrackSubtitle from './track-subtitle';
import TrackText from './track-text';
import TrackVideo from './track-video';
export default class TrackRenderer {
    private TAG;
    tracker: TrackText | TrackPic | TrackSlideshow | TrackVideo | TrackSubtitle;
    constructor(event: IRawEventFrameData);
    render(): void | HTMLDivElement;
    stop(): void;
}
