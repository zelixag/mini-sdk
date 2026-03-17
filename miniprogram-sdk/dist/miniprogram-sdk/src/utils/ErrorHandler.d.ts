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
type ErrorListener = (error: SDKError) => void;
/**
 * SDK的集中错误处理器
 */
export declare class ErrorHandler {
    private listeners;
    private errorHistory;
    private maxHistorySize;
    /**
     * 注册一个错误监听器
     * @param listener 回调函数
     */
    onError(listener: ErrorListener): void;
    /**
     * 移除一个错误监听器
     * @param listener 之前注册的回调函数
     */
    offError(listener: ErrorListener): void;
    /**
     * SDK内部报告错误
     * @param code 错误码
     * @param message 错误信息
     * @param originalError 原始错误对象
     */
    report(code: EErrorCode, message: string, originalError?: any): void;
    /**
     * 处理错误并返回 SDKError 对象
     * @param error 错误对象或 SDKError
     * @param context 上下文信息
     * @returns SDKError 对象
     */
    handle(error: any, context?: {
        module?: string;
        method?: string;
        params?: any;
    }): SDKError;
    /**
     * 获取错误历史记录
     */
    getHistory(): SDKError[];
    /**
     * 触发所有监听器
     * @param error 错误对象
     */
    private dispatch;
}
export declare const errorHandler: ErrorHandler;
export type { SDKError };
