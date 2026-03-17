/**
 * 错误处理器（熵减优化）
 * 提供统一的错误处理和报告机制
 * 
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，仅处理错误逻辑
 * 2. 系统秩序：统一的错误格式和错误码
 * 3. 抽象层次：隐藏错误处理细节，提供简洁接口
 * 4. 负熵实现：集中管理，避免错误处理代码分散
 */

import { EErrorCode, SDKError } from '../types/error';
import { logger } from './logger';

type ErrorListener = (error: SDKError) => void;

/**
 * SDK的集中错误处理器
 */
export class ErrorHandler {
  private listeners: Set<ErrorListener> = new Set();
  private errorHistory: SDKError[] = [];
  private maxHistorySize: number = 100;

  /**
   * 注册一个错误监听器
   * @param listener 回调函数
   */
  onError(listener: ErrorListener): void {
    this.listeners.add(listener);
  }

  /**
   * 移除一个错误监听器
   * @param listener 之前注册的回调函数
   */
  offError(listener: ErrorListener): void {
    this.listeners.delete(listener);
  }

  /**
   * SDK内部报告错误
   * @param code 错误码
   * @param message 错误信息
   * @param originalError 原始错误对象
   */
  report(code: EErrorCode, message: string, originalError?: any): void {
    const error: SDKError = {
      code,
      message,
      timestamp: Date.now(),
      details: originalError ? {
        name: originalError?.name,
        message: originalError?.message,
        stack: originalError?.stack
      } : undefined
    };

    // 记录到历史
    this.errorHistory.push(error);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    // 记录日志
    logger.error('ErrorHandler', `[${EErrorCode[code]}] ${message}`, originalError);

    // 触发监听器
    this.dispatch(error);
  }

  /**
   * 处理错误并返回 SDKError 对象
   * @param error 错误对象或 SDKError
   * @param context 上下文信息
   * @returns SDKError 对象
   */
  handle(error: any, context?: { module?: string; method?: string; params?: any }): SDKError {
    let sdkError: SDKError;

    // 如果已经是 SDKError，直接返回
    if (error && typeof error === 'object' && 'code' in error && 'message' in error && 'timestamp' in error) {
      sdkError = error as SDKError;
    } else if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      // 部分 SDKError 格式
      sdkError = {
        code: error.code as EErrorCode,
        message: error.message as string,
        timestamp: error.timestamp || Date.now(),
        details: error.details || error
      };
    } else {
      // 普通错误对象
      const errorMessage = error?.message || error?.errMsg || String(error) || 'Unknown error';
      sdkError = {
        code: EErrorCode.NETWORK_BREAK,
        message: errorMessage,
        timestamp: Date.now(),
        details: {
          originalError: error,
          context
        }
      };
    }

    // 报告错误
    this.report(sdkError.code, sdkError.message, error);

    return sdkError;
  }

  /**
   * 获取错误历史记录
   */
  getHistory(): SDKError[] {
    return [...this.errorHistory];
  }

  /**
   * 触发所有监听器
   * @param error 错误对象
   */
  private dispatch(error: SDKError): void {
    this.listeners.forEach(listener => {
      try {
        listener(error);
      } catch (err) {
        logger.error('ErrorHandler', 'Error in error listener', err);
      }
    });
  }
}

// 导出单例实例
export const errorHandler = new ErrorHandler();

// 导出 SDKError 类型
export type { SDKError };
