# 数字人小程序示例 - 基础使用

这是一个基础示例，展示如何在小程序中使用 XmovAvatar SDK。

## 文件结构

```
examples/basic/
├── app.json          # 小程序配置
├── lib/              # SDK 库文件目录
│   └── xmov-avatar-mp.heavy.js  # UMD 格式的 SDK 包
├── pages/
│   └── index/
│       ├── index.js      # 页面逻辑
│       ├── index.wxml    # 页面结构
│       ├── index.wxss    # 页面样式
│       └── index.json    # 页面配置
└── README.md         # 说明文档
```

## 使用步骤

### 1. 构建 SDK

在 `miniprogram-sdk` 目录下执行：

```bash
npm install
npm run build
```

构建产物会输出到 `dist/` 目录。

### 2. 复制 SDK 到小程序示例

SDK 已经自动复制到 `lib/` 目录。如果需要更新，可以手动复制：

```bash
# 在 miniprogram-sdk 目录下
cp dist/xmov-avatar-mp.heavy.js examples/basic/lib/
```

### 3. 引入 SDK

在 `pages/index/index.js` 中引入 SDK：

```javascript
// 从 lib 目录引入 UMD 格式的 SDK
const XmovAvatarMP = require('../../lib/xmov-avatar-mp.heavy.js');
const { CanvasAdapter, createCanvasAdapter } = XmovAvatarMP;
```

### 4. 配置小程序

确保 `app.json` 中配置了必要的权限和背景模式：

```json
{
  "requiredBackgroundModes": ["audio"],
  "networkTimeout": {
    "request": 90000,
    "connectSocket": 90000,
    "downloadFile": 90000
  }
}
```

### 5. 运行示例

在微信开发者工具中打开小程序项目，运行示例。

## 注意事项

1. **Canvas 节点获取**：小程序需要使用 `wx.createSelectorQuery()` 异步获取 Canvas 节点
2. **WebGL 上下文**：小程序 Canvas 通过 `getContext('webgl')` 获取 WebGL 上下文
3. **生命周期管理**：需要在 `onShow`/`onHide` 中处理 Canvas 适配器的生命周期
4. **网络域名**：需要在微信公众平台配置合法域名（socket、request）

## 下一步

- 初始化 XmovAvatar SDK（待 SDK 核心代码完成）
- 连接 WebSocket 服务器
- 处理音频播放
- 处理用户交互

## 相关文档

- [小程序 SDK 架构设计文档](../小程序SDK架构设计文档-熵减版.md)
- [小程序 SDK 落地方案](../小程序SDK落地方案-熵减版.md)
