/**
 * Window Polyfill for Mini Program
 * 将 window 映射到 globalThis
 */
declare const windowShim: {
    window: {};
    self: {};
    global: {};
    globalThis: {};
    document: any;
    location: {
        href: string;
        protocol: string;
        host: string;
        pathname: string;
    };
    navigator: {
        userAgent: string;
        onLine: boolean;
    };
    setTimeout: any;
    clearTimeout: any;
    setInterval: any;
    clearInterval: any;
    requestAnimationFrame: any;
    cancelAnimationFrame: any;
    console: Console | {
        log: () => void;
        warn: () => void;
        error: () => void;
        info: () => void;
    };
};
export declare function initWindowPolyfill(canvas?: any): void;
export default windowShim;
