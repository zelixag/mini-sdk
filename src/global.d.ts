// src/global.d.ts
// 1. 声明全局 protobuf 对象（适配 protobufjs UMD 格式）
declare namespace globalThis {
  const protobuf: {
    roots: {
      default: {
        MeshData: {
          create: (props?: any) => any;
          encode: (msg: any, writer?: any) => any;
          decode: (buf: Uint8Array | any, length?: number) => any;
          verify: (msg: any) => string | null;
          fromObject: (obj: any) => any;
          toObject: (inst: any, options?: any) => any;
          // 其他需要的方法可按需补充（参考你的 proto 编译文件）
        };
        JointData: typeof MeshData;
        FaceFrameData: typeof MeshData;
        FaceFrameDataList: typeof MeshData;
      };
    };
  };
}

// 2. 扩展 Window 接口，添加 proxyProtobuf 属性
interface Window {
  proxyProtobuf: typeof protobuf.roots.default;
}

declare const VideoDecoder: any;

// 或者，提供一个更具体的、虽然不完整的声明
// 这可以提供一定的类型提示，比 'any' 要好
declare class VideoDecoder {
  constructor(options: {
    output: (frame: any) => void;
    error: (error: Error) => void;
  });
  configure(config: any): void;
  decode(chunk: any): void;
  close(): void;
  static isConfigSupported(config: any): Promise<{ supported: boolean }>;
}