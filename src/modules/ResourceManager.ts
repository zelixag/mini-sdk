import Pako from 'pako'
import { IAvatarOptions, INetworkInfo, Layout, WalkConfig } from "../types/index";
import request, { XMLRequest } from "../utils/request";
import {
  IBRAnimationGeneratorCharInfo_NN,
} from "../utils/DataInterface";
import XmovAvatar from "../index";
import { EErrorCode } from "../types/error";
import { headersNeedSign } from "../utils/encodeToken";
// import { isDEV } from "../utils";
import CacheManager from './cache-manager';

/**
 * 资源处理模块，加载并存储资源
 */

type TOptions = Pick<
  IAvatarOptions,
  "appId" | "appSecret" | "gatewayServer" | 'cacheServer' | "sdkInstance" | "config" | "headers"
> & {
  onNetworkInfo(quality: INetworkInfo): void
  onStartSessionWarning?: (message: Object) => void
};
export type TDownloadProgress = (progress: number) => void;
export interface IOfflineIdle {
  asf: number
  aef: number
  n: string
}
export interface IResumeParams {
  client_frame: number
  current_ani: string
  current_ani_frame: number
  next_state: string
}
export interface ISessionResponse {
  session_id: string;
  room: string;
  token: string;
  socket_io_url: string;
  session_start_time: string;
  resource_pack: {
    body_data_dir: string;
    face_ani_char_data: string;
    face_ani_preload_data: string;
    offline_idle: IOfflineIdle[],
    interpolate_joints: [number, number][]
  };
  reconnect_timeout: number;
  reconnect_client_timeout: number;
  config: {
    background_img: string;
    frame_rate: number;
    look_name: string;
    tts_vcn_id: string;
    sta_face_id: string;
    mp_service_id: string;
    raw_audio: boolean;
    resolution: {
      width: number;
      height: number;
    },
    init_events: [
      {
        type: string,
        data: {
          image: string,
          axis_id: number,
        }
      }
    ]
  };
}
export default class ResourceManager {
  private TAG = "[ResourceManager]";
  options: TOptions;
  sdk: XmovAvatar;
  session_id?: string;
  mouthShapeLib: any;
  offlineIdle: IOfflineIdle[] = []
  offlineCache = new Map<string, {
    data: ArrayBuffer;
  }>();
  networkInfos: INetworkInfo[] = [];
  private bg: HTMLImageElement | null = null;
  public resource_pack: {
    body_data_dir: string;
    face_ani_char_data: string;
    face_ani_preload_data: string;
    blendshape_map?: number[][];
    interpolate_joints: [number, number][]
  }
  progress = 0; // start session 以后之后资源下载进度

  config: {
    background_img: string;
    frame_rate: number;
    look_name: string;
    tts_vcn_id: string;
    sta_face_id: string;
    mp_service_id: string;
    raw_audio: boolean;
    resolution: {
      width: number;
      height: number;
    },
    init_events: [
      {
        type: string,
        "x_location"?: number,//控件锚点信息，控件左上角在屏幕上的横向位置。范围0-1
        "y_location"?: number,//控件锚点信息，控件左上角在屏幕上的纵向位置。范围0-1
        width?: number,//控件锚点信息，控件在屏幕上的宽度。范围0-1
        height: number,//控件锚点信息，控件在屏幕上的高度。范围0-1
        data?: {
          image: string,
          axis_id: number,
        }
      }
    ],
    framedata_proto_version: number;
    layout: Layout;
    walk_config: WalkConfig;
  };

  // 视频缓存相关
  private videoCache = new Map<string, {
    data: ArrayBuffer;
    lastAccessTime: number;
    accessCount: number;
  }>();
  private maxCacheSize = 10 * 1024 * 1024; // 5MB 默认缓存大小
  private maxCacheEntries = 20; // 最大缓存条目数
  private cacheCleanupInterval: any = null;
  private isProcessingVideo = false; // 防止在视频处理过程中清理缓存
  private cacheServer?: CacheManager;

  // 新增：正在下载的视频跟踪
  private downloadingVideos = new Map<string, Promise<ArrayBuffer | undefined>>();
  first_load = true;
  constructor(options: TOptions) {
    this.options = options;
    this.sdk = options.sdkInstance as XmovAvatar;
    this.mouthShapeLib = {
      char_info: null,
    };
    this.config = options.config || {};
    this.resource_pack = {
      body_data_dir: "",
      face_ani_char_data: "",
      face_ani_preload_data: "",
      interpolate_joints: [[4, 3]]
    };

    if (options.cacheServer) {
      this.cacheServer = new CacheManager(options.cacheServer);
    }
    // 启动缓存清理定时器
    this.startCacheCleanup();
  }

  public getAppInfo() {
    return {
      appId: this.options.appId,
      appSecret: this.options.appSecret,
    }
  }


  // preCache(appId: string, appSecret: string) {
  //   if (this.cacheServer) {
  //     return this.cacheServer.preCache(appId, appSecret)
  //   }
  //   return Promise.reject('缓存服务器未配置')
  // }

  /**
   * 加载背景图片
   * @returns Promise<void>
   */
  getBackgroundImage(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        // 设置跨域属性
        img.crossOrigin = "anonymous";
        img.src = this.config?.background_img || "";
        if (!this.config?.background_img) return;
        img.onload = () => {
          this.bg = img;
          resolve();
        };

        img.onerror = (error) => {
          this.sdk.onMessage({
            code: EErrorCode.BACKGROUND_IMAGE_LOAD_ERROR,
            message: `Error: 背景图片加载失败`,
            e: JSON.stringify({ error, img }),
          });
          this.bg = null;
          resolve();
        };
      } catch (error) {
      }
    });
  }

  /**
   * 获取背景图片
   * @returns HTMLImageElement | null
   */
  getBackgroundImageElement(): HTMLImageElement | null {
    return this.bg;
  }

  getConfig() {
    return this.config;
  }

  async load(onDownloadProgress?: TDownloadProgress) {
    onDownloadProgress?.(this.progress);
    // http 请求算 10 进度
    const result = await this.startSession();
    if (!result) {
      // 接口请求失败时已经提示了错误，这里不需要再提示
      // this.sdk.onMessage({
      //   code: EErrorCode.START_SESSION_ERROR,
      //   message: `${this.TAG} Error: startSession请求失败`,
      //   e: JSON.stringify({ error: 'startSession请求失败' }),
      // });
      return null;
    }
    this.progress += 10;
    onDownloadProgress?.(this.progress);
    const res = result as unknown as ISessionResponse;
    this.session_id = res?.session_id;
    this.resource_pack = res.resource_pack;
    this.config = res.config as any;
    this.offlineIdle = res.resource_pack?.offline_idle || []
    this._setOfflineCache()
    if (this.resource_pack) {
      await this.loadMouthShapeLib(onDownloadProgress);
      this.getBackgroundImage();
      if(!this.mouthShapeLib?.char_info) {
        return null
      }
    }
    return res;
  }

  async startSession() {
    try {
      const result = await this._startSession();
      if (result?.verify_res) {
        this.options.onStartSessionWarning?.(result.verify_res);
      }
      return result;
    } catch (error) {
      return null;
    }
  }
  _startSession() {
    if (!navigator.onLine) {
      this.sdk.onMessage({
        code: EErrorCode.NETWORK_BREAK,
        message: '没有网络，请联网后重试~',
      });
      return null;
    }

    const url = `${this.options.gatewayServer}`;

    // 如果用户传入特定房间tag则透传给后端
    const tagObj = this.sdk.getTag() ? {tag: this.sdk.getTag()} : {};

    const data = {
      ...tagObj,
      config: {
        ...this.config,
        framedata_proto_version: 2
      }
    }
    const { headers, data: signedData } = headersNeedSign(this.options.appId, this.options.appSecret, "POST", url, data);
    return request(url, { method: "POST", data: signedData, headers: {...headers, ...this.options.headers} })
      .then(response => response.json())
      .then(res => {
        if (!res?.data?.resource_pack) {
          this.sdk.onMessage({
            code: res?.error_code,
            message: `Error: ${res?.error_code}, ${res?.error_reason}`,
          });
          return null;
        }
        return res?.data;
      })
  }

  async stopSession(stop_reason: string) {
    try {
      const url = `${this.options.gatewayServer}`;
      if (!this.session_id) {
        return;
      }
      const data = {
        session_id: this.session_id,
        stop_reason,
      }
      const { headers, data: signedData } = headersNeedSign(this.options.appId, this.options.appSecret, "DELETE", url, data);
      const response = await request(url, { method: "DELETE", data: signedData, headers:{...headers, ...this.options.headers} });
      return await response.json();
    } catch (error) {
      this.sdk.onMessage({
        code: EErrorCode.STOP_SESSION_ERROR,
        message: `Error: 停止会话失败`,
        e: JSON.stringify({ error }),
      });
    }
  }

  /**
   * 加载表情数据
   */
  async loadMouthShapeLib(onDownloadProgress?: TDownloadProgress) {
    try {
      if (!this.resource_pack.face_ani_char_data) {
        this.progress += 60;
        onDownloadProgress?.(this.progress);
        return;
      }
      // 只拿一个：优先 .gz，仅当 .gz 下载失败（404 等）时才回退 .bin；解压失败不回退
      let char_data: ArrayBuffer | null = null;
      let gzDownloadSucceeded = false;
      try {
        const gzUrl = `${this.resource_pack.face_ani_char_data}.gz`;
        const [, gz_data] = await XMLRequest({
          url: gzUrl,
          onProgress: (progress) => {
            onDownloadProgress?.(this.progress + progress * 0.3);
          },
        });
        gzDownloadSucceeded = true;
        // .gz 下载成功，解压（解压失败则抛错，不回退 bin）
        const decompressed = Pako.ungzip(new Uint8Array(gz_data as ArrayBuffer));
        if (decompressed instanceof Uint8Array) {
          const ab = new ArrayBuffer(decompressed.byteLength);
          new Uint8Array(ab).set(decompressed);
          char_data = ab;
        } else {
          char_data = decompressed as ArrayBuffer;
        }
      } catch (e) {
        if (gzDownloadSucceeded) {
          throw e; // 解压失败，直接抛出，不回退
        }
      }
      if (!char_data) {
        // 仅当 .gz 下载失败时才回退 .bin（避免两个都拿）
        try {
          const [, bin_data] = await XMLRequest({
            url: this.resource_pack.face_ani_char_data,
            onProgress: (progress) => {
              onDownloadProgress?.(this.progress + progress * 0.3);
            },
          });
          char_data = bin_data as ArrayBuffer;
        } catch (e) {
          if (this.first_load) {
            this.first_load = false;
            this.stopSession("char_bin_load_error");
          }
          this.sdk.onMessage({
            code: EErrorCode.FACE_BIN_LOAD_ERROR,
            message: `Error: 表情数据加载失败 (.gz和bin都失败)`,
            e: JSON.stringify({ binError: e }),
          });
          return;
        }
      }
      const char_info = new IBRAnimationGeneratorCharInfo_NN(
        char_data,
        {
          blendshapeMap: this.resource_pack?.blendshape_map || [[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235],[],[],[]],
        }
      );
      this.progress += 60;
      this.mouthShapeLib = { char_info };
    } catch (error) {
      if (this.first_load) {
        this.first_load = false;
        this.stopSession("char_bin_load_error");
      }
      this.sdk.onMessage({
        code: EErrorCode.FACE_BIN_LOAD_ERROR,
        message: `Error: 表情数据加载失败，请检查charbin文件内容是否正确`,
        e: JSON.stringify({ error }),
      });
    }
  }

  getMouthShapeLib() {
    return this.mouthShapeLib;
  }

  getVideoUrl(name: string) {
    if (!this.resource_pack.body_data_dir) {
      return "";
    }
    if (!name) {
      if (this.first_load) {
        this.first_load = false;
        this.stopSession("no_video_name_error");
      }
      this.sdk.onMessage({
        code: EErrorCode.INVALID_BODY_NAME,
        message: `Error: 视频地址获取失败`,
        e: JSON.stringify({ name }),
      });
      return "";
    }
    const url = `${this.resource_pack.body_data_dir}${name}.mp4`
    if (this.cacheServer) {
      return this.cacheServer?.getVideo(url);
    }
    return url
  }

  /**
   * 预加载视频
   * @param name 视频名称
   * @returns Promise<ArrayBuffer>
   */
  async preloadVideo(name: string) {
    if (this.videoCache.has(name)) return;
    return this.loadVideo(name);
  }
  /**
   * 加载视频
   * @param name 视频名称
   * @returns Promise<ArrayBuffer>
   */
  async loadVideo(name: string) {
    // 检查缓存
    const cacheEntry = this.videoCache.get(name) || this.offlineCache.get(name);
    if (cacheEntry) {
      if (cacheEntry.data) {
        this.updateCacheAccess(name);
        return cacheEntry.data;
      } else {
        // 缓存条目存在但数据为空，删除这个无效条目
        (window as any).avatarSDKLogger.warn(this.TAG, `发现无效缓存条目: ${name}，正在删除`);
        this.videoCache.delete(name);
      }
    }

    // 检查是否正在下载
    if (this.downloadingVideos.has(name)) {
      try {
        const result = await this.downloadingVideos.get(name);
        return result;
      } catch (error) {
        // 如果下载失败，从下载列表中移除
        this.downloadingVideos.delete(name);
        (window as any).avatarSDKLogger.warn(this.TAG, `${name} 视频下载失败，从下载列表移除`);
        throw error;
      }
    }

    // 开始下载
    this.isProcessingVideo = true;
    const downloadPromise = this.downloadVideo(name);
    this.downloadingVideos.set(name, downloadPromise);
    try {
      const result = await downloadPromise;
      return result;
    } finally {
      // 下载完成后从下载列表中移除
      this.downloadingVideos.delete(name);
      this.isProcessingVideo = false;
    }
  }

  /**
   * 实际下载视频的方法
   * @param name 视频名称
   * @returns Promise<ArrayBuffer>
   */
  private async downloadVideo(name: string): Promise<ArrayBuffer | undefined> {
    const url = this.getVideoUrl(name);
    if (!url) {
      return;
    }
    try {
      const { response, arrayBuffer } = await this._fetchVideo(url);
      if (!response.ok) {
        if (this.first_load) {
          this.first_load = false;
          this.stopSession("load_video_error");
        }
        this.sdk.onMessage({
          code: EErrorCode.VIDEO_DOWNLOAD_ERROR,
          message: `Error: ${name} 视频下载失败`,
          e: JSON.stringify({ name, url, res: response }),
        });
        return;
      }

      // 将下载的数据添加到缓存
      this.addToCache(name, arrayBuffer);

      return arrayBuffer;
    } catch (error) {
      this.sdk.onMessage({
        code: EErrorCode.VIDEO_DOWNLOAD_ERROR,
        message: `Error: ${name} 视频下载失败`,
        e: JSON.stringify({ name, url, error }),
      });
      return;
    }
  }

  private async _fetchVideo(url: string) {
    if (this.networkInfos.length >= 4) {
      const avgRtt = this.networkInfos.reduce((sum, curr) => sum + curr.rtt, 0) / this.networkInfos.length;
      const avgDownlink = this.networkInfos.reduce((sum, curr) => sum + curr.downlink, 0) / this.networkInfos.length;
      this.options.onNetworkInfo?.({
        rtt: avgRtt,
        downlink: avgDownlink,
      })
      this.networkInfos.length = 0
    }
    const startTime = performance.now();
    const response = await fetch(url)
    const totalSize = parseFloat(response.headers.get('Content-Length') || '0');
    const endTime = performance.now();
    const arrayBuffer = await response.arrayBuffer()
    const rtt = endTime - startTime; // 毫秒
    const downlink = (totalSize * 8) / (rtt / 1000 * 1000000); // Mbps

    const networkInfo = {
      rtt,
      downlink,
    };
    this.networkInfos.push(networkInfo)
    return {
      response,
      arrayBuffer,
    }
  }

  /**
   * 添加数据到缓存
   */
  private addToCache(key: string, data: ArrayBuffer) {
    const now = Date.now();

    // 检查缓存大小限制
    let totalSize = 0;
    for (const value of this.videoCache.values()) {
      totalSize += value.data.byteLength;
    }

    // 如果添加这个数据会超过限制，先清理一些缓存
    if (totalSize + data.byteLength > this.maxCacheSize || this.videoCache.size >= this.maxCacheEntries) {
      this.cleanupCache();

      // 重新计算大小
      totalSize = 0;
      for (const value of this.videoCache.values()) {
        totalSize += value.data.byteLength;
      }

      // 如果仍然超过限制，且单个文件太大，不缓存这个数据
      if (totalSize + data.byteLength > this.maxCacheSize && data.byteLength > this.maxCacheSize * 0.5) {
        (window as any).avatarSDKLogger.warn(this.TAG, `视频文件过大(${(data.byteLength / 1024 / 1024).toFixed(2)}MB)，跳过缓存: ${key}`);
        return;
      }

      // 如果缓存空间仍然不足，清理更多缓存
      if (totalSize + data.byteLength > this.maxCacheSize) {
        // 强制清理到50%容量
        const targetSize = this.maxCacheSize * 0.5;
        const sortedEntries = Array.from(this.videoCache.entries())
          .sort((a, b) => a[1].lastAccessTime - b[1].lastAccessTime);

        for (const [cacheKey, cacheValue] of sortedEntries) {
          if (totalSize <= targetSize) break;
          this.videoCache.delete(cacheKey);
          totalSize -= cacheValue.data.byteLength;
        }
      }
    }

    // 添加到缓存
    this.videoCache.set(key, {
      data: data,
      lastAccessTime: now,
      accessCount: 1
    });
  }

  /**
   * 启动缓存清理定时器
   */
  private startCacheCleanup() {
    // 每5分钟清理一次缓存
    this.cacheCleanupInterval = setInterval(() => {
      this.cleanupCache();
    }, 5 * 60 * 1000);
  }

  /**
   * 清理缓存
   */
  private cleanupCache() {
    // 如果正在处理视频，跳过清理
    if (this.isProcessingVideo) {
      return;
    }

    const now = Date.now();
    const inactiveThreshold = 10 * 60 * 1000; // 10分钟不活跃的缓存将被清理

    // 按最后访问时间排序
    const sortedEntries = Array.from(this.videoCache.entries())
      .sort((a, b) => a[1].lastAccessTime - b[1].lastAccessTime);

    let totalSize = 0;
    const entriesToRemove: string[] = [];

    // 计算当前缓存总大小
    for (const [_, value] of this.videoCache.entries()) {
      totalSize += value.data.byteLength;
    }


    // 清理不活跃的缓存（但保留最近访问的）
    for (const [key, value] of sortedEntries) {
      if (now - value.lastAccessTime > inactiveThreshold) {
        entriesToRemove.push(key);
        totalSize -= value.data.byteLength;
      }
    }

    // 如果缓存仍然过大，清理最旧的条目（但至少保留2个条目）
    if (totalSize > this.maxCacheSize || this.videoCache.size > this.maxCacheEntries) {
      for (const [key, value] of sortedEntries) {
        if (!entriesToRemove.includes(key)) {
          entriesToRemove.push(key);
          totalSize -= value.data.byteLength;

          // 确保至少保留2个缓存条目，防止完全清空
          if ((this.videoCache.size - entriesToRemove.length <= 2) ||
            (totalSize <= this.maxCacheSize * 0.8 && this.videoCache.size - entriesToRemove.length <= this.maxCacheEntries * 0.8)) {
            break;
          }
        }
      }
    }

    // 执行清理
    for (const key of entriesToRemove) {
      this.videoCache.delete(key);
    }
  }

  /**
   * 更新缓存访问信息
   */
  private updateCacheAccess(key: string) {
    const cacheEntry = this.videoCache.get(key);
    if (cacheEntry) {
      cacheEntry.lastAccessTime = Date.now();
      cacheEntry.accessCount++;
    }
  }

  /**
   * 清空所有缓存
   */
  clearAllCache() {
    this.videoCache.clear();
  }

  /** 获取离线 idle */
  _getOfflineIdle() {
    return this.offlineIdle
  }
  /** 获取上一次 session_id */
  _getSessionId() {
    return this.session_id || ''
  }

  /** 离线重连 */
  async _reload() {
    const result = await this.startSession();
    if (!result) {
      return null;
    }
    const res = result as unknown as ISessionResponse;
    this.session_id = res?.session_id;
    this.resource_pack = res.resource_pack;
    this.config = res.config as any;
    this.offlineIdle = res.resource_pack?.offline_idle || []
    this._setOfflineCache()
    if (this.resource_pack) {
      this.getBackgroundImage();
    }
    return res;
  }

  private async _setOfflineCache() {
    if (!this.offlineIdle || this.offlineIdle.length === 0) {
      return
    }
    this.offlineCache.clear()
    const names = this.offlineIdle.map($i => $i.n)
    for (const name of names) {
      try {
        await this._runOfflineCache(name)
      } catch (error) {
      }
    }
  }
  private async _runOfflineCache(name: string) {
    const url = this.getVideoUrl(name)
    if (!url) {
      return;
    }
    return this._fetchVideo(url)
      .then(({ arrayBuffer }) => {
        this.offlineCache.set(name, {
          data: arrayBuffer,
        })
      })
  }

  /**
   * 销毁资源管理器
   */
  destroy() {
    // 清理定时器
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }

    // 清理缓存
    this.clearAllCache();

    // 清理下载跟踪
    this.downloadingVideos.clear();

    // 清理背景图片
    if (this.bg) {
      this.bg = null;
    }
    this.progress = 0
  }
}
