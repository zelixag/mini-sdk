# 微信小程序 SDK 开发任务清单

---

## 阶段一：基础骨架（构建与适配）（部分完成）

### 构建系统 (2天)

- [x] Rollup 构建配置（build-heavy-rollup.js，UMD 输出）
- [x] Alias 替换（构建时桥接：socket.io-client、request、AudioWorklet）
- [x] 字符串替换（replaceGlobals：window→globalThis、document、navigator、Worker）
- [x] Source Map 配置
- [ ] 包体积优化（单文件 < 500KB，分包策略）

### Polyfill 与适配器（3天）

- [x] window polyfill（globalThis）
- [x] api polyfill（fetch、Event、Image、URL）
- [x] blob polyfill（Blob）
- [x] module polyfill（socket.io-client 桥接）
- [x] 网络请求适配（mpRequest + headersNeedSign）
- [x] WebSocket 适配（io、MiniProgramWebSocket、Engine.IO 协议）
- [x] Canvas 适配（createCanvasAdapter、getCanvasNode、WebGL）
- [x] 音频适配（createAudioAdapter）
- [x] Worker 适配（createWorkerAdapter 空实现）

---

## 阶段二：核心能力（会话与通信）

### 会话管理 2天

- [x] start_session（签名、请求、sessionInfo 校验）
- [x] stop_session（DELETE 请求、WebSocket 断开）
- [x] TTSA WebSocket 连接（io、enter_room、first_start_timestamp）
- [x] onTtsaReady 回调（通道就绪通知）

### 下行帧处理 3人天

- [x] tts_audio 事件监听（onTtsAudio 回调骨架，解码待接入）
- [x] face_data 事件监听（onFaceData + msgpack/protobuf 解码，proto 加载已修复：injectFaceDataPb 编译时注入）
- [x] body_data 事件监听（onBodyData 回调 + msgpack 解码接入）
- [x] send_text 上行发送（sendText 方法）

---

## 阶段三：渲染链路（资源与渲染）（进行中）

### 资源加载 2天

- [x] ResourceManager 集成（ResourceManagerMP 适配器：loadMouthShapeLib、getVideoUrl，first_start_timestamp 时自动加载 face_ani_char_data）
- [x] resource_pack 解析（face_ani_char_data、body_data_dir）
- [x] 视频预加载（wx.downloadFile + 并发队列，tempFilePath 供 VideoDecoder）

### 解码与渲染 5天（这个比较粗估不确定）

- [x] 视频解码适配（video-test 页面：VideoDecoder + getFrameData + texImage2D raw buffer）
- [x] ImageBitmap 转换（toImageBitmap、wx.createImageBitmap 降级）（做了单点测试有问题）
- [X] 身体视频渲染（BodyRendererMP 已接入，仅身体不做脸部融合，待真机验证）
- [] RenderScheduler 集成（RenderSchedulerMP：帧驱动、body/face 数据路由）
- [] AvatarRenderer 集成（AvatarRendererMP：整合 BodyRenderer，预留脸部融合）
- [] DataCacheQueue 数据流（DataCacheQueueMP：帧索引、body/face 缓存策略）

