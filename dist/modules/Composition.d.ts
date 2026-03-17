import AvatarRender from "../baseRender/AvatarRenderer";
import UIRenderer from "../baseRender/UIRenderer";
import AudioRenderer from "../baseRender/AudioRenderer";
type TRenderer = UIRenderer;
export default class Composition {
    TAG: string;
    container: Element;
    avatarRenderer: AvatarRender;
    audioRenderer: AudioRenderer;
    restRenderers: TRenderer[];
    constructor(options: {
        container: Element;
        avatarRenderer: AvatarRender;
        restRenderers: TRenderer[];
        audioRenderer: AudioRenderer;
    });
    compose(frameIndex: number): void;
    stop(): void;
    destroy(): void;
}
export {};
