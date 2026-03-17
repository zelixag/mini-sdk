/**
 * 数字人小程序示例 - 基础使用
 * 
 * 说明：这是一个基础示例，展示如何在小程序中使用 XmovAvatar SDK
 */

// 引入 SDK（UMD 格式）
// UMD 格式支持多种引入方式：
// 1. CommonJS: const XmovAvatarMP = require('../../../../dist/xmov-avatar-mp.heavy.js');
// 2. AMD: define(['xmov-avatar-mp'], function(XmovAvatarMP) { ... });
// 3. 全局变量: <script src="xmov-avatar-mp.heavy.js"></script> 然后使用 window.XmovAvatarMP

// 小程序使用 CommonJS 方式（推荐）
// 从项目 lib 目录引入 SDK
const SDK = require('../../lib/xmov-avatar-mp.heavy.js');
const { createCanvasAdapter } = SDK;
const XmovAvatarMP = SDK.XmovAvatarMP || SDK.default;
const FACE_ALIGN_STORAGE_KEY = 'xmov_face_align_config_v1';

// 从 Web 示例（app）同步过来的会话配置
const WEB_EXAMPLE_SESSION_CONFIG = {
  // 来源：app/.env.test
  gatewayServer: 'https://test-ttsa-gateway-lite.xmov.ai/api/session',
  // 来源：app/src/components/walk-test.vue
  appId: '3b8f7000b8fd4b4b83dfc680600590b2',
  appSecret: '8b25a33d96684052a6a6e5cc604c2a94',
  headers: {
    Authorization: '888jn'
  },
  // 来源：app/.env.dev 的 VITE_DEFAULT_CONFIG（用于 start_session 的 config）
  config: {
    "auto_ka": true,
    "cleaning_text": true,
    "emotion_version": "v1_version",
    "figure_name": "SCF25_001",
    "framedata_proto_version": 2,
    "init_events": [
    ],
    "is_large_model": false,
    "is_vertical": true,
    "language": "chinese",
    "lite_drive_style": "service1",
    "llm_name": "Doubao",
    "look_name": "N_Wuliping_14333_new",
    "mp_service_id": "F_CN02_show52",
    "optional_emotion": "serious,smile,confused",
    "pitch": 1,
    "raw_audio": true,
    "render_preset": "1080x1920_fullbody",
    "resolution": {
        "height": 1920,
        "width": 1080
    },
    "sta_face_id": "F_lively02_xiaoze",
    "tts_emotion": "neutral",
    "tts_speed": 1,
    "tts_split_length": 16,
    "tts_split_row": 1,
    "tts_vcn_id": "XMOV_HN_TTS__43",
    "volume": 1
  }
};

Page({
  data: {
    canvasId: 'avatar-canvas',
    /** 'full' | 'half'：全屏 / 半屏，用于自定义画布占位 */
    canvasSizeMode: 'full',
    avatarReady: false,
    playState: 'stopped',
    panelCollapsed: true,
    controlsCollapsed: true,
    importJsonText: '',
    faceAlign: {
      offset_x_px: 0,
      offset_y_px: 0,
      head_motion_scale: 2.0,
      expr_motion_scale: 1.0,
      eye_extra_scale: 0.0
    },
    wsPanelCollapsed: true,
    wsAutoHook: true,
    wsAutoScroll: true,
    wsFilters: {
      open: true,
      close: true,
      error: true,
      send: true,
      message: true
    },
    wsCounters: {
      open: 0,
      close: 0,
      error: 0,
      send: 0,
      message: 0
    },
    wsLogs: [],
    wsDisplayLogs: [],
    wsScrollTop: 0,
    wsLastStatus: '未连接',
    eventPanelCollapsed: true,
    lastSubtitle: '',
    lastEventType: '',
    lastEventTime: '',
    lastAudioStatus: 'idle',
    lastAudioPath: '',
    lastAudioError: '',
    subtitleText: '',
    showSubtitle: true,
    backgroundImage: '',
    widgetMode: true,
    widgetExpanded: false
  },

  initWsMonitor() {
    if (this._wsMonitorInited) return;
    this._wsMonitorInited = true;
    this._wsSocketSeq = 0;
    this._wsTasks = {};
    this._originConnectSocket = wx.connectSocket;
    this.hookWebSocket();
  },

  hookWebSocket() {
    if (this._wsHooked || !this.data.wsAutoHook) return;
    if (!this._originConnectSocket) return;
    const origin = this._originConnectSocket;
    const page = this;
    wx.connectSocket = function (opts) {
      const task = origin(opts);
      const socketId = `WS-${++page._wsSocketSeq}`;
      page._wsTasks[socketId] = task;
      page.setData({ wsLastStatus: '连接中' });

      const wrap = (methodName, handler) => {
        const original = task[methodName]?.bind(task);
        if (!original) return;
        task[methodName] = (cb) => original((res) => {
          handler(res);
          if (cb) cb(res);
        });
      };

      wrap('onOpen', () => {
        page.setData({ wsLastStatus: '已连接' });
        page.addWsLog('open', socketId, undefined, '连接成功');
      });
      wrap('onClose', (res) => {
        page.setData({ wsLastStatus: '已断开' });
        page.addWsLog('close', socketId, undefined, `code=${res?.code ?? ''}`);
      });
      wrap('onError', (err) => {
        page.setData({ wsLastStatus: '错误' });
        page.addWsLog('error', socketId, undefined, err?.errMsg || 'error');
      });
      wrap('onMessage', (res) => {
        const payload = page.formatWsPayload(res?.data);
        page.addWsLog('message', socketId, payload);
      });

      const originSend = task.send?.bind(task);
      if (originSend) {
        task.send = (data) => {
          const payload = page.formatWsPayload(data);
          page.addWsLog('send', socketId, payload);
          return originSend(data);
        };
      }

      return task;
    };
    this._wsHooked = true;
  },

  unhookWebSocket() {
    if (!this._wsHooked) return;
    if (this._originConnectSocket) {
      wx.connectSocket = this._originConnectSocket;
    }
    this._wsHooked = false;
  },

  formatWsPayload(data) {
    try {
      if (typeof data === 'string') return data;
      if (data instanceof ArrayBuffer) return `ArrayBuffer(${data.byteLength})`;
      if (data?.buffer instanceof ArrayBuffer) return `TypedArray(${data.byteLength})`;
      return JSON.stringify(data);
    } catch {
      return '[unreadable]';
    }
  },

  addWsLog(type, socketId, payload, detail) {
    const time = new Date();
    const stamp = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}.${time.getMilliseconds().toString().padStart(3, '0')}`;
    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      time: stamp,
      type,
      socketId,
      payload,
      detail
    };
    const nextLogs = [item, ...(this.data.wsLogs || [])].slice(0, 200);
    const nextCounters = { ...this.data.wsCounters, [type]: (this.data.wsCounters[type] || 0) + 1 };
    const nextData = { wsLogs: nextLogs, wsCounters: nextCounters };
    this.setData(nextData, () => {
      this.updateWsDisplay();
    });
  },

  updateWsDisplay() {
    const filters = this.data.wsFilters || {};
    const display = (this.data.wsLogs || []).filter(item => filters[item.type]);
    const next = { wsDisplayLogs: display };
    if (this.data.wsAutoScroll) {
      next.wsScrollTop = (this.data.wsScrollTop || 0) + 9999;
    }
    this.setData(next);
  },

  toggleWsPanel() {
    this.setData({ wsPanelCollapsed: !this.data.wsPanelCollapsed });
  },

  toggleEventPanel() {
    this.setData({ eventPanelCollapsed: !this.data.eventPanelCollapsed });
  },

  onWsFilterChange(e) {
    const key = e?.currentTarget?.dataset?.key;
    if (!key) return;
    this.setData({ [`wsFilters.${key}`]: !!e.detail.value }, () => this.updateWsDisplay());
  },

  onWsAutoScrollChange(e) {
    this.setData({ wsAutoScroll: !!e.detail.value });
  },

  onWsAutoHookChange(e) {
    const enabled = !!e.detail.value;
    this.setData({ wsAutoHook: enabled }, () => {
      if (enabled) this.hookWebSocket();
      else this.unhookWebSocket();
    });
  },

  clearWsLogs() {
    this.setData({
      wsLogs: [],
      wsDisplayLogs: [],
      wsCounters: { open: 0, close: 0, error: 0, send: 0, message: 0 }
    });
  },

  onLoad() {
    console.log('[Example] Page loaded');
    this.restoreFaceAlignFromStorage();
    this.initWsMonitor();
    this.initAvatar();
  },

  onShow() {
    if (this.canvasAdapter) this.canvasAdapter.onShow();
    this.avatar?.onPageShow?.();
  },

  onHide() {
    if (this.canvasAdapter) this.canvasAdapter.onHide();
    // 停止渲染循环、销毁 VideoDecoder，避免切后台后 task not found 刷屏
    this.avatar?.onPageHide?.();
  },

  /** 切换画布占位（全屏 / 半屏），并通知 SDK 重建缓冲 */
  setCanvasSizeMode(e) {
    const mode = e?.currentTarget?.dataset?.mode || 'full';
    if (!this.avatar?.setCanvasSize || !this.canvasNode) return;
    this.setData({ canvasSizeMode: mode }, () => {
      const dpr = wx.getWindowInfo?.().pixelRatio || 2;
      const win = wx.getWindowInfo?.() || {};
      const winW = (win.windowWidth || 375) * dpr;
      const winH = (win.windowHeight || 667) * dpr;
      const w = mode === 'half' ? Math.floor(winW * 0.5) : winW;
      const h = mode === 'half' ? Math.floor(winH * 0.5) : winH;
      if (this.canvasNode.width !== undefined) {
        this.canvasNode.width = w;
        this.canvasNode.height = h;
      }
      this.avatar.setCanvasSize(w, h);
      wx.showToast({ title: mode === 'half' ? '已切换为半屏' : '已切换为全屏', icon: 'none', duration: 1200 });
    });
  },

  toggleWidgetMode() {
    const next = !this.data.widgetMode;
    this.setData({ widgetMode: next, widgetExpanded: next ? this.data.widgetExpanded : false }, () => {
      this.resizeCanvasToLayout();
    });
  },

  toggleWidgetExpand() {
    this.setData({ widgetExpanded: !this.data.widgetExpanded }, () => {
      this.resizeCanvasToLayout();
    });
  },

  /**
   * 初始化 WebGL（对齐 video-test 页面的实现）
   */
  initWebGLLikeVideoTest() {
    return new Promise((resolve) => {
      const query = this.createSelectorQuery();
      query
        .select('#avatar-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res?.[0]?.node) {
            resolve({ canvasNode: null, gl: null });
            return;
          }
          const canvas = res[0].node;
          // antialias: true 减轻锯齿（小程序 Canvas 若支持则生效）
          const glOpts = { antialias: true, alpha: false };
          const gl = canvas.getContext('webgl2', glOpts) || canvas.getContext('webgl', glOpts);
          if (!gl) {
            resolve({ canvasNode: null, gl: null });
            return;
          }
          const dpr = wx.getWindowInfo?.().pixelRatio || 2;
          // 支持自定义尺寸：若页面设置了 canvasWidth/canvasHeight（CSS 像素），则优先使用
          const layoutW = res[0].width || 300;
          const layoutH = res[0].height || 400;
          const w = (this.data.canvasWidth != null && this.data.canvasHeight != null)
            ? this.data.canvasWidth * dpr
            : layoutW * dpr;
          const h = (this.data.canvasWidth != null && this.data.canvasHeight != null)
            ? this.data.canvasHeight * dpr
            : layoutH * dpr;
          canvas.width = Math.round(w);
          canvas.height = Math.round(h);
          gl.viewport(0, 0, canvas.width, canvas.height);
          resolve({ canvasNode: canvas, gl });
        });
    });
  },

  resizeCanvasToLayout() {
    if (!this.canvasNode || !this.gl) return;
    const query = this.createSelectorQuery();
    query
      .select('#avatar-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res?.[0]) return;
        const dpr = wx.getWindowInfo?.().pixelRatio || 2;
        const w = Math.max(1, Math.round((res[0].width || 1) * dpr));
        const h = Math.max(1, Math.round((res[0].height || 1) * dpr));
        if (this.canvasNode.width !== w || this.canvasNode.height !== h) {
          this.canvasNode.width = w;
          this.canvasNode.height = h;
          this.gl.viewport(0, 0, w, h);
          this.avatar?.setCanvasSize?.(w, h);
        }
      });
  },

  onUnload() {
    // 页面卸载时，销毁适配器
    if (this.canvasAdapter) {
      this.canvasAdapter.destroy();
      this.canvasAdapter = null;
    }
    if (this.avatar) {
      this.avatar.destroy?.();
      this.avatar = null;
    }
    this.unhookWebSocket();
  },

  /**
   * 初始化数字人
   */
  async initAvatar() {
    try {
      console.log('[Example] Initializing avatar...');

      // 1. 创建 Canvas 适配器
      this.canvasAdapter = createCanvasAdapter({
        canvasId: this.data.canvasId,
        componentInstance: this // 传入页面实例，用于 createSelectorQuery
      });

      // 2. 获取 Canvas 节点与尺寸（对齐 video-test：.fields + WebGL）
      const { canvasNode, gl } = await this.initWebGLLikeVideoTest();
      if (!gl || !canvasNode) {
        wx.showToast({ title: 'WebGL 初始化失败', icon: 'none' });
        return;
      }
      console.log('[Example] WebGL context created');
      this.canvasNode = canvasNode;
      this.gl = gl;

      // 3. 监听 Canvas 尺寸变化
      this.canvasAdapter.watchCanvasSize((width, height) => {
        console.log('[Example] Canvas size changed:', width, height);
        this.resizeCanvasToLayout();
      });

      // 4. 初始化 XmovAvatar SDK 实例（char_data 用 wx.downloadFile + 异步 readFile 加载）
      if (typeof XmovAvatarMP === 'function') {
        this.avatar = new XmovAvatarMP({
          canvas: canvasNode,
          gl,
          // 对齐 Web SDK Main.vue：打开日志与调试开关
          enableLogger: true,
          enableDebugger: true,
          appId: WEB_EXAMPLE_SESSION_CONFIG.appId,
          appSecret: WEB_EXAMPLE_SESSION_CONFIG.appSecret,
          gatewayServer: WEB_EXAMPLE_SESSION_CONFIG.gatewayServer,
          headers: WEB_EXAMPLE_SESSION_CONFIG.headers,
          config: WEB_EXAMPLE_SESSION_CONFIG.config,
          onStatusChange: (status) => {
            console.log('[Example] Avatar status:', status);
            if (status === 'playing' || status === 'paused' || status === 'stopped') {
              this.setData({ playState: status });
            }
          },
          onMessage: (msg) => {
            // code < 0 是真正的错误，其余是 info/debug
            if (msg.code < 0) {
              console.error('[Example] SDK ERROR:', msg.code, msg.message, msg.details);
            } else {
              console.log('[Example] SDK msg:', msg.code, msg.message);
            }
          },
          onTtsaReady: (e) => {
            console.log('=== [SPEAK TRACE] TTSA 已就绪，可以调用 speak ===', e);
            console.log('[SPEAK TRACE] sessionInfo:', JSON.stringify(this.avatar?.getSessionInfo?.()));
            wx.showToast({ title: 'TTSA 已连接', icon: 'success', duration: 1500 });
          },
          onTtsAudio: (frames) => {
            // frames 是解码后的 IRawAudioFrameData[]
            const first = Array.isArray(frames) ? frames[0] : frames;
            console.log('[SPEAK TRACE] Step 6a: tts_audio 回调 sid=', first?.sid, 'sf=', first?.sf, 'ef=', first?.ef, 'adType=', Object.prototype.toString.call(first?.ad));
            this.setData({
              lastAudioStatus: 'received',
              lastAudioTime: this._nowStamp?.() || '',
              lastAudioError: ''
            });
          },
          onFaceData: (data) => {
            // 只打第一次，避免刷屏
            if (!this._faceDataLogged) {
              this._faceDataLogged = true;
              console.log('[SPEAK TRACE] Step 6b: 首次收到 face_data，帧数=', data?.length, 'first sf=', data?.[0]?.sf, 'ef=', data?.[0]?.ef);
            }
          },
          onBodyData: (data) => {
            if (!this._bodyDataLogged) {
              this._bodyDataLogged = true;
              console.log('[SPEAK TRACE] Step 6c: 首次收到 body_data，帧数=', data?.length, 'first.n=', data?.[0]?.n, 'sid=', data?.[0]?.id);
            }
          },
          onEventData: (events) => {
            console.log('[SPEAK TRACE] Step 6d: event_data 收到，frames=', events?.length);
            for (const frame of events) {
              for (const item of (frame.e || [])) {
                if (item.type === 'subtitle_on') {
                  console.log('[SPEAK TRACE] 字幕 ON ▶', item.text);
                  this.setData({
                    lastSubtitle: item.text || '',
                    lastEventType: item.type,
                    lastEventTime: this._nowStamp?.() || '',
                    subtitleText: item.text || ''
                  });
                  // this.setData({ subtitle: item.text })
                } else if (item.type === 'subtitle_off') {
                  console.log('[SPEAK TRACE] 字幕 OFF ■ speech_id:', item.speech_id);
                  this.setData({
                    lastSubtitle: '',
                    lastEventType: item.type,
                    lastEventTime: this._nowStamp?.() || '',
                    subtitleText: ''
                  });
                  // this.setData({ subtitle: '' })
                } else {
                  console.log('[SPEAK TRACE] event type=', item.type, item);
                  this.setData({
                    lastEventType: item.type,
                    lastEventTime: this._nowStamp?.() || ''
                  });
                }
                if (item.type === 'widget_pic' && item.image) {
                  this.setData({
                    backgroundImage: item.image,
                    lastEventType: item.type,
                    lastEventTime: this._nowStamp?.() || ''
                  });
                }
              }
            }
          }
        });
        await this.avatar.init?.();
        this.applyFaceAlignConfig();
      } else {
        // 兜底：如果包导出异常，回退 mock 以确保流程可运行
        this.avatar = this.createMockAvatar();
      }

      this.setData({ avatarReady: true, playState: 'stopped' });
      console.log('[Example] Avatar initialized successfully');
    } catch (error) {
      console.error('[Example] Failed to initialize avatar:', error);
      wx.showToast({
        title: '初始化失败',
        icon: 'none',
        duration: 2000
      });
    }
  },

  _nowStamp() {
    const time = new Date();
    return `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}.${time.getMilliseconds().toString().padStart(3, '0')}`;
  },

  /**
   * 创建模拟 Avatar，先打通按钮流程
   */
  createMockAvatar() {
    return {
      start: () => {
        this.setData({ playState: 'playing' });
        wx.showToast({ title: '已开始（模拟）', icon: 'none' });
      },
      pause: () => {
        this.setData({ playState: 'paused' });
        wx.showToast({ title: '已暂停（模拟）', icon: 'none' });
      },
      stop: () => {
        this.setData({ playState: 'stopped' });
        wx.showToast({ title: '已停止（模拟）', icon: 'none' });
      }
    };
  },

  /**
   * 处理 Canvas 触摸事件（如果需要交互）
   */
  onCanvasTouch(e) {
    console.log('[Example] Canvas touched:', e);
    // TODO: 处理触摸交互
  },

  /**
   * 开始数字人（点击「开始」按钮）
   */
  async startAvatar() {
    console.log('[Example] startAvatar tapped');
    const ok = await this.avatar?.start?.();
    if (!ok) {
      wx.showToast({ title: 'start_session 调用失败', icon: 'none' });
    }
  },

  /**
   * 停止数字人（点击「停止」按钮）
   */
  async stopAvatar() {
    console.log('[Example] stopAvatar tapped');
    await this.avatar?.stop?.();
  },

  goVideoTest() {
    wx.navigateTo({ url: '/pages/video-test/video-test' });
  },

  /**
   * 暂停数字人（点击「暂停」按钮）
   */
  pauseAvatar() {
    console.log('[Example] pauseAvatar tapped');
    this.avatar?.pause?.();
  },

  handleSpeak() {
    console.log('=== [SPEAK TRACE] Step 1: 按钮点击 ===');

    // // Step 2: 检查 avatar 实例
    // if (!this.avatar) {
    //   console.error('[SPEAK TRACE] Step 2 FAIL: this.avatar 为 null，请先点「开始」');
    //   wx.showToast({ title: '请先点开始', icon: 'none' });
    //   return;
    // }
    // console.log('[SPEAK TRACE] Step 2 OK: avatar 实例存在，status =', this.avatar.getStatus?.());

    // // Step 3: 检查 speak 方法
    // if (typeof this.avatar.speak !== 'function') {
    //   console.error('[SPEAK TRACE] Step 3 FAIL: avatar.speak 不是函数，SDK 可能未正确加载');
    //   return;
    // }
    // console.log('[SPEAK TRACE] Step 3 OK: avatar.speak 方法存在');

    // // Step 4: 检查 sessionInfo（WebSocket 是否已连接）
    // const sessionInfo = this.avatar.getSessionInfo?.();
    // console.log('[SPEAK TRACE] Step 4: sessionInfo =', JSON.stringify(sessionInfo));
    // if (!sessionInfo) {
    //   console.warn('[SPEAK TRACE] Step 4 WARN: sessionInfo 为 null，TTSA 可能未连接');
    // }

    // Step 5: 调用 speak，观察返回值
    const text = '你好，这是一段测试语音，请仔细听。';
    console.log('[SPEAK TRACE] Step 5: 调用 speak，文本 =', text);
    const speakId = this.avatar.speak(text);
    console.log('[SPEAK TRACE] Step 5 结果: speakId =', speakId);
    if (!speakId) {
      console.error('[SPEAK TRACE] Step 5 FAIL: speakId 为 null，说明 socket 未连接或 session_id 为空');
      wx.showToast({ title: 'speak 失败，查看日志', icon: 'none' });
    } else {
      console.log('[SPEAK TRACE] Step 5 OK: send_text 已发出，等待服务端响应...');
      wx.showToast({ title: '发送成功，等待响应', icon: 'none', duration: 1500 });
    }
  },

  applyFaceAlignConfig() {
    if (!this.avatar?.setFaceAlignmentConfig) return;
    this.avatar.setFaceAlignmentConfig({ ...this.data.faceAlign });
  },

  sanitizeFaceAlignConfig(input = {}) {
    const base = {
      offset_x_px: 0,
      offset_y_px: 0,
      head_motion_scale: 2.0,
      expr_motion_scale: 1.0,
      eye_extra_scale: 0.0
    };
    const toNum = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    return {
      offset_x_px: Math.round(toNum(input.offset_x_px ?? input.offsetXPx, base.offset_x_px)),
      offset_y_px: Math.round(toNum(input.offset_y_px ?? input.offsetYPx, base.offset_y_px)),
      head_motion_scale: toNum(input.head_motion_scale ?? input.headMotionScale, base.head_motion_scale),
      expr_motion_scale: toNum(input.expr_motion_scale ?? input.exprMotionScale, base.expr_motion_scale),
      eye_extra_scale: toNum(input.eye_extra_scale ?? input.eyeExtraScale, base.eye_extra_scale)
    };
  },

  persistFaceAlignConfig(faceAlign) {
    try {
      wx.setStorageSync(FACE_ALIGN_STORAGE_KEY, this.sanitizeFaceAlignConfig(faceAlign));
    } catch (e) {
      console.warn('[Example] persist face align failed:', e);
    }
  },

  restoreFaceAlignFromStorage() {
    try {
      const saved = wx.getStorageSync(FACE_ALIGN_STORAGE_KEY);
      if (!saved || typeof saved !== 'object') return;
      this.setData({ faceAlign: this.sanitizeFaceAlignConfig(saved) });
    } catch (e) {
      console.warn('[Example] restore face align failed:', e);
    }
  },

  onFaceAlignSlider(e) {
    const key = e.currentTarget.dataset.key;
    const value = Number(e.detail.value);
    if (!key) return;
    const scaleKeySet = new Set(['head_motion_scale', 'expr_motion_scale', 'eye_extra_scale']);
    const normalized = scaleKeySet.has(key) ? value / 100 : value;
    const nextFaceAlign = this.sanitizeFaceAlignConfig({ ...this.data.faceAlign, [key]: normalized });
    this.setData({ faceAlign: nextFaceAlign });
    this.persistFaceAlignConfig(nextFaceAlign);
    this.applyFaceAlignConfig();
  },

  resetFaceAlign() {
    const faceAlign = this.sanitizeFaceAlignConfig();
    this.setData({ faceAlign });
    this.persistFaceAlignConfig(faceAlign);
    this.applyFaceAlignConfig();
  },

  copyFaceAlignConfig() {
    const text = JSON.stringify({ face_align: this.data.faceAlign }, null, 2);
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '参数已复制', icon: 'success' })
    });
  },

  onImportJsonInput(e) {
    this.setData({ importJsonText: e.detail.value || '' });
  },

  toggleAlignPanel() {
    this.setData({ panelCollapsed: !this.data.panelCollapsed });
  },

  toggleControlsPanel() {
    this.setData({ controlsCollapsed: !this.data.controlsCollapsed });
  },

  importFaceAlignConfig() {
    const rawText = (this.data.importJsonText || '').trim();
    if (!rawText) {
      wx.showToast({ title: '请先粘贴 JSON', icon: 'none' });
      return;
    }
    try {
      const parsed = JSON.parse(rawText);
      const source = (parsed && typeof parsed === 'object' && parsed.face_align)
        ? parsed.face_align
        : parsed;
      const nextFaceAlign = this.sanitizeFaceAlignConfig(source || {});
      this.setData({ faceAlign: nextFaceAlign });
      this.persistFaceAlignConfig(nextFaceAlign);
      this.applyFaceAlignConfig();
      wx.showToast({ title: '导入成功', icon: 'success' });
    } catch (e) {
      console.warn('[Example] import face align failed:', e);
      wx.showToast({ title: 'JSON 格式错误', icon: 'none' });
    }
  }
});
