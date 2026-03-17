# 变更日志

## 0.1.0-alpha.129

在初始化过程中，char bin资产下载成功，才能连接socket
[【LiteSDK】行走2期](https://rsjqcmnt5p.feishu.cn/wiki/U2Waw2SDZikg7UkyVgxcorh7nne) 存在init_point时，h_align和offset_x不生效

## 0.1.0-alpha.128

修复数字人状态变更混乱，初始化时，在online和visible状态间来回切换
[speak增加回调](https://rsjqcmnt5p.feishu.cn/wiki/HNIjwwbENi2MK8k35phcj2iWnNd)

## 0.1.0-alpha.127

合并release beta.122版本，发布新的alpha版本

## 0.1.0-alpha.126

修复客户端打断时，未发送voice_end事件

## 0.1.0-alpha.125

speak打断时，如果开启了enableClientInterrupt，关闭数字人口型渲染。
离线模式下，发送subtitle_off事件，关闭字幕，其余事件不处理。
离线模式下，uiRenderer不销毁，否则会导致widget_pic被清除。destroy时，才会销毁uiRenderer，进而清除widget_pic。

## 0.1.0-beta.122

修复重置解帧队列场景下切换动作丢帧

## 0.1.0-beta.121

修复离线再上线，数字人表情和音频异常,优化代码

## 0.1.0-beta.120

修复 数字人没有初始化完，房间还建立连接没有销毁

## 0.1.0-beta.119

修复 ios 数字人不能加载问题，原因是初始化了mse报错

## 0.1.0-beta.118

demo 1080p look更新 删除onWidgetEvent，避免原地行走
destroyClient 增加销毁计时器逻辑
销毁重试定时器时不需要销毁离线定时器

## 0.1.0-beta.117

修复主动离线和被动离线逻辑，主动离线时需断开socket调用stopSession，被动离线时，无需断开socket，仅需调用offlineHandle
修复行走原地走动问题
修复端上打断逻辑speak口型异常
断线重连增加限制，最多重连3轮，每轮重连9次，预计总共等待大约48min，如果3轮9次都失败，才认为连接失败。

## 0.1.0-beta.116

去除初始化startSession失败重连逻辑

## 0.1.0-beta.115

sdk 1.5.0 2026/1/21 上pre环境，发布beta分支

## 0.1.0-beta.114

过滤身体数据下发过期提示

## 0.1.0-alpha.124

修复事件过滤逻辑

## 0.1.0-alpha.123

断线重连后增加判断，如果是非speak，无脑发一次voice_end事件（尝试修复星云在断开期间讲述结束，按钮loading）
在socket断开期间，不调用speak更新req_id，用socket的状态拦截所有的socket上行处理及消息
增加日志，及断开网络时增加进入离线模式的逻辑
优化有网后，立即重连，不再走延迟重连策略

## 0.1.0-alpha.122

修复断线重连: 优化检测网络连接时，如果在重开房间，去除计时快速发起一次startSession
断线重连重置音频，解决二次连接后音频未播放
增加socket状态判断，只有在连接状态下，才发送数据，否则丢弃数据。避免在重连成功之后，在enter_room之前发送数据，导致服务端gg。
缓存视频梳理，视频加载超时时间调整。
socket持续不下发数据监控调整为30s，超过30s无任何数据下发，认为连接已断开，关闭当前房间，发起重连。

## 0.1.0-alpha.121

传递指定房间tag

## 0.1.0-alpha.120

断线重连逻辑优化
回退解码模块

## 0.1.0-alpha.119

断线重连stop_reason增加，admin kick, nebula admin stop时,不重连

## 0.1.0-alpha.118

修复离线模式，离线判断
删除startSession失败，回调close状态

## 0.1.0-alpha.117

修复断线重连销毁逻辑以及切离线模式时，数字人人脸分离等问题
socket增加无数据下发检测，超过6秒无任何数据下发，认为连接已断开，关闭当前房间，发起重连

## 0.1.0-alpha.116

增加用户主动断开以及charbin下载失败，不重连逻辑
socket 判断客户端断开时，不做任何处理
增加enableClientInterrupt参数，默认值为false，用于控制是否开启客户端打断逻辑
添加aa_frame事件接收

## 0.1.0-alpha.115

修改断线重连数字人状态状态没有更新

## 0.1.0-alpha.114

合并release, 修复一些bug

## 0.1.0-alpha.113

删除插件系统降低包体
增加端打断逻辑
webm音频压缩代码优化

## 0.1.0-alpha.112

chrome音频压缩

## 0.1.0-alpha.111

对startSession增加警告信息的返回

## 0.1.0-beta.113

更新视频预缓存最大限制
恢复android软解逻辑
删除帧数据转imageBitmap

## 0.1.0-beta.112

修复数字人layout宽高计算
修复视频帧缓存最大限制
去除android软解逻辑

## 0.1.0-beta.111

修复移动设备上的浮点精度问题
修复数字人宽高计算问题

## 0.1.0-beta.110

修复session 接口签名算法问题

## 0.1.0-beta.109

增加安卓环境为软解

## 0.1.0-alpha.108

在恢复现身的时候清除脸部数据，修复人脸分离
在恢复和隐身阶段清除已经下发的语音数据
把widgets的map管理绑定实例进行管理，去除全局管理

## 0.1.0-alpha.107

变更初始化pipeline策略，在数字人隐身模式初始化时候不初始化pipeline，只有在在线的时候初始化pipeline

## 0.1.0-alpha.106

修复解帧逻辑
增加webgl资源清理
修改离线模式
加大视频加载超时时间

## 0.1.0-alpha.105

如果session请求失败，则关闭数字人状态抛给用户数字人为close状态

## 0.1.0-alpha.104

修复行走距离不对的bug

## 0.1.0-alpha.102

修复老版本init_events样式兼容

## 0.1.0-alpha.101

实时换人，当数字人在online的时候 进入rendering态的时候，也应该编程visible态

## 0.1.0-alpha.99

实时换人，更新枚举值

## 0.1.0-alpha.98

实时换人，添加一个visible状态

## 0.1.0-alpha.97

增加支持speak文本缓存，enable_speech_cache参数
支持行走
支持4k
支持硬解

## 0.1.0-alpha.96

插值渲染功能log更新

## 0.1.0-alpha.95

更改webgl判断逻辑，修复机器人报错未出现

## 0.1.0-alpha.94

新增丢帧插值渲染功能

## 0.1.0-alpha.93

取消 MSE 音频流式播放，还原之前音频播放逻辑

## 0.1.0-alpha.92

修改avatarRender width height兜底

## 0.1.0-alpha.91

删除身体数据晚到错误反馈到业务层

## 0.1.0-alpha.90

临时修复：mesAudioPlayer缓存播放逻辑，音频buffer直接进入播放队列，解决音频播放过程中的卡顿问题

## 0.1.0-alpha.89

修改 MES stop 逻辑，修复 currentTime = 0 时播放首字

## 0.1.0-alpha.88

修改mseAudioPlayer初始化时机，解决音画不同步

## 0.1.0-alpha.87

token 修改

## 0.1.0-alpha.85

音频播放：增加mseAudioplayer

## 0.1.0-alpha.84

硬解版本：硬解版本优化

## 0.1.0-alpha.84

硬解版本：硬解版本优化

## 0.1.0-alpha.83

webgl 修复，眼睛渲染异常

## 0.1.0-alpha.82

webgl 修复，带帽子角色不展示脸的问题

## 0.1.0-alpha.81

回退socket断开时，进入离线模式
webgl修复：切换离线时，未清除上一帧面部；角色渲染时，存在眼睛渲染异常

## 0.1.0-alpha.80

socket断开时，进入离线模式

## 0.1.0-alpha.79

增加默认blendShapeMap

## 0.1.0-alpha.78

charbin 问题修复，增加blendShapeMap传入webgl

## 0.1.0-alpha.77

charbin 压缩
自定义header
client_quit进入离线

## 0.1.0-alpha.76

硬解版本：
解帧逻辑优化，降低cpu占用
pcm音频播放资源由外网资源改为sdk内部集成，业务内网环境无法访问外网

## 0.1.0-alpha.75

pcm播放器外网资源集成到sdk内部

## 0.1.0-alpha.74

修复音频提前start

## 0.1.0-alpha.73

增加视频加载超时时间，默认800ms，超时则跳过解帧下一个视频
修复跳帧导致流式音频未播放

## 0.1.0-alpha.72

增加根据framedata_proto_version判断，解析face_data的方式
更新face_data解析逻辑
删除console

## 0.1.0-alpha.71

流量优化：修改数据转换代码，更新proto

## 0.1.0-alpha.70

流量优化：入参修改。

## 0.1.0-alpha.69

流量优化：入参修改。

## 0.1.0-alpha.68

修复ios pcm音频播放

## 0.1.0-alpha.67

流量优化：增加protobuf进行数据序列化。

## 0.1.0-alpha.66

切换离线模式，清除字幕、停止ui事件和音频播放
socket离线时，发送切换到离线模式。

## 0.1.0-alpha.65

修复socket断开，离线模式以及销毁的处理

## 0.1.0-alpha.64

修复IOS的特殊性，audioContext的初始state='suspended', 不会播放声音；必须通过用户交互的回调中ctx.resume()来解锁ctx才能播放

## 0.1.0-alpha.63

webgl 上下文丢失时，增加二次初始化失败处理

## 0.1.0-alpha.62

- 修复sdk disconnect时，sdk判断是否未销毁，未销毁时先销毁再发送给业务close

## 0.1.0-alpha.61

- 修复sdk close时，sdk未销毁

## 0.1.0-alpha.60

- 修复人物重叠
- 修复音频播放晚于正确事件

## 0.1.0-alpha.59

- 修改字幕和webgl lost

## 0.1.0-alpha.58

- webgl update

## 0.1.0-alpha.57

- 修复横屏样式

## 0.1.0-alpha.56

- 增加埋点
- 修改visibilitychange时，socket断开时不重连

## 0.1.0-alpha.55

- 修改canvas transform变换

## 0.1.0-alpha.54

- 修改canvas宽高设置

## 0.1.0-alpha.53

- 增加session_speak_req_id重置

## 0.1.0-alpha.52

- 增加session_speak_req_id

## 0.1.0-alpha.51

- 调整canvas样式

## 0.1.0-alpha.50

- charactor auchor 代码回撤

## 0.1.0-alpha.49

- charactor auchor webgl更新
- 更新埋点

## 0.1.0-alpha.48

- 修复sdk销毁时销毁内容
- onVoiceStateChange增加响应耗时
- 增加埋点

## 0.1.0-alpha.47

- 临时调整：音频数据过期时，临时调整sf和ef，确保音频能够播放

## 0.1.0-alpha.46

- 增加上报及日志排查音频丢失问题

## 0.1.0-alpha.45

- 修复ui事件渲染队列未及时清空导致的闪烁问题

## 0.1.0-alpha.44

- 修复音频数据提前下发导致被清除以及过期帧未及时清除导致渲染帧错误
- 增加stop_reason 修复背景和前景闪烁的问题

## 0.1.0-alpha.43

- 修复widget_pic渲染闪烁问题

## 0.1.0-alpha.41

- 新增onVoiceStateChange回调，用于通知业务语音状态变化

## 0.1.0-alpha.40

- 坐姿分支修复卡通人物表情处理异常

## 0.1.0-alpha.39

- 修复卡通人物表情处理异常

## 0.1.0-alpha.38

- config.init_events 选填

## 0.1.0-alpha.37

- sdk支持坐姿前景图\人物缩位移等叠加开发
- 增加onVoiceStateChange事件，用于监听语音状态变化
- 增加proxyWidget方法，用于业务自定义代理widget，sdk仅支持字幕及pic两种默认widget

## 0.1.0-alpha.36

- 修复startSession前，错误的网络判断导致连接失败无响应

## 0.1.0-alpha.35

- 卡通人物bsw增加特殊处理

## 0.1.0-alpha.34

- 修复声音和字幕不同步问题

## 0.1.0-alpha.33

- 修复sdk销毁重新建立链接时，初始化报错导致链接失败

## 0.1.0-alpha.32

- 修复横屏模式下背景图被压缩，背景图的渲染由webgl转至dom层实现
- 修复socket断开的情况下，进入离线模式。

## 0.1.0-alpha.31

- 修复abortFrameIndex过期导致的丢帧问题

## 0.1.0-alpha.30

- xmovAvatar 新增 renderFrame 方法

## 0.1.0-alpha.29

- 清理日志

## 0.1.0-alpha.28

- 增加socket断连检测,检测到socket断连销毁sdk
- 简化日志打印

## 0.1.0-alpha.27

- 修复丢帧error过滤，不发送给业务

## 0.1.0-alpha.26

- 修复 ttsa disconnect 状态发送

## 0.1.0-alpha.25

- 调试框增加body_id、增加渲染丢帧报错
- 下载视频失败时增加视频名称
- 修复大模型音量设置无效，小模型音量设置后会重置

## 0.1.0-alpha.24

- 解帧边界case修复

## 0.1.0-alpha.23

- init() 取消 onClose 参数定义
- 视频下载、解码时间新增日志

## 0.1.0-alpha.22

- 新增缓存服务配置
- onStatusChange 新增被动断开 close 状态

## 0.1.0-alpha.21

- 修改speak时间统计，从isStart开始计算

## 0.1.0-alpha.19

- 修改 destroy 接口返回

## 0.1.0-alpha.18

- 删除init方法的onClose参数
- 新增onStatusChange

## 0.1.0-alpha.17

- 非ios切换为软解码

## 0.1.0-alpha.16

- 优化大模型语音使用audioWorkletProcessor流式播放
- 删除不需要的状态切换 如wakeup等
- 优化断线后检测到网络恢复清空视频队列导致人物卡顿

## 0.1.0-alpha.15

- 修复断线重连模块，用户主动断开时未销毁模块及事件监听，导致重复调用stopSesion和startSession
- 修复断线重连模块，在重连失败时卡死，更新为在重连startSession失败时，报错并销毁sdk

## 0.1.0-alpha.14

- 删除console.log

## 0.1.0-alpha.13

- 修复断线重连未更新session_id
- 接入大模型声音
- 修复前端在切换状态时出现的声音异常

## 0.1.0-alpha.12

- 修复切换tab或最小化后，返回页面音频数据异常
- 修复被动断开不触发onClose
- 完善动画人的PCA数据处理
- 修复部分边界case下多解码，优化解码效率

## 0.1.0-alpha.11

- 修复destory时字幕未消失问题
- 修复星云体验中心背景图未生效
- 修复切tab或最小化时返回，未响应问题

## 0.1.0-alpha.10

- debugInfo增加当前帧数、audio、event信息展示
- 增加audio数据返回过期报错
- 修改android时，软解码

## 0.1.0-alpha.9

- 修复页面隐藏断线、可见重连
- 更新网络带宽数据

## 0.1.0-alpha.8

- webgl更新，帧缓存在没有角色动画数据时不会被清空

## 0.1.0-alpha.7

- 背景视频颜色混合函数问题,修复人物脸部白边

## 0.1.0-alpha.6

- 增加网络检测
- 修复ios、android移动端兼容性，根据不同的平台选择不同的解码方式及限制

## 0.1.0-alpha.5

- 修复数字人白边
- 增加断线重连功能
- 增加解码视频帧与实际视频长度不一致校验

## 0.1.0-alpha.3

- 恢复onClose事件

## 0.1.0-alpha.2

- 修复audioContext丢失问题
- 并发视频解析数量增加限制

## 0.1.0-alpha.1

- 新增全脸支持
- 新增移动端及 Safari 浏览器支持

## 0.0.1-alpha.33

- 修复打断音频未中断的问题

## 0.0.1-alpha.29

- debugInfo 面板增加了当前播放的视频名称、视频加载时间、解码时间展示，且面板可自定义拖拽
- SDK 增加录制功能，可通过 `enableDebugger`开启，通过按钮下载整个播放过程中的数据（仅限测试环境开启）。[离线缓存数据生成与调试指南](https://rsjqcmnt5p.feishu.cn/docx/KHzFd5OVdo4uK6xmNsjccU7UnRf)
- 修复 `speak`过程中一次返回多个事件导致字幕丢失的问题
- 修复切换 tab 或切到后台后返回页面，出现长时间卡顿无响应的问题
- 接入音频数据压缩，更新 `audio`实现
- 同步算法侧代码更新

## 0.0.1-alpha.27

- 修复语音播放异常的问题

## 0.0.1-alpha.26

- 修复性能数据输出异常的问题

## 0.0.1-alpha.25

- 优化声音打断时跟随身体状态变更的逻辑
- 删除兜底表情

## 0.0.1-alpha.23

- 修复音画同步问题
- 增加 3s 视频预缓存功能

## 0.0.1-alpha.22

- 修复 `speak`时口型异常的问题

## 0.0.1-alpha.20

- 更新部分场景的丢帧逻辑
- 修复初始化异常未断连的场景，资源或首个视频加载失败时会主动调用 `stopSession`
- 修改 tab 切换回来后对齐帧索引播放的逻辑
- `onError`新增异常 Code：`TTSA_ERROR = 40006`（ttsa 下行发送异常信息）

## 0.0.1-alpha.19

- 去掉表情解压步骤

## 0.0.1-alpha.18

- 优化切换状态时的卡顿问题

## 0.0.1-alpha.16

- 增加通过 `appId`、`appSecret`生成 `token`的功能

## 0.0.1-alpha.13

- 优化性能，修复黑屏和卡顿问题

## 0.0.1-alpha.10

- 新增事件/方法：`onStateChange`、`onStateRenderChange`、`skill`、`touchReact`、`exitInteraction`、`setVolume`
- 修复事件未按时序输出的问题
- 修复异常问题：[参考文档](https://rsjqcmnt5p.feishu.cn/docx/OmpSdhzsooDO3JxFVDPcXUMNnLH)

## 0.0.1-alpha.9

- 删除 `onReady`及 `start`相关逻辑，可直接监控 `onDownLoadProgress`进度达到 100（此时虚拟人首帧渲染，状态为 `idle`）
- 主动调用 `destroy`时，内部会自动调用 `onClose`
- 视频处理完成后清除对应的 `webWorker`（若仍存在相关问题，可随时沟通）
