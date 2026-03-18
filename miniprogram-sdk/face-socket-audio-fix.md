Agent Team 排查报告汇总
共发现 29 个新问题（不含之前已修复的 11 个）：

WebGL 渲染专家 — 9 个问题
| # | 严重度 | 问题 | 文件 |
|---|--------|------|------|
| W1 | P0 | uniformMatrix4fv(transpose=true) 在小程序 WebGL1 降级环境不生效，投影矩阵转置失败 | GLPipelineMP.ts:863 |
| W2 | P0 | Body 纹理上传用 RGBA（Web SDK 用 RGB），若数据是 RGB 会花屏 | GLPipelineMP.ts:684 |
| W3 | P1 | Mask pass 循环外预上传了旧的 blendshape 权重，首个 genMask mesh 被 skip 时表情错误 | GLPipelineMP.ts:872-875 |
| W4 | P1 | PCA 用 UBO，WebGL1 降级时无 fallback，面部无颜色 | GLPipelineMP.ts:441 |
| W5 | P1 | ub_rig_info_data_offset 变量未用 let 声明，严格模式下 ReferenceError | GLPipelineMP.ts:887 |
| W6 | P1 | LUT 纹理创建逻辑完全缺失 | GLPipelineMP.ts:628 |
| W7 | P2 | lbs_transform NaN 保护行为与 Web 不一致（但更好，不用改） | — |
| W8 | P2 | VAO 创建但从未使用，GPU 资源泄漏 | GLPipelineMP.ts:456 |
| W9 | P2 | max_bones 初始值硬编码差异（8 vs 1） | GLPipelineMP.ts:319 |

WebSocket 通信专家 — 10 个问题
| # | 严重度 | 问题 | 文件 |
|---|--------|------|------|
| S1 | P0 | speak() 缺少 resume() 调用，音频管道可能停滞 | index.ts:280 |
| S2 | P0 | session_speak_req_id 递增时序与 Web SDK 不一致（先增 vs 后增） | index.ts:302-303 |
| S3 | P1 | binaryQueue 无超时清理，单个坏包可阻塞所有后续二进制事件 | websocket.ts:185 |
| S4 | P1 | Socket.IO 解析缺少命名空间(nsp)支持 | websocket.ts:85-111 |
| S5 | P1 | 重连后 binaryQueue/acks 未清理，数据错乱 | websocket.ts:251-323 |
| S6 | P1 | 缺少 error_message 监听，服务端报错完全无感知 | index.ts |
| S7 | P1 | 缺少 client_quit 监听，session 过期后状态不重置 | index.ts |
| S8 | P2 | 缺少 aa_frame 监听 | — |
| S9 | P2 | extra 参数未透传，丢弃外部 client_speak_id | index.ts:332 |
| S10 | P2 | speak 打断时序竞态（state_change 和 send_text 可能同帧到达） | index.ts:278-280 |

音频处理专家 — 10 个问题
| # | 严重度 | 问题 | 杂音症状 | 文件 |
|---|--------|------|---------|------|
| A1 | P0 | InnerAudioContext 复用，段间切换有间隙 | 咔哒声/噗声 | index.ts:895-921 |
| A2 | P0 | clearAudioQueue 竞态：stop 后旧 cleanup 仍可能触发 | 双音/重叠 | index.ts:927-947 |
| A3 | P0 | pcmToWav 采样率硬编码 24000，与服务端不一致时变调 | 变调/爆音 | index.ts:808 |
| A4 | P1 | 事件监听 off/on 间有窗口期，ended 可能丢失 → 队列卡死 | 静音 | index.ts:909-921 |
| A5 | P1 | sid flush 超时 600ms 太长，chunk 可能被拆成两段 | 句间断裂 | index.ts:823-845 |
| A6 | P1 | canplay 事件在某些机型不触发或多次触发 | 静音/重复 | index.ts:917-921 |
| A7 | P1 | 缺少 oldSpeechId 过滤，打断后旧 sid 数据仍被播放 | 串音 | index.ts:816-856 |
| A8 | P2 | PCM chunk 字节不对齐时拼接错位 | 爆音 | index.ts:867-873 |
| A9 | P2 | 临时文件累积可能耗尽 200MB 存储限额 | 突然无声 | index.ts:877 |
| A10 | P2 | 音量渐变动画在段切换时产生波动 | 忽大忽小 | audio.ts:217-249 |

---

优先修复建议（Top 8）
| 优先级 | 问题 | 预计影响 |
|--------|------|---------|
| 1 | A1 InnerAudioContext 每段新建而非复用 | 消除段间咔哒声 |
| 2 | A7 增加 oldSpeechId 过滤 | 消除打断后串音 |
| 3 | A2 clearAudioQueue 加 cancelToken 防竞态 | 消除打断后双音 |
| 4 | S3 binaryQueue 加超时清理 | 防止所有二进制事件卡死 |
| 5 | S5 重连时清空 binaryQueue/acks | 防止重连后数据错乱 |
| 6 | W5 ub_rig_info_data_offset 加 let 声明 | 防止严格模式崩溃 |
| 7 | S6 添加 error_message 监听 | 服务端报错可感知 |
| 8 | A3 pcmToWav 采样率从配置读取 | 消除变调问题 |