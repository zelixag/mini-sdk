export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

class Logger {
  private level: LogLevel = LogLevel.INFO
  private prefix = '[XmovAvatar]'

  setLevel(level: LogLevel) {
    this.level = level
  }

  debug(module: string, ...args: any[]) {
    if (this.level <= LogLevel.DEBUG)
      console.log(`${this.prefix}[${module}]`, ...args)
  }

  info(module: string, ...args: any[]) {
    if (this.level <= LogLevel.INFO)
      console.log(`${this.prefix}[${module}]`, ...args)
  }

  warn(module: string, ...args: any[]) {
    if (this.level <= LogLevel.WARN)
      console.warn(`${this.prefix}[${module}]`, ...args)
  }

  error(module: string, ...args: any[]) {
    if (this.level <= LogLevel.ERROR)
      console.error(`${this.prefix}[${module}]`, ...args)
  }
}

export const logger = new Logger()

export function createModuleLogger(module: string) {
  return {
    debug: (...args: any[]) => logger.debug(module, ...args),
    info: (...args: any[]) => logger.info(module, ...args),
    warn: (...args: any[]) => logger.warn(module, ...args),
    error: (...args: any[]) => logger.error(module, ...args),
  }
}
