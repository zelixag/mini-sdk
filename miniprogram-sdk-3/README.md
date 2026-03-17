# XmovAvatar MiniProgram SDK v2

基于 Web SDK 重新设计实现的微信小程序数字人渲染 SDK。

## 架构概览

```
┌───────────────────────────────────────────────────┐
│                  index.ts (XmovAvatarMP)           │
│          生命周期: init → start → destroy           │
├───────────────────────────────────────────────────┤
│                     控制层 control/                 │
│  ┌──────────────┐ ┌────────┐ ┌──────────────────┐ │
│  │RenderScheduler│ │  Ttsa  │ │  StateMachine    │ │
│  │ 24fps帧循环   │ │WebSocket│ │  状态管理        │ │
│  └──────┬───────┘ └────┬───┘ └──────────────────┘ │
├─────────┼──────────────┼─────────────────────────┤
│         │        渲染层 render/                     │
│  ┌──────▼──────┐ ┌─────▼──────┐ ┌──────────────┐ │
│  │ Composition │ │AvatarRender│ │ AudioRenderer │ │
│  │  合成编排   │ │ 3D渲染     │ │ 音频播放      │ │
│  └─────────────┘ └──────┬─────┘ └──────────────┘ │
│                         │                         │
│  ┌──────────────┐ ┌─────▼──────┐                  │
│  │  GLPipeline  │ │  GLDevice  │                  │
│  │ WebGL管线    │ │ GL上下文   │                  │
│  └──────────────┘ └────────────┘                  │
├───────────────────────────────────────────────────┤
│                     数据层 data/                    │
│  ┌───────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │CacheQueue │ │DataInterf│ │ ResourceManager  │ │
│  │ 帧缓存队列│ │ 3D数据结构│ │ 资源加载/会话    │ │
│  └───────────┘ └──────────┘ └──────────────────┘ │
├───────────────────────────────────────────────────┤
│  解码层 decoder/          │  协议层 protocol/       │
│  BodyDecoder FaceDecoder  │  MsgPack Token MD5     │
│  Float16Decoder VideoDecoder│  Socket.IO协议        │
├───────────────────────────────────────────────────┤
│                  平台适配层 platform/                │
│  Canvas  Audio  Network  WebSocket  FileSystem     │
│  (wx.createSelectorQuery / wx.request / wx.connect)│
└───────────────────────────────────────────────────┘
```

## 目录结构

```
src/
├── index.ts                  # SDK入口 XmovAvatarMP
├── types/                    # 类型定义
│   ├── config.ts             # SDK配置、状态枚举
│   ├── event.ts              # UI控件类型
│   ├── frame-data.ts         # 帧数据类型
│   └── index.ts
├── platform/                 # 平台适配（隔离wx API）
│   ├── env.ts                # 环境检测、RAF polyfill
│   ├── canvas.ts             # Canvas节点获取、WebGL上下文
│   ├── audio.ts              # 音频播放队列
│   ├── network.ts            # HTTP请求(wx.request)
│   └── websocket.ts          # Socket.IO协议实现(wx.connectSocket)
├── protocol/                 # 通信协议
│   ├── token.ts              # 请求签名(内嵌MD5)
│   └── msgpack-lite.ts       # 轻量msgpack编解码
├── decoder/                  # 数据解码
│   ├── body-decoder.ts       # body_data msgpack解码
│   ├── face-decoder.ts       # face_data 双路径(msgpack/protobuf)
│   ├── float16-decoder.ts    # int16→float32反量化
│   ├── video-decoder.ts      # wx.createVideoDecoder适配
│   └── index.ts
├── data/                     # 数据管理
│   ├── math.ts               # 向量/矩阵/四元数数学库
│   ├── data-interface.ts     # 3D数据结构(Tensor/RigidTransform/IBR)
│   ├── cache-queue.ts        # 五队列帧缓存
│   └── resource-manager.ts   # 会话管理、资源加载
├── render/                   # 渲染管线
│   ├── gl-device.ts          # WebGL2设备抽象
│   ├── gl-pipeline.ts        # 完整WebGL渲染管线(着色器+mesh+背景)
│   ├── avatar-renderer.ts    # 身体+表情融合渲染器
│   ├── audio-renderer.ts     # 音频播放渲染器
│   └── composition.ts        # 渲染合成编排
├── control/                  # 控制调度
│   ├── state-machine.ts      # 通用状态机
│   ├── ttsa.ts               # TTSA WebSocket连接管理
│   └── render-scheduler.ts   # 帧循环调度+数据路由
└── utils/                    # 工具
    ├── logger.ts             # 分级日志
    ├── error.ts              # 错误码+错误创建
    ├── event-emitter.ts      # 类型安全事件发射器
    └── performance.ts        # 性能打点
```

## 与 Web SDK 的关键差异

| 维度 | Web SDK | MiniProgram SDK v2 |
|------|---------|-------------------|
| Canvas | HTMLCanvasElement | wx.createSelectorQuery |
| WebGL | 直接创建 | canvas.getContext + 兼容检测 |
| 纹理上传 | HTMLImageElement/VideoElement | Uint8Array RGBA像素 |
| WebSocket | socket.io-client | 自实现Engine.IO+Socket.IO协议 |
| 音频 | Web Audio API / MSE | wx.createInnerAudioContext |
| Worker | Web Worker解码MP4 | wx.createVideoDecoder |
| HTTP | fetch/XMLHttpRequest | wx.request |
| MD5 | blueimp-md5 | 内嵌RFC1321实现 |
| msgpack | @msgpack/msgpack | 内嵌轻量实现 |
| MSAA | 直接使用 | 自动降级fallback |
| 3D纹理 | TEXTURE_2D_ARRAY | 检测可用性+fallback |

## 使用方式

```javascript
// 在小程序组件中
const { createAvatar } = require('./lib/xmov-avatar-mp')

Component({
  lifetimes: {
    attached() {
      this.avatar = createAvatar()
    },
    detached() {
      this.avatar?.destroy()
    }
  },
  methods: {
    async initAvatar() {
      await this.avatar.init({
        appId: 'your-app-id',
        appSecret: 'your-app-secret',
        gatewayServer: 'https://api.example.com',
        containerId: '#avatar-canvas',
        debug: true,
      }, this)  // 传入组件上下文

      this.avatar.start()
    },
    speak(text) {
      this.avatar.speak(text)
    },
    interrupt() {
      this.avatar.interrupt()
    }
  }
})
```

## 构建

```bash
npm install
npm run build    # 输出到 dist/xmov-avatar-mp.js
npm run dev      # 开发模式(watch)
```
