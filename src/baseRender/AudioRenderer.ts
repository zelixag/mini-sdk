/**
 * 音频渲染
 * 使用 AudioContext 控制
 */

import ResourceManager from "modules/ResourceManager";
import { DataCacheQueue } from "../control/DataCacheQueue";
// import PCMAudioPlayer from "./Audio";
import AudioWorklet from "./AudioWorklet";
import { performanceConstant } from "../utils/perfermance";
import XmovAvatar from "../index";
import { AvatarStatus } from "../types";
import MediaSourceAudioPlayer from "./MSEAudioPlayer";

type Option = {
  sdk: XmovAvatar;
  dataCacheQueue: DataCacheQueue;
  resourceManager: ResourceManager;
};

export default class AudioRender {
  private TAG = "[AudioRenderer]";
  private options: Option;
  audioCtx: AudioContext;
  source: AudioBufferSourceNode | null = null;
  isPlaying = false;
  gainNode: GainNode | null = null;
  lastFrameIndex: number = -1;
  offset: number = 0;
  audio: AudioWorklet | null = null;
  firstFrameIndex: number = -1;
  resourceManager: ResourceManager;
  valume: number = 1;
  speech_id: number = -1; // 当前播放的音频id
  cacheFirstFrameIndex: number = -1; // 缓存下来的第一个音频的索引
  cacheAudioData: Uint8Array[] = []; // 缓存下来的音频数据
  oldSpeechId: number = -1; // 上一个播放的音频id

  private mseAudioPlayer: MediaSourceAudioPlayer | null = null;
  
  constructor(options: Option) {
    this.options = options;
    this.resourceManager = options.resourceManager;
    this.audioCtx = new AudioContext();
    this.audio = new AudioWorklet();
    this.audio.init();
    if(!this.resourceManager.config.raw_audio) {
      this.mseAudioPlayer = new MediaSourceAudioPlayer();
      this.mseAudioPlayer.init();
    }
  }
  updateAudioData(audioList: any) {
    if (
      !this.resourceManager.config.raw_audio ||
      audioList[0].sid === this.oldSpeechId
    )
      return;
    if (this.firstFrameIndex === -1) {
      this.firstFrameIndex = audioList[0].sf;
    }
    let totalLength = 0;
    for (const audio of audioList) {
      totalLength += audio.ad?.length || 0;
    }

    // 创建合并后的Uint8Array
    const mergedData = new Uint8Array(totalLength);
    let offset = 0;

    // 填充合并数据
    for (const audio of audioList) {
      if (audio.ad) {
        mergedData.set(new Uint8Array(audio.ad), offset);
        offset += audio.ad.length;
      }
    }
    if (this.speech_id === -1) {
      this.speech_id = audioList[0].sid;
      this.audio?.receivePCMStream(mergedData);
    } else {
      if (this.speech_id !== audioList[0].sid) {
        // 先缓存下来
        if (this.cacheFirstFrameIndex === -1) {
          this.cacheFirstFrameIndex = audioList[0].sf;
        }
        this.cacheAudioData.push(mergedData);
      } else {
        // 直接播放
        this.audio?.receivePCMStream(mergedData);
      }
    }
  }

  _updateAudio(audioList: any) {
    if (!this.mseAudioPlayer || audioList.length === 0) return;

    const firstAudio = audioList[0];
    
    // 检查是否是旧的 speech_id
    if (firstAudio.sid === this.oldSpeechId) {
      return;
    }

    // 如果 speech_id 变化，停止当前播放并重置
    if (this.speech_id !== -1 && firstAudio.sid !== this.speech_id) {
      (window as any).avatarSDKLogger?.log(
        this.TAG,
        `检测到新的 speech_id: ${firstAudio.sid}, 停止当前 WebM 播放 (旧: ${this.speech_id})`
      );
      this.mseAudioPlayer.stop();
      this.mseAudioPlayer.init(); // 重新初始化 MediaSource
      this.firstFrameIndex = -1;
    }

    // 记录第一个音频段的帧索引
    if (this.firstFrameIndex === -1) {
      this.firstFrameIndex = firstAudio.sf;
    }

    // 更新 speech_id
    if (this.speech_id === -1) {
      this.speech_id = firstAudio.sid;
    } else if (this.speech_id !== firstAudio.sid) {
      this.speech_id = firstAudio.sid;
    }

    // 处理每个音频段
    for (const audio of audioList) {
      if (audio.ad) {
        // 将 Uint8Array 转换为 ArrayBuffer
        const audioData = audio.ad instanceof ArrayBuffer 
          ? audio.ad 
          : audio.ad.buffer.slice(audio.ad.byteOffset, audio.ad.byteOffset + audio.ad.byteLength);
        
        this.mseAudioPlayer.addAudioSegment(
          audioData,
          audio.sf,
          audio.sid
        );
      }
    }
  }

  async render(frameIndex: number) {
    // (window as any).avatarSDKLogger.log("当前帧索引:", frameIndex, "音频开始播放帧：", this.firstFrameIndex);
    if (this.lastFrameIndex === -1) {
      this.lastFrameIndex = frameIndex;
    }
    if (this.options.sdk.getStatus() === AvatarStatus.offline) return;
    // PCM 流式播放（raw_audio = true）
    if (
      frameIndex >= this.firstFrameIndex &&
      this.firstFrameIndex != -1 &&
      !this.isPlaying &&
      this.resourceManager.config.raw_audio
    ) {
      (window as any).performanceTracker.markEnd(
        performanceConstant.start_action_render,
        "speak"
      );
      this.isPlaying = true;
      this.audio?.start();
      return;
    }

    // WebM 流式播放（raw_audio = false）
    if (!this.resourceManager.config.raw_audio && this.mseAudioPlayer) {
      // 检查是否应该开始播放（帧对齐）
      if (
        this.firstFrameIndex !== -1 &&
        frameIndex >= this.firstFrameIndex &&
        !this.mseAudioPlayer.isPlaying
      ) {
        // 优化：确保有足够的数据缓冲再开始播放
        const stats = this.mseAudioPlayer.getStats();
        const hasEnoughData = stats.queueLength > 0 || stats.bufferedRanges !== '-';
        
        if (hasEnoughData) {
          try {
            await this.mseAudioPlayer.start();
            (window as any).performanceTracker.markEnd(
              performanceConstant.start_action_render,
              "speak"
            );
          } catch (error) {
            (window as any).avatarSDKLogger.error("[AudioRenderer] WebM 音频播放失败:", {
              error,
              frameIndex,
              firstFrameIndex: this.firstFrameIndex,
              queueLength: stats.queueLength,
            });
          }
        } else {
          // 数据不足，等待更多数据
          (window as any).avatarSDKLogger.debug?.(
            "[AudioRenderer]",
            `等待更多 WebM 音频数据 (frameIndex: ${frameIndex}, queueLength: ${stats.queueLength})`
          );
        }
      }
      return; // WebM 模式下不需要继续处理 PCM 播放逻辑
    }

    // 使用 AudioContext 播放音频
    if (this.audioCtx.state === "closed") {
      this.audioCtx = new AudioContext();
    }

    let audioFrame: any = null;
    if (frameIndex - this.lastFrameIndex > 1) {
      audioFrame = this.options.dataCacheQueue._getAudioInterval(
        this.lastFrameIndex,
        frameIndex
      );
      this.offset = frameIndex - this.lastFrameIndex;
    } else {
      audioFrame = this.options.dataCacheQueue._getAudio(frameIndex);
    }
    this.lastFrameIndex = frameIndex;
    if (
      this.options.dataCacheQueue.currentTtsaState &&
      this.options.dataCacheQueue.currentTtsaState.state !== "speak" &&
      frameIndex >= this.options.dataCacheQueue.currentTtsaState.start_frame
    ) {
      return;
    }
    // 获取音频帧数据
    if (!audioFrame?.ad) return;
    this.speech_id = audioFrame.sid;
    /*
    try {
      // 使用 MediaSourceAudioPlayer 播放音频
      this.mseAudioPlayer?.start();
    } catch (error) {
      (window as any).avatarSDKLogger.error("[AudioRenderer] 音频播放失败:", {
        error,
      });
      this.isPlaying = false;
      this.mseAudioPlayer?.destroy();
      this.mseAudioPlayer = null;
    }
    */

    try {
      const audioBuffer = await this.audioCtx.decodeAudioData(audioFrame.ad);
      // 创建音频源并播放
      this.source = this.audioCtx.createBufferSource();
      this.source.buffer = audioBuffer;

      // 连接并播放
      if (!this.gainNode) {
        // 创建增益节点（默认增益为1，即正常音量）
        this.gainNode = this.audioCtx.createGain();
        this.gainNode.connect(this.audioCtx.destination);
        this.gainNode.gain.value = this.valume;
      }

      this.source.connect(this.gainNode);

      (window as any).performanceTracker.markEnd(
        performanceConstant.start_action_render,
        "speak"
      );
      const offsetTime =
        this.offset > 24 ? (frameIndex - audioFrame.sf) / 24 : 0;
      this.offset = 0;
      this.source.start(0, offsetTime);
      this.isPlaying = true;

      // 监听播放结束
      this.source.onended = () => {
         this.isPlaying = false;
        this.source = null;
      };
    } catch (error) {
      (window as any).avatarSDKLogger.error("[AudioRenderer] 音频解码失败:", {
        error,
        audioDataType: typeof audioFrame.ad,
        audioDataConstructor: audioFrame.ad?.constructor?.name,
        audioDataLength: audioFrame.ad?.byteLength || audioFrame.ad?.length,
        frameIndex,
      });
      (window as any).avatarSDKLogger.error(
        this.TAG,
        "Error playing audio:",
        error
      );
      this.isPlaying = false;
      this.source = null;
    }
  }

  resume() {
    if (this.audio && this.resourceManager.config.raw_audio) {
      this.audio?.resume();
    } else {
      // if (this.audioCtx.state === "suspended") {
      //   this.audioCtx
      //     .resume()
      //     .then(() => {
      //       (window as any).avatarSDKLogger.info("音频上下文恢复成功");
      //     })
      //     .catch((error) => {
      //       (window as any).avatarSDKLogger.error("音频上下文恢复失败:", error);
      //     });
      // }
    }
  }

  pause() {
    this.source?.stop();
    this.source?.disconnect();
    this.source = null;
    this.gainNode?.disconnect();
    this.gainNode = null;
    this.isPlaying = false;
    this.options.dataCacheQueue._clearAudio(this.speech_id);
    if (this.audioCtx.state !== "closed") {
      this.audioCtx.close();
    }
    this.firstFrameIndex = -1;
    
    // 停止 WebM 播放
    this.mseAudioPlayer?.stop(this.speech_id);
    this.speech_id = -1;
  }

  stop(speech_id: number) {
    // 停止 PCM 播放
    this.source?.stop();
    this.source?.disconnect();
    this.source = null;
    this.gainNode?.disconnect();
    this.gainNode = null;
    this.isPlaying = false;
    this.options.dataCacheQueue._clearAudio(speech_id);
    if (this.audioCtx.state !== "closed") {
      this.audioCtx.close();
    }
    this.firstFrameIndex = -1;
    this.audio?.stop();
    
    // 停止 WebM 播放
    this.mseAudioPlayer?.stop(speech_id);
    
    this.oldSpeechId = speech_id;
    this.speech_id = -1;
    if (this.cacheAudioData.length > 0) {
      this.firstFrameIndex = this.cacheFirstFrameIndex;
      this.cacheFirstFrameIndex = -1;
      // 新的缓存下来的数据，推入音频流
      for (const data of this.cacheAudioData) {
        this.audio?.receivePCMStream(data);
      }
      this.cacheAudioData = [];
    }
  }

  setVolume(valume: number) {
    this.valume = valume;
    if (this.resourceManager.config.raw_audio) {
      this.audio?.setVolume(valume);
    } else {
      // WebM 模式：使用 MSEAudioPlayer 设置音量
      this.mseAudioPlayer?.setVolume(valume);
      // 兼容旧的 AudioContext 方式
      if (this.source && this.gainNode?.gain) {
        this.gainNode.gain.value = valume;
      }
    }
  }

  destroy() {
    this.stop(-1);
    this.cacheAudioData = [];
    this.audio?.destroy();
    this.mseAudioPlayer?.destroy();
    this.mseAudioPlayer = null;
  }
}
