/**
 * Event Polyfill for Mini Program
 * 提供基本的 Event, EventTarget, CustomEvent 支持
 */

export class Event {
  type: string;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented: boolean;
  composed: boolean;
  timeStamp: number;

  constructor(type: string, options?: EventInit) {
    this.type = type;
    this.bubbles = options?.bubbles || false;
    this.cancelable = options?.cancelable || false;
    this.defaultPrevented = false;
    this.composed = options?.composed || false;
    this.timeStamp = Date.now();
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    // No-op for compatibility
  }

  stopImmediatePropagation(): void {
    // No-op for compatibility
  }
}

export interface EventListenerOptions {
  capture?: boolean;
  passive?: boolean;
  once?: boolean;
}

export type EventListenerOrEventListenerObject = EventListener | EventListenerObject;

export interface AddEventListenerOptions extends EventListenerOptions {
  once?: boolean;
  passive?: boolean;
}

export class EventTarget {
  private listeners: Map<string, Set<{ listener: EventListenerOrEventListenerObject; options: AddEventListenerOptions }>> = new Map();

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions
  ): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    const wrappedListener = typeof listener === 'function'
      ? listener.bind(this)
      : listener;

    this.listeners.get(type)!.add({
      listener: wrappedListener,
      options: options || {}
    });
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: EventListenerOptions
  ): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;

    listeners.forEach(item => {
      if (item.listener === listener) {
        listeners.delete(item);
      }
    });
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.listeners.get(event.type);
    if (!listeners) return true;

    // 复制一份避免在遍历时修改
    const listenersCopy = Array.from(listeners);

    for (const item of listenersCopy) {
      try {
        if (typeof item.listener === 'function') {
          item.listener.call(this, event);
        } else if (typeof item.listener.handleEvent === 'function') {
          item.listener.handleEvent(event);
        }
      } catch (error) {
        console.error('Event listener error:', error);
      }
    }

    return !event.defaultPrevented;
  }
}

export class CustomEvent<T = any> extends Event {
  detail: T;

  constructor(type: string, options?: CustomEventInit<T>) {
    super(type, options);
    this.detail = options?.detail || null as T;
  }

  initCustomEvent(
    type: string,
    bubbles: boolean,
    cancelable: boolean,
    detail: T
  ): void {
    this.type = type;
    this.bubbles = bubbles;
    this.cancelable = cancelable;
    this.detail = detail;
  }
}

// 初始化全局 EventTarget
export function initEventPolyfill(): void {
  if (typeof (globalThis as any).Event !== 'function') {
    (globalThis as any).Event = Event;
  }
  if (typeof (globalThis as any).EventTarget !== 'function') {
    (globalThis as any).EventTarget = EventTarget;
  }
  if (typeof (globalThis as any).CustomEvent !== 'function') {
    (globalThis as any).CustomEvent = CustomEvent;
  }
}
