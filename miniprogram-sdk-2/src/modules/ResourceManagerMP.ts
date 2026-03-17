/**
 * ResourceManagerMP - 资源管理器 for Mini Program
 * 负责资源加载、缓存和管理
 */

import { logger } from '../utils/logger';

export interface ResourcePack {
  char_info?: any;
  blendshape_map?: number[][];
  resource_url?: string;
  config?: any;
}

export interface ResourceManagerOptions {
  resource_pack: ResourcePack;
  config?: any;
  onMessage?: (error: any) => void;
}

/**
 * 资源管理器
 * 负责:
 * - 资源包解析
 * - 资源配置
 * - 资源预加载
 */
export class ResourceManagerMP {
  private TAG = '[ResourceManagerMP]';
  private options: ResourceManagerOptions;

  // 资源包
  public resource_pack: ResourcePack = {};

  // 配置
  public config: any = {};

  // 会话 ID
  public session_id: string = '';

  // 回调
  private onMessageCallback?: (error: any) => void;

  constructor(options: ResourceManagerOptions) {
    this.options = options;
    this.onMessageCallback = options.onMessage;

    this.init(options.resource_pack, options.config);

    logger.info(this.TAG, 'Created');
  }

  /**
   * 初始化
   */
  private init(resourcePack: ResourcePack, config?: any): void {
    this.resource_pack = resourcePack || {};
    this.config = {
      framedata_proto_version: 2,
      ...(config || {})
    };

    logger.info(this.TAG, 'Initialized with config:', this.config);
  }

  /**
   * 获取字符信息
   */
  getCharInfo(): any {
    return this.resource_pack.char_info || null;
  }

  /**
   * 获取口型库
   */
  getMouthShapeLib(): {
    char_info: any;
    blendshape_map: number[][];
  } {
    return {
      char_info: this.resource_pack.char_info || null,
      blendshape_map: this.resource_pack.blendshape_map || []
    };
  }

  /**
   * 获取 blendshape 映射
   */
  getBlendshapeMap(): number[][] {
    return this.resource_pack.blendshape_map || [];
  }

  /**
   * 获取配置
   */
  getConfig(): any {
    return this.config;
  }

  /**
   * 获取帧率
   */
  getFrameRate(): number {
    return this.config.frame_rate || this.config.fps || 24;
  }

  /**
   * 获取分辨率
   */
  getResolution(): { width: number; height: number } {
    return this.config.resolution || { width: 1080, height: 1920 };
  }

  /**
   * 设置会话 ID
   */
  setSessionId(id: string): void {
    this.session_id = id;
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string {
    return this.session_id;
  }

  /**
   * 获取资源 URL
   */
  getResourceUrl(): string {
    return this.resource_pack.resource_url || '';
  }

  /**
   * 获取 app info
   */
  getAppInfo(): any {
    return {
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      session_id: this.session_id
    };
  }

  /**
   * 预加载资源
   */
  async preload(resources: string[]): Promise<void> {
    logger.info(this.TAG, 'Preloading resources:', resources.length);
    // TODO: 实现资源预加载
  }

  /**
   * 获取缓存路径
   */
  getCachePath(key: string): string {
    // 小程序缓存路径
    const fs = wx?.getFileSystemManager?.();
    if (fs) {
      return `${wx.env.USER_DATA_PATH}/${key}`;
    }
    return key;
  }

  /**
   * 检查资源是否存在
   */
  async checkResourceExists(path: string): Promise<boolean> {
    try {
      const fs = wx?.getFileSystemManager?.();
      if (fs) {
        await fs.access({ path });
        return true;
      }
    } catch (e) {
      // 文件不存在
    }
    return false;
  }

  /**
   * 清理缓存
   */
  async clearCache(): Promise<void> {
    logger.info(this.TAG, 'Clearing cache');
    // TODO: 实现缓存清理
  }

  /**
   * 获取离线空闲数据
   */
  _getOfflineIdle(): any {
    return this.config.offline_idle || null;
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.resource_pack = {};
    this.config = {};
    this.session_id = '';
    logger.info(this.TAG, 'Destroyed');
  }
}

export default ResourceManagerMP;
