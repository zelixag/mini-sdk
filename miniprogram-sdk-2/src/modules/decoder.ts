/**
 * Decoder - 视频解码器 for Mini Program
 * 负责从视频 URL 解码出帧图像
 */

import { logger } from '../utils/logger';

export interface DecoderOptions {
  hardwareAcceleration?: string;
  onMessage?: (message: any) => void;
}

export interface DecodedFrame {
  frame: any;
  index: number;
  width: number;
  height: number;
}

export interface VideoData {
  name: string;
  url: string;
  body_id: number;
  id: number;
  sf: number;
  ef: number;
  startFrameIndex: number;
  endFrameIndex: number;
  frameRate?: number;
}

/**
 * Decoder - 视频解码器
 * 使用小程序视频组件解码视频帧
 */
export class Decoder {
  private TAG = '[Decoder]';
  private options: DecoderOptions;

  // 正在解码的任务
  private decodingTasks: Map<string, {
    video: any;
    frames: Map<number, any>;
    abort: boolean;
  }> = new Map();

  // 解码配置
  private maxParallelDecodes: number = 2;
  private decodeQueue: VideoData[] = [];

  constructor(options: DecoderOptions = {}) {
    this.options = options;
    logger.info(this.TAG, 'Created');
  }

  /**
   * 解码视频帧
   */
  decode(
    videoData: VideoData,
    frameCallback: (file: VideoData, frame: any, index: number) => void,
    doneCallback?: (file: VideoData) => void
  ): void {
    const taskId = this.getTaskId(videoData);

    logger.info(this.TAG, 'Decoding video:', videoData.name, 'frames:', videoData.sf, '-', videoData.ef);

    // 创建视频上下文（小程序方式）
    this.decodeWithVideoContext(videoData, frameCallback, doneCallback);
  }

  /**
   * 使用小程序视频上下文解码
   */
  private decodeWithVideoContext(
    videoData: VideoData,
    frameCallback: (file: VideoData, frame: any, index: number) => void,
    doneCallback?: (file: VideoData) => void
  ): void {
    const { url, sf, ef, startFrameIndex, endFrameIndex, frameRate = 24 } = videoData;

    // 计算帧时间间隔
    const frameDuration = 1 / frameRate;

    // 小程序视频解码
    const video = wx.createVideoContext?.('decoder-video');

    if (!video) {
      logger.error(this.TAG, 'Failed to create video context');
      doneCallback?.(videoData);
      return;
    }

    // 设置视频源
    video.src = url;

    // 等待视频加载
    video.onReady(() => {
      // 逐帧抽取
      this.extractFrames(video, sf, ef, startFrameIndex, frameDuration, frameCallback, () => {
        doneCallback?.(videoData);
      });
    });
  }

  /**
   * 提取帧
   */
  private extractFrames(
    video: any,
    startFrame: number,
    endFrame: number,
    startIndex: number,
    frameDuration: number,
    frameCallback: (file: VideoData, frame: any, index: number) => void,
    doneCallback: () => void
  ): void {
    let currentFrame = startFrame;

    const extractNext = () => {
      if (currentFrame > endFrame) {
        doneCallback();
        return;
      }

      const seekTime = currentFrame * frameDuration;
      video.seek(seekTime);

      // 等待 seek 完成
      video.onSeek(() => {
        // 获取当前帧图像
        // 小程序无法直接获取帧图像，需要使用 canvas
        const frameData = this.captureFrame(video, startIndex + (currentFrame - startFrame));

        if (frameData) {
          frameCallback(
            {} as VideoData,
            frameData,
            startIndex + (currentFrame - startFrame)
          );
        }

        currentFrame++;
        extractNext();
      });
    };

    extractNext();
  }

  /**
   * 捕获帧
   */
  private captureFrame(video: any, index: number): any {
    // 小程序中使用 canvas 绘制视频帧
    // 这里需要结合 CanvasAdapter 使用
    // TODO: 实现帧捕获
    return null;
  }

  /**
   * 取消解码
   */
  abort(taskId?: string): void {
    if (taskId) {
      const task = this.decodingTasks.get(taskId);
      if (task) {
        task.abort = true;
        this.decodingTasks.delete(taskId);
      }
    }
  }

  /**
   * 取消单个视频解码
   */
  abortOne(taskId: string): void {
    this.abort(taskId);
  }

  /**
   * 获取任务 ID
   */
  private getTaskId(data: VideoData): string {
    return `${data.body_id || data.id}_${data.name}`;
  }

  /**
   * 同步解码（用于断线重连）
   */
  syncDecode(frameIndex: number): void {
    // TODO: 实现同步解码
    logger.debug(this.TAG, 'Sync decode at frame:', frameIndex);
  }

  /**
   * 离线模式解码
   */
  _offLineMode(offlineData: any, frame: number): void {
    // TODO: 实现离线模式解码
    logger.debug(this.TAG, 'Offline mode decode');
  }

  /**
   * 离线模式运行
   */
  _offlineRun(): void {
    // TODO: 实现离线模式运行
    logger.debug(this.TAG, 'Offline run');
  }

  /**
   * 重新加载
   */
  _reload(): void {
    // 取消所有正在进行的解码
    this.decodeQueue = [];
    for (const [id, task] of this.decodingTasks) {
      task.abort = true;
    }
    this.decodingTasks.clear();

    logger.info(this.TAG, 'Reloaded');
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.abort();
    this.decodeQueue = [];
    logger.info(this.TAG, 'Destroyed');
  }
}

/**
 * ParallelDecoder - 并行解码器
 * 支持多视频并行解码
 */
export class ParallelDecoder {
  private TAG = '[ParallelDecoder]';
  private decoder: Decoder;
  private activeDecodes: number = 0;

  constructor(options: DecoderOptions = {}) {
    this.decoder = new Decoder(options);
    logger.info(this.TAG, 'Created');
  }

  /**
   * 解码视频
   */
  decode(
    videoList: VideoData[],
    frameCallback: (file: VideoData, frame: any, index: number) => void,
    doneCallback?: (file: VideoData) => void
  ): void {
    videoList.forEach(videoData => {
      this.decoder.decode(videoData, frameCallback, doneCallback);
    });
  }

  /**
   * 尝试开始下一个解码任务
   */
  _tryStartNext(): void {
    // TODO: 实现队列调度
  }

  /**
   * 同步解码
   */
  syncDecode(frameIndex: number): void {
    this.decoder.syncDecode(frameIndex);
  }

  /**
   * 取消所有解码
   */
  abort(): void {
    this.decoder.abort();
  }

  /**
   * 取消单个解码
   */
  abortOne(taskId: string): void {
    this.decoder.abortOne(taskId);
  }

  /**
   * 重新加载
   */
  _reload(): void {
    this.decoder._reload();
  }

  /**
   * 离线模式
   */
  _offLineMode(data: any, frame: number): void {
    this.decoder._offLineMode(data, frame);
  }

  /**
   * 离线运行
   */
  _offlineRun(): void {
    this.decoder._offlineRun();
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.decoder.destroy();
    logger.info(this.TAG, 'Destroyed');
  }
}

export default { Decoder, ParallelDecoder };
