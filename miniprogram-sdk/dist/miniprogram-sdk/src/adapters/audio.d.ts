/**
 * 音频适配器 - 小程序版本（熵减优化）
 * 将 wx.createInnerAudioContext 适配为 Web Audio API 语义
 *
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，纯适配逻辑，无业务逻辑
 * 2. 系统秩序：清晰的播放控制、音量管理、事件系统
 * 3. 抽象层次：隐藏 wx.createInnerAudioContext 细节，提供标准 Web Audio API
 * 4. 负熵实现：统一错误处理、平滑音量变化、完整事件系统
 */
import { ErrorHandler } from '../utils/ErrorHandler';
export interface AudioAdapterOptions {
    src?: string;
    autoplay?: boolean;
    loop?: boolean;
    volume?: number;
    errorHandler?: ErrorHandler;
}
/**
 * 音频适配器类
 */
export declare class AudioAdapter {
    private audioContext;
    private errorHandler;
    private listeners;
    private _volume;
    private targetVolume;
    private volumeAnimationFrame;
    private isDestroyed;
    constructor(options?: AudioAdapterOptions);
    /**
     * 绑定小程序音频事件
     */
    private _bindEvents;
    /**
     * 播放
     */
    play(): void;
    /**
     * 暂停
     */
    pause(): void;
    /**
     * 停止
     */
    stop(): void;
    /**
     * 设置音频源
     */
    set src(value: string);
    /**
     * 获取音频源
     */
    get src(): string;
    /**
     * 设置音量（0-1），支持平滑变化
     */
    set volume(value: number);
    /**
     * 获取音量
     */
    get volume(): number;
    /**
     * 平滑音量变化动画
     */
    private _animateVolume;
    /**
     * 设置是否循环
     */
    set loop(value: boolean);
    /**
     * 获取是否循环
     */
    get loop(): boolean;
    /**
     * 设置是否自动播放
     */
    set autoplay(value: boolean);
    /**
     * 获取是否自动播放
     */
    get autoplay(): boolean;
    /**
     * 获取当前播放时间（秒）
     */
    get currentTime(): number;
    /**
     * 设置当前播放时间（秒）
     */
    set currentTime(value: number);
    /**
     * 获取音频时长（秒）
     */
    get duration(): number;
    /**
     * 监听事件
     */
    on(event: string, callback: Function): void;
    /**
     * 移除监听
     */
    off(event: string, callback?: Function): void;
    /**
     * 触发事件（内部方法）
     */
    private _emit;
    /**
     * 销毁适配器
     */
    destroy(): void;
}
/**
 * 创建音频适配器实例
 */
export declare function createAudioAdapter(options?: AudioAdapterOptions): AudioAdapter;
