import { GLDevice } from "./GLDevice";
import { IBRAnimationGeneratorStaticInfo_NN, IBRAnimationGeneratorCharInfo_NN, IBRAnimationFrameData_NN, RigidTransform, TextureFloat_3D } from "./DataInterface";

export interface GLPipelineCharData {
    char: IBRAnimationGeneratorCharInfo_NN | null,
    LUT: TextureFloat_3D | null,
    transform: {
        offsetX: number;
        offsetY: number;
        scaleX: number;
        scaleY: number;
    }
    multisample: number | null;
}
export interface GLPipelineFrameData {
    backgroundTexture: HTMLImageElement | HTMLVideoElement | null,
    charBodyTexture: HTMLImageElement | HTMLVideoElement,
    data: IBRAnimationFrameData_NN | null,
    onPostRender: (pipeline: GLPipeline) => GLPipelineFrameData | null
}

interface PipelineInfo {
  program: WebGLProgram,
  progUniforms: { [index: string]: WebGLUniformLocation },
  progUniformBlocks: { [index: string]: GLint },
  progAttribs: { [index: string]: GLint }
}
interface TexturePCAModel {
  texture: WebGLTexture,
  unsigned: boolean,
  scalingFactor?: Float32Array;
}
interface MeshInfo {
  VAO: WebGLVertexArrayObject,
  buffers: { [index: string]: WebGLBuffer },
  textures: { [index: string]: WebGLTexture },
  texturePCAModels: TexturePCAModel[],
  uniformUInts: { [index: string]: number }
}
interface MeshStatistics {
  max_pca_component_count: number,
  max_bs_count: number,
  max_bones: number
}

export declare class GLPipeline {
  public readonly device: GLDevice;
  private compat_features: { [index: string]: unknown };

  private charData: GLPipelineCharData | null;
  private backgroundPipelineInfo: PipelineInfo
  private backgroundVAO: WebGLVertexArrayObject;
  private backgroundTextures: { [index: string]: WebGLTexture };
  private backgroundTextureSrc: unknown;

  private meshPipelineInfo: PipelineInfo | null;
  private maskPipelineInfo: PipelineInfo | null;
  private meshInfos: Array<MeshInfo>;
  private meshStatistics: MeshStatistics;

  private FrameTexture_meshColor: WebGLTexture | null;
  private FrameTexture_meshAlpha: WebGLTexture | null;
  private LUTTexture: WebGLTexture | null;

  private FrameBuffer_MSAA: WebGLFramebuffer | null;
  private FrameBuffer_meshColor: WebGLFramebuffer | null;
  private FrameBuffer_meshAlpha: WebGLFramebuffer | null;
  private initSkeletonStatus: RigidTransform[];

  private first_webgl_render;
  private frameDataCallback: () => GLPipelineFrameData | null;

  private currentGamma: {r: number, g: number, b: number };
  private currentColorBalance: { rc: number, gm: number, by: number };

  constructor(device: GLDevice);

  private assembleBackgroundPipeline(): void;
  private assembleMeshPipelines(data: GLPipelineCharData): void;
  private initFrame(): void;
  private renderBackground(background: HTMLImageElement | HTMLVideoElement | null, char_body: HTMLImageElement | HTMLVideoElement, transform: { offsetX: number; offsetY: number; scaleX: number; scaleY: number; } | null): void;
  private renderMesh(data: GLPipelineCharData, frame_data: IBRAnimationFrameData_NN): void;
  private _onRender(): void;

  public reinitialize(): void;
  public setSyncMedia(syncMedia?: HTMLVideoElement): void;
  public setCharData(charData?: GLPipelineCharData): void;
  public setFrameDataCallback(cb: () => GLPipelineFrameData | null): void;
  public setGamma(gammaR: number, gammaG: number, gammaB: number): void;
  public setColorBalance(rc: number, gm: number, by: number): void;

  public renderFrame(
    image: ImageBitmap | any,
    frame: IBRAnimationFrameData_NN | null,
    background: HTMLImageElement | null,
    transform: {
      offsetX: number;
      offsetY: number;
      scaleX: number;
      scaleY: number;
    } | null
  ): void;
}