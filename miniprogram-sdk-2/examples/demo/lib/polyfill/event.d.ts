/**
 * Event Polyfill for Mini Program
 * 提供基本的 Event, EventTarget, CustomEvent 支持
 */
export declare class Event {
    type: string;
    bubbles: boolean;
    cancelable: boolean;
    defaultPrevented: boolean;
    composed: boolean;
    timeStamp: number;
    constructor(type: string, options?: EventInit);
    preventDefault(): void;
    stopPropagation(): void;
    stopImmediatePropagation(): void;
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
export declare class EventTarget {
    private listeners;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions): void;
    dispatchEvent(event: Event): boolean;
}
export declare class CustomEvent<T = any> extends Event {
    detail: T;
    constructor(type: string, options?: CustomEventInit<T>);
    initCustomEvent(type: string, bubbles: boolean, cancelable: boolean, detail: T): void;
}
export declare function initEventPolyfill(): void;
