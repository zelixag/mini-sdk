/**
 * 统一日志工具（熵减优化）
 *
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，统一日志格式
 * 2. 系统秩序：清晰的日志级别和模块标识
 * 3. 抽象层次：隐藏实现细节，提供统一接口
 * 4. 负熵实现：可配置、可控制，避免日志混乱
 */
export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4
}
export interface LoggerOptions {
    level?: LogLevel;
    prefix?: string;
    enableModuleTag?: boolean;
}
declare class Logger {
    private level;
    private prefix;
    private enableModuleTag;
    constructor(options?: LoggerOptions);
    /**
     * 设置日志级别
     */
    setLevel(level: LogLevel): void;
    /**
     * 获取日志级别
     */
    getLevel(): LogLevel;
    /**
     * 格式化日志消息
     */
    private formatMessage;
    /**
     * DEBUG 级别日志
     */
    debug(module: string, ...args: any[]): void;
    /**
     * INFO 级别日志
     */
    info(module: string, ...args: any[]): void;
    /**
     * WARN 级别日志
     */
    warn(module: string, ...args: any[]): void;
    /**
     * ERROR 级别日志
     */
    error(module: string, ...args: any[]): void;
    /**
     * 禁用日志
     */
    disable(): void;
    /**
     * 启用日志
     */
    enable(level?: LogLevel): void;
}
/**
 * 默认 logger 实例
 */
export declare const logger: Logger;
/**
 * 创建模块专用 logger（熵减：模块隔离）
 */
export declare function createModuleLogger(moduleName: string, options?: LoggerOptions): {
    debug: (...args: any[]) => void;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
};
export {};
