/**
 * ResourceManager 小程序适配器
 *
 * 职责：使用 wx.downloadFile 下载资源，替代 Web 的 fetch/XMLRequest
 * 与主项目 ResourceManager 接口对齐，供 RenderScheduler 等复用
 */

import Pako from 'pako';

export type TDownloadProgress = (progress: number) => void;

export interface IResourcePack {
  body_data_dir: string;
  face_ani_char_data: string;
  face_ani_preload_data?: string;
  blendshape_map?: number[][];
  interpolate_joints?: [number, number][];
}

export interface ResourceManagerMPOptions {
  resource_pack: IResourcePack;
  config?: Record<string, any>;
  onMessage?: (payload: { code: number; message: string; e?: string }) => void;
}

/** 获取 wx 对象 */
function getWx(): any {
  const g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? (window as any) : null));
  return g?.wx;
}

/** 简单字符串 hash，用于 char_bin 缓存 key */
function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h = h & h;
  }
  return 'char_bin_' + Math.abs(h).toString(36);
}

const CHAR_BIN_CACHE_DIR = 'xmov_char_bin_cache';

/**
 * 下载到临时文件路径（供 VideoDecoder 使用，无需 readFile）
 */
export function wxDownloadToTempFile(url: string, onProgress?: (p: number) => void): Promise<string> {
  const wx = getWx();
  if (!wx?.downloadFile) return Promise.reject(new Error('wx.downloadFile not available'));
  return new Promise((resolve, reject) => {
    const task = wx.downloadFile({
      url,
      success: (res: any) => {
        if (res.statusCode !== 200) {
          reject(new Error(`download failed: ${res.statusCode}`));
          return;
        }
        resolve(res.tempFilePath);
      },
      fail: reject
    });
    if (task?.onProgressUpdate && typeof onProgress === 'function') {
      task.onProgressUpdate((e: any) => {
        const total = e.totalBytesWritten ?? 0;
        const totalExpected = e.totalBytesExpectedToWrite ?? 1;
        onProgress(totalExpected > 0 ? total / totalExpected : 0);
      });
    }
  });
}

/**
 * 使用 wx.downloadFile 下载文件为 ArrayBuffer
 */
export function wxDownloadToArrayBuffer(url: string, onProgress?: (p: number) => void): Promise<ArrayBuffer> {
  const wx = getWx();
  if (!wx?.downloadFile) {
    return Promise.reject(new Error('wx.downloadFile not available'));
  }
  return new Promise((resolve, reject) => {
    const task = wx.downloadFile({
      url,
      success: (res: any) => {
        if (res.statusCode !== 200) {
          reject(new Error(`download failed: ${res.statusCode}`));
          return;
        }
        const fs = wx.getFileSystemManager?.();
        if (!fs) {
          reject(new Error('wx.getFileSystemManager not available'));
          return;
        }
        fs.readFile({
          filePath: res.tempFilePath,
          success: (readRes: any) => {
            const buf = readRes.data;
            if (buf instanceof ArrayBuffer) {
              resolve(buf);
            } else if (buf && typeof buf.byteLength === 'number') {
              resolve(buf as ArrayBuffer);
            } else {
              reject(new Error('readFile returned invalid data'));
            }
          },
          fail: (err: any) => reject(err)
        });
      },
      fail: reject
    });
    if (task?.onProgressUpdate && typeof onProgress === 'function') {
      task.onProgressUpdate((e: any) => {
        const total = e.totalBytesWritten ?? 0;
        const totalExpected = e.totalBytesExpectedToWrite ?? 1;
        onProgress(totalExpected > 0 ? total / totalExpected : 0);
      });
    }
  });
}

/**
 * 小程序 ResourceManager 适配器（精简版）
 */
export class ResourceManagerMP {
  resource_pack: IResourcePack;
  config: Record<string, any>;
  mouthShapeLib: { char_info: any } = { char_info: null };
  private onMessage?: (p: { code: number; message: string; e?: string }) => void;

  constructor(options: ResourceManagerMPOptions) {
    this.resource_pack = options.resource_pack || { body_data_dir: '', face_ani_char_data: '', face_ani_preload_data: '' };
    this.config = options.config || {};
    this.onMessage = options.onMessage;
  }

  /**
   * 加载表情数据（face_ani_char_data）
   * 直接下载 .bin 文件（不使用缓存，不尝试 .gz）
   */
  async loadMouthShapeLib(onDownloadProgress?: TDownloadProgress): Promise<void> {
    const url = this.resource_pack.face_ani_char_data;
    if (!url) {
      return;
    }
    
    try {
      // 直接下载 .bin 文件，使用 wx.downloadFile + readFile (async) 避免主线程阻塞
      const buf = await wxDownloadToArrayBuffer(url, (p) => onDownloadProgress?.(10 + p * 90));
      this.mouthShapeLib = { char_info: buf };
      onDownloadProgress?.(100);
    } catch (e) {
      this.onMessage?.({
        code: 3002,
        message: 'face_ani_char_data 加载失败',
        e: String(e)
      });
    }
  }

  getMouthShapeLib() {
    return this.mouthShapeLib;
  }

  /**
   * 获取身体视频 URL
   */
  getVideoUrl(name: string): string {
    if (!this.resource_pack.body_data_dir || !name) return '';
    const dir = this.resource_pack.body_data_dir;
    return dir.endsWith('/') ? `${dir}${name}.mp4` : `${dir}/${name}.mp4`;
  }

  /** 已下载视频缓存：name -> tempFilePath（供 VideoDecoder.start({ source })） */
  private videoCache = new Map<string, string>();
  /** 正在下载中的 Promise，避免重复请求 */
  private downloadingVideos = new Map<string, Promise<string | undefined>>();
  /** 预加载并发控制：最多同时下载数 */
  private readonly MAX_PRELOAD_CONCURRENT = 3;
  private preloadQueue: string[] = [];
  private preloadRunning = 0;

  /**
   * 下载身体视频到本地临时文件
   */
  async loadVideo(name: string): Promise<string | undefined> {
    if (!name) return undefined;
    const cached = this.videoCache.get(name);
    if (cached) return cached;
    const pending = this.downloadingVideos.get(name);
    if (pending) return pending;
    const url = this.getVideoUrl(name);
    if (!url) {
      this.onMessage?.({ code: 40003, message: `视频 URL 为空: ${name}` });
      return undefined;
    }
    const promise = wxDownloadToTempFile(url)
      .then((path) => {
        this.videoCache.set(name, path);
        return path;
      })
      .catch((e) => {
        this.onMessage?.({
          code: 40003,
          message: `${name} 视频下载失败`,
          e: String(e)
        });
        return undefined;
      })
      .finally(() => {
        this.downloadingVideos.delete(name);
      });
    this.downloadingVideos.set(name, promise);
    return promise;
  }

  /**
   * 预加载视频（已缓存则跳过，并发控制）
   */
  async preloadVideo(name: string): Promise<void> {
    if (this.videoCache.has(name)) return;
    await this.loadVideo(name);
  }

  /**
   * 从 body_data 提取视频名并预加载（带并发队列）
   * 设计原则：不等 char_bin 完成，body_data 到达即触发，与 loadMouthShapeLib 并行
   */
  preloadVideosFromBodyData(bodyData: Array<{ n?: string }>): void {
    if (!this.resource_pack.body_data_dir || !bodyData?.length) return;
    const names = [...new Set(bodyData.map((item) => item.n).filter(Boolean))] as string[];
    for (const name of names) {
      if (this.videoCache.has(name) || this.downloadingVideos.has(name) || this.preloadQueue.includes(name)) continue;
      this.preloadQueue.push(name);
    }
    this.drainPreloadQueue();
  }

  private async drainPreloadQueue(): Promise<void> {
    while (this.preloadRunning < this.MAX_PRELOAD_CONCURRENT && this.preloadQueue.length > 0) {
      const name = this.preloadQueue.shift()!;
      if (this.videoCache.has(name)) continue;
      this.preloadRunning++;
      this.loadVideo(name)
        .finally(() => {
          this.preloadRunning--;
          this.drainPreloadQueue();
        })
        .catch(() => {});
    }
  }

  /** 获取已缓存的视频路径（供 VideoDecoder.start({ source })） */
  getCachedVideoPath(name: string): string | undefined {
    return this.videoCache.get(name);
  }

  /** @deprecated 使用 getCachedVideoPath */
  getCachedVideo(name: string): string | undefined {
    return this.videoCache.get(name);
  }

  getConfig() {
    return this.config;
  }
}
