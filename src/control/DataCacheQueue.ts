import {
  EFrameDataType,
  IRawAudioFrameData,
  IRawFaceFrameData,
  IRawEventFrameData,
  IRawFrameData,
  StateChangeInfo,
} from "../types/frame-data";

export interface IBodyFrame {
  frame: any;
  frameIndex: number;
  frameState: string;
  id: number;
  name: string;
  body_id: number;
  hfd: boolean;
  sf: number;
  offset: number;
}

export class DataCacheQueue {
  private TAG = "[DataCacheQueue]";
  // body视频抽帧副本，使用 Map 优化查找和删除性能
  private _bodyQueue: Map<number, IBodyFrame> = new Map();
  // 表情match信息列表
  private _facialQueue: Array<IRawFaceFrameData> = [];
  // 原始表情数据
  private _realFacialQueue: Array<IRawFaceFrameData> = [];
  // 音频队列
  private audioQueue: Array<IRawAudioFrameData> = [];
  // UI事件队列
  private eventQueue: Array<IRawEventFrameData> = [];
  // 当前处理好的视频id组
  private videoIdList: string[] = [];
  // 当前状态
  private _currentPlayState: string = "idle";
  // 当前ttsa状态
  private _currentTtsaState: StateChangeInfo | null = null;
  constructor() {
    // @ts-ignore
    window["__dev_event_queue__"] = this.eventQueue;
  }

  set currentPlayState(state: string) {
    this._currentPlayState = state;
  }

  get currentPlayState() {
    return this._currentPlayState;
  }

  set currentTtsaState(state: StateChangeInfo | null) {
    this._currentTtsaState = state;
  }
  get currentTtsaState() {
    return this._currentTtsaState;
  }

  get bodyQueue() {
    return Array.from(this._bodyQueue.values());
  }

  // 更新body视频抽帧副本
  _updateBodyImageBitmap(data: IBodyFrame) {
    // [DEBUG] 数据流追踪：更新缓存队列
    (window as any).avatarSDKLogger?.log('[DEBUG] DataCacheQueue._updateBodyImageBitmap:', {
      frameIndex: data.frameIndex,
      hasFrame: !!data.frame,
      frameType: typeof data.frame,
      frameKeys: data.frame ? Object.keys(data.frame) : [],
      frameWidth: data.frame?.displayWidth,
      frameHeight: data.frame?.displayHeight,
      hasClose: typeof data.frame?.close === 'function',
      bodyInfo: {
        name: data.name,
        body_id: data.body_id,
        id: data.id,
        frameState: data.frameState
      }
    });
    
    const old = this._bodyQueue.get(data.frameIndex);
    if (old && old.frame && typeof old.frame.close === "function") {
      old.frame.close();
    }
    // 清理过期帧，根据data.body_id,删除所有小于的帧
    for (const [curIndex, curFrame] of this._bodyQueue.entries()) {
      if (curFrame.body_id < data.body_id && curFrame.frameIndex >= data.frameIndex) {
        curFrame.frame.close();
        this._bodyQueue.delete(curIndex);
      }
    }
    this._bodyQueue.set(data.frameIndex, data);
  }

  clearOldFrames(sf: number) {
    for (const [curIndex, curFrame] of this._bodyQueue.entries()) {
      if (curIndex >= sf) {
        curFrame.frame.close();
        this._bodyQueue.delete(curIndex);
      }
    }
  }

  setVideoIdList(videoId: string) {
    if (!this.videoIdList.includes(videoId)) {
      this.videoIdList.push(videoId);
    }
  }

  getVideoIdList() {
    return this.videoIdList;
  }

  /**
   * 获取指定帧并从Map中删除
   * @param frameIndex 要获取的帧索引
   * @returns 找到的帧数据（未找到则返回undefined）
   */
  _getBodyImageBitmap(frameIndex: number) {
    const frame = this._bodyQueue.get(frameIndex);
    
    // 清理过期帧
    for (const [curIndex, curFrame] of this._bodyQueue.entries()) {
      if (curIndex < frameIndex) {
        curFrame.frame.close();
        this._bodyQueue.delete(curIndex);
      }
    }

    if (frame) {
      return frame;
    }
    return undefined;
  }

  // 获取body内的视频名称list
  getBodyVideoNameListLength() {
    const list: string[] = [];
    this.bodyQueue.forEach((item) => {
      if (!list.includes(item.name)) {
        list.push(item.name);
      }
    });
    return list.length;
  }

  _getFaceImageBitmap(frameIndex: number, body_id: number) {
    // 找出face中frameIndex和body_id相同的帧
    let targetItem: IRawFaceFrameData | null = null;
    for (let i = this._facialQueue.length - 1; i >= 0; i--) {
      const item = this._facialQueue[i];
      if (item.frameIndex === frameIndex && item.body_id === body_id) {
        targetItem = item;
        break; // 找到后立即退出循环
      }
    }
    // 删除所有小于frameIndex的帧
    this._facialQueue = this._facialQueue.filter(
      (item) => item.frameIndex >= frameIndex
    );
    return targetItem;
  }
  // 更新表情队列
  _updateFacial(data: Array<IRawFaceFrameData>) {
    this._facialQueue.push(...data);
  }
  get facialQueue() {
    return this._facialQueue;
  }
  _getRealFaceImageBitmap(frameIndex: number, body_id: number) {
    // 找出face中frameIndex和body_id相同的帧
    let targetItem: IRawFaceFrameData | null = null;
    for (let i = this._realFacialQueue.length - 1; i >= 0; i--) {
      const item = this._realFacialQueue[i];
      if (item?.frameIndex === frameIndex && item?.body_id === body_id) {
        targetItem = item;
        break; // 找到后立即退出循环
      }
    }
    // 删除所有小于frameIndex的帧
    this._realFacialQueue = this._realFacialQueue.filter(
      (item) => item?.frameIndex >= frameIndex
    );
    return targetItem;
  }
  _updateRealFacial(data: Array<IRawFaceFrameData>) {
    this._realFacialQueue.push(...data);
  }
  get realFacialQueue() {
    return this._realFacialQueue;
  }

  /**
   * 清空所有表情数据（用于切换隐身模式时）
   */
  clearAllFaceData() {
    this._facialQueue = [];
    this._realFacialQueue = [];
    (window as any).avatarSDKLogger?.log(
      this.TAG,
      "已清空所有表情数据"
    );
  }
  _updateAudio(data: Array<IRawAudioFrameData>) {
    this.audioQueue.push(...data);
  }

  _clearAudio(speech_id: number) {
    if(speech_id !== -1){
      this.audioQueue = this.audioQueue.filter(item => item.sid !== speech_id);
    } else {
      this.audioQueue = [];
    }
  }

  _getAudio(frameIndex: number) {
    const targetIndex = this.audioQueue.findIndex(
      (item) => item.sf === frameIndex
    );
    if (targetIndex === -1) {
      return;
    }
    const [targetItem] = this.audioQueue.splice(targetIndex, 1);
    return targetItem;
  }

  _getAudioInterval(startFrame: number, endFrame: number) {
    const audioList = this.audioQueue.filter(
      (item) => item.sf >= startFrame && item.sf <= endFrame
    );
    if (audioList.length === 0) {
      return;
    }
    const audio = audioList[audioList.length - 1];
    const index = this.audioQueue.findIndex((item) => item.id === audio.id);
    this.audioQueue.splice(index, 1);
    return audio;
  }

  _updateUiEvent(data: Array<IRawEventFrameData>) {
    this.eventQueue.push(...data);
  }

  clearSubtitleOn(speech_id: number) {
    this.eventQueue = this.eventQueue.map(item => ({
      ...item,
      e: item.e.filter((subItem:any) => subItem.speech_id != speech_id)
    }));
  }

  _clearEvent() {
    this.eventQueue = [];
  }

  _getEvent(frame: number) {
    const targetIndex = this.eventQueue.findIndex((item) => item.sf === frame);
    if (targetIndex === -1) {
      return;
    }
    const [targetItem] = this.eventQueue.splice(targetIndex, 1);
    return targetItem;
  }

  _getEventInterval(startFrame: number, endFrame: number) {
    const targetIndex = this.eventQueue.findIndex(
      (item) => item.sf >= startFrame && item.sf <= endFrame
    );
    if (targetIndex === -1) {
      return;
    }
    const [targetItem] = this.eventQueue.splice(targetIndex, 1);
    return targetItem;
  }

  /**
   * 检查数据是否因seek等原因失效，并清理缓存。
   * @param data 新的数据帧数组
   * @param type 数据类型
   */
  checkValidData(data: Array<IRawFrameData>, type: string) {
    switch (type) {
      case EFrameDataType.BODY:
        break;
      case EFrameDataType.FACE: {
        // 根据bodyId获取face，暂时去掉过滤
        // if (this._facialQueue.length === 0 || data.length === 0) {
        //   return;
        // }
        // const isDiscontinuous =
        //   this._facialQueue[this._facialQueue.length - 1]?.ef >= data[0].sf ||
        //   data[0].sf <= this._facialQueue[0]?.sf;
        // if (isDiscontinuous) {
        //   const facialIndex = this._facialQueue.findIndex(
        //     (item) => item.sf >= data[0].sf
        //   );
        //   if (facialIndex !== -1) {
        //     this._facialQueue.length = facialIndex;
        //   }
        // }
        break;
      }
      case EFrameDataType.AUDIO: {
        if (this.audioQueue.length === 0 || data.length === 0) {
          return;
        }
        const isDiscontinuous =
          this.audioQueue[this.audioQueue.length - 1]?.ef < data[0].sf ||
          data[0].sf < this.audioQueue[0]?.sf;
        if (isDiscontinuous) {
          const audioIndex = this.audioQueue.findIndex(
            (item) => item.sf >= data[0].sf
          );
          if (audioIndex !== -1) {
            this.audioQueue.length = audioIndex;
          }
        }
        break;
      }
    }
  }
  destroy() {
    this._bodyQueue.forEach((item) => {
      if (item.frame && typeof item.frame.close === "function") {
        item.frame.close();
      }
    });
    this._bodyQueue.clear();
    this._facialQueue = [];
    this.audioQueue = [];
    this.eventQueue = [];
  }
}
