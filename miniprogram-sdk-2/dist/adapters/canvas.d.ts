/**
 * Canvas Adapter for Mini Program
 * 封装微信小程序 canvas 相关 API，提供 WebGL 渲染支持
 */
export interface CanvasAdapterOptions {
    type?: '2d' | 'webgl' | 'webgl2';
    canvasId: string;
    width?: number;
    height?: number;
}
export interface CanvasContext {
    canvas: any;
    getContext: (type: string) => any;
    width: number;
    height: number;
}
export interface WebGLRenderingContextExtended extends WebGLRenderingContext {
    canvas: any;
}
/**
 * 创建 Canvas 适配器
 */
export declare function createCanvasAdapter(options: CanvasAdapterOptions): CanvasContext;
/**
 * 获取 WebGL 上下文
 */
export declare function getWebGLContext(canvas: any): WebGLRenderingContextExtended | null;
/**
 * Canvas Adapter 类
 */
export declare class CanvasAdapter {
    private canvas;
    private gl;
    private width;
    private height;
    constructor(options: CanvasAdapterOptions);
    getContext(type: string): WebGLRenderingContextExtended | null;
    getGL(): WebGLRenderingContextExtended | null;
    getCanvas(): any;
    getWidth(): number;
    getHeight(): number;
    setSize(width: number, height: number): void;
    /**
     * 渲染完成回调
     */
    draw(callback?: () => void): void;
}
export default CanvasAdapter;
