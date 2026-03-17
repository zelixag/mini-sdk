/**
 * 状态管理器（熵减优化）
 * 统一管理 SDK 状态，提供状态机转换和状态监听
 */

// 从类型入口导入
import { AvatarStatus, RenderState } from '../types/index';
import { ErrorHandler } from './ErrorHandler';

export type StateChangeCallback = (newState: any, oldState: any) => void;

/**
 * 状态管理器
 */
export class StateManager<T extends string | number> {
  private currentState: T;
  private previousState: T | null = null;
  private listeners: Map<T, Set<StateChangeCallback>> = new Map();
  private globalListeners: Set<StateChangeCallback> = new Set();
  private stateHistory: Array<{ state: T; timestamp: number }> = [];
  private maxHistorySize: number = 50;
  private errorHandler: ErrorHandler;

  constructor(initialState: T, errorHandler?: ErrorHandler) {
    this.currentState = initialState;
    this.errorHandler = errorHandler || new ErrorHandler();
    this.addToHistory(initialState);
  }

  /**
   * 获取当前状态
   */
  getState(): T {
    return this.currentState;
  }

  /**
   * 获取上一个状态
   */
  getPreviousState(): T | null {
    return this.previousState;
  }

  /**
   * 设置状态（带验证）
   */
  setState(newState: T, force: boolean = false): boolean {
    // 如果状态相同，不触发变更
    if (newState === this.currentState && !force) {
      return false;
    }

    const oldState = this.currentState;
    this.previousState = oldState;
    this.currentState = newState;
    this.addToHistory(newState);

    // 触发监听器
    this.notifyListeners(newState, oldState);

    return true;
  }

  /**
   * 添加状态监听器
   */
  onStateChange(state: T, callback: StateChangeCallback): () => void {
    if (!this.listeners.has(state)) {
      this.listeners.set(state, new Set());
    }
    
    const callbacks = this.listeners.get(state)!;
    callbacks.add(callback);

    // 返回取消监听的函数
    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(state);
      }
    };
  }

  /**
   * 添加全局状态监听器（监听所有状态变更）
   */
  onAnyStateChange(callback: StateChangeCallback): () => void {
    this.globalListeners.add(callback);
    
    return () => {
      this.globalListeners.delete(callback);
    };
  }

  /**
   * 移除状态监听器
   */
  removeListener(state: T, callback: StateChangeCallback): void {
    const callbacks = this.listeners.get(state);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(state);
      }
    }
  }

  /**
   * 通知监听器
   */
  private notifyListeners(newState: T, oldState: T): void {
    // 通知特定状态监听器
    const stateListeners = this.listeners.get(newState);
    if (stateListeners) {
      stateListeners.forEach(callback => {
        this.safeNotify(callback, newState, oldState);
      });
    }

    // 通知全局监听器
    this.globalListeners.forEach(callback => {
      this.safeNotify(callback, newState, oldState);
    });
  }

  /**
   * 安全通知（带错误处理）
   */
  private safeNotify(callback: StateChangeCallback, newState: T, oldState: T): void {
    try {
      callback(newState, oldState);
    } catch (error) {
      this.errorHandler.handle(error, {
        module: 'StateManager',
        method: 'notifyListeners',
        params: { newState, oldState }
      });
    }
  }

  /**
   * 添加到历史记录
   */
  private addToHistory(state: T): void {
    this.stateHistory.push({
      state,
      timestamp: Date.now()
    });

    // 限制历史记录大小
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }

  /**
   * 获取状态历史
   */
  getHistory(): Array<{ state: T; timestamp: number }> {
    return [...this.stateHistory];
  }

  /**
   * 清除历史记录
   */
  clearHistory(): void {
    this.stateHistory = [];
  }

  /**
   * 检查状态是否有效
   */
  isValidState(state: any): state is T {
    return state === this.currentState || this.stateHistory.some(h => h.state === state);
  }
}

/**
 * Avatar 状态管理器
 */
export class AvatarStateManager extends StateManager<AvatarStatus> {
  constructor(errorHandler?: ErrorHandler) {
    super(AvatarStatus.close, errorHandler);
  }

  /**
   * 状态转换验证
   */
  canTransitionTo(newState: AvatarStatus): boolean {
    const currentState = this.getState();
    
    // 定义允许的状态转换
    const allowedTransitions: Map<AvatarStatus, AvatarStatus[]> = new Map([
      [AvatarStatus.close, [AvatarStatus.online, AvatarStatus.offline]],
      [AvatarStatus.online, [AvatarStatus.offline, AvatarStatus.invisible, AvatarStatus.visible]],
      [AvatarStatus.offline, [AvatarStatus.online, AvatarStatus.close]],
      [AvatarStatus.invisible, [AvatarStatus.visible, AvatarStatus.online]],
      [AvatarStatus.visible, [AvatarStatus.invisible, AvatarStatus.online]]
    ]);

    const allowed = allowedTransitions.get(currentState) || [];
    return allowed.includes(newState);
  }

  /**
   * 安全状态转换
   */
  transitionTo(newState: AvatarStatus, force: boolean = false): boolean {
    if (!force && !this.canTransitionTo(newState)) {
      console.warn(
        `[AvatarStateManager] 不允许的状态转换: ${AvatarStatus[this.getState()]} -> ${AvatarStatus[newState]}`
      );
      return false;
    }

    return this.setState(newState, force);
  }
}

/**
 * Render 状态管理器
 */
export class RenderStateManager extends StateManager<RenderState> {
  constructor(errorHandler?: ErrorHandler) {
    super(RenderState.init, errorHandler);
  }

  /**
   * 状态转换验证
   */
  canTransitionTo(newState: RenderState): boolean {
    const currentState = this.getState();
    
    // 定义允许的状态转换
    const allowedTransitions: Map<RenderState, RenderState[]> = new Map([
      [RenderState.init, [RenderState.loading]],
      [RenderState.loading, [RenderState.rendering, RenderState.stopped]],
      [RenderState.rendering, [RenderState.pausing, RenderState.stopped]],
      [RenderState.pausing, [RenderState.paused]],
      [RenderState.paused, [RenderState.resumed, RenderState.stopped]],
      [RenderState.resumed, [RenderState.rendering, RenderState.stopped]],
      [RenderState.stopped, [RenderState.init]]
    ]);

    const allowed = allowedTransitions.get(currentState) || [];
    return allowed.includes(newState);
  }

  /**
   * 安全状态转换
   */
  transitionTo(newState: RenderState, force: boolean = false): boolean {
    if (!force && !this.canTransitionTo(newState)) {
      console.warn(
        `[RenderStateManager] 不允许的状态转换: ${this.getState()} -> ${newState}`
      );
      return false;
    }

    return this.setState(newState, force);
  }
}
