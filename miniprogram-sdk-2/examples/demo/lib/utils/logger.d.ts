/**
 * Logger Utility for Mini Program SDK
 * 日志工具，支持多级别日志
 */
export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4
}
declare class Logger {
    private level;
    private enabled;
    private tag;
    constructor(tag?: string);
    setLevel(level: LogLevel): void;
    setEnabled(enabled: boolean): void;
    setTag(tag: string): void;
    debug(...args: any[]): void;
    log(...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
}
export declare function createModuleLogger(tag: string): Logger;
export declare function setGlobalLogLevel(level: LogLevel): void;
export declare function setGlobalLoggerEnabled(enabled: boolean): void;
export declare const logger: Logger;
export default logger;
