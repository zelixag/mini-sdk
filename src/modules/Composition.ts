import AvatarRender from "../baseRender/AvatarRenderer";
import UIRenderer from "../baseRender/UIRenderer";
import AudioRenderer from "../baseRender/AudioRenderer";
type TRenderer = UIRenderer;
export default class Composition {
  TAG = "[Composition]";
  container: Element;
  avatarRenderer: AvatarRender;
  audioRenderer: AudioRenderer;
  restRenderers: TRenderer[];

  constructor(options: {
    container: Element;
    avatarRenderer: AvatarRender;
    restRenderers: TRenderer[];
    audioRenderer: AudioRenderer;
  }) {
    this.container = options.container;
    this.avatarRenderer = options.avatarRenderer;
    this.restRenderers = options.restRenderers;
    this.audioRenderer = options.audioRenderer;
    this.container.appendChild(options.avatarRenderer.canvas);
  }

  compose(frameIndex: number) {
    this.avatarRenderer.render(frameIndex);
    this.audioRenderer.render(frameIndex);
    for (const r of this.restRenderers) {
      const layer = r.render(frameIndex);
      r.clearTrackerRenderer();
      if (layer) {
        for (const l of layer) {
          const ele = l?.render();
          if (ele) {
            this.container.appendChild(ele as Node);
          }
        }
      }
    }
  }

  stop() {
    this.audioRenderer.stop(-1);
  }

  destroy() {
    this.avatarRenderer.destroy();
    this.audioRenderer.destroy();
    this.restRenderers.forEach((r) => r.destroy());
  }
}
