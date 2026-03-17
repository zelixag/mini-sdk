import { GLDevice } from './GLDevice';
import { IBRAnimationGeneratorCharInfo_NN, IBRAnimationFrameData_NN, TextureFloat_3D } from './DataInterface';
export interface GLPipelineCharData {
    char: IBRAnimationGeneratorCharInfo_NN | null;
    LUT: TextureFloat_3D | null;
    transform: {
        offsetX: number;
        offsetY: number;
        scaleX: number;
        scaleY: number;
    };
    multisample: number | null;
}
export interface GLPipelineFrameData {
    backgroundTexture: HTMLImageElement | HTMLVideoElement | null;
    charBodyTexture: HTMLImageElement | HTMLVideoElement;
    data: IBRAnimationFrameData_NN | null;
    onPostRender: (pipeline: GLPipeline) => GLPipelineFrameData | null;
}
export declare class GLPipeline {
    readonly device: GLDevice;
    private compat_features;
    private charData;
    private backgroundPipelineInfo;
    private backgroundVAO;
    private backgroundTextures;
    private backgroundTextureSrc;
    private meshPipelineInfo;
    private maskPipelineInfo;
    private meshInfos;
    private meshStatistics;
    private FrameTexture_meshColor;
    private FrameTexture_meshAlpha;
    private LUTTexture;
    private FrameBuffer_MSAA;
    private FrameBuffer_meshColor;
    private FrameBuffer_meshAlpha;
    private initSkeletonStatus;
    private frameDataCallback;
    private currentGamma;
    private currentColorBalance;
    private _ub_rig_info_data;
    private _ub_pca_info_data;
    private assembleBackgroundPipeline;
    assembleMeshPipelines(data: GLPipelineCharData): void;
    private initFrame;
    private renderBackground;
    private renderMesh;
    constructor(device: GLDevice);
    reinitialize(): void;
    setSyncMedia(syncMedia?: HTMLVideoElement): void;
    setCharData(charData?: GLPipelineCharData): void;
    setFrameDataCallback(cb: () => GLPipelineFrameData | null): void;
    setGamma(gammaR: number, gammaG: number, gammaB: number): void;
    setColorBalance(rc: number, gm: number, by: number): void;
    private _onRender;
    renderFrame(image: ImageBitmap | any, frame: IBRAnimationFrameData_NN | null, background: HTMLImageElement | null, transform: {
        offsetX: number;
        offsetY: number;
        scaleX: number;
        scaleY: number;
    } | null): void;
    destroy(): void;
}
