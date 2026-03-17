/**
 * 状态管理器（熵减优化）
 * 统一管理 SDK 状态，提供状态机转换和状态监听
 */
import { AvatarStatus, RenderState } from '../types/index';
import { ErrorHandler } from './ErrorHandler';
export type StateChangeCallback = (newState: any, oldState: any) => void;
/**
 * 状态管理器
 */
export declare class StateManager<T extends string | number> {
    private currentState;
    private previousState;
    private listeners;
    private globalListeners;
    private stateHistory;
    private maxHistorySize;
    private errorHandler;
    constructor(initialState: T, errorHandler?: ErrorHandler);
    /**
     * 获取当前状态
     */
    getState(): T;
    /**
     * 获取上一个状态
     */
    getPreviousState(): T | null;
    /**
     * 设置状态（带验证）
     */
    setState(newState: T, force?: boolean): boolean;
    /**
     * 添加状态监听器
     */
    onStateChange(state: T, callback: StateChangeCallback): () => void;
    /**
     * 添加全局状态监听器（监听所有状态变更）
     */
    onAnyStateChange(callback: StateChangeCallback): () => void;
    /**
     * 移除状态监听器
     */
    removeListener(state: T, callback: StateChangeCallback): void;
    /**
     * 通知监听器
     */
    private notifyListeners;
    /**
     * 安全通知（带错误处理）
     */
    private safeNotify;
    /**
     * 添加到历史记录
     */
    private addToHistory;
    /**
     * 获取状态历史
     */
    getHistory(): Array<{
        state: T;
        timestamp: number;
    }>;
    /**
     * 清除历史记录
     */
    clearHistory(): void;
    /**
     * 检查状态是否有效
     */
    isValidState(state: any): state is T;
}
/**
 * Avatar 状态管理器
 */
export declare class AvatarStateManager extends StateManager<AvatarStatus> {
    constructor(errorHandler?: ErrorHandler);
    /**
     * 状态转换验证
     */
    canTransitionTo(newState: AvatarStatus): boolean;
    /**
     * 安全状态转换
     */
    transitionTo(newState: AvatarStatus, force?: boolean): boolean;
}
/**
 * Render 状态管理器
 */
export declare class RenderStateManager extends StateManager<RenderState> {
    constructor(errorHandler?: ErrorHandler);
    /**
     * 状态转换验证
     */
    canTransitionTo(newState: RenderState): boolean;
    /**
     * 安全状态转换
     */
    transitionTo(newState: RenderState, force?: boolean): boolean;
}
