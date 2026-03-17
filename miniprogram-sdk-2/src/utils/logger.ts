/**
 * Logger Utility for Mini Program SDK
 * 日志工具，支持多级别日志
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private enabled: boolean = true;
  private tag: string = '[XmovAvatarMP]';

  constructor(tag?: string) {
    if (tag) {
      this.tag = tag;
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setTag(tag: string): void {
    this.tag = tag;
  }

  debug(...args: any[]): void {
    if (this.enabled && this.level <= LogLevel.DEBUG) {
      console.debug(this.tag, ...args);
    }
  }

  log(...args: any[]): void {
    if (this.enabled && this.level <= LogLevel.INFO) {
      console.log(this.tag, ...args);
    }
  }

  info(...args: any[]): void {
    if (this.enabled && this.level <= LogLevel.INFO) {
      console.info(this.tag, ...args);
    }
  }

  warn(...args: any[]): void {
    if (this.enabled && this.level <= LogLevel.WARN) {
      console.warn(this.tag, ...args);
    }
  }

  error(...args: any[]): void {
    if (this.enabled && this.level <= LogLevel.ERROR) {
      console.error(this.tag, ...args);
    }
  }
}

// 全局 logger 实例
const globalLogger = new Logger('[XmovAvatarMP]');

export function createModuleLogger(tag: string): Logger {
  return new Logger(`[XmovAvatarMP] ${tag}`);
}

export function setGlobalLogLevel(level: LogLevel): void {
  globalLogger.setLevel(level);
}

export function setGlobalLoggerEnabled(enabled: boolean): void {
  globalLogger.setEnabled(enabled);
}

export const logger = globalLogger;

export default logger;
