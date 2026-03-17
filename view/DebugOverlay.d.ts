import { ErrorHandler } from '../control/ErrorHandler';
import { ISessionResponse } from '../modules/ResourceManager';
/**
 * 调试信息浮层
 */
export declare class DebugOverlay {
    private container;
    private errorHandler;
    private sessionInfo;
    private startTime;
    private updateInterval;
    constructor(errorHandler: ErrorHandler, sessionInfo: ISessionResponse);
    /**
     * 显示浮层
     */
    show(): void;
    /**
     * 隐藏浮层
     */
    hide(): void;
    /**
     * 销毁浮层和定时器
     */
    destroy(): void;
    /**
     * 更新浮层内容
     */
    private update;
    private formatErrors;
    /**
     * 创建DOM元素
     */
    private createOverlay;
    /**
     * 应用CSS样式
     * @param element
     */
    private applyStyles;
}
