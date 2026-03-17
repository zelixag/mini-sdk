import { IAvatarOptions } from "types/index";
/**
 * 资源处理模块，加载并存储资源
 */
type TOptions = Pick<IAvatarOptions, "appId" | "secretId" | "gatewayServer">;
export type TDownloadProgress = (progress: number) => void;
export interface ISessionResponse {
    session_id: string;
    room: string;
    socket_io_url: string;
    session_start_time: string;
    resource_pack: {
        resource_pack_url: string;
        version: string;
        video_url_pattern: string;
    };
    config: {
        background_img: string;
        frame_rate: number;
        look_name: string;
        tts_vcn_id: string;
        sta_face_id: string;
        mp_service_id: string;
    };
}
export default class ResourceManager {
    private TAG;
    options: TOptions;
    session_id?: string;
    video_url_pattern?: string;
    mouthShapeLib: any;
    private bg;
    progress: number;
    config: {
        background_img: string;
        frame_rate: number;
        look_name: string;
        tts_vcn_id: string;
        sta_face_id: string;
        mp_service_id: string;
    };
    constructor(options: TOptions);
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
    load(onDownloadProgress?: TDownloadProgress): Promise<ISessionResponse>;
    startSession(): Promise<any>;
    stopSession(): Promise<Response>;
    /**
     * 加载表情数据
     */
    loadMouthShapeLib(onDownloadProgress?: TDownloadProgress): Promise<void>;
    getMouthShapeLib(): any;
    getVideoUrl(name: string): string | undefined;
    loadVideo(name: string): Promise<ArrayBuffer>;
}
export {};
