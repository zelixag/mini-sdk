/**
 * 3D 渲染（身体+表情）
 */
import ResourceManager from "../modules/ResourceManager";
import { DataCacheQueue } from "../control/DataCacheQueue";
import { GLDevice } from "../utils/GLDevice";
import { IBRAnimationData_NN } from "../utils/GLPipeline";
type Option = {
    dataCacheQueue: DataCacheQueue;
    resourceManager: ResourceManager;
};
export default class AvatarRender {
    private TAG;
    options: Option;
    canvas: HTMLCanvasElement;
    device: GLDevice;
    private isInit;
    private isFirstFrame;
    constructor(options: Option);
    init(data: IBRAnimationData_NN): Promise<void>;
    private style;
    render(): HTMLCanvasElement;
}
export {};
