export declare class GLDevice {
    private _ElementTypeMap_JS2GL: { readonly [index: string]: number };
    private _FormatTypeMap_Ext2Int: Map<number, Map<number, number>>;
    private _FormatTypeMap_Ext2Str: Map<number, string>;
    private shaderStage: { readonly [index: string]: number };
    private running: boolean;
    private syncMedia: HTMLVideoElement | null;
    private syncMediaTime: DOMHighResTimeStamp | null;
    private _lost_context_sim: WEBGL_lose_context | null;
    canvas: HTMLCanvasElement;
    gl: WebGL2RenderingContext;
    frameID: number | null;
    cbRender: (device: GLDevice) => void;
    constructor(canvas: HTMLCanvasElement);
    compileShaderProgram(shaders: { readonly [index: string]: string }): WebGLProgram;
    getShaderProgramUniformLocation(program: WebGLProgram, attribNames: Array<string>): { [index: string]: WebGLUniformLocation };
    getShaderProgramUniformBlockLocation(program: WebGLProgram, attribNames: Array<string>): { [index: string]: GLint };
    getShaderProgramAttribLocation(program: WebGLProgram, attribNames: Array<string>): { [index: string]: GLint };
    getGLArrayElementType(arr: ArrayBufferView<ArrayBufferLike>): number | null;
    getGLTexInternalFormat(externalFormat: number, elementType: number): number | null;
    texImage2D(target: number, level: number, width: number, height: number, format: number, srcData: ArrayBufferView<ArrayBufferLike>): void;
    texImage3D(target: number, level: number, width: number, height: number, depth: number, format: number, srcData: ArrayBufferView<ArrayBufferLike>): void;
    run(fn: (device: GLDevice) => void, syncMedia?: HTMLVideoElement): void;
    refresh(): void;
    getSyncMediaTime(): number | null;
    stop(): void;
    simulateContextFault(contextAvailable: boolean): void;
    captureFrame(): {
        width: number;
        height: number;
        data: Uint8Array;
    };
}