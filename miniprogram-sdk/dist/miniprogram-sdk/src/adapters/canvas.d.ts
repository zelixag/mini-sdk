/**
 * Canvas 适配器 - 小程序版本（熵减优化）
 * 将小程序 Canvas 获取方式适配为 DOM Canvas 语义
 *
 * 设计原则（熵减框架）：
 * 1. 信息密度：单一职责，纯适配逻辑，无业务逻辑
 * 2. 系统秩序：清晰的节点获取、上下文创建、尺寸管理流程
 * 3. 抽象层次：隐藏 wx.createSelectorQuery 细节，提供标准 Canvas API
 * 4. 负熵实现：统一错误处理、生命周期管理、资源释放
 */
import { ErrorHandler } from '../utils/ErrorHandler';
export interface CanvasAdapterOptions {
    canvasId: string;
    componentInstance?: any;
    errorHandler?: ErrorHandler;
}
/**
 * Canvas 适配器类
 */
export declare class CanvasAdapter {
    private canvasId;
    private componentInstance?;
    private canvasNode;
    private webglContext;
    private errorHandler;
    private sizeObserver;
    private resizeCallback;
    private isDestroyed;
    constructor(options: CanvasAdapterOptions);
    /**
     * 获取 Canvas 节点
     */
    getCanvasNode(): Promise<WechatMiniprogram.Canvas>;
    /**
     * 创建 WebGL 上下文
     */
    createWebGLContext(options?: WebGLContextAttributes): Promise<WebGLRenderingContext | WebGL2RenderingContext | null>;
    /**
     * 获取 Canvas 尺寸
     */
    getCanvasSize(): Promise<{
        width: number;
        height: number;
    }>;
    /**
     * 设置 Canvas 尺寸
     */
    setCanvasSize(width: number, height: number): Promise<void>;
    /**
     * 监听 Canvas 尺寸变化
     * 小程序环境通过页面生命周期事件触发检查
     */
    watchCanvasSize(callback: (width: number, height: number) => void): void;
    /**
     * 手动触发尺寸检查（供页面生命周期调用）
     */
    checkSize(): void;
    /**
     * 停止监听尺寸变化
     */
    unwatchCanvasSize(): void;
    /**
     * 处理页面显示（恢复渲染）
     */
    onShow(): void;
    /**
     * 处理页面隐藏（暂停渲染）
     */
    onHide(): void;
    /**
     * 销毁适配器
     */
    destroy(): void;
    /**
     * 获取 Canvas 节点（同步，如果已获取）
     */
    getCanvasNodeSync(): WechatMiniprogram.Canvas | null;
    /**
     * 获取 WebGL 上下文（同步，如果已创建）
     */
    getWebGLContextSync(): WebGLRenderingContext | WebGL2RenderingContext | null;
}
/**
 * 创建 Canvas 适配器实例
 */
export declare function createCanvasAdapter(options: CanvasAdapterOptions): CanvasAdapter;
