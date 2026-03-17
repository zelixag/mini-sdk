# MiniProgram SDK 2.0 实现计划

## Context

用户希望基于 Web SDK (`src/`) 重新实现一个微信小程序 SDK，放在 `miniprogram-sdk-2` 目录中。现有 `miniprogram-sdk` 存在一些问题需要重构。

### 设计决策（已确认）

- **代码复用**: 复用主项目 Web SDK 代码（通过 npm 引用 + 平台适配层）
- **API 兼容**: 对外 API 与 Web SDK 保持完全兼容

### 关键参考

**Web SDK 架构 (`src/`)**:
- `index.ts` - 主入口类 `XmovAvatar`
- `control/RenderScheduler.ts` - 渲染调度器
- `control/DataCacheQueue.ts` - 数据缓存队列
- `baseRender/AvatarRenderer.ts` - 数字人渲染器
- `modules/ResourceManager.ts` - 资源管理器
- `utils/GLDevice.ts` / `GLPipeline.ts` - WebGL 设备与渲染管线
- `types/` - 类型定义

**现有小程序 SDK (`miniprogram-sdk/`)**:
- 有 polyfill 和基础适配器
- `XmovAvatarMP` 类
- 包含 Canvas/Audio/WebSocket 适配器
- `GLPipelineMP.ts` / `GLDeviceMP.ts` - 小程序 WebGL 实现

---

## 实现方案

### 目录结构

```
miniprogram-sdk-2/
├── src/
│   ├── index.ts                    # 主入口 - XmovAvatarMP 类 (继承 XmovAvatar)
│   ├── adapters/                  # 小程序平台适配器
│   │   ├── canvas.ts              # Canvas 适配 (WebGL渲染)
│   │   ├── audio.ts               # AudioContext 适配
│   │   ├── websocket.ts           # WebSocket 适配 (Socket.IO)
│   │   └── request.ts             # 网络请求适配
│   ├── polyfill/                  # Polyfill 模块
│   │   ├── window.ts              # window → globalThis
│   │   ├── fetch.ts               # fetch polyfill
│   │   └── event.ts               # Event polyfill
│   ├── core/                      # 核心模块 (复用 Web SDK + 小程序适配)
│   │   └── RenderSchedulerMP.ts  # 渲染调度器 (继承 + 适配)
│   ├── render/                    # 渲染层 (复用 Web SDK + 小程序适配)
│   │   ├── AvatarRendererMP.ts   # 数字人渲染器
│   │   ├── GLDeviceMP.ts         # WebGL 设备
│   │   └── GLPipelineMP.ts       # WebGL 渲染管线
│   └── utils/
│       └── logger.ts              # 日志模块
├── package.json                    # 依赖主项目 xmov-avatar
├── tsconfig.json
└── rollup.config.js               # 构建配置
```

**说明**: 核心业务逻辑（ResourceManager, DataCacheQueue, Ttsa 等）通过 npm 引用主项目，只在小程序 SDK 中做平台适配

### 核心设计原则

1. **代码复用**: 通过 npm 引用主项目 Web SDK，复用核心业务逻辑
2. **平台适配层**: 将浏览器 API 替换为微信小程序 API（适配器模式）
3. **API 兼容**: 对外 API 与 Web SDK 保持完全一致 (`XmovAvatarMP`)
4. **模块化设计**: 清晰的模块划分，便于维护和测试

### 实现步骤

#### Phase 1: 基础架构搭建

1. **创建项目配置文件**
   - `package.json` - 依赖主项目 `xmov-avatar` + 微信小程序相关依赖
   - `tsconfig.json` - TypeScript 配置
   - `rollup.config.js` - 构建配置

2. **Polyfill 模块**
   - 实现 `window` → `globalThis` 映射
   - 实现 `fetch`, `Event`, `URL` 等 polyfill

#### Phase 2: 适配器层

1. **Canvas 适配器**
   - 封装微信小程序 `canvas` 组件
   - 实现 WebGL 上下文适配

2. **Audio 适配器**
   - 封装微信小程序音频 API
   - 支持 PCM 音频播放

3. **WebSocket 适配器**
   - 封装 `wx.connectSocket`
   - 支持 Socket.IO 协议

4. **Request 适配器**
   - 封装 `wx.request`
   - 支持认证和签名

#### Phase 3: 渲染层（核心工作量）

1. **GLDeviceMP**
   - 基于主项目 `GLDevice` 适配小程序
   - 处理 WebGL 上下文创建

2. **GLPipelineMP**
   - 基于主项目 `GLPipeline` 适配小程序
   - 实现 IBR 渲染管线

3. **AvatarRendererMP**
   - 整合身体和脸部渲染
   - 处理数据融合和渲染

#### Phase 4: 核心调度（复用 + 适配）

1. **RenderSchedulerMP**
   - 继承主项目 `RenderScheduler`
   - 适配小程序渲染循环

#### Phase 5: 主入口

1. **XmovAvatarMP 类**
   - 继承主项目 `XmovAvatar`
   - 实现完整生命周期: `init` → `start` → `pause`/`stop` → `destroy`
   - 对外提供统一 API（与 Web SDK 完全兼容）

---

## 验证方案

1. **编译验证**: `npm run build` 成功编译
2. **类型检查**: `npx tsc --noEmit` 无类型错误
3. **功能测试**: 在微信开发者工具中运行 demo 验证
4. **API 对比**: 与 Web SDK API 保持兼容

---

## 关键文件映射

| Web SDK (npm 引用) | MiniProgram SDK 2.0 (适配) |
|-------------------|---------------------------|
| `xmov-avatar` 主包 | `src/index.ts` (继承 + 适配) |
| `GLDevice` | `src/render/GLDeviceMP.ts` |
| `GLPipeline` | `src/render/GLPipelineMP.ts` |
| `AvatarRenderer` | `src/render/AvatarRendererMP.ts` |
| `RenderScheduler` | `src/core/RenderSchedulerMP.ts` |

---

## 技术要点

1. **npm 依赖**: 主项目发布后作为 npm 包被小程序 SDK 引用
2. **Rollup 构建**: 使用 Rollup 打包，处理小程序特殊语法
3. **平台检测**: 代码中使用条件判断或插件处理浏览器/小程序差异
4. **类型复用**: 直接引用主项目的类型定义
