# SDK-3 开发计划

## 当前状态
- WebSocket 连接正常
- 资源加载正常（脸部数据、身体视频）
- 渲染黑屏（渲染管线未完成）

## 待完成事项

### 1. 渲染管线核心组件

#### 1.1 VideoDecoder (视频解码器) ⚠️ 重要
- [x] 使用 `wx.createVideoDecoder()` 小程序原生 API (已有基础实现)
- [x] 支持 mp4 视频解码为帧数据
- [x] seekToNextFrame 方法
- [x] 与 RenderScheduler 集成
- [ ] 视频帧纹理上传 (texImage2D) - 需在 AvatarRenderer 中实现
- [ ] 参考: `miniprogram-sdk/src/modules/body-renderer-mp.ts`

#### 1.2 BodyRendererMP (身体渲染器)
- [ ] 视频帧纹理上传 (texImage2D)
- [ ] 身体视频渲染逻辑
- [ ] 与 GLPipeline 集成

#### 1.3 DataCacheQueueMP (数据缓存队列)
- [ ] body_data 帧缓存管理
- [ ] face_data 帧缓存管理
- [ ] 按帧号查询数据

#### 1.4 AvatarRendererMP (数字人渲染器)
- [ ] 融合脸部 blendshape 渲染
- [ ] 融合身体视频渲染
- [ ] 坐标对齐计算

### 2. 渲染流程对接

#### 2.1 RenderScheduler 完善
- [ ] body_data 接收后正确解码和缓存
- [ ] 渲染循环获取正确的帧数据
- [ ] 时间同步逻辑

#### 2.2 数据流转
```
WebSocket body_data
  → downloadVideoToTemp (下载 .mp4)
  → VideoDecoder (wx.createVideoDecoder 解码)
  → BodyRendererMP (渲染)
  → AvatarRendererMP (融合)
  → Canvas 显示
```

### 3. 其他功能

#### 3.1 音频播放
- [ ] tts_audio 数据处理
- [ ] 小程序音频 API 集成 (wx.createInnerAudioContext)

#### 3.2 状态管理
- [ ] 完善各状态转换逻辑

#### 3.3 错误处理
- [ ] 超时处理
- [ ] 降级策略

### 4. 工具类补充

#### 4.1 Polyfill 补充
- [ ] window-polyfill (RAF, setTimeout 等)
- [ ] requestAnimationFrame 兼容

#### 4.2 工具类
- [ ] ErrorHandler 错误处理
- [ ] StateManager 状态管理
- [ ] lipsync-core 口型同步核心

## 参考代码
- `miniprogram-sdk/src/control/RenderSchedulerMP.ts` - 渲染调度
- `miniprogram-sdk/src/modules/body-renderer-mp.ts` - 身体渲染 (含 VideoDecoder)
- `miniprogram-sdk/src/control/DataCacheQueueMP.ts` - 数据缓存
- `miniprogram-sdk/src/baseRender/AvatarRendererMP.ts` - 数字人渲染
- `miniprogram-sdk/src/utils/GLPipelineMP.ts` - WebGL 渲染管线
- `miniprogram-sdk/src/utils/GLDeviceMP.ts` - WebGL 设备管理
- `miniprogram-sdk/src/types/wechat.d.ts` - 小程序类型定义
  