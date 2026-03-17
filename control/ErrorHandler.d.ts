import { EErrorCode, SDKError } from '../types/error';
type ErrorListener = (error: SDKError) => void;
/**
 * SDK的集中错误处理器
 */
export declare class ErrorHandler {
    private listeners;
    private errorHistory;
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
     * 获取错误历史记录
     */
    getHistory(): SDKError[];
    /**
     * 触发所有监听器
     * @param error 错误对象
     */
    private dispatch;
}
export {};
