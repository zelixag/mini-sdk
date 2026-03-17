# 未来代码优化方向

- 优化音频播放逻辑，区分暂停和停止
- 优化requestAnimationFrame在document.hidden时的处理,提供requestAnimationFrame不起作用时的替代方案
- 优化scheduler的实现,在scheduler中处理各种打断逻辑时，避免直接调用sub render的方法。scheduler中提供针对所有sub render的方法调用。
- sdk状态收归优化，离线、在线、断网、有网等
- 判断如果当前解帧的帧号小于渲染的帧号，且差异过大，说明当前是丢帧卡顿的状态，需要调用decode.ts内的syncDecode方法，同步解码到当前渲染的帧号，确保解帧跟上进度。
- 增加skd、demo构建后，自动上传oss。（已完成）
