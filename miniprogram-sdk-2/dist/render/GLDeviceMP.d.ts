/**
 * GLDeviceMP - WebGL Device Adapter for Mini Program
 * 基于微信小程序 canvas 的 WebGL 设备封装
 */
export interface GLDeviceOptions {
    canvas: any;
    alpha?: boolean;
    antialias?: boolean;
    depth?: boolean;
    stencil?: boolean;
    premultipliedAlpha?: boolean;
    preserveDrawingBuffer?: boolean;
    powerPreference?: 'default' | 'low-power' | 'high-performance';
}
export declare class GLDeviceMP {
    canvas: any;
    gl: WebGLRenderingContext | WebGL2RenderingContext | null;
    isWebGL2: boolean;
    private contextLost;
    constructor(options: GLDeviceOptions);
    /**
     * 初始化 WebGL 上下文
     */
    private initWebGL;
    /**
     * 获取 WebGL 版本
     */
    getVersion(): string;
    /**
     * 检查上下文是否有效
     */
    isValid(): boolean;
    /**
     * 获取画布宽度
     */
    getWidth(): number;
    /**
     * 获取画布高度
     */
    getHeight(): number;
    /**
     * 设置视口
     */
    viewport(x: number, y: number, width: number, height: number): void;
    /**
     * 清除颜色
     */
    clearColor(r: number, g: number, b: number, a: number): void;
    /**
     * 清除缓冲区
     */
    clear(mask: number): void;
    /**
     * 创建着色器
     */
    createShader(type: number): WebGLShader | null;
    /**
     * 编译着色器
     */
    compileShader(shader: WebGLShader, source: string): boolean;
    /**
     * 创建着色器程序
     */
    createProgram(): WebGLProgram | null;
    /**
     * 链接着色器程序
     */
    linkProgram(program: WebGLProgram): boolean;
    /**
     * 使用着色器程序
     */
    useProgram(program: WebGLProgram): void;
    /**
     * 创建缓冲区
     */
    createBuffer(): WebGLBuffer | null;
    /**
     * 绑定缓冲区
     */
    bindBuffer(target: number, buffer: WebGLBuffer | null): void;
    /**
     * 设置缓冲区数据
     */
    bufferData(target: number, data: ArrayBufferView, usage: number): void;
    /**
     * 创建纹理
     */
    createTexture(): WebGLTexture | null;
    /**
     * 绑定纹理
     */
    bindTexture(target: number, texture: WebGLTexture | null): void;
    /**
     * 设置纹理参数
     */
    texParameteri(target: number, pname: number, param: number): void;
    /**
     * 上传纹理图像
     */
    texImage2D(target: number, level: number, internalformat: number, format: number, type: number, image: any): void;
    /**
     * 创建顶点数组对象 (WebGL2)
     */
    createVertexArray(): WebGLVertexArrayObject | null;
    /**
     * 绑定顶点数组 (WebGL2)
     */
    bindVertexArray(vertexArray: WebGLVertexArrayObject | null): void;
    /**
     * 启用混合
     */
    enable(cap: number): void;
    /**
     * 禁用混合
     */
    disable(cap: number): void;
    /**
     * 设置混合函数
     */
    blendFunc(sfactor: number, dfactor: number): void;
    /**
     * 开启深度测试
     */
    enableDepthTest(): void;
    /**
     * 销毁设备
     */
    destroy(): void;
}
export default GLDeviceMP;
