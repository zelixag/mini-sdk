/**
 * UIRenderer - UI 渲染器 for Mini Program
 * 负责字幕、事件等 UI 元素的渲染
 */
export interface UIRendererOptions {
    container?: any;
    onWalkStateChange?: (state: string) => void;
    onVoiceStart?: (duration: number, speech_id: number) => void;
    onVoiceEnd?: (speech_id: number) => void;
    onSpeakStateChange?: (state: string, client_speak_id: string) => void;
    clearSubtitleOn?: (speech_id: number) => void;
}
export interface UIEvent {
    id: number;
    s: string;
    sf: number;
    ef: number;
    e: {
        type: string;
        content?: string;
        url?: string;
        [key: string]: any;
    }[];
}
/**
 * UIRenderer - UI 渲染器
 * 负责:
 * - 字幕渲染
 * - 事件处理
 * - 行走状态管理
 */
export declare class UIRenderer {
    private TAG;
    private options;
    private container;
    private eventQueue;
    private currentEvent;
    private subtitleElement;
    private currentFrame;
    private isInterrupt;
    private onWalkStateChangeCallback?;
    private onVoiceStartCallback?;
    private onVoiceEndCallback?;
    private onSpeakStateChangeCallback?;
    private clearSubtitleOnCallback?;
    constructor(options?: UIRendererOptions);
    /**
     * 初始化容器
     */
    private initContainer;
    /**
     * 创建字幕元素
     */
    private createSubtitleElement;
    /**
     * 更新 UI 事件
     */
    updateUiEvent(events: UIEvent[]): void;
    /**
     * 处理事件
     */
    private processEvents;
    /**
     * 处理事件开始
     */
    private handleEventStart;
    /**
     * 处理事件更新
     */
    private handleEventUpdate;
    /**
     * 处理事件结束
     */
    private handleEventEnd;
    /**
     * 显示字幕
     */
    showSubtitle(content: string): void;
    /**
     * 更新字幕
     */
    updateSubtitle(content: string): void;
    /**
     * 隐藏字幕
     */
    hideSubtitle(): void;
    /**
     * 清理字幕
     */
    clearSubtitle(speech_id: number): void;
    /**
     * 设置当前帧
     */
    setCurrentFrame(frame: number): void;
    /**
     * 设置中断
     */
    setInterrupt(speech_id: number): void;
    /**
     * 获取事件队列
     */
    getEventQueue(): UIEvent[];
    /**
     * 清理事件
     */
    clearEvents(): void;
    /**
     * 销毁
     */
    destroy(): void;
}
export default UIRenderer;
