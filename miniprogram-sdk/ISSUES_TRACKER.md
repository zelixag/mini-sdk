# miniprogram-sdk 问题追踪表

> 三个 Agent 专家（WebGL/WebSocket/Audio）排查共发现 29 个问题，按优先级分类管理。

## 已修复 ✅ (12/29)

| # | 领域 | 问题 | 修复方式 |
|---|------|------|---------|
| A1 | Audio P0 | InnerAudioContext 复用导致段间咔哒声 | 每段创建新实例 + destroy |
| A2 | Audio P0 | clearAudioQueue 竞态导致双音 | cancelToken 机制 |
| A3 | Audio P0 | pcmToWav 采样率硬编码 24000 | 从 sessionInfo.config 读取 |
| A5 | Audio P1 | flush 超时 600ms 太长 | 降到 200ms + 最大 chunk 触发 |
| A7 | Audio P1 | 缺少 oldSpeechId 过滤 | 添加 _discardedSid |
| A8 | Audio P2 | PCM chunk 字节不对齐 | 2 字节对齐保护 |
| S3 | WS P1 | binaryQueue 无超时清理 | 5s 超时 + 队列长度上限 |
| S5 | WS P1 | 重连后 binaryQueue/acks 未清理 | onOpen 时清空 |
| S6 | WS P1 | 缺 error_message 监听 | 已添加 + emitMessage |
| S7 | WS P1 | 缺 client_quit 监听 | 已添加 + 状态重置 |
| W3 | GL P1 | mask pass 循环外旧 blendshape 权重 | 移除预上传 |
| W5 | GL P1 | ub_rig_info_data_offset 未声明 | 添加 let |

## 第二轮修复 ✅ (额外)

| # | 领域 | 问题 | 修复方式 |
|---|------|------|---------|
| R1 | WS | session_speak_req_id 从 1 开始（应从 0） | 先用后递增，对齐 Web SDK |
| R2 | WS | multi_turn_conversation_id 格式不同 | 改为 `N-sessionId` 格式 |
| R3 | WS | speak() 前多余的 state_change | 删除，对齐 Web SDK |
| R4 | GL | 眼球从面部皮肤漏出 | polygonOffset depth bias |

## 待修复（高优先级）

- [ ] **AvatarRendererMP**: getLatestFaceData 终极兜底 + !rawBody 降级到 fallback
- [ ] **W1**: `uniformMatrix4fv(transpose=true)` WebGL1 降级不生效 → CPU 端预转置
- [ ] **W2**: Body 纹理上传 RGBA vs RGB 确认

## 待修复（中优先级）

- [ ] **S9**: extra 参数未透传到 sendText
- [ ] **A9**: 临时文件累积清理（init/destroy 时清理 tts_*.wav）

## 已修复（低优先级）

- [x] **W8**: VAO 创建改为 null（节省 GPU 内存）
- [x] **S4**: Socket.IO 解析增加命名空间(nsp)剥离
- [x] **A10**: 音量设置改为直接赋值（移除渐变动画）

## 暂不修复（风险低/无影响）

- [ ] **W4**: PCA UBO WebGL1 fallback — 小程序基本都是 WebGL2
- [ ] **W6**: LUT 纹理创建 — 当前 LUT=null 且 flags 不含 bit1

## 不需要修复

| # | 原因 |
|---|------|
| W7 | lbs_transform NaN 保护 — 小程序版更健壮，不需要改 |
| W9 | max_bones 初始值 — 会被 assembleMeshPipelines 覆盖 |
| S1 | speak() 缺 resume() — 小程序不用 AudioRenderer，不适用 |
| S8 | 缺 aa_frame 监听 — 当前业务不需要 |
| S10 | speak 打断时序竞态 — Socket.IO 保证消息顺序 |
| A4 | 事件监听窗口期 — 已被 A1 修复覆盖 |
| A6 | canplay 不触发 — 已被 A1 修复覆盖（改用 autoplay） |
