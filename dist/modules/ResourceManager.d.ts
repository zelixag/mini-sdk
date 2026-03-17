import { IAvatarOptions, INetworkInfo, Layout, WalkConfig } from "../types/index";
import XmovAvatar from "../index";
/**
 * 资源处理模块，加载并存储资源
 */
type TOptions = Pick<IAvatarOptions, "appId" | "appSecret" | "gatewayServer" | 'cacheServer' | "sdkInstance" | "config" | "headers"> & {
    onNetworkInfo(quality: INetworkInfo): void;
    onStartSessionWarning?: (message: Object) => void;
};
export type TDownloadProgress = (progress: number) => void;
export interface IOfflineIdle {
    asf: number;
    aef: number;
    n: string;
}
export interface IResumeParams {
    client_frame: number;
    current_ani: string;
    current_ani_frame: number;
    next_state: string;
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
        offline_idle: IOfflineIdle[];
        interpolate_joints: [number, number][];
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
        };
        init_events: [
            {
                type: string;
                data: {
                    image: string;
                    axis_id: number;
                };
            }
        ];
    };
}
export default class ResourceManager {
    private TAG;
    options: TOptions;
    sdk: XmovAvatar;
    session_id?: string;
    mouthShapeLib: any;
    offlineIdle: IOfflineIdle[];
    offlineCache: Map<string, {
        data: ArrayBuffer;
    }>;
    networkInfos: INetworkInfo[];
    private bg;
    resource_pack: {
        body_data_dir: string;
        face_ani_char_data: string;
        face_ani_preload_data: string;
        blendshape_map?: number[][];
        interpolate_joints: [number, number][];
    };
    progress: number;
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
        };
        init_events: [
            {
                type: string;
                "x_location"?: number;
                "y_location"?: number;
                width?: number;
                height: number;
                data?: {
                    image: string;
                    axis_id: number;
                };
            }
        ];
        framedata_proto_version: number;
        layout: Layout;
        walk_config: WalkConfig;
    };
    private videoCache;
    private maxCacheSize;
    private maxCacheEntries;
    private cacheCleanupInterval;
    private isProcessingVideo;
    private cacheServer?;
    private downloadingVideos;
    first_load: boolean;
    constructor(options: TOptions);
    getAppInfo(): {
        appId: string;
        appSecret: string;
    };
    /**
     * 加载背景图片
     * @returns Promise<void>
     */
    getBackgroundImage(): Promise<void>;
    /**
     * 获取背景图片
     * @returns HTMLImageElement | null
     */
    getBackgroundImageElement(): HTMLImageElement | null;
    getConfig(): {
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
        };
        init_events: [{
            type: string;
            x_location?: number | undefined;
            y_location?: number | undefined;
            width?: number | undefined;
            height: number;
            data?: {
                image: string;
                axis_id: number;
            } | undefined;
        }];
        framedata_proto_version: number;
        layout: Layout;
        walk_config: WalkConfig;
    };
    load(onDownloadProgress?: TDownloadProgress): Promise<ISessionResponse | null>;
    startSession(): Promise<any>;
    _startSession(): Promise<any> | null;
    stopSession(stop_reason: string): Promise<any>;
    /**
     * 加载表情数据
     */
    loadMouthShapeLib(onDownloadProgress?: TDownloadProgress): Promise<void>;
    getMouthShapeLib(): any;
    getVideoUrl(name: string): string;
    /**
     * 预加载视频
     * @param name 视频名称
     * @returns Promise<ArrayBuffer>
     */
    preloadVideo(name: string): Promise<ArrayBuffer | undefined>;
    /**
     * 加载视频
     * @param name 视频名称
     * @returns Promise<ArrayBuffer>
     */
    loadVideo(name: string): Promise<ArrayBuffer | undefined>;
    /**
     * 实际下载视频的方法
     * @param name 视频名称
     * @returns Promise<ArrayBuffer>
     */
    private downloadVideo;
    private _fetchVideo;
    /**
     * 添加数据到缓存
     */
    private addToCache;
    /**
     * 启动缓存清理定时器
     */
    private startCacheCleanup;
    /**
     * 清理缓存
     */
    private cleanupCache;
    /**
     * 更新缓存访问信息
     */
    private updateCacheAccess;
    /**
     * 清空所有缓存
     */
    clearAllCache(): void;
    /** 获取离线 idle */
    _getOfflineIdle(): IOfflineIdle[];
    /** 获取上一次 session_id */
    _getSessionId(): string;
    /** 离线重连 */
    _reload(): Promise<ISessionResponse | null>;
    private _setOfflineCache;
    private _runOfflineCache;
    /**
     * 销毁资源管理器
     */
    destroy(): void;
}
export {};
