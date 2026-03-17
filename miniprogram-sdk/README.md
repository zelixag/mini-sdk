# XmovAvatar 小程序 SDK

微信小程序版本的 XmovAvatar 数字人 SDK。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 构建 SDK

```bash
npm run build
```

构建产物会输出到 `dist/` 目录：
- `xmov-avatar-mp.heavy.js` - ES Module 格式
- `xmov-avatar-mp.heavy.cjs` - CommonJS 格式（小程序推荐）
- `*.js` - 代码分割后的 chunk 文件
- `*.map` - Source Map 文件

### 3. 在小程序中使用

将构建产物复制到小程序项目的 `sdk/` 目录，然后在页面中引入：

```javascript
// pages/index/index.js
const { CanvasAdapter, createCanvasAdapter } = require('../../sdk/xmov-avatar-mp.heavy.cjs');

Page({
  async onLoad() {
    // 创建 Canvas 适配器
    const canvasAdapter = createCanvasAdapter({
      canvasId: 'avatar-canvas',
      componentInstance: this
    });

    // 获取 Canvas 节点和 WebGL 上下文
    const canvasNode = await canvasAdapter.getCanvasNode();
    const gl = await canvasAdapter.createWebGLContext();
    
    // TODO: 初始化 XmovAvatar SDK
  }
});
```

## 项目结构

```
miniprogram-sdk/
├── src/                    # 源代码
│   ├── adapters/          # 适配器（Canvas、Audio、WebSocket）
│   ├── utils/             # 工具类（Polyfill、ErrorHandler）
│   ├── types/             # 类型定义
│   └── index.ts           # 入口文件
├── dist/                  # 构建产物
├── examples/              # 使用示例
│   └── basic/             # 基础示例
├── build-heavy-rollup.js  # Rollup 构建配置
├── postbuild-patch.js     # 构建后处理脚本
└── package.json           # 项目配置
```

## 核心功能

### 适配器

- **Canvas 适配器**：小程序 Canvas 节点获取和 WebGL 上下文管理
- **Audio 适配器**：小程序音频播放适配
- **WebSocket 适配器**：小程序 WebSocket 连接适配（兼容 Socket.IO）
- **网络适配器**：小程序网络请求适配（兼容 fetch API）

### Polyfill

- **Window Polyfill**：`window` → `globalThis`
- **API Polyfill**：`fetch`、`Event`、`Image`、`URL`、`ImageBitmap`
- **Blob Polyfill**：Blob 对象支持
- **Module Polyfill**：Socket.IO 客户端适配

## 开发

### 开发模式（监听文件变化）

```bash
npm run dev
```

### 构建配置

构建配置在 `build-heavy-rollup.js` 中，主要功能：

1. **Alias 替换**：适配器路径替换
2. **字符串替换**：`window` → `globalThis`，`document` → `getDocument()`
3. **代码分割**：确保单文件 < 500KB（小程序限制）
4. **代码压缩**：Terser 压缩
5. **Source Map**：生成 Source Map 便于调试

## 示例

查看 `examples/basic/` 目录获取完整的使用示例。

## 文档

- [架构设计文档](./小程序SDK架构设计文档-熵减版.md)
- [落地方案](./小程序SDK落地方案-熵减版.md)
- [能力验证清单](./能力验证清单.md)
- [真机验证检查清单](./真机验证检查清单.md)

## 画布尺寸（非全屏 / 自定义）

Canvas 不必占满全屏，可按业务需要自定义大小：

1. **初始化时**：在获取 Canvas 节点后、传入 SDK 前，设置 `canvas.width` / `canvas.height`（像素，建议 × 设备 pixelRatio 以保清晰度）。管线会按 `gl.drawingBufferWidth/Height` 创建 FBO，与当前画布一致。
2. **运行时**：布局变化（如半屏、旋转）后，先设置 `canvas.width/height`，再调用 **`avatar.setCanvasSize(width, height)`**，SDK 会重建内部 FBO/纹理并继续渲染。
3. **示例**：`examples/basic` 提供「半屏 / 全屏」切换，演示 `setCanvasSize` 用法；也可在 `data` 中设置 `canvasWidth`、`canvasHeight`（CSS 像素）后重新初始化，以固定初始尺寸。

## 注意事项

1. **小程序限制**：
   - 单文件大小限制：500KB
   - 不支持 Worker
   - Canvas 需要异步获取节点

2. **网络配置**：
   - 需要在微信公众平台配置合法域名
   - Socket 域名需要单独配置

3. **基础库版本**：
   - 建议使用基础库 2.19.0+
   - WebGL 需要基础库 2.9.0+

## 许可证

ISC
