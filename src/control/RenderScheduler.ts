import { DataCacheQueue } from "./DataCacheQueue";
import AvatarRenderer from "../baseRender/AvatarRenderer";
import UIRenderer from "../baseRender/UIRenderer";
import Composition from "../modules/Composition";
import ResourceManager from "../modules/ResourceManager";
import {
  EFrameDataType,
  IRawFrameData,
  IRawBodyFrameData,
  IRawEventFrameData,
  IRawFaceFrameData,
  IRawAudioFrameData,
  ITtsFaceFrameData,
  StateChangeInfo,
} from "../types/frame-data";
import ParallelDecoder from "../modules/decoder";
import AnimationController from "../utils/requestAnimateFrames";
import { EErrorCode } from "../types/error";
import { formatMJT } from "../utils/DataInterface";
import AudioRenderer from "../baseRender/AudioRenderer";
import XmovAvatar from "index";
import SaveAndDownload from "./SaveAndDownload";
import { RenderState, WalkConfig } from "../types/index";
import { Layout } from "../types";

export default class RenderScheduler {
  private TAG = "[RenderScheduler]";
  private dataCacheQueue: DataCacheQueue;
  private sdk: XmovAvatar;

  private avatarRenderer: AvatarRenderer;
  private audioRenderer: AudioRenderer;
  private uiRenderer: UIRenderer;
  private composition: Composition;

  private currentSpeechId: number = -1;

  private resourceManager: ResourceManager;
  private frameAnimationController: AnimationController | undefined;
  private isStartPlay = false;
  private renderState: RenderState = RenderState.init;

  private onDownloadProgress: (progress: number) => void;
  private onRenderChange: (state: RenderState) => void;
  private decoder: ParallelDecoder;
  private saveAndDownload: SaveAndDownload;  
  public lastSpeechId = -1;
  private enableClientInterrupt: boolean = false;

  private setAudioInfo: (info: {
    sf: number;
    ef: number;
    ad: Uint8Array;
  }) => void;
  private setEventData: (info: {
    sf: number;
    ef: number;
    event: Array<any>;
  }) => void;
  private reportMessage: (message: {
    code: EErrorCode;
    message: string;
    e?: object;
  }) => void;
  private sendSdkPoint: (type: string, data: any, extra?: any) => void;
  constructor(config: {
    sdkInstance: XmovAvatar;
    container: Element;
    hardwareAcceleration: string;
    resourceManager: ResourceManager;
    enableDebugger?: boolean;
    enableClientInterrupt?: boolean;
    onDownloadProgress: (progress: number) => void;
    onStateChange: (state: string) => void;
    onSpeakStateChange: (state: string, client_speak_id: number | string) => void;
    onRenderChange: (state: RenderState, oldState?: RenderState) => void;
    onVoiceStateChange: (state: string, duration?: number) => void;
    onWalkStateChange: (state: string) => void;
    sendVideoInfo: (info: { name: string, body_id: number, id: number }) => void;
    setAudioInfo: (info: {
      sf: number;
      ef: number;
      ad: Uint8Array;
    }) => void;
    setEventData: (info: {
      sf: number;
      ef: number;
      event: Array<any>;
    }) => void;
    renderFrameCallback: (frame: number) => void;
    reportMessage: (message: {
      code: EErrorCode;
      message: string;
      e?: object;
    }) => void;
    sendSdkPoint: (type: string, data: any, extra?: any) => void;
  }) {
    this.setAudioInfo = config.setAudioInfo;
    this.setEventData = config.setEventData;
    this.reportMessage = config.reportMessage;
    this.sendSdkPoint = config.sendSdkPoint;
    this.onRenderChange = config.onRenderChange;
    this.enableClientInterrupt = config.enableClientInterrupt || false;
    this.saveAndDownload = new SaveAndDownload(
      "avatarData.js",
      config.enableDebugger
    );
    this.resourceManager = config.resourceManager;
    this.sdk = config.sdkInstance;
    this.onDownloadProgress = config.onDownloadProgress;
    this.dataCacheQueue = new DataCacheQueue();
    this.decoder = new ParallelDecoder({
      hardwareAcceleration: config.hardwareAcceleration,
      resourceManager: this.resourceManager,
      saveAndDownload: this.saveAndDownload,
      dataCacheQueue: this.dataCacheQueue,
      reportMessage: this.reportMessage,
    });

    this.avatarRenderer = new AvatarRenderer({
      dataCacheQueue: this.dataCacheQueue,
      resourceManager: this.resourceManager,
      saveAndDownload: this.saveAndDownload,
      onDownloadProgress: (progress: number) => {
        this.onDownloadProgress(progress);
      },
      onStateChange: (state: string) => {
        config.onStateChange(state);
      },
      onRenderChange: (state: RenderState) => {
        config.onRenderChange(state, this.renderState);
        this.renderState = state;
      },
      sendVideoInfo: config.sendVideoInfo,
      onError: (error: any) => {
        this.sdk.onMessage(error);
      },
    });
    this.uiRenderer = new UIRenderer({
      sdk: this.sdk,
      dataCacheQueue: this.dataCacheQueue,
      resourceManager: this.resourceManager,
      enableClientInterrupt: this.enableClientInterrupt,
      onWalkStateChange: (state: string) => {
        config.onWalkStateChange(state);
      },
      onVoiceStart: (duration: number, speech_id: number) => {
        if(this.enableClientInterrupt) {    
          this.avatarRenderer.setInterrupt(false);
        }
        config.onVoiceStateChange("start", duration);
        this.currentSpeechId = speech_id;
      },
      onVoiceEnd: (speech_id: number) => {
        this.stopAudio(speech_id);
        config.onVoiceStateChange("end");
      },
      onSpeakStateChange: (state: string, client_speak_id: number | string) => {
        config.onSpeakStateChange(state, client_speak_id);
      },
      clearSubtitleOn: (speech_id: number) => {
        this.dataCacheQueue.clearSubtitleOn(speech_id);
      },
      sendSdkPoint: (type: string, data: any, extra?: any) => {
        config.sendSdkPoint(type, data, extra);
      },
    });
    this.audioRenderer = new AudioRenderer({
      sdk: this.sdk,
      dataCacheQueue: this.dataCacheQueue,
      resourceManager: this.resourceManager,
    });

    this.composition = new Composition({
      container: config.container,
      avatarRenderer: this.avatarRenderer,
      restRenderers: [this.uiRenderer],
      audioRenderer: this.audioRenderer,
    });
    this.frameAnimationController = new AnimationController({
      defaultSpeed: 1,
      frameRate: 24,
      frameCallback: (frame) => {
        config.renderFrameCallback(frame);
        if (this.isStartPlay) {
          this.composition.compose(frame);
          this.decoder._tryStartNext();
        }
      },
    });
  }

  init() {
    const mouthShapeLib = this.resourceManager.getMouthShapeLib();
    this.saveAndDownload.writeFields({
      resource_pack: this.resourceManager.resource_pack,
    });
    this.avatarRenderer.init({
      char: mouthShapeLib.char_info,
      LUT: null,
      transform: {
        offsetX: 0.0,
        offsetY: 0.0,
        scaleX: 1.0,
        scaleY: 1.0
      },
      multisample: null
    });
  }

  /**
   * 处理数据：拆解并添加到缓存队列中
   * @param data TTSA 下发的数据
   */
  async handleData(data: IRawFrameData[], type: EFrameDataType) {
    switch (type) {
      case EFrameDataType.BODY: {
        // 根据currentFrame查找sf>currentFrame的body数据
        const currentFrame = this.frameAnimationController?.getCurrentFrame()??0;
        let mp4List = ([...data] as IRawBodyFrameData[]).filter((item) => item.ef > currentFrame);
        (window as any).avatarSDKLogger.log(mp4List,"mp4List")
        if (mp4List.length > 0) {
          // 在暂停状态（隐身模式）下，不检查数据是否过期
          // 因为此时帧动画暂停但数据仍在接收，可能导致帧索引与数据起始帧不同步
          if (this.renderState !== RenderState.paused && this.frameAnimationController?.getCurrentFrame() && this.frameAnimationController?.getCurrentFrame() > data[0].sf && this.frameAnimationController?.getCurrentFrame() > 10) {
            // 判断非初始场景下，body数据下发过期的情况
            this.sdk.onMessage({
              code: EErrorCode.BODY_DATA_EXPIRED,
              message: `Error: 身体数据过期 cur:${this.frameAnimationController?.getCurrentFrame()}-sf:${data[0].sf}`,
              e: JSON.stringify({ data }),
            });
          }
          // 已经插入队列的移除掉
          this.decoder.decode(
            mp4List,
            (file: any, frame: any, index: any) => {
              // createImageBitmap(frame).then((rgbBitmap) => {
              if (file.start <= index && file.end >= index) {
                // [DEBUG] 数据流追踪：解码器回调
                (window as any).avatarSDKLogger?.log('[DEBUG] RenderScheduler.decode callback:', {
                  frameIndex: file.startFrameIndex + index,
                  hasFrame: !!frame,
                  frameType: typeof frame,
                  frameKeys: frame ? Object.keys(frame) : [],
                  frameWidth: frame?.displayWidth,
                  frameHeight: frame?.displayHeight,
                  hasClose: typeof frame?.close === 'function',
                  fileInfo: {
                    name: file.name,
                    body_id: file.body_id,
                    id: file.id,
                    startFrameIndex: file.startFrameIndex,
                    endFrameIndex: file.endFrameIndex
                  }
                });
                
                this.dataCacheQueue._updateBodyImageBitmap({
                  frame,
                  frameIndex: file.startFrameIndex + index,
                  frameState: file.frameState,
                  id: file.id,
                  body_id: file.body_id,
                  name: file.name,
                  hfd: file.hfd,
                  sf: file.startFrameIndex,
                  offset: file?.x_offset[index] || 0,
                });
                // 视频获取完成，防止后端下发实际帧数大于需要抽的帧数，避免多余抽帧
                if (file.endFrameIndex <= file.startFrameIndex + index) {
                  this.decoder.abortOne(
                    `${file.body_id ?? file.id ?? 0}_${file.name}`
                  );
                }
              }
            },
          );
        }
        break;
      }
      case EFrameDataType.FACE:
        const faceData = this.handleFaceData(data as ITtsFaceFrameData[]);
        if (faceData.length > 0) {
          this.saveAndDownload.appendMultipleToArray("faceData", faceData);
        }
        this.dataCacheQueue.checkValidData(
          faceData,
          type
        );
        // https://rsjqcmnt5p.feishu.cn/wiki/UiTUwZRKRiRGitkqDc4c78eUnye
        // 遍历处理完成之后的faceData，根据face_frame_type区分原始数据和实时数据，保存到不同的队列内
        let realFaceData: Array<IRawFaceFrameData> = [], nowFaceData: Array<IRawFaceFrameData> = [];
        for (let i = 0; i < faceData.length; i++) {
          // face_frame_type 1 实时数据
          if (!faceData[i]?.face_frame_type) {
            realFaceData.push(faceData[i])
          } else {
            nowFaceData.push(faceData[i]);
          }
          nowFaceData.length && this.dataCacheQueue._updateFacial(nowFaceData);
          realFaceData.length && this.dataCacheQueue._updateRealFacial(realFaceData);
        }
        break;
      case EFrameDataType.AUDIO:
        const audioData = data as IRawAudioFrameData[];
        this.setAudioInfo({
          sf: audioData[0].sf,
          ef: audioData[0].ef,
          ad: audioData[0].ad,
        });
        // 在暂停状态（隐身模式）下，不检查音频数据是否过期
        // 因为此时帧动画暂停但数据仍在接收，可能导致帧索引与数据起始帧不同步
        if (this.renderState !== RenderState.paused && this.frameAnimationController?.getCurrentFrame() && this.frameAnimationController?.getCurrentFrame() > data[0].sf) {
          this.sdk.onMessage({
            code: EErrorCode.AUDIO_DATA_EXPIRED,
            message: `Error: 音频数据过期 cur:${this.frameAnimationController?.getCurrentFrame()}-sf:${data[0].sf}`,
            e: JSON.stringify({ data }),
          });
          const currentFrame = this.frameAnimationController?.getCurrentFrame();
          const delta = currentFrame ? currentFrame - data[0].sf : 0;
          this.reportMessage({
            code: EErrorCode.AUDIO_DATA_EXPIRED,
            message: `Error: 音频数据过期 cur:${this.frameAnimationController?.getCurrentFrame()}-sf:${data[0].sf}`,
            e: {
              currentFrame: this.frameAnimationController?.getCurrentFrame(),
              sf: data[0].sf,
              ef: delta,
              timestamp: Date.now(),
            }
          })
          this.sendSdkPoint('audio_data_expired', {
            currentFrame: this.frameAnimationController?.getCurrentFrame(),
            sf: data[0].sf,
            ef: delta,
            timestamp: Date.now(),
          });
          return;
        }
        this.dataCacheQueue.checkValidData(data as IRawAudioFrameData[], type);

        const processedAudioData = (data as IRawAudioFrameData[]).map((item: IRawAudioFrameData) => {
          // raw_audio = true 时，PCM 音频下发，不进行转换
          if (this.resourceManager.config.raw_audio) {
            return item;
          }
          // raw_audio = false 时，PCM 编码音频下发，进行转换 ArrayBuffer
          return {
            ...item,
            ad: item.ad.buffer.slice(item.ad.byteOffset, item.ad.byteOffset + item.ad.byteLength)
          };
          // if (item.ad instanceof Uint8Array) {
          //   // 检查前几个字节来判断格式
          //   const header = new Uint8Array(item.ad.slice(0, 12));
          //   const isWebM = header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3;
          //   if(isWebM) {
          //     return {
          //       ...item,
          //       ad: item.ad.buffer.slice(item.ad.byteOffset, item.ad.byteOffset + item.ad.byteLength)
          //     };
          //   }else {
          //     return item
          //   }
          // }
        });
        // 过期的音频数据，直接丢弃
        if (processedAudioData[0].sid <= this.lastSpeechId) {
          return;
        }
        if (this.resourceManager.config.raw_audio) {
          (window as any).avatarSDKLogger?.log(this.TAG, 'processedAudioData[0].sid', processedAudioData[0].sid, this.currentSpeechId, this.renderState);

          this.audioRenderer.updateAudioData(processedAudioData);
        } else {
          // 临时修复: 先缓存一份数据，用于保留开始播放的时间
          this.dataCacheQueue._updateAudio(processedAudioData);
          this.audioRenderer._updateAudio(processedAudioData);
        }
        break;
      case EFrameDataType.EVENT:
        const d = data as IRawEventFrameData[];
        this.setEventData({
          sf: d[0].sf,
          ef: d[0].ef,
          event: d[0].e,
        });
        this.dataCacheQueue._updateUiEvent(d);
        break;
      default:
        this.sdk.onMessage({
          code: EErrorCode.INVALID_DATA_STRUCTURE,
          message: `Error: 数据类型错误`,
          e: JSON.stringify({ data, type }),
        });
    }
  }

  setVolume(volume: number) {
    this.audioRenderer.setVolume(volume);
  }

  runStartFrameIndex() {
    this.frameAnimationController?.play();
  }

  stateChangeHandle(e: any) {
    this.dataCacheQueue.currentPlayState = e;
  }

  stopAudio(speech_id: number) {
    this.audioRenderer.stop(speech_id);
  }

  render() {
    // 如果 pipeline 还未创建，在这里初始化（普通模式初始化时会调用这个方法）
    this.avatarRenderer.initPipeline();
    this.isStartPlay = true;
    this.renderState = RenderState.rendering;
    this.onRenderChange(this.renderState);
  }

  stop() {
    this.isStartPlay = false;
    this.renderState = RenderState.stopped;
    this.onRenderChange(this.renderState);
    this.composition.stop();
  }

  /**
   * 暂停渲染（停止渲染循环和音频播放）
   * 但继续接收和处理后端推送的数据并放入缓存队列，避免切换到在线时丢失数据导致丢帧
   */
  pauseRender(): void {
    if (this.renderState === RenderState.paused) {
      return;
    }

    // 1. 暂停动画帧循环（保留当前帧索引）
    this.frameAnimationController?.pause();
    this.decoder.abort();

    // 2. 停止并清空音频播放（丢弃所有剩余的音频数据）
    this.audioRenderer.stop(-1); // 传入 -1 清空所有音频数据

    // 3. 清空所有表情数据，避免错误的旧脸部数据与当前身体数据一起渲染导致人脸分离
    // 恢复渲染时会使用最新的脸部数据
    this.dataCacheQueue.clearAllFaceData();

    this.renderState = RenderState.paused;
    this.onRenderChange(this.renderState);

    (window as any).avatarSDKLogger?.log(this.TAG, `渲染已暂停（已清空表情数据，等待恢复）: ${this.renderState}`);
  }

  /**
   * 恢复渲染
   */
  resumeRender(): void {
    if (this.renderState !== RenderState.paused) {
      return;
    }
    // 在恢复渲染时初始化 pipeline（如果在隐身模式时还未创建）
    // 这样可以避免在隐身模式时创建 pipeline 导致的 GPU 资源竞争
    // initPipeline() 内部会检查 pipeline 是否已创建，不会重复初始化
    this.avatarRenderer.initPipeline()

    // 重置表情相关状态，避免从隐身模式恢复时人脸和身体不匹配
    this.avatarRenderer.resetFaceFrameState();

    // 3. 恢复动画帧循环（从暂停时的帧索引继续）
    // 注意：frameAnimationController 会保持暂停时的帧索引，恢复时继续

    this.frameAnimationController?.play();
    this.isStartPlay = true
    this.forceSyncDecoder();
    // 4. 恢复后立即进入渲染中状态
    this.renderState = RenderState.resumed;
    this.onRenderChange(this.renderState);
    (window as any).avatarSDKLogger?.log(this.TAG, ' 渲染已恢复，状态: this.currentSpeechId===');
  }

  /**
   * 切换隐身模式（暂停/恢复渲染）
   */
  switchInvisibleMode(): void {
    if (this.renderState === RenderState.rendering || this.renderState === RenderState.resumed) {
      (window as any).avatarSDKLogger?.log(this.TAG, 'switchInvisibleMode: rendering to paused');
      this.pauseRender();
    } else if (this.renderState === RenderState.paused) {
      (window as any).avatarSDKLogger?.log(this.TAG, 'switchInvisibleMode: paused to rendering');
      this.resumeRender();
    } else {
      // stopped 或 idle 状态不做任何操作
      (window as any).avatarSDKLogger?.warn(this.TAG, `渲染状态为 ${this.renderState}，无法切换隐身模式`);
    }
  }

  /**
   * 获取渲染状态
   */
  public getRenderState(): RenderState {
    (window as any).avatarSDKLogger?.log(this.TAG, `getRenderState: ${this.renderState}`);
    return this.renderState;
  }

  destroy() {
    this.isStartPlay = false;
    this.frameAnimationController?.destroy();
    this.frameAnimationController = undefined;
    this.dataCacheQueue.destroy();
    this.composition.destroy();
    this.decoder.destroy();
  }

  handleFaceData(data: ITtsFaceFrameData[]): IRawFaceFrameData[] {
    try {
      const resourcePack = this.resourceManager.resource_pack;
      const framedata_proto_version = this.resourceManager.getConfig().framedata_proto_version;
      const blendshape_map = [...resourcePack.blendshape_map ?? []];
      const face_list: any[] = data.map((item) => {
        let bsw_list: number[][] = [];
        const { body_id, sf, ef, s: state, id, js, bsw, ms, face_frame_type } = item;
        let mesh: any[] = [];
        if (blendshape_map?.length > 0) {
          for (let i = 0; i < blendshape_map.length; i++) {
            const blendshape_map_item = blendshape_map[i];
            if (blendshape_map_item?.length > 0) {
              for (let j = 0; j < blendshape_map_item.length; j++) {
                if (!bsw_list[i]) {
                  bsw_list[i] = [];
                }
                bsw_list[i][j] = bsw[blendshape_map_item[j]];
              }
            }
          }
          if (!framedata_proto_version) {
            mesh = Array.from({ length: ms.length }, (_, index) => ({
              blendshapeWeights: bsw_list[index],
              textureModelIndex: ms[index]?.[0] ?? 0,
              texturePCAWeights: ms[index]?.[1] ?? [],
            }));
          } else {
            mesh = Array.from({ length: ms.length }, (_, index) => ({
              blendshapeWeights: bsw_list[index],
              textureModelIndex: ms[index]?.index ?? 0,
              texturePCAWeights: ms[index]?.weights ?? [],
            }));
          }
        } else {
          if (!framedata_proto_version) {
            mesh = Array.from({ length: ms.length }, (_, index) => ({
              // blendshape_map 内容如[[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49],[44,45,8,10,12],[44,45,9,11,13],[44,45]]
              // 在遍历时，需要根据 blendshape_map 的索引，将 bsw 中的值替换为 blendshape_map 中索引的值
              blendshapeWeights: index === 0 ? bsw : [],
              textureModelIndex: ms[index]?.[0] ?? 0, // 增加可选链和默认值，防止越界
              texturePCAWeights: ms[index]?.[1] ?? [],
            }));
          } else {
            mesh = Array.from({ length: ms.length }, (_, index) => ({
              // blendshape_map 内容如[[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49],[44,45,8,10,12],[44,45,9,11,13],[44,45]]
              // 在遍历时，需要根据 blendshape_map 的索引，将 bsw 中的值替换为 blendshape_map 中索引的值
              blendshapeWeights: index === 0 ? bsw : [],
              textureModelIndex: ms[index]?.index ?? 0, // 增加可选链和默认值，防止越界
              texturePCAWeights: ms[index]?.weights ?? [],
            }));

          }
        }
        let movableJointTransforms: any[] = []
        if (!framedata_proto_version) {
          movableJointTransforms = js.map((joint) =>
            formatMJT(joint[0], joint[1])
          );
        } else {
          movableJointTransforms = js.map((joint) =>
            formatMJT(joint.translate, joint.rotate)
          );
        }
        return {
          body_id,
          frameIndex: sf,
          sf,
          ef,
          state,
          id,
          face_frame_type,
          FaceFrameData: {
            mesh,
            movableJointTransforms,
            blendshapeWeights: bsw,
          },
        };
      });
      return face_list;
    } catch (error) {
      this.sdk.onMessage({
        code: EErrorCode.FACE_PROCESSING_ERROR,
        message: `Error: 表情数据处理失败`,
        e: JSON.stringify({ error }),
      });
      return [];
    }
  }
  forceSyncDecoder() {
    const currentFrameIndex = this.frameAnimationController?.getCurrentFrame();
    if (currentFrameIndex) {
      this.decoder.syncDecode(currentFrameIndex);
    }
  }
  _reload() {
    this.decoder._reload()
  }
  _getResumeInfo() {
    const frame = this.frameAnimationController?.getCurrentFrame();
    return this.avatarRenderer._getCurrentBodyFrameInfo(frame || 0)
  }
  
  sendVoiceEnd() {
    const currentFrameIndex = this.frameAnimationController?.getCurrentFrame()??0 + 1;
    this.dataCacheQueue._updateUiEvent([{
      "id": 0,
      "s": "",
      "sf": currentFrameIndex,
      "ef": currentFrameIndex + 1,
      "e": [
        {
          "type": "voice_end",
        },
      ]
    }])
  }
  _offlineMode() {
    this.dataCacheQueue._clearEvent();
    this.dataCacheQueue._updateUiEvent([{
      "id": 0,
      "s": "",
      "sf": this.frameAnimationController?.getCurrentFrame()?? 0 + 1,
      "ef": this.frameAnimationController?.getCurrentFrame()?? 0 + 2,
      "e": [
        {
          "type": "subtitle_off",
        },
      ]
    }])
    this.audioRenderer.pause()
    const frame = this.frameAnimationController?.getCurrentFrame();
    if (frame) {
      this.decoder._offLineMode(this.resourceManager._getOfflineIdle(), frame);
    }
  }
  _offlineRun() {
    this.decoder._offlineRun()
    this.dataCacheQueue.clearAllFaceData();
  }

  ttsaStateChangeHandle(state: StateChangeInfo) {
    this.dataCacheQueue.currentTtsaState = state;
  }

  resume() {
    this.audioRenderer.resume();
  }

  /**
   * 设置数字人canvas的显隐状态
   * @param visible 是否可见
   */
  setAvatarCanvasVisible(visible: boolean) {
    this.avatarRenderer.setCanvasVisibility(visible);
  }
  setCharacterCanvasLayout(layout?: Layout) {
    this.avatarRenderer.setCharacterCanvasAnchor(layout);
  }

  setWalkConfig(walkConfig: WalkConfig) {
    this.avatarRenderer.setWalkConfig(walkConfig);
  }

  interrupt(type?: string){
    // 插入中断字幕和语音结束事件
    const speech_id = this.audioRenderer.speech_id;
    if(type === "in_offline_mode") {
      this.lastSpeechId = -1;
    } else {
      this.lastSpeechId = speech_id;
    }
    if(type !== "in_offline_mode") {
      this.avatarRenderer.setInterrupt(true);
    }
    this.dataCacheQueue._clearAudio(speech_id);
    this.dataCacheQueue.clearSubtitleOn(speech_id);
    this.dataCacheQueue._updateUiEvent([{
      "id": 0,
      "s": "",
      "sf": this.frameAnimationController?.getCurrentFrame()?? 0 + 1,
      "ef": this.frameAnimationController?.getCurrentFrame()?? 0 + 2,
      "e": [
        {
          "type": "subtitle_off",
        },
        {
          "type": "voice_end",
        },
      ]
    }])
    // 中断音频播放
    if(type !== "in_offline_mode") {
      this.audioRenderer.stop(speech_id);
    }
    this.uiRenderer.setInterrupt(speech_id)
  }
}
