/**
 * ResourceManagerMP - 资源管理器 for Mini Program
 * 负责资源加载、缓存和管理
 */
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
export declare class ResourceManagerMP {
    private TAG;
    private options;
    resource_pack: ResourcePack;
    config: any;
    session_id: string;
    private onMessageCallback?;
    constructor(options: ResourceManagerOptions);
    /**
     * 初始化
     */
    private init;
    /**
     * 获取字符信息
     */
    getCharInfo(): any;
    /**
     * 获取口型库
     */
    getMouthShapeLib(): {
        char_info: any;
        blendshape_map: number[][];
    };
    /**
     * 获取 blendshape 映射
     */
    getBlendshapeMap(): number[][];
    /**
     * 获取配置
     */
    getConfig(): any;
    /**
     * 获取帧率
     */
    getFrameRate(): number;
    /**
     * 获取分辨率
     */
    getResolution(): {
        width: number;
        height: number;
    };
    /**
     * 设置会话 ID
     */
    setSessionId(id: string): void;
    /**
     * 获取会话 ID
     */
    getSessionId(): string;
    /**
     * 获取资源 URL
     */
    getResourceUrl(): string;
    /**
     * 获取 app info
     */
    getAppInfo(): any;
    /**
     * 预加载资源
     */
    preload(resources: string[]): Promise<void>;
    /**
     * 获取缓存路径
     */
    getCachePath(key: string): string;
    /**
     * 检查资源是否存在
     */
    checkResourceExists(path: string): Promise<boolean>;
    /**
     * 清理缓存
     */
    clearCache(): Promise<void>;
    /**
     * 获取离线空闲数据
     */
    _getOfflineIdle(): any;
    /**
     * 销毁
     */
    destroy(): void;
}
export default ResourceManagerMP;
