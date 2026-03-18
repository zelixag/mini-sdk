/**
 * AvatarRenderer 小程序版（稳定单画布路径）
 *
 * 当前策略：优先保证“人像稳定可见 + 帧连续”。
 * 说明：face_data 先入队，后续再接单画布可用的真实融合管线。
 */

import type { BodyRendererMP } from '../modules/body-renderer-mp';
import type { ResourceManagerMP } from '../modules/resource-manager-adapter';
import type { DataCacheQueueMP } from '../control/DataCacheQueueMP';
import { FaceSignalAdapter } from '../modules/face-signal-adapter';
import { LipSyncControllerMP } from '../control/LipSyncControllerMP';
import { GLPipelineMP, GLPipelineCharData } from '../utils/GLPipelineMP';
import { GLDeviceMP } from '../utils/GLDeviceMP';
import { IBRAnimationGeneratorCharInfo_NN, IBRAnimationFrameData_NN, IBRMeshFrameInfo, transformMJT } from '../utils/DataInterfaceMP';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('AvatarRenderer');

export interface AvatarRendererMPOptions {
  bodyRenderer: BodyRendererMP;
  resourceManager: ResourceManagerMP;
  dataCacheQueue: DataCacheQueueMP;
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  canvas: any;
}

export interface FaceAlignmentConfigMP {
  offset_x_px?: number;
  offset_y_px?: number;
  offset_x_ndc?: number;
  offset_y_ndc?: number;
  head_motion_scale?: number;
  expr_motion_scale?: number;
  eye_extra_scale?: number;
  offsetXPx?: number;
  offsetYPx?: number;
  offsetXNdc?: number;
  offsetYNdc?: number;
  headMotionScale?: number;
  exprMotionScale?: number;
  eyeExtraScale?: number;
}

export class AvatarRendererMP {
  private bodyRenderer: BodyRendererMP;
  private resourceManager: ResourceManagerMP;
  private dataCacheQueue: DataCacheQueueMP;
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  private canvas: any;
  private charInfo: IBRAnimationGeneratorCharInfo_NN | null = null;
  private isInit = false;
  private faceSignalAdapter: FaceSignalAdapter;
  private lipSyncController: LipSyncControllerMP;
  
  private device: GLDeviceMP | null = null;
  private pipeline: GLPipelineMP | null = null;
  private runtimeFaceAlignConfig: FaceAlignmentConfigMP | null = null;

  // Web SDK 对齐：缓存上一帧有效的 face 数据，当前帧找不到时用作 fallback
  // 防止因 body_id 不匹配、帧索引间隙、数据延迟等导致 face mesh 被跳过
  private lastValidFaceData: IBRAnimationFrameData_NN | null = null;

  private applyFaceAlignmentConfig(): void {
    if (!this.pipeline) return;
    const cfg = this.resourceManager.getConfig?.() || {};
    const align = {
      ...(cfg?.face_align || cfg?.faceAlign || {}),
      ...(this.runtimeFaceAlignConfig || {})
    };
    const canvasW = this.gl.drawingBufferWidth || 0;
    const canvasH = this.gl.drawingBufferHeight || 0;
    const toNum = (v: any): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

    let offsetXPx = toNum(align.offset_x_px ?? align.offsetXPx);
    let offsetYPx = toNum(align.offset_y_px ?? align.offsetYPx);

    // 兼容历史 NDC 调参项（+X 向右，+Y 向上）
    const offsetXNdc = toNum(align.offset_x_ndc ?? align.offsetXNdc);
    const offsetYNdc = toNum(align.offset_y_ndc ?? align.offsetYNdc);
    if (offsetXPx === undefined && offsetXNdc !== undefined && canvasW > 0) {
      offsetXPx = (offsetXNdc * canvasW) / 2;
    }
    if (offsetYPx === undefined && offsetYNdc !== undefined && canvasH > 0) {
      offsetYPx = (-offsetYNdc * canvasH) / 2;
    }

    this.pipeline.setFaceAlignmentConfig({
      offsetXPx: offsetXPx ?? 0,
      offsetYPx: offsetYPx ?? 0,
      headMotionScale: toNum(align.head_motion_scale ?? align.headMotionScale),
      exprMotionScale: toNum(align.expr_motion_scale ?? align.exprMotionScale),
      eyeExtraScale: toNum(align.eye_extra_scale ?? align.eyeExtraScale),
    });
  }

  /**
   * 设置画布尺寸并重建管线 FBO（用于非全屏或自定义大小）。
   * @param width 画布缓冲宽度（像素）
   * @param height 画布缓冲高度（像素）
   */
  setCanvasSize(width: number, height: number): void {
    if (!this.gl || width <= 0 || height <= 0) return;
    const canvas = this.canvas;
    if (canvas && typeof canvas.width !== 'undefined' && typeof canvas.height !== 'undefined') {
      canvas.width = width;
      canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
    this.pipeline?.resizeFramebuffers();
  }

  /**
   * 运行时热更新脸部贴合参数（无需重启会话）
   */
  setFaceAlignmentConfig(config?: FaceAlignmentConfigMP): void {
    if (!config || typeof config !== 'object') return;
    this.runtimeFaceAlignConfig = {
      ...(this.runtimeFaceAlignConfig || {}),
      ...config
    };
    this.applyFaceAlignmentConfig();
  }

  constructor(options: AvatarRendererMPOptions) {
    this.bodyRenderer = options.bodyRenderer;
    this.resourceManager = options.resourceManager;
    this.dataCacheQueue = options.dataCacheQueue;
    this.gl = options.gl;
    this.canvas = options.canvas;
    this.faceSignalAdapter = new FaceSignalAdapter({
      blendshapeMap: this.resourceManager.resource_pack?.blendshape_map || []
    });
    this.lipSyncController = new LipSyncControllerMP();
  }

  /** 初始化（尝试加载 char.bin 启用 GLPipeline） */
  init(charInfoRaw?: any): void {
    const rawCharInfo = charInfoRaw ?? this.resourceManager.getMouthShapeLib()?.char_info ?? null;
    
    if (rawCharInfo && rawCharInfo instanceof ArrayBuffer) {
        try {
            // 初始化 GLPipeline
            this.device = new GLDeviceMP(this.gl, this.canvas);
            
            // 解析 char.bin
            const blendshapeMap = this.resourceManager.resource_pack?.blendshape_map;
            // 注意：IBRAnimationGeneratorCharInfo_NN 构造函数可能抛错
            this.charInfo = new IBRAnimationGeneratorCharInfo_NN(rawCharInfo, { blendshapeMap });
            
            const pipelineData: GLPipelineCharData = {
                char: this.charInfo,
                LUT: null, // 小程序暂不支持 LUT
                transform: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
                multisample: 0
            };
            
            this.pipeline = new GLPipelineMP(this.device);
            this.pipeline.setCharData(pipelineData);
            this.applyFaceAlignmentConfig();
            
            log.info('GLPipeline initialized successfully');
        } catch (e) {
            log.error(`GLPipeline init failed: ${e}`);
            this.charInfo = null;
            this.pipeline = null;
        }
    } else {
        log.info('No char.bin found, fallback to BodyRenderer');
    }

    this.faceSignalAdapter.setBlendshapeMap(this.resourceManager.resource_pack?.blendshape_map || []);
    this.lipSyncController.reset();
    const cfg = this.resourceManager.getConfig?.() || {};
    const mouthCfg = cfg?.lip_sync?.mouth_mask || cfg?.mouth_mask || {};
    const lipMode = cfg?.lip_sync?.mode === 'strong' ? 'strong' : 'subtle';
    const defaultStrength = lipMode === 'strong' ? 0.32 : 0.18;
    const defaultHeightOpen = lipMode === 'strong' ? 0.04 : 0.024;
    const defaultWidth = lipMode === 'strong' ? 0.09 : 0.08;
    this.bodyRenderer.setMouthRegion({
      enabled: typeof mouthCfg.enabled === 'boolean' ? mouthCfg.enabled : true,
      centerX: typeof mouthCfg.center_x === 'number' ? mouthCfg.center_x : 0.5,
      centerY: typeof mouthCfg.center_y === 'number' ? mouthCfg.center_y : 0.2,
      width: typeof mouthCfg.width === 'number' ? mouthCfg.width : defaultWidth,
      heightBase: typeof mouthCfg.height_base === 'number' ? mouthCfg.height_base : 0.022,
      heightOpen: typeof mouthCfg.height_open === 'number' ? mouthCfg.height_open : defaultHeightOpen,
      strength: typeof mouthCfg.strength === 'number' ? mouthCfg.strength : defaultStrength,
      autoTrack: typeof mouthCfg.auto_track === 'boolean' ? mouthCfg.auto_track : true
    });
    this.isInit = true;
  }

  /** 将 IAlignedFaceFrameData 转换为 IBRAnimationFrameData_NN */
  private convertFaceData(alignedData: any): IBRAnimationFrameData_NN | null {
      if (!alignedData || !alignedData.FaceFrameData) return null;

      const raw = alignedData.FaceFrameData;
      const result = new IBRAnimationFrameData_NN();

      // 关键修复：使用 mesh[0].blendshapeWeights（经过 blendshapeMap 映射后的值），
      // 而非原始 bsw。blendshapeIndices 期望的是 char.bin 定义的顺序，
      // 原始 bsw 是服务端顺序，两者不一致会导致嘴型权重全部取错。
      // Web SDK 的 IBRAnimationFrameData_NN 也是按 blendshapeIndices 索引填充的。
      if (raw.mesh?.[0]?.blendshapeWeights?.length > 0) {
        result.blendshapeWeights = new Float32Array(raw.mesh[0].blendshapeWeights);
      } else if (raw.blendshapeWeights) {
        // fallback：无 mesh 映射时用原始 bsw
        result.blendshapeWeights = new Float32Array(raw.blendshapeWeights);
      }

      if (raw.mesh && Array.isArray(raw.mesh)) {
          result.mesh = raw.mesh.map((m: any) => {
              return new IBRMeshFrameInfo(m.textureModelIndex, new Float32Array(m.texturePCAWeights));
          });
      }

      if (raw.movableJointTransforms) result.movableJointTransforms = transformMJT(raw.movableJointTransforms);

      return result;
  }

  /** 渲染指定帧（由 RenderScheduler 驱动） */
  private _diagRenderCount = 0;

  render(frameIndex: number): void {
    if (!this.isInit) return;

    const bodyChunk = this.bodyRenderer.findBodyChunk(frameIndex) as any;
    const bodyId = bodyChunk?.body_id || 0;

    // 诊断日志：每 60 帧打一次渲染状态
    if (++this._diagRenderCount % 60 === 1) {
      const rqLen = (this.dataCacheQueue as any).realFacialQueue?.length ?? -1;
      const fqLen = (this.dataCacheQueue as any).facialQueue?.length ?? -1;
      console.log('[DIAG][AvatarRenderer] render',
        'frame=' + frameIndex,
        'bodyId=' + bodyId,
        'pipeline=' + !!this.pipeline,
        'realQ=' + rqLen, 'facialQ=' + fqLen,
        'hasBodyChunk=' + !!bodyChunk,
        'lastValid=' + !!this.lastValidFaceData
      );
    }

    if (this.pipeline) {
      // GLPipeline 路径：face mesh + body 融合渲染
      const rawBody = this.bodyRenderer.getRawFrame(frameIndex);
      if (!rawBody) {
        // rawBody 不可用时降级到 fallback，不直接 return
        // 否则 face 数据积压后被 trimFaceDataBefore 清除，嘴型永远不动
        const fb = this._findFaceData(frameIndex, bodyId);
        const signal = this.faceSignalAdapter.extract(fb);
        const mouthOpen = this.lipSyncController.update(frameIndex, signal);
        this.bodyRenderer.renderFrame(frameIndex, mouthOpen);
        return;
      }

      // face 数据查找：精确匹配 → bodyId=0 兜底 → 最新数据兜底
      let faceDataAligned = this._findFaceData(frameIndex, bodyId);

      let faceDataNN = this.convertFaceData(faceDataAligned);

      // Web SDK 对齐：如果当前帧找不到 face 数据，复用上一帧的有效数据
      // 防止 face mesh 短暂消失导致嘴型静止（用户看到的"嘴不动"）
      if (faceDataNN) {
        this.lastValidFaceData = faceDataNN;
      } else if (this.lastValidFaceData) {
        faceDataNN = this.lastValidFaceData;
      }

      this.pipeline.renderFrame(
        rawBody.data,
        faceDataNN,
        null, // background
        null, // transform
        rawBody.width,
        rawBody.height
      );
    } else {
      // 降级路径：纯 body 渲染 + 嘴型遮罩
      const faceDataAligned = this._findFaceData(frameIndex, bodyId);
      const signal = this.faceSignalAdapter.extract(faceDataAligned);
      const mouthOpen = this.lipSyncController.update(frameIndex, signal);
      this.bodyRenderer.renderFrame(frameIndex, mouthOpen);
    }
  }

  /** 统一 face 数据查找：同时查两个队列，优先使用 ef 更大（更新）的数据。
   *  speak 时 lipsync 数据在 facialQueue（face_frame_type=1），必须优先于
   *  realFacialQueue 中旧的视频追踪数据，否则嘴型永远不动。 */
  private _findFaceData(frameIndex: number, bodyId: number) {
    // 同时查两个队列，取 ef 更大的（更新的数据优先）
    const realData = this.dataCacheQueue.getRealFaceData(frameIndex, bodyId);
    const facialData = this.dataCacheQueue.getFaceData(frameIndex, bodyId);
    let data = this._pickNewerFaceData(realData, facialData);

    if (!data && bodyId !== 0) {
      const realData0 = this.dataCacheQueue.getRealFaceData(frameIndex, 0);
      const facialData0 = this.dataCacheQueue.getFaceData(frameIndex, 0);
      data = this._pickNewerFaceData(realData0, facialData0);
    }
    // 终极兜底：timelineFrameIndex 与服务端 sf/ef 不对齐时用最新数据
    if (!data) data = this.dataCacheQueue.getLatestFaceData();
    return data;
  }

  /** 从两个候选中选择 ef 更大（更新）的数据 */
  private _pickNewerFaceData(a: any, b: any): any {
    if (a && b) {
      return ((b.ef ?? 0) >= (a.ef ?? 0)) ? b : a;
    }
    return a || b || null;
  }

  getBodyRenderer(): BodyRendererMP {
    return this.bodyRenderer;
  }

  destroy(): void {
    this.bodyRenderer.destroy();
    this.lipSyncController.reset();
    this.isInit = false;
  }
}
