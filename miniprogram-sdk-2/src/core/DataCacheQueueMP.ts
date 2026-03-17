/**
 * DataCacheQueueMP - 数据缓存队列 for Mini Program
 * 借鉴 Web SDK DataCacheQueue 实现
 */

import { logger } from '../utils/logger';

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

export interface IRawFaceFrameData {
  body_id: number;
  frameIndex: number;
  sf: number;
  ef: number;
  state: string;
  id: number;
  FaceFrameData: any;
}

export interface IRawAudioFrameData {
  sf: number;
  ef: number;
  ad: Uint8Array;
  sid: number;
}

export interface IRawEventFrameData {
  id: number;
  s: string;
  sf: number;
  ef: number;
  e: any[];
}

/**
 * DataCacheQueueMP - 数据缓存队列
 * 管理身体、脸部、音频、事件数据的缓存
 */
export class DataCacheQueueMP {
  private TAG = '[DataCacheQueueMP]';

  // Body 视频抽帧缓存 (使用 Map 优化查找)
  private _bodyQueue: Map<number, IBodyFrame> = new Map();

  // 表情数据队列
  private _facialQueue: IRawFaceFrameData[] = [];
  private _realFacialQueue: IRawFaceFrameData[] = [];

  // 音频队列
  private audioQueue: IRawAudioFrameData[] = [];

  // UI 事件队列
  private eventQueue: IRawEventFrameData[] = [];

  // 当前视频 ID 列表
  private videoIdList: string[] = [];

  // 当前播放状态
  private _currentPlayState: string = 'idle';

  // 当前 TTSA 状态
  private _currentTtsaState: any = null;

  constructor() {
    logger.info(this.TAG, 'Created');
  }

  // ===== 属性 getter/setter =====

  set currentPlayState(state: string) {
    this._currentPlayState = state;
  }

  get currentPlayState(): string {
    return this._currentPlayState;
  }

  set currentTtsaState(state: any) {
    this._currentTtsaState = state;
  }

  get currentTtsaState(): any {
    return this._currentTtsaState;
  }

  get bodyQueue(): IBodyFrame[] {
    return Array.from(this._bodyQueue.values());
  }

  // ===== Body 数据操作 =====

  /**
   * 更新身体图像数据
   */
  _updateBodyImageBitmap(data: IBodyFrame): void {
    // 清理旧帧
    const old = this._bodyQueue.get(data.frameIndex);
    if (old && old.frame) {
      this.disposeFrame(old.frame);
    }

    // 清理过期帧
    for (const [curIndex, curFrame] of this._bodyQueue.entries()) {
      if (curFrame.body_id < data.body_id && curFrame.frameIndex >= data.frameIndex) {
        this.disposeFrame(curFrame.frame);
        this._bodyQueue.delete(curIndex);
      }
    }

    this._bodyQueue.set(data.frameIndex, data);

    logger.debug(this.TAG, 'Body frame updated:', data.frameIndex);
  }

  /**
   * 获取身体图像数据
   */
  _getBodyImageBitmap(frameIndex: number): IBodyFrame | undefined {
    const frame = this._bodyQueue.get(frameIndex);

    // 清理过期帧
    for (const [curIndex, curFrame] of this._bodyQueue.entries()) {
      if (curIndex < frameIndex) {
        this.disposeFrame(curFrame.frame);
        this._bodyQueue.delete(curIndex);
      }
    }

    return frame;
  }

  /**
   * 清理过期帧
   */
  clearOldFrames(sf: number): void {
    for (const [curIndex, curFrame] of this._bodyQueue.entries()) {
      if (curIndex >= sf) {
        this.disposeFrame(curFrame.frame);
        this._bodyQueue.delete(curIndex);
      }
    }
  }

  /**
   * 设置视频 ID 列表
   */
  setVideoIdList(videoId: string): void {
    if (!this.videoIdList.includes(videoId)) {
      this.videoIdList.push(videoId);
    }
  }

  /**
   * 获取视频 ID 列表
   */
  getVideoIdList(): string[] {
    return this.videoIdList;
  }

  // ===== Face 数据操作 =====

  /**
   * 更新表情数据
   */
  _updateFacial(data: IRawFaceFrameData[]): void {
    this._facialQueue = data;
  }

  /**
   * 获取表情数据
   */
  _getFacial(frameIndex: number): IRawFaceFrameData | undefined {
    return this._facialQueue.find(item => item.sf <= frameIndex && item.ef >= frameIndex);
  }

  /**
   * 更新实时表情数据
   */
  _updateRealFacial(data: IRawFaceFrameData[]): void {
    this._realFacialQueue = data;
  }

  /**
   * 获取实时表情数据
   */
  _getRealFacial(frameIndex: number): IRawFaceFrameData | undefined {
    return this._realFacialQueue.find(item => item.sf <= frameIndex && item.ef >= frameIndex);
  }

  /**
   * 清理所有表情数据
   */
  clearAllFaceData(): void {
    this._facialQueue = [];
    this._realFacialQueue = [];
    logger.debug(this.TAG, 'All face data cleared');
  }

  // ===== Audio 数据操作 =====

  /**
   * 更新音频数据
   */
  _updateAudio(data: IRawAudioFrameData[]): void {
    // 保留最新的音频数据
    this.audioQueue = data;
  }

  /**
   * 获取音频数据
   */
  _getAudio(frameIndex: number): IRawAudioFrameData | undefined {
    // 查找当前帧对应的音频数据
    return this.audioQueue.find(item => item.sf <= frameIndex && item.ef >= frameIndex);
  }

  /**
   * 清理音频数据
   */
  _clearAudio(speechId: number): void {
    // 清理指定 speechId 的音频数据
    this.audioQueue = this.audioQueue.filter(item => item.sid > speechId);
  }

  // ===== Event 数据操作 =====

  /**
   * 更新 UI 事件
   */
  _updateUiEvent(data: IRawEventFrameData[]): void {
    this.eventQueue.push(...data);
  }

  /**
   * 获取 UI 事件
   */
  _getUiEvent(frameIndex: number): IRawEventFrameData[] {
    return this.eventQueue.filter(item => item.sf <= frameIndex && item.ef >= frameIndex);
  }

  /**
   * 清理事件数据
   */
  _clearEvent(): void {
    this.eventQueue = [];
  }

  // ===== 数据验证 =====

  /**
   * 检查数据有效性
   */
  checkValidData(data: any[], type: string): void {
    if (!data || data.length === 0) return;

    const first = data[0];
    const currentFrame = 0; // TODO: 获取当前帧

    if (first.sf < currentFrame) {
      logger.warn(this.TAG, `${type} data expired: sf=${first.sf}, current=${currentFrame}`);
    }
  }

  // ===== 工具方法 =====

  /**
   * 释放帧资源
   */
  private disposeFrame(frame: any): void {
    if (frame && typeof frame.close === 'function') {
      frame.close();
    } else if (frame && typeof frame.release === 'function') {
      frame.release();
    }
  }

  /**
   * 获取身体视频名称列表长度
   */
  getBodyVideoNameListLength(): number {
    const list: string[] = [];
    this.bodyQueue.forEach(item => {
      if (!list.includes(item.name)) {
        list.push(item.name);
      }
    });
    return list.length;
  }

  /**
   * 获取队列大小
   */
  getQueueSize(): {
    body: number;
    face: number;
    audio: number;
    event: number;
  } {
    return {
      body: this._bodyQueue.size,
      face: this._facialQueue.length,
      audio: this.audioQueue.length,
      event: this.eventQueue.length
    };
  }

  /**
   * 清理所有数据
   */
  clear(): void {
    // 清理 body
    for (const [, frame] of this._bodyQueue) {
      this.disposeFrame(frame.frame);
    }
    this._bodyQueue.clear();

    // 清理 face
    this._facialQueue = [];
    this._realFacialQueue = [];

    // 清理 audio
    this.audioQueue = [];

    // 清理 event
    this.eventQueue = [];

    this.videoIdList = [];

    logger.info(this.TAG, 'All queues cleared');
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.clear();
    logger.info(this.TAG, 'Destroyed');
  }
}

export default DataCacheQueueMP;
