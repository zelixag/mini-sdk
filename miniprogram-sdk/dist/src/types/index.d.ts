import type XmovAvatar from "../index";
import type { IRawWidgetData } from "./frame-data";
import type { SDKError } from "./error";
import type { TDownloadProgress } from "../modules/ResourceManager";
export declare enum AvatarStatus {
    online = 0,// 在线可见状态（合并了原来的 playing）
    offline = 1,
    network_on = 2,
    network_off = 3,
    close = 4,
    visible = 5,// 可见状态
    invisible = 6,// 隐身状态（原来的 paused）
    stopped = 7
}
/**
 * 渲染状态枚举
 * 用于表示渲染器的状态，与数字人状态（AvatarStatus）分离
 */
export declare enum RenderState {
    init = "init",// 开始渲染（初始状态，准备开始）
    rendering = "rendering",// 渲染中（正在渲染）
    pausing = "pausing",// 暂停渲染中（正在暂停渲染）
    paused = "paused",// 暂停渲染（暂停但保留数据）
    resumed = "resumed",// 恢复渲染（从暂停恢复）
    stopped = "stopped"
}
/**
 * 网络情况
 * @params downlink 下载速率（Mbps）
 * @params rtt 延迟（毫秒）
 */
export interface INetworkInfo {
    downlink: number;
    rtt: number;
}
export declare enum InitModel {
    normal = "normal",
    invisible = "invisible"
}
export interface IInitParams {
    initModel?: InitModel;
    onDownloadProgress: TDownloadProgress;
    onWarning?: (message: string) => void;
}
export interface IAvatarOptions {
    sdkInstance?: XmovAvatar;
    containerId: string;
    appId: string;
    appSecret: string;
    tag?: string;
    gatewayServer: string;
    headers?: Record<string, string>;
    cacheServer?: string;
    backgroundMode?: 'cover' | 'contain' | 'fill';
    invisibleMode?: boolean;
    env?: string;
    config?: any;
    hardwareAcceleration?: string;
    enableClientInterrupt?: boolean;
    onMessage: (error: SDKError) => void;
    onStartSessionWarning?: (message: Object) => void;
    onAAFrameHandle?: (data: any) => void;
    onNetworkInfo?(networkInfo: INetworkInfo): void;
    onWidgetEvent?(data: IRawWidgetData): void;
    enableRecording?: boolean;
    enableLogger?: boolean;
    onStateChange?(state: string): void;
    onSpeakStateChange?(state: string, client_speak_id: number | string): void;
    onRenderChange?(state: RenderState): void;
    onVoiceStateChange?(state: string, duration?: number): void;
    onStatusChange?(status: AvatarStatus): void;
    onStateRenderChange?(state: string, duration: number): void;
    onWalkStateChange?(state: string): void;
    enableDebugger?: boolean;
    proxyWidget?: {
        [key: string]: (data: any) => void;
    };
}
export interface Layout {
    container: {
        size: number[];
    };
    avatar: {
        v_align: string;
        h_align: string;
        scale: number;
        offset_x: number;
        offset_y: number;
    };
}
export interface WalkConfig {
    min_x_offset: number;
    max_x_offset: number;
    walk_points: {
        [key: string]: number;
    };
    init_point?: number;
}
