// pages/index/index.js
const SDK = require('../../lib/xmov-avatar-mp.heavy.js');
const { createCanvasAdapter } = SDK;
const XmovAvatarMP = SDK.XmovAvatarMP || SDK.default;

// 会话配置
const SESSION_CONFIG = {
  gatewayServer: 'https://test-ttsa-gateway-lite.xmov.ai/api/session',
  appId: '3b8f7000b8fd4b4b83dfc680600590b2',
  appSecret: '8b25a33d96684052a6a6e5cc604c2a94',
  headers: {
    Authorization: '888jn'
  },
  config: {
    "auto_ka": true,
    "cleaning_text": true,
    "emotion_version": "v1_version",
    "figure_name": "SCF25_001",
    "framedata_proto_version": 2,
    "init_events": [],
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
    // 状态
    status: 'created',
    sessionId: '',
    isInitialized: false,
    isPlaying: false,

    // 输入
    inputText: '',
    volume: 1.0,

    // UI
    canvasHeight: 60,
    panelCollapsed: false,

    // WebSocket 监控
    wsPanelOpen: false,
    wsStatus: 'disconnected',
    wsStatusText: '未连接',
    wsCounters: { message: 0, send: 0, reconnect: 0 },
    wsLogs: [],
    wsScrollAnchor: ''
  },

  // SDK 实例
  avatar: null,
  canvasNode: null,
  gl: null,

  onLoad() {
    console.log('Page loaded');
  },

  onReady() {
    console.log('Page ready');
  },

  /**
   * 收起/展开控制面板
   */
  togglePanel() {
    this.setData({ panelCollapsed: !this.data.panelCollapsed });
  },

  /**
   * 画布大小调节
   */
  handleCanvasSizeChange(e) {
    const height = e.detail.value;
    this.setData({ canvasHeight: height });
    // 通知 SDK 重建缓冲
    if (this.canvasNode && this.gl) {
      setTimeout(() => {
        const query = this.createSelectorQuery();
        query.select('#avatar-canvas').fields({ node: true, size: true }).exec((res) => {
          if (!res?.[0]) return;
          const dpr = wx.getWindowInfo?.().pixelRatio || 2;
          const w = Math.round((res[0].width || 300) * dpr);
          const h = Math.round((res[0].height || 400) * dpr);
          if (this.canvasNode) {
            this.canvasNode.width = w;
            this.canvasNode.height = h;
            this.gl.viewport(0, 0, w, h);
            this.avatar?.setCanvasSize?.(w, h);
          }
        });
      }, 100);
    }
  },

  /**
   * 获取 Canvas 节点和 WebGL 上下文
   */
  initWebGL() {
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
          const glOpts = { antialias: true, alpha: false };
          const gl = canvas.getContext('webgl2', glOpts) || canvas.getContext('webgl', glOpts);
          if (!gl) {
            resolve({ canvasNode: null, gl: null });
            return;
          }
          const dpr = wx.getWindowInfo?.().pixelRatio || 2;
          const layoutW = res[0].width || 300;
          const layoutH = res[0].height || 400;
          canvas.width = Math.round(layoutW * dpr);
          canvas.height = Math.round(layoutH * dpr);
          gl.viewport(0, 0, canvas.width, canvas.height);
          resolve({ canvasNode: canvas, gl });
        });
    });
  },

  /**
   * 初始化 SDK
   */
  async handleInit() {
    if (this.avatar) {
      console.warn('SDK already initialized');
      return;
    }

    console.log('Initializing SDK...');

    // 1. 获取 WebGL 上下文
    const { canvasNode, gl } = await this.initWebGL();
    if (!gl || !canvasNode) {
      wx.showToast({ title: 'WebGL 初始化失败', icon: 'none' });
      return;
    }
    this.canvasNode = canvasNode;
    this.gl = gl;
    console.log('WebGL context created');

    // 2. 创建 SDK 实例
    this.avatar = new XmovAvatarMP({
      canvas: canvasNode,
      gl,
      enableLogger: true,
      appId: SESSION_CONFIG.appId,
      appSecret: SESSION_CONFIG.appSecret,
      gatewayServer: SESSION_CONFIG.gatewayServer,
      headers: SESSION_CONFIG.headers,
      config: SESSION_CONFIG.config,
      onStatusChange: (status) => {
        console.log('Status changed:', status);
        this.setData({ status });
        if (status === 'playing') this.setData({ isPlaying: true });
        if (status === 'stopped' || status === 'paused') this.setData({ isPlaying: false });
      },
      onMessage: (msg) => {
        if (msg.code < 0) {
          console.error('SDK ERROR:', msg.code, msg.message, msg.details);
        } else {
          console.log('SDK msg:', msg.code, msg.message);
        }
        // WS 监控：连接状态
        const m = msg.message || '';
        if (m.includes('TTSA reconnected')) {
          this.updateWsStatus('connected', '已重连');
          this.wsCounterInc('reconnect');
          this.addWsLog('conn', '重连成功');
        } else if (m.includes('TTSA disconnected')) {
          this.updateWsStatus('disconnected', '已断开');
          this.addWsLog('err', '连接断开: ' + (msg.details || ''));
        } else if (m.includes('connect_error')) {
          this.updateWsStatus('disconnected', '连接错误');
          this.addWsLog('err', '连接错误: ' + (msg.details || ''));
        }
      },
      onTtsaReady: (e) => {
        console.log('TTSA ready:', e);
        this.updateWsStatus('connected', '已连接');
        this.addWsLog('conn', 'TTSA 连接就绪');
        wx.showToast({ title: 'TTSA 已连接', icon: 'success', duration: 1500 });
      },
      onFaceData: (data) => {
        const count = Array.isArray(data) ? data.length : 0;
        this.wsCounterInc('message');
        this.addWsLog('face', 'face_data x' + count + (data?.[0] ? ' sf=' + data[0].sf : ''));
      },
      onBodyData: (data) => {
        const count = Array.isArray(data) ? data.length : 0;
        this.wsCounterInc('message');
        this.addWsLog('body', 'body_data x' + count + (data?.[0]?.n ? ' ' + data[0].n : ''));
      },
      onTtsAudio: (frames) => {
        const first = Array.isArray(frames) ? frames[0] : frames;
        this.wsCounterInc('message');
        this.addWsLog('audio', 'tts_audio sid=' + (first?.sid ?? '?'));
      },
      onEventData: (events) => {
        this.wsCounterInc('message');
        for (const frame of events || []) {
          for (const item of (frame.e || [])) {
            this.addWsLog('event', item.type + (item.text ? ': ' + item.text : ''));
          }
        }
      }
    });

    await this.avatar.init?.();

    this.setData({
      isInitialized: true,
      status: 'inited'
    });
    console.log('SDK initialized');
    wx.showToast({ title: '初始化成功', icon: 'success' });
  },

  /**
   * 开始渲染
   */
  async handleStart() {
    if (!this.avatar) {
      console.warn('SDK not initialized');
      return;
    }

    console.log('Starting...');
    const ok = await this.avatar.start?.();
    if (!ok) {
      wx.showToast({ title: 'start 失败', icon: 'none' });
      return;
    }

    this.setData({
      isPlaying: true,
      sessionId: this.avatar.getSessionId?.() || ''
    });
    wx.showToast({ title: '已开始', icon: 'success' });
  },

  /**
   * 暂停渲染
   */
  handlePause() {
    if (!this.avatar) return;
    this.avatar.pause?.();
    this.setData({ isPlaying: false, status: 'paused' });
    wx.showToast({ title: '已暂停', icon: 'none' });
  },

  /**
   * 停止
   */
  async handleStop() {
    if (!this.avatar) return;
    await this.avatar.stop?.();
    this.setData({ isPlaying: false, status: 'stopped' });
    wx.showToast({ title: '已停止', icon: 'none' });
  },

  /**
   * 销毁
   */
  async handleDestroy() {
    if (!this.avatar) return;
    this.avatar.destroy?.();
    this.avatar = null;
    this.setData({
      isInitialized: false,
      isPlaying: false,
      status: 'destroyed',
      sessionId: ''
    });
    wx.showToast({ title: '已销毁', icon: 'none' });
  },

  /**
   * 输入文本
   */
  handleInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  /**
   * 发送文本
   */
  handleSpeak() {
    if (!this.avatar || !this.data.inputText) return;

    const text = this.data.inputText;
    console.log('Speaking:', text);
    this.wsCounterInc('send');
    this.addWsLog('send', 'speak: ' + text);
    const speakId = this.avatar.speak(text);

    if (speakId) {
      wx.showToast({ title: '发送成功', icon: 'none', duration: 1500 });
    } else {
      this.addWsLog('err', 'speak 失败，socket 未连接');
      wx.showToast({ title: 'speak 失败', icon: 'none' });
    }
    this.setData({ inputText: '' });
  },

  /**
   * 切换到空闲状态
   */
  handleIdle() {
    if (!this.avatar) return;
    this.avatar.idle?.();
    this.setData({ status: 'idle' });
  },

  /**
   * 切换到倾听状态
   */
  handleListen() {
    if (!this.avatar) return;
    this.avatar.listen?.();
    this.setData({ status: 'listen' });
  },

  /**
   * 切换到思考状态
   */
  handleThink() {
    if (!this.avatar) return;
    this.avatar.think?.();
    this.setData({ status: 'think' });
  },

  /**
   * 音量调节
   */
  handleVolumeChange(e) {
    const volume = e.detail.value / 100;
    this.setData({ volume });
    if (this.avatar) {
      this.avatar.setVolume?.(volume);
    }
  },

  handleTouchStart() {},
  handleTouchEnd() {},

  // ========== WebSocket 监控 ==========

  _wsLogId: 0,

  toggleWsPanel() {
    this.setData({ wsPanelOpen: !this.data.wsPanelOpen });
  },

  _stamp() {
    const t = new Date();
    return `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}:${String(t.getSeconds()).padStart(2,'0')}.${String(t.getMilliseconds()).padStart(3,'0')}`;
  },

  addWsLog(tag, msg) {
    const id = ++this._wsLogId;
    const item = { id, time: this._stamp(), tag, msg };
    const logs = [item, ...this.data.wsLogs].slice(0, 150);
    this.setData({
      wsLogs: logs,
      wsScrollAnchor: 'ws-' + id
    });
  },

  updateWsStatus(status, text) {
    this.setData({ wsStatus: status, wsStatusText: text });
  },

  wsCounterInc(key) {
    const counters = { ...this.data.wsCounters };
    counters[key] = (counters[key] || 0) + 1;
    this.setData({ wsCounters: counters });
  },

  clearWsLogs() {
    this.setData({
      wsLogs: [],
      wsCounters: { message: 0, send: 0, reconnect: 0 }
    });
  },

  onUnload() {
    if (this.avatar) {
      this.avatar.destroy?.();
      this.avatar = null;
    }
  }
});
