/**
 * 统一日志工具（熵减优化）
 * 
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，统一日志格式
 * 2. 系统秩序：清晰的日志级别和模块标识
 * 3. 抽象层次：隐藏实现细节，提供统一接口
 * 4. 负熵实现：可配置、可控制，避免日志混乱
 */

export enum LogLevel {
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

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private prefix: string = '[XMOV AVATAR MINIPROGRAM]';
  private enableModuleTag: boolean = true;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.prefix = options.prefix ?? this.prefix;
    this.enableModuleTag = options.enableModuleTag ?? true;
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * 获取日志级别
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * 格式化日志消息
   */
  private formatMessage(module: string, level: string, ...args: any[]): any[] {
    const tag = this.enableModuleTag ? `[${module}]` : '';
    return [`${this.prefix} ${tag} ${level}`, ...args];
  }

  /**
   * DEBUG 级别日志
   */
  debug(module: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(...this.formatMessage(module, '[DEBUG]', ...args));
    }
  }

  /**
   * INFO 级别日志
   */
  info(module: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info(...this.formatMessage(module, '[INFO]', ...args));
    }
  }

  /**
   * WARN 级别日志
   */
  warn(module: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(...this.formatMessage(module, '[WARN]', ...args));
    }
  }

  /**
   * ERROR 级别日志
   */
  error(module: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(...this.formatMessage(module, '[ERROR]', ...args));
    }
  }

  /**
   * 禁用日志
   */
  disable(): void {
    this.level = LogLevel.NONE;
  }

  /**
   * 启用日志
   */
  enable(level: LogLevel = LogLevel.INFO): void {
    this.level = level;
  }
}

/**
 * 默认 logger 实例
 */
export const logger = new Logger({
  level: LogLevel.INFO,
  prefix: '[XMOV AVATAR MINIPROGRAM]',
  enableModuleTag: true
});

/**
 * 创建模块专用 logger（熵减：模块隔离）
 */
export function createModuleLogger(moduleName: string, options?: LoggerOptions): {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
} {
  const moduleLogger = new Logger(options);
  return {
    debug: (...args: any[]) => moduleLogger.debug(moduleName, ...args),
    info: (...args: any[]) => moduleLogger.info(moduleName, ...args),
    warn: (...args: any[]) => moduleLogger.warn(moduleName, ...args),
    error: (...args: any[]) => moduleLogger.error(moduleName, ...args)
  };
}
