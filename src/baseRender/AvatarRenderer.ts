/**
 * 3D 渲染（身体+表情）
 */
import ResourceManager from "../modules/ResourceManager";
import { DataCacheQueue, IBodyFrame } from "../control/DataCacheQueue";
import { GLDevice } from "../utils/GLDevice";
import { GLPipeline, GLPipelineCharData } from "../utils/GLPipeline";
import { performanceConstant } from "../utils/perfermance";
import { EErrorCode } from "../types/error";
import DefaultWidgetRenderer from "../modules/TrackRenderer/render-implements";
import { Layout, RenderState, WalkConfig } from "../types";
import { IBRAnimationFrameData_NN } from "../utils/DataInterface";
import SaveAndDownload from "../control/SaveAndDownload";
import { getStyleStr, updateCanvasXOffset } from "../utils";
import { IRawFaceFrameData } from "types/frame-data";

type Option = {
  dataCacheQueue: DataCacheQueue;
  resourceManager: ResourceManager;
  saveAndDownload: SaveAndDownload;
  onDownloadProgress: (progress: number) => void;
  onStateChange: (state: string) => void;
  onRenderChange: (state: RenderState) => void;
  sendVideoInfo: (info: { name: string; body_id: number; id: number }) => void;
  onError: (error: any) => void;
};
export default class AvatarRender {
  private TAG = "[AvatarRender]";
  options: Option;
  canvas = document.createElement("canvas");
  device: GLDevice | null;
  pipeline: GLPipeline | null;
  currentBodyFrame: IBodyFrame | null = null;
  lastFaceFrame: IRawFaceFrameData | null = null;
  private isInit = false;
  private isFirstRender = false;
  private lastFrameState: string = "";
  private lastRenderState: RenderState = RenderState.init;
  private onDownloadProgress: (progress: number) => void;
  private onStateChange?: (state: string) => void = () => {};
  private onRenderChange?: (state: RenderState) => void = () => {};
  private sendVideoInfo: (info: {
    name: string;
    body_id: number;
    id: number;
  }) => void = () => {};
  private lostHandler: (event: Event) => void = () => {};
  private restoreHandler: (event: Event) => void = () => {};
  private avatarCanvasVisible: boolean = true;
  private lastRealFaceFrameData: any = null; // 上一帧渲染的实时数据
  private lastRealFaceFrame: number = -1; // 上一次实时表情数据帧号
  private lastWeight: number = 0.0;

  private lastFrameIndex = -1;
  private saveAndDownload: SaveAndDownload;
  private canvasOffsetX = -1;
  private pendingCharData: GLPipelineCharData | null = null; // 待设置的字符数据
  private interrupt: boolean = false; // 是否中断speak
  private walkConfig: WalkConfig | null = null;
  layout: Layout | null = null;

  constructor(options: Option) {
    this.options = options;
    this.onDownloadProgress = options.onDownloadProgress;
    this.onStateChange = options.onStateChange;
    this.onRenderChange = options.onRenderChange;
    this.sendVideoInfo = options.sendVideoInfo;
    this.saveAndDownload = options.saveAndDownload;
    this.lostHandler = this._lostHandler.bind(this);
    this.restoreHandler = this._restoreHandler.bind(this);
    this.setCanvasVisibility(this.avatarCanvasVisible);
    // 延迟创建 GLDevice 和 GLPipeline，避免与视频解码器竞争 GPU 资源
    // 将在 init 方法中首次创建
    this.device = null;
    this.pipeline = null;
  }

  /**
   * 重置表情相关状态（用于从隐身模式恢复渲染时）
   */
  resetFaceFrameState() {
    this.lastRealFaceFrame = -1;
    this.lastRealFaceFrameData = null;
    this.lastWeight = 0.0;
    (window as any).avatarSDKLogger?.log(
      this.TAG,
      "重置表情状态（从隐身模式恢复）"
    );
  }

  /**
   * 创建 pipeline 并设置字符数据
   */
  private _createPipeline() {
    if (this.pipeline || !this.device) {
      return;
    }
    this.pipeline = new GLPipeline(this.device);
    
    // 如果有待设置的字符数据，立即设置
    if (this.pendingCharData) {
      this.pipeline.setCharData(this.pendingCharData);
      this.pipeline.setSyncMedia();
      this.pendingCharData = null;
    }
  }

  _lostHandler(event: Event) {
    event.preventDefault();
    console.error("Context lost.", event);
  }

  _restoreHandler(event: Event) {
    if (!this.device) {
      console.error("_restoreHandle device is null");
      this.device = new GLDevice(this.canvas);
      this.device.canvas.addEventListener("webglcontextlost", this.lostHandler, false);
      this.device.canvas.addEventListener("webglcontextrestored", this.restoreHandler, false);
    }
    this.isInit = false;
    // 把已经掉线的context拉起来
    if (this.pipeline) {
      this.pipeline.reinitialize();
      this.pipeline.setSyncMedia();
    }
  }

  init(data: GLPipelineCharData | null) {
    // this.style(this.options.resourceManager.getConfig()?.resolution?.width ?? 1080, this.options.resourceManager.getConfig()?.resolution?.height ?? 1920)
    let charInitData = data;
    // if (!this.device) {
    //   return;
    // }
    this.style(this.options.resourceManager.getConfig()?.resolution?.width ?? 1080, this.options.resourceManager.getConfig()?.resolution?.height ?? 1920)
    this.setCharacterCanvasAnchor();
    if(!charInitData?.char) {
      const charInfo = this.options.resourceManager.getMouthShapeLib().char_info;
      charInitData = {
        char: charInfo,
        LUT: null,
        transform: {
          offsetX: 0.0,
          offsetY: 0.0,
          scaleX: 1.0,
          scaleY: 1.0
        },
        multisample: null
      }
    }
    
    // 保存字符数据，但不创建 pipeline
    // pipeline 将在切换到在线模式时（resumeRender）才创建，避免在隐身模式时创建 pipeline 导致的 GPU 资源竞争
    this.pendingCharData = charInitData;
    this.isInit = true;
    // 注意：这里不创建 pipeline，将在切换到在线模式时通过 initPipeline() 方法创建
  }

  /**
   * 初始化 pipeline（在从隐身模式切换到在线模式时调用）
   * 用于延迟创建 pipeline，避免在隐身模式时创建 pipeline 导致的 GPU 资源竞争
   */
  initPipeline(): void {
    if (this.pipeline) {
      // 已经创建，不需要重复创建
      return;
    }
    // 创建 pipeline 并设置字符数据
    this._createPipeline();
  }

  private style(width = 0, height = 0) {
    if (width > 0 && height > 0) {
      // 设置canvas宽度为输入图片宽度的一半，因为输入的是左右两张图片合并的
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /**
   * 设置画布样式（修复transform失效 + 优化对齐逻辑 + 优雅拼接样式）
   * @param avatar 布局配置
   */
  setCanvasStyle(layout: Layout) {
    this.layout = layout;
    const initPoint = this.walkConfig?.init_point || null;
    const {width = 1080, height = 1920} = this.options.resourceManager.getConfig()?.resolution || {width: 1080, height: 1920};
    // 解构并设置默认值
    let {
      v_align = 'center', // 垂直对齐：top/middle/bottom（修正命名逻辑）
      h_align = 'center', // 水平对齐：left/center/right
      scale = 1.0,
      offset_x = 0.0,
      offset_y = 0.0
    } = layout.avatar || {};
    // [【LiteSDK】行走2期](https://rsjqcmnt5p.feishu.cn/wiki/U2Waw2SDZikg7UkyVgxcorh7nne)
    if(initPoint !== null && initPoint !== undefined) {
      h_align = 'left';
      offset_x = 0;
    }
    const avatarHeight = height * scale;
    const avatarWidth = width * scale;
    const marginX = avatarWidth  / 2;
    const marginY = avatarHeight / 2;

    // 基础样式（提取固定项，避免重复拼接）
    const baseStyles = {
      position: 'absolute',
      zIndex: 100,
      height: `${avatarHeight}px`,
      width: `${avatarWidth}px`,
      objectFit: 'contain',
      top: 'auto',
      right: 'auto',
      bottom: 'auto',
      left: 'auto',
      marginLeft: '0',
      marginTop: '0'
    };

    // 1. 处理水平对齐（h_align）：left/center/right
    switch (h_align) {
      case 'left':
        baseStyles.left = '0';
        break;
      case 'right':
        baseStyles.right = '0';
        break;
      default: // center
        baseStyles.position = 'absolute';
        baseStyles.left = '50%';
        baseStyles.marginLeft = `${-marginX + offset_x}px`;
        break;
    }

    // 2. 处理垂直对齐（v_align）：top/middle/bottom
    switch (v_align) {
      case 'top':
        baseStyles.top = '0';
        break;
      case 'bottom':
        baseStyles.bottom = '0';
        break;
      default: // middle
        baseStyles.position = 'absolute';
        baseStyles.top = '50%';
        baseStyles.marginTop = `${-marginY + offset_y}px`;
        break;
    }

    // 3. 合并transform（核心：只定义一次，避免覆盖）
    // 4. 拼接样式字符串（优雅转换为css样式）
    const styleStr = getStyleStr(baseStyles);

    // 应用样式
    this.canvas.setAttribute('style', styleStr);
  }

  setWalkConfig(walkConfig: WalkConfig) {
    this.walkConfig = walkConfig;
    if((walkConfig.init_point !== null || walkConfig.init_point !== undefined) && this.layout) {
      this.setCanvasStyle(this.layout);
    }
  }

  setCharacterCanvasAnchor(layout?: Layout) {
    if(layout?.avatar) {
      this.setCanvasStyle(layout);
    } else if(this.options.resourceManager.getConfig()?.layout) {
      const layout =this.options.resourceManager.getConfig()?.layout || {
        avatar: {
          v_align: "default",
          h_align: "default",
          scale: 1.0,
          offset_x: 0.0,
          offset_y: 0.0,
        },
      };
      this.setCanvasStyle(layout);
    } else {
        const baseStyles = {
        position: 'absolute',
        zIndex: 100,
        height: `100%`,
        objectFit: 'contain',
        top: 'auto',
        right: 'auto',
        bottom: 'auto',
        left: 'auto',
        marginLeft: '0',
        marginTop: '0'
      };
      const styleStr = getStyleStr(baseStyles);
      this.canvas.setAttribute('style', styleStr);
      const auchor = this.options.resourceManager.getConfig()?.init_events?.find((item) => item.type === 'SetCharacterCanvasAnchor') || {
        type: 'SetCharacterCanvasAnchor',
        x_location: 0.0,
        y_location: 0.0,
        width: 1.0,
        height: 1.0,
      };
      const {x_location, y_location, width, height} = auchor;
      const style = this.canvas.style.cssText + `left: calc(${x_location} * 100%); top: calc(${y_location} * 100%); transform: scale(${width}, ${height}); transform-origin: top left;`
      this.canvas.setAttribute("style", style);
    }
  }

  // 获取权重
  // this.lastWeight应初始化为0
  computeWeight(frameIndex) {
    const maxTweenStep = 12;

    const frameDiff = frameIndex - this.lastFrameIndex;
    const isLost: boolean = frameIndex > this.lastRealFaceFrame;

    if (isLost) {
      // 丢帧：权重累加步长，最大不超过1.0
      this.lastWeight = Math.min(this.lastWeight + frameDiff, maxTweenStep);
    } else {
      // 未丢帧：权重递减步长，最小不低于0.0
      this.lastWeight = Math.max(this.lastWeight - frameDiff, 0);
    }
    return this.lastWeight / maxTweenStep;
  }

  render(frameIndex: number) {
    if (!this.isInit) {
      return this.canvas;
    }
    // 确保 device 已创建
    if (!this.device) {
      this.device = new GLDevice(this.canvas);
      this.device.canvas.addEventListener("webglcontextlost", this.lostHandler, false);
      this.device.canvas.addEventListener("webglcontextrestored", this.restoreHandler, false);
    }
    // pipeline 应该在切换到在线模式时通过 initPipeline() 创建
    // 如果还没有创建，这里作为兜底方案创建（防止遗漏）
    if (!this.pipeline) {
      this.initPipeline();
      // 如果创建失败，返回 canvas
      if (!this.pipeline) {
        return this.canvas;
      }
    }
    const bodyFrame =
      this.options.dataCacheQueue._getBodyImageBitmap(frameIndex);
    
    // [DEBUG] 数据流追踪：获取渲染帧数据
    (window as any).avatarSDKLogger?.log('[DEBUG] AvatarRenderer.render - getBodyImageBitmap:', {
      frameIndex,
      hasBodyFrame: !!bodyFrame,
      bodyFrameKeys: bodyFrame ? Object.keys(bodyFrame) : [],
      hasFrame: !!bodyFrame?.frame,
      frameType: typeof bodyFrame?.frame,
      frameKeys: bodyFrame?.frame ? Object.keys(bodyFrame.frame) : [],
      frameWidth: bodyFrame?.frame?.displayWidth,
      frameHeight: bodyFrame?.frame?.displayHeight,
      hasClose: typeof bodyFrame?.frame?.close === 'function',
      bodyInfo: bodyFrame ? {
        name: bodyFrame.name,
        body_id: bodyFrame.body_id,
        id: bodyFrame.id,
        frameState: bodyFrame.frameState
      } : null
    });
    
    let faceFrame = this.options.dataCacheQueue._getFaceImageBitmap(
      frameIndex,
      bodyFrame?.body_id ?? bodyFrame?.id ?? 0
    );
    let curRealFaceData = this.options.dataCacheQueue._getRealFaceImageBitmap(frameIndex, bodyFrame?.body_id ?? bodyFrame?.id ?? 0);
    if (this.lastFrameState === "speak" && bodyFrame?.frameState !== "speak") {
      // 从speak切出，重置表情权重相关状态
      this.lastRealFaceFrame = -1;
      this.lastRealFaceFrameData = null;
      this.lastWeight = 0.0;
    }
    if(this.interrupt) {
      faceFrame = curRealFaceData;
    } else if(faceFrame?.FaceFrameData && faceFrame?.face_frame_type) {
      // 在当前第 i 帧时，如果有实时表情数据real_face_data_i，则用其来渲染，同时更新last_real_face_data和last_real_face_data_frame
      this.lastRealFaceFrameData = faceFrame.FaceFrameData;
      this.lastRealFaceFrame = frameIndex;
      // 实时数据帧连续时，权重递减
      if (this.lastRealFaceFrame !== -1 && this.lastWeight > 0 && curRealFaceData) {
      const lastWeight = this.computeWeight(frameIndex)
      faceFrame = {
          frameIndex,
          state: bodyFrame?.frameState || 'idle',
          body_id: bodyFrame?.body_id || -1,
          sf: frameIndex,
          ef: frameIndex,
          face_frame_type: 0,
          id: bodyFrame?.body_id || -1,
          FaceFrameData: IBRAnimationFrameData_NN.interp(
            this.lastRealFaceFrameData,
            curRealFaceData.FaceFrameData,
            curRealFaceData.FaceFrameData,
            lastWeight,
            this.options.resourceManager.resource_pack?.interpolate_joints || []
          )
        }
      }
    } else {
      if(this.lastRealFaceFrame === -1) {
        faceFrame = curRealFaceData;
        // this.options.onError({
        //   code: EErrorCode.RENDER_FACE_ERROR,
        //   message: `第${frameIndex}帧 实时面部数据为空,原始数据渲染`,
        //   e: JSON.stringify({ bodyFrame, faceFrame }),
        // });
      } else {
        // this.options.onError({
        //   code: EErrorCode.RENDER_FACE_ERROR,
        //   message: `第${frameIndex}帧 实时面部数据为空，插值渲染`,
        //   e: JSON.stringify({ bodyFrame, faceFrame }),
        // });
        if(curRealFaceData?.FaceFrameData) {
          if(this.lastRealFaceFrameData === null) {
            // 如果只有原始表情数据idle_face_data_i，若last_real_face_data为空，直接用idle_face_data_i渲染
            faceFrame = curRealFaceData;
          } else {
            // 若last_real_face_data非空，则使用last_real_face_data和idle_face_data_i的插值结果来渲染
            const lastWeight = this.computeWeight(frameIndex)
            faceFrame = {
              frameIndex,
              state: bodyFrame?.frameState || 'idle',
              body_id: bodyFrame?.body_id || -1,
              sf: frameIndex,
              ef: frameIndex,
              face_frame_type: 0,
              id: bodyFrame?.body_id || -1,
              FaceFrameData: IBRAnimationFrameData_NN.interp(
                this.lastRealFaceFrameData,
                curRealFaceData.FaceFrameData,
                curRealFaceData.FaceFrameData,
                lastWeight,
                this.options.resourceManager.resource_pack?.interpolate_joints || []
              )
            }
          }
        }
      }
    }
    this._setCurrentBodyFrame(bodyFrame);
    if (
      ((!bodyFrame || !faceFrame) && bodyFrame?.hfd) ||
      (!bodyFrame?.hfd && !bodyFrame?.frame)
    ) {
      // 判断bodyFrame和faceFrame是否为空
      if (!bodyFrame) {
        this.options.onError({
          code: EErrorCode.RENDER_BODY_ERROR,
          message: `Error:  第${frameIndex}帧 bodyFrame为空`,
          e: JSON.stringify({ bodyFrame, faceFrame }),
        });
      } else if (!faceFrame) {
        this.options.onError({
          code: EErrorCode.RENDER_FACE_ERROR,
          message: `Error: 第${frameIndex}帧 faceFrame为空`,
          e: JSON.stringify({ bodyFrame, faceFrame }),
        });
      }
      (window as any).avatarSDKLogger.log(
        this.TAG,
        "render第",
        frameIndex,
        "丢帧，bodyFrame",
        bodyFrame,
        "faceFrame",
        faceFrame
      );
    } else {
      // this.onRenderChange?.(RenderState.rendering);
    }
    if (
      ((bodyFrame && faceFrame?.FaceFrameData && bodyFrame?.hfd) ||
        (!bodyFrame?.hfd && bodyFrame?.frame)) &&
      this.device
    ) {
      this.sendVideoInfo({
        name: bodyFrame.name,
        body_id: bodyFrame.body_id,
        id: bodyFrame.id,
      });
      if (bodyFrame?.frameState !== this.lastFrameState) {
        this.onStateChange?.(bodyFrame?.frameState);
        if (bodyFrame.frameState !== "speak") {
          (window as any).performanceTracker.markEnd(
            performanceConstant.start_action_render,
            bodyFrame.frameState
          );
        }
        this.lastFrameState = bodyFrame?.frameState;
      }
      if (!this.isFirstRender) {
        (window as any).performanceTracker.markEnd(
          performanceConstant.first_avatar_render
        );
        this.onDownloadProgress?.(100);
        this.isFirstRender = true;  
        this.renderBackground();
      }
      // this.style(bodyFrame.frame.displayWidth, bodyFrame.frame.displayHeight);
      if (this.pipeline) {
        try {
          const faceData = bodyFrame?.hfd ? faceFrame?.FaceFrameData ?? null : null;
          if (faceData) {
            this.saveAndDownload.appendMultipleToArray("render_faceData", [faceFrame]);
          }
          this.lastFaceFrame = faceFrame;
          
          // [DEBUG] 数据流追踪：调用渲染管道
          (window as any).avatarSDKLogger?.log('[DEBUG] AvatarRenderer.render - renderFrame call:', {
            frameIndex,
            hasBodyFrame: !!bodyFrame,
            hasFrame: !!bodyFrame?.frame,
            frameType: typeof bodyFrame?.frame,
            frameWidth: bodyFrame?.frame?.displayWidth,
            frameHeight: bodyFrame?.frame?.displayHeight,
            hasFaceData: !!faceData
          });
          
          this.pipeline.renderFrame(
            bodyFrame.frame,
            faceData,
            null,
            // 临时方案，后续需要根据实际情况调整
            {
              offsetX: 0,
              offsetY: 0,
              scaleX: 1,
              scaleY: 1,
            }
          );
          const offset_PX = bodyFrame?.offset;
          if(offset_PX !== this.canvasOffsetX) {
            this.canvasOffsetX = offset_PX;
            if (DefaultWidgetRenderer.CUSTOM_WIDGET) {
              DefaultWidgetRenderer.CUSTOM_WIDGET({
                type: "set_character_canvas_offset",
                data: offset_PX
              });
            } else if (DefaultWidgetRenderer.PROXY_WIDGET && DefaultWidgetRenderer.PROXY_WIDGET["set_character_canvas_offset"]) {
              // 如果有代理的渲染器，则根据类型执行代理的渲染器
              DefaultWidgetRenderer.PROXY_WIDGET["set_character_canvas_offset"](offset_PX);
            } else {
              updateCanvasXOffset(this.canvas, offset_PX);
            }
          }
          this.lastFrameIndex = frameIndex;
        } catch (error) {
          (window as any).avatarSDKLogger.error(this.TAG, "渲染帧失败:", error);
        } finally {
          // 渲染完成后再关闭VideoFrame
          if (bodyFrame.frame && typeof bodyFrame.frame.close === "function") {
            bodyFrame.frame.close();
          }
        }
        this.onRenderChange?.(RenderState.rendering);
      } else {
        // 如果没有渲染，也要关闭VideoFrame
        if (bodyFrame?.frame && typeof bodyFrame.frame.close === "function") {
          bodyFrame.frame.close();
        }
      }
      return this.canvas;
    }
  }

  renderBackground() {
    const background = this.options.resourceManager.getBackgroundImageElement();
    if (!background) return;
    const bgContainer = document.getElementById("avatar-bg-container");
    if (!bgContainer) return;
    // 设置背景图样式
    bgContainer.style.backgroundImage = `url(${background.src})`;
    // 可添加其他背景样式（如覆盖方式、定位等）
    bgContainer.style.backgroundSize = "cover";
    bgContainer.style.backgroundPosition = "center";
  }

  _setCurrentBodyFrame(bodyFrame?: IBodyFrame) {
    if (bodyFrame) {
      this.currentBodyFrame = bodyFrame;
    }
  }
  _getCurrentBodyFrameInfo(frameIndex: number) {
    if (this.currentBodyFrame && frameIndex > 0) {
      return {
        client_frame: frameIndex,
        current_ani: this.currentBodyFrame.name,
        current_ani_frame:
          this.currentBodyFrame.frameIndex - this.currentBodyFrame.sf,
        next_state: this.lastFrameState || "idle",
      };
    }
    return {
      client_frame: 0,
      current_ani: "",
      current_ani_frame: 0,
      next_state: "idle",
    };
  }
  /**
   * 设置canvas的显隐状态
   * @param visible 是否可见
   */
  setCanvasVisibility(visible: boolean) {
    this.avatarCanvasVisible = visible;
    if (this.canvas) {
      this.canvas.style.display = visible ? "" : "none";
    }
  }

  /**
   * 获取canvas的显隐状态
   */
  getCanvasVisibility(): boolean {
    return this.avatarCanvasVisible;
  }

  destroy() {
    // 先移除事件监听器，避免在销毁过程中触发
    if (this.device) {
      this.device.canvas.removeEventListener(
        "webglcontextlost",
        this.lostHandler
      );
      this.device.canvas.removeEventListener(
        "webglcontextrestored",
        this.restoreHandler
      );
      
      // 如果 pipeline 存在，先销毁 pipeline（释放 WebGL 资源）
      if (this.pipeline) {
        this.pipeline.destroy();
        this.pipeline = null;
      }
      
      // 最后销毁 device（会释放 WebGL context）
      // 对于隐身的数字人，如果没有 pipeline，说明没有真正使用 WebGL
      // 使用延迟销毁，避免在渲染关键帧时释放 GPU 资源导致其他数字人渲染异常
      if (this.device.gl) {
        // 保存 device 引用，延迟销毁
        const deviceToDestroy = this.device;
        this.device = null; // 先清除引用，避免后续操作使用
        
        // 延迟到下一帧销毁，给其他数字人留出完成当前渲染的时间
        // 这样可以避免在销毁隐身数字人时影响正在说话的数字人的面部渲染
        requestAnimationFrame(() => {
          try {
            if (deviceToDestroy) {
              deviceToDestroy.destroy();
            }
          } catch (error) {
            // 忽略销毁错误，避免影响其他数字人
            (window as any).avatarSDKLogger?.warn?.('[AvatarRenderer] 销毁 device 时出错:', error);
          }
        });
      } else {
        // 如果 gl 为 null，直接清理引用
        this.device = null;
      }
    }
    
    // 清理状态
    this.isInit = false;
    this.isFirstRender = false;
    this.lastRealFaceFrame = -1;
    this.lastRealFaceFrameData = null;
    this.lastWeight = 0.0;
    this.onStateChange = undefined;
    this.lastFrameState = "";
    this.pipeline = null;

    const bgContainer = document.getElementById("avatar-bg-container");
    if (bgContainer && bgContainer.parentNode) {
      bgContainer.parentNode.removeChild(bgContainer);
    }


    // 移除 canvas
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.remove();
    }
  }
  setInterrupt(interrupt: boolean) {
    if(this.lastFaceFrame?.state !== 'speak' && interrupt) return
    this.interrupt = interrupt;
  }
}
