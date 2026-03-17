/**
 * 通用有限状态机
 *
 * 支持：
 * - 状态切换与历史追踪（previous state）
 * - 指定状态监听（onState）
 * - 任意状态变化监听（onChange）
 * - 自动去重（相同状态不触发）
 */

export class StateMachine<T extends string> {
  private _state: T
  private _previous: T
  private _listeners: Map<T, Set<(prev: T) => void>> = new Map()
  private _anyListeners: Set<(state: T, prev: T) => void> = new Set()

  constructor(initialState: T) {
    this._state = initialState
    this._previous = initialState
  }

  get state(): T {
    return this._state
  }

  get previous(): T {
    return this._previous
  }

  setState(newState: T): void {
    if (newState === this._state) return
    this._previous = this._state
    this._state = newState
    this._listeners.get(newState)?.forEach((fn) => fn(this._previous))
    this._anyListeners.forEach((fn) => fn(newState, this._previous))
  }

  /**
   * 监听指定状态的进入事件
   * @returns 取消监听函数
   */
  onState(state: T, cb: (prev: T) => void): () => void {
    if (!this._listeners.has(state)) this._listeners.set(state, new Set())
    this._listeners.get(state)!.add(cb)
    return () => this._listeners.get(state)?.delete(cb)
  }

  /**
   * 监听任意状态变化
   * @returns 取消监听函数
   */
  onChange(cb: (state: T, prev: T) => void): () => void {
    this._anyListeners.add(cb)
    return () => this._anyListeners.delete(cb)
  }

  destroy(): void {
    this._listeners.clear()
    this._anyListeners.clear()
  }
}
