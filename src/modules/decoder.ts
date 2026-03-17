import { bodyFile, IRawBodyFrameData } from "../types/frame-data";
import { workerURL } from "../worker/streaming-video";
import ResourceManager, { IOfflineIdle } from "./ResourceManager";
import { performanceConstant } from "../utils/perfermance";
import SaveAndDownload from "../control/SaveAndDownload";
import { DataCacheQueue } from "../control/DataCacheQueue";
import { EErrorCode } from "../types/error";
import { parseUint8ToFloat32 } from "utils/float32-decoder";


export default class ParallelDecoder {
  private tasks: Map<
    string,
    {
      worker: Worker;
      status: string;
      onMessage: (e: MessageEvent) => void;
      ef?: number;
    }
  >;
  private queue: Array<IRawBodyFrameData>;
  private maxParallel: number;
  private currentParallel: number;
  private _locked: boolean;
  private currentTaskId: string | null;
  private resourceManager: ResourceManager;
  private onFrame: (file: bodyFile, frame: any, index: number) => void;
  private onDone: (file: bodyFile, id: string) => void;
  private isFirstDecode: boolean;
  private pendingAbort: boolean = false;
  private abortAfterEf: number | null = null;
  private pendingNewQueue: Array<IRawBodyFrameData> | null = null;
  private currentDecodedFrameIndex: number | null = null;
  private abortAfterFrame: number | null = null;
  private cacheVideoCount: number = 5; // 缓存视频数量
  private saveAndDownload: SaveAndDownload;
  private dataCacheQueue: DataCacheQueue;
  private bodyFrameCountMap: Map<string, number>;
  private maxVideoCount: number = 2;
  private hardwareAcceleration: string = "default";
  private MAX_LOAD_VIDEO_TIMEOUT_MS = 2000; // 最大加载视频超时时间（毫秒）

  _offlineLastFrame = 0;
  _offlineIdle: IOfflineIdle[] = [];
  _offlineIdleIndex = 0;
  reportMessage: (message: {
    code: EErrorCode;
    message: string;
    e?: object;
  }) => void;

  constructor(options: {
    hardwareAcceleration: string;
    resourceManager: ResourceManager;
    saveAndDownload: SaveAndDownload;
    dataCacheQueue: DataCacheQueue;
    reportMessage: (message: {
      code: EErrorCode;
      message: string;
      e?: object;
    }) => void;
  }) {
    this.tasks = new Map();
    this.queue = [];
    this.maxParallel = 1;
    this.currentParallel = 0;
    this._locked = false; // 并发保护锁
    this.currentTaskId = null;
    this.resourceManager = options.resourceManager;
    this.onFrame = () => {};
    this.onDone = () => {};
    this.isFirstDecode = true;
    this.saveAndDownload = options.saveAndDownload;
    this.dataCacheQueue = options.dataCacheQueue;
    this.bodyFrameCountMap = new Map();
    this.hardwareAcceleration = options.hardwareAcceleration;
    this.reportMessage = options.reportMessage;
  }

  getRandomTaskId() {
    return Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  }

  decode(
    files: Array<IRawBodyFrameData>,
    onFrame: (file: bodyFile, frame: any, index: number) => void,
  ) {
    if (this.isFirstDecode) {
      if (this._locked) return; // 并发保护
      this.abort(); // 清理所有旧任务
      this._locked = true;
      this.queue = files; // 拷贝一份队列
      this.onFrame = (file, frame, index) => {
        this.currentDecodedFrameIndex = file.startFrameIndex + index;
        this._handlePendingAbort(file, index);
        onFrame(file, frame, index);
      };
      this.currentParallel = 0;
      this.currentTaskId = this.getRandomTaskId(); // 唯一任务ID
      this.isFirstDecode = false;
    } else {
      this.updateQueue(files);
    }
  }

  updateQueue(files: Array<IRawBodyFrameData>) {
    this.abortAfterFrame = null;
    if (this.queue.length === 0) {
      this.queue.push(...files);
      (window as any).avatarSDKLogger.log("队列为空，直接追加", JSON.stringify(this.getQueue()));
      return;
    }

    const lastQueueEf = this.queue[this.queue.length - 1].ef;
    const firstQueueSf = this.queue[0].sf;
    const newSf = files[0].sf;
    (window as any).avatarSDKLogger.log("开始校验视频队列,目前队列", JSON.stringify(this.getQueue()));

    if (newSf >= lastQueueEf) {
      // 顺序追加
      this.queue.push(...files);
      (window as any).avatarSDKLogger.log("顺序追加结果", JSON.stringify(this.getQueue()));
    } else if (newSf < firstQueueSf) {
      // 回退/seek，判断是否需要等待
      if (
        this.currentDecodedFrameIndex !== null &&
        newSf > this.currentDecodedFrameIndex + 1
      ) {
        // 有间隔，需要等待
        this.abortAfterFrame = newSf - 1;
        // 找到数据中ef小于abortAfterFrame的帧
        const oldQueue = this.queue.filter((item) => item.ef < newSf);
        this.queue = oldQueue.concat(files);
        (window as any).avatarSDKLogger.log("等待处理到abortAfterFrame后再abort", this.abortAfterFrame, this.pendingNewQueue);
        return;
      } else {
        // 没有间隔，直接abort
        this.abort();
        this.queue = files.slice();
        this._locked = true;
        this.currentTaskId = this.getRandomTaskId();
        (window as any).avatarSDKLogger.log("回退/seek，重置队列", JSON.stringify(this.getQueue()));
        // 清除队列中sf小于newsf的帧
        const newQueueSf = this.queue[0].sf;
        this.dataCacheQueue.clearOldFrames(newQueueSf);
      }
    } else if (newSf === firstQueueSf) {
      this.queue = files.slice();
      const newQueueSf = this.queue[0].sf;
      this.dataCacheQueue.clearOldFrames(newQueueSf);
      (window as any).avatarSDKLogger.log("重置队列", JSON.stringify(this.getQueue()));
    } else {
      // 在队列中间，找到重叠点，截断再追加
      const mp4Index = this.queue.findIndex((item) => item.sf >= newSf);
      if (mp4Index !== -1) {
        this.queue.length = mp4Index;
      }
      this.abortAfterFrame = newSf-1;
      this.queue.push(...files);
      (window as any).avatarSDKLogger.log("中间追加，截断后追加", JSON.stringify(this.getQueue()));
    }
  }
  _isIOS() {
    return /iPad|iPhone|iPod|iOS/.test(navigator.userAgent);
  }

  getQueue() {
    return this.queue.map(item => ({
      ...item,
      x_offset: []
    }));
  }

  // 定义超时函数：超过指定时间后 reject
  timeoutPromise(ms: number, reason = "请求超时") {
    return new Promise((_, reject) => {
      setTimeout(() => {
        // (window as any).avatarSDKLogger.error(reason);
        reject();
      }, ms);
    });
  }

  // 加载视频并添加超时控制（800ms）
  async loadVideoWithTimeout(videoKey: string): Promise<ArrayBuffer | null> {
    try {
      // Promise.race：谁先完成就取谁的结果（加载成功 或 超时）
      const arrayBuffer = await Promise.race([
        this.resourceManager.loadVideo(videoKey), // 原加载逻辑
        this.timeoutPromise(this.MAX_LOAD_VIDEO_TIMEOUT_MS, `视频 ${videoKey} 加载超时（${this.MAX_LOAD_VIDEO_TIMEOUT_MS}ms）`) // 800ms 超时
      ]);
      return arrayBuffer as ArrayBuffer; // 加载成功，返回 ArrayBuffer
    } catch (error) {
      return null; // 超时或失败，返回 null 标识
    }
  }

  async _tryStartNext() {
     // 新增：判断当前队列是否包含回退视频（sf < 当前已解码帧索引）
    const hasBackwardVideo = this.queue.some(item => 
      this.currentDecodedFrameIndex !== null && item.sf < this.currentDecodedFrameIndex
    );
    // 缓存数量判断：回退场景下放宽限制（允许多1个）
    let maxAllowed: number;

    if (hasBackwardVideo) {
      // 回退时：iOS 保持原限制，其他平台临时+1
      maxAllowed = this._isIOS() ? this.maxVideoCount : this.maxVideoCount + 1;
    } else {
      // 非回退时：iOS 限制为1，其他平台用默认最大数量
      maxAllowed = this._isIOS() ? 1 : this.maxVideoCount;
    }
    if (this.dataCacheQueue.getBodyVideoNameListLength() >= maxAllowed) {
      return;
    }
    if (this.currentParallel < this.maxParallel && this.queue.length > 0) {
      const bodyInfo = this.queue.shift() as IRawBodyFrameData;
      this.saveAndDownload.appendMultipleToArray("videoData", [bodyInfo]);
      this._cleanupOldWorkers(bodyInfo.body_id ?? bodyInfo.id ?? 0);
      this.currentParallel++;
      (window as any).performanceTracker.markStart(
        performanceConstant.load_video,
        bodyInfo
      );
      if(!bodyInfo.n) {
        this.currentParallel--;
        this._tryStartNext();
        this.reportMessage({
          code: EErrorCode.INVALID_BODY_NAME,
          message: `body数据无Name: ${JSON.stringify(bodyInfo)}`,
        });
        return;
      }
      // 加载视频并添加超时控制
      const arrayBuffer = (await this.loadVideoWithTimeout(
        bodyInfo.n
      )) as ArrayBuffer;
      if(!arrayBuffer) {
        this.currentParallel--;
        this._tryStartNext();
        return;
      }
      (window as any).performanceTracker.markEnd(
        performanceConstant.load_video,
        bodyInfo
      );
      (window as any).performanceTracker.markStart(
        performanceConstant.decode_video,
        bodyInfo
      );
      this._startWorker({
        name: bodyInfo.n,
        id: bodyInfo.id,
        frameState: bodyInfo.s,
        start: bodyInfo.asf,
        end: bodyInfo.aef,
        hfd: bodyInfo.hfd,
        data: arrayBuffer,
        startFrameIndex: bodyInfo.sf,
        endFrameIndex: bodyInfo.ef,
        body_id: bodyInfo.body_id,
        x_offset: parseUint8ToFloat32(bodyInfo.x_offset) || []
      });
    }
  }

  _startWorker(file: bodyFile) {
    const taskId = this.currentTaskId;
    const worker = new Worker(workerURL);
    const id = `${file.body_id ?? file.id ?? 0}_${file.name}`;
    const data = file.data;
    const dataCopy = new ArrayBuffer(data.byteLength);
    new Uint8Array(dataCopy).set(new Uint8Array(data));

    const onMessage = (e: MessageEvent) => {
      if (taskId !== this.currentTaskId) return; // 只处理当前任务
      if (e.data.type === "frame") {
        if(e.data.index < file.start || e.data.index > file.end) {
          e.data.frame.close();
        } else {
          this.cacheVideo();
          this.onFrame(file, e.data.frame, e.data.index);
          const bodyFrameCount = this.bodyFrameCountMap.get(file.name) ?? 0
          this.bodyFrameCountMap.set(file.name, bodyFrameCount + 1)
          if (this.abortAfterFrame && e.data.index + file.startFrameIndex >= this.abortAfterFrame) {
            (window as any).avatarSDKLogger.log("abortAfterFrame", this.abortAfterFrame, file)
            this.abortOne(id);
            this.abortAfterFrame = null;
            this._tryStartNext();
          }
        }
      } else if(e.data.type === "configSupport") {
        (window as any).avatarSDKLogger.log("configSupport", e.data);
      }else if (e.data.type === "done") {
        (window as any).performanceTracker.markEnd(
          performanceConstant.decode_video,
          file
        );
        const bodyFrameCount = this.bodyFrameCountMap.get(file.name) ?? 0
        if(bodyFrameCount < file.end- file.start - 1) {
          this.bodyFrameCountMap.delete(file.name)
        }
        const task = this.tasks.get(id);
        if (task) {
          task.status = "done";
          task.worker.postMessage({ type: "abort" });
        }
        this.currentParallel--;
        this.onDone && this.onDone(file, id);
        worker.removeEventListener("message", onMessage);
        worker.terminate();
        this.tasks.delete(id);
        if (this.currentParallel === 0 && this.queue.length === 0) {
          this._locked = false; // 解锁
        }
        this._tryStartNext();
      } else if (e.data.type === "error") {
        const task = this.tasks.get(id);
        if (task) {
          task.status = "error";
          task.worker.postMessage({ type: "abort" });
        }
        this.currentParallel--;
        this.onDone && this.onDone(file, id);
        worker.removeEventListener("message", onMessage);
        worker.terminate();
        this.tasks.delete(id);
        if (this.currentParallel === 0 && this.queue.length === 0) {
          this._locked = false; // 解锁
        }
      }
    };
    worker.addEventListener("message", onMessage);
    this.tasks.set(id, {
      worker,
      status: "decoding",
      onMessage,
      ef: file.endFrameIndex,
    });
    (window as any).avatarSDKLogger.log("start decode", file.name, file.startFrameIndex, file.endFrameIndex)
    worker.postMessage(
      {
        type: "decode",
        file: { data: dataCopy },
        start: file.start,
        end: file.end,
        hardwareAcceleration: this.hardwareAcceleration,
        taskId,
      },
      [dataCopy]
    );
  }

  // 在当前视频解出第一帧后，缓存队列中的前cacheVideoCount个视频（包括当前视频）
  // 首次调用会缓存当前视频及后续cacheVideoCount-1个视频
  // 后续每次调用会重新请求前cacheVideoCount个视频（已缓存的视频会被loadVideo内部过滤）
  cacheVideo() {
    const cacheQueue = this.queue.slice(0, this.cacheVideoCount);
    for (const item of cacheQueue) {
      this.resourceManager.preloadVideo(item.n);
    }
  }

  abort() {
    this.tasks.forEach(({ worker, status, onMessage }) => {
      if (status === "decoding") {
        worker.postMessage({ type: "abort" });
        if (onMessage) worker.removeEventListener("message", onMessage);
        worker.terminate();
      }
    });
    this.tasks.clear();
    this.queue = [];
    this.currentParallel = 0;
    this._locked = false; // 解锁
    this.currentTaskId = null;
  }

  abortOne(id: string) {
    const task = this.tasks.get(id);
    if (task && task.status === "decoding") {
      task?.worker.postMessage({ type: "abort" });
      if (task?.onMessage) {
        task.worker.removeEventListener("message", task.onMessage);
      }
      task?.worker.terminate();
      this.tasks.delete(id);
      this.currentParallel--;
      if (this.currentParallel === 0 && this.queue.length === 0) {
        this._locked = false; // 解锁
      }
    }
  }

  destroy() {
    this.abort();
    this.queue = [];
    this.currentParallel = 0;
    this._locked = false;
    this.currentTaskId = null;
    this.pendingAbort = false;
    this.abortAfterEf = null;
    this.pendingNewQueue = null;
    this.abortAfterFrame = null;
    this.currentDecodedFrameIndex = null;
  }

  _handlePendingAbort(file: bodyFile, index: number) {
    if (this.pendingAbort && this.abortAfterEf !== null) {
      const currentFrameIndex = file.startFrameIndex + index;
      if (currentFrameIndex >= this.abortAfterEf) {
        this.abort();
        this.queue = this.pendingNewQueue!;
        this._locked = true;
        this.currentTaskId = this.getRandomTaskId();
        // 重置等待标志
        this.pendingAbort = false;
        this.abortAfterEf = null;
        this.pendingNewQueue = null;
      }
    }
  }

  private _cleanupOldWorkers(newBodyId: number) {
    for (const [taskId, task] of this.tasks) {
      // taskId 格式如 '143_stand_by_unface03_cut_011'
      const [bodyIdStr] = taskId.split("_");
      const bodyId = parseInt(bodyIdStr, 10);
      if (!isNaN(bodyId) && bodyId < newBodyId) {
        task.worker.postMessage({ type: "abort" });
        if (task.onMessage)
          task.worker.removeEventListener("message", task.onMessage);
        task.worker.terminate();
        this.tasks.delete(taskId);
      }
    }
  }
  syncDecode(currentFrameIndex: number) {
    // 直接打断当前解帧的视频，理论上1s，很小概率用户会切换回来。
    const mp4List = this.queue.filter((item) => item.ef > currentFrameIndex);
    this.abort();
    // 如果上述条件不满足，则打断当前处理中的任务，根据currentFrameIndex获取queue中ef>currentFrameIndex的queue，重新装填到解帧队列，开始解帧
    this.queue = mp4List;
    this._locked = true;
    this.currentTaskId = this.getRandomTaskId();
    this._tryStartNext();
  }

  /** 进入正常模式 */
  _reload() {
    this._offlineLastFrame = 0
    this.queue = []
  }
  /** 进入离线，清空剩余身体数据 */
  _offLineMode(offlineIdle: IOfflineIdle[], currentFrame: number) {
    this.abort()
    this._offlineLastFrame = currentFrame
    this._offlineIdle = offlineIdle
    this.currentParallel -= 1;
    this.queue = []
    this._offlineRun()
  }
  _offlineRun() {
    const idle = this._offlineIdle[this._offlineIdleIndex]
    if (idle) {
      this._offlineIdleIndex += 1
      this._putOfflineBodyData(idle)
    } else {
      this._offlineIdleIndex = 0
    }
  }
  /** 设置 idle 视频 */
  _putOfflineBodyData(idle: IOfflineIdle) {
    const delta = idle.aef - idle.asf

    const bodyInfo = {
      id: -1,
      n: idle.n,
      s: 'idle',
      hfd: false,
      body_id: -1,
      asf: idle.asf,
      aef: idle.aef,
      sf: this._offlineLastFrame,
      ef: this._offlineLastFrame + delta,
      x_offset: new Uint8Array(),
    }
    this.queue.push(bodyInfo)
    this._offlineLastFrame = bodyInfo.ef
  }
}
