import AvatarRender from "baseRender/AvatarRenderer";
import UIRenderer from "baseRender/UIRenderer";
import AudioRenderer from "baseRender/AudioRenderer";
type TRenderer = AvatarRender | UIRenderer | AudioRenderer;
export default class Composition {
    TAG: string;
    container: Element;
    avatarRenderer: AvatarRender;
    audioRenderer: AudioRenderer;
    restRenderers: TRenderer[];
    constructor(options: {
        container: Element;
        avatarRenderer: AvatarRender;
        restRenderers: UIRenderer[];
        audioRenderer: AudioRenderer;
    });
    compose(frame: number): void;
}
export {};
