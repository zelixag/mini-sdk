/**
 * 微信小程序 API 类型定义
 * 基于微信小程序官方文档：https://developers.weixin.qq.com/miniprogram/dev/framework/
 */

declare namespace WechatMiniprogram {
  /**
   * 网络请求相关类型
   */
  interface RequestOption {
    url: string;
    data?: string | object | ArrayBuffer;
    header?: Record<string, string>;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS';
    dataType?: 'json' | 'text' | 'arraybuffer' | 'other';
    responseType?: 'text' | 'arraybuffer';
    success?: (res: RequestSuccessCallbackResult) => void;
    fail?: (err: GeneralCallbackResult) => void;
    complete?: (res: GeneralCallbackResult) => void;
  }

  interface RequestSuccessCallbackResult {
    data: any;
    statusCode: number;
    header: Record<string, string>;
    cookies?: string[];
    errMsg: string;
  }

  interface RequestTask {
    abort(): void;
    onHeadersReceived(callback: (res: { header: Record<string, string> }) => void): void;
    offHeadersReceived(callback?: () => void): void;
  }

  /**
   * WebSocket 相关类型
   */
  interface ConnectSocketOption {
    url: string;
    protocols?: string[];
    header?: Record<string, string>;
    timeout?: number;
    success?: (res: GeneralCallbackResult) => void;
    fail?: (err: GeneralCallbackResult) => void;
    complete?: (res: GeneralCallbackResult) => void;
  }

  interface SocketTask {
    send(options: SocketSendOption): void;
    close(options?: SocketCloseOption): void;
    onOpen(callback: (res: GeneralCallbackResult) => void): void;
    onClose(callback: (res: SocketCloseCallbackResult) => void): void;
    onError(callback: (res: GeneralCallbackResult) => void): void;
    onMessage(callback: (res: SocketMessageCallbackResult) => void): void;
  }

  interface SocketSendOption {
    data: string | ArrayBuffer;
    success?: (res: GeneralCallbackResult) => void;
    fail?: (err: GeneralCallbackResult) => void;
    complete?: (res: GeneralCallbackResult) => void;
  }

  interface SocketCloseOption {
    code?: number;
    reason?: string;
    success?: (res: GeneralCallbackResult) => void;
    fail?: (err: GeneralCallbackResult) => void;
    complete?: (res: GeneralCallbackResult) => void;
  }

  interface SocketCloseCallbackResult {
    code: number;
    reason: string;
    wasClean: boolean;
  }

  interface SocketMessageCallbackResult {
    data: string | ArrayBuffer;
  }

  /**
   * Canvas 相关类型
   */
  interface Canvas {
    width: number;
    height: number;
    getContext(
      contextType: '2d' | 'webgl' | 'webgl2',
      contextAttributes?: WebGLContextAttributes
    ): RenderingContext | WebGLRenderingContext | WebGL2RenderingContext | null;
  }

  interface SelectorQuery {
    select(selector: string): NodesRef;
    selectAll(selector: string): NodesRef;
    selectViewport(): NodesRef;
    in(component: any): SelectorQuery;
    exec(callback?: (res: any[]) => void): NodesRef;
  }

  interface NodesRef {
    boundingClientRect(callback?: (res: BoundingClientRectCallbackResult) => void): SelectorQuery;
    scrollOffset(callback?: (res: ScrollOffsetCallbackResult) => void): SelectorQuery;
    fields(fields: FieldsOption, callback?: (res: any) => void): SelectorQuery;
    node(callback?: (res: NodeCallbackResult) => void): SelectorQuery;
    context(callback?: (res: ContextCallbackResult) => void): SelectorQuery;
  }

  interface BoundingClientRectCallbackResult {
    id: string;
    dataset: Record<string, any>;
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  }

  interface ScrollOffsetCallbackResult {
    id: string;
    dataset: Record<string, any>;
    scrollLeft: number;
    scrollTop: number;
  }

  interface FieldsOption {
    id?: boolean;
    dataset?: boolean;
    rect?: boolean;
    size?: boolean;
    scrollOffset?: boolean;
    properties?: string[];
    computedStyle?: string[];
    context?: boolean;
    node?: boolean;
  }

  interface NodeCallbackResult {
    node: Canvas;
  }

  interface ContextCallbackResult {
    context: any;
  }

  /**
   * 音频相关类型
   */
  interface InnerAudioContext {
    src: string;
    startTime: number;
    autoplay: boolean;
    loop: boolean;
    obeyMuteSwitch: boolean;
    volume: number;
    duration: number;
    currentTime: number;
    paused: boolean;
    buffered: number;
    play(): void;
    pause(): void;
    stop(): void;
    seek(position: number): void;
    destroy(): void;
    onCanplay(callback: () => void): void;
    onPlay(callback: () => void): void;
    onPause(callback: () => void): void;
    onStop(callback: () => void): void;
    onEnded(callback: () => void): void;
    onTimeUpdate(callback: () => void): void;
    onError(callback: (res: InnerAudioContextOnErrorCallbackResult) => void): void;
    onWaiting(callback: () => void): void;
    onSeeking(callback: () => void): void;
    onSeeked(callback: () => void): void;
    offCanplay(callback?: () => void): void;
    offPlay(callback?: () => void): void;
    offPause(callback?: () => void): void;
    offStop(callback?: () => void): void;
    offEnded(callback?: () => void): void;
    offTimeUpdate(callback?: () => void): void;
    offError(callback?: (res: InnerAudioContextOnErrorCallbackResult) => void): void;
    offWaiting(callback?: () => void): void;
    offSeeking(callback?: () => void): void;
    offSeeked(callback?: () => void): void;
  }

  interface InnerAudioContextOnErrorCallbackResult {
    errMsg: string;
    errCode: number;
  }

  /**
   * 图片相关类型
   */
  interface GetImageInfoOption {
    src: string;
    success?: (res: GetImageInfoSuccessCallbackResult) => void;
    fail?: (err: GeneralCallbackResult) => void;
    complete?: (res: GeneralCallbackResult) => void;
  }

  interface GetImageInfoSuccessCallbackResult {
    width: number;
    height: number;
    path: string;
    orientation: string;
    type: string;
  }

  /**
   * 通用回调结果
   */
  interface GeneralCallbackResult {
    errMsg: string;
  }
}

/**
 * 微信小程序全局对象 wx
 */
declare const wx: {
  request(option: WechatMiniprogram.RequestOption): WechatMiniprogram.RequestTask;
  connectSocket(option: WechatMiniprogram.ConnectSocketOption): WechatMiniprogram.SocketTask;
  createSelectorQuery(): WechatMiniprogram.SelectorQuery;
  createInnerAudioContext(): WechatMiniprogram.InnerAudioContext;
  getImageInfo(option: WechatMiniprogram.GetImageInfoOption): void;
  createVideoDecoder?(): WechatMiniprogram.VideoDecoder; // 视频解码器（基础库 2.19.0+）
  [key: string]: any; // 其他小程序 API
}

declare namespace WechatMiniprogram {
  /** 视频解码器 */
  interface VideoDecoder {
    start(options: { source: string }): Promise<void>;
    stop(): void;
    remove?(): void;
    getFrameData(): { data: ArrayBuffer; width: number; height: number } | null;
    seekToNextFrame?(): void; // 若存在则消费当前帧并推进
    seek?(position: number): void; // 回退能力：按毫秒定位
    on?(event: string, callback: (...args: any[]) => void): void;
  }
}
