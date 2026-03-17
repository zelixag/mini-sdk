// pages/index/index.js
const SDK = require('../../xmov-avatar-mp2.js');

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
    volume: 1.0
  },

  // SDK 实例
  avatar: null,
  canvasAdapter: null,

  onLoad() {
    console.log('Page loaded');
  },

  onReady() {
    console.log('Page ready');
  },

  /**
   * 初始化 SDK
   */
  handleInit() {
    if (this.avatar) {
      console.warn('SDK already initialized');
      return;
    }

    console.log('Initializing SDK...');

    // 使用 CanvasAdapter 获取 canvas 节点和 WebGL 上下文
    const canvasAdapter = new SDK.CanvasAdapter({
      canvasId: 'avatar-canvas'
    });

    canvasAdapter.init().then(() => {
      console.log('Canvas adapter initialized');
      console.log('Canvas size:', canvasAdapter.getWidth(), canvasAdapter.getHeight());

      return canvasAdapter.getGL();
    }).then((gl) => {
      if (!gl) {
        console.error('WebGL not available');
        wx.showToast({ title: 'WebGL 不可用', icon: 'none' });
        return;
      }

      console.log('WebGL context:', gl);

      // 创建 SDK 实例
      this.avatar = new SDK.XmovAvatarMP({
        containerId: 'avatar-canvas',
        canvas: canvasAdapter.getCanvas(),
        gl: gl,
        appId: SESSION_CONFIG.appId,
        appSecret: SESSION_CONFIG.appSecret,
        gatewayServer: SESSION_CONFIG.gatewayServer,
        headers: SESSION_CONFIG.headers,
        config: SESSION_CONFIG.config,
        env: 'production',
        enableLogger: true,
        enableDebugger: true,

        // 状态回调
        onStatusChange: (status) => {
          console.log('Status changed:', status);
          this.setData({ status });
        },

        // 消息回调
        onMessage: (error) => {
          console.error('SDK Error:', error);
          wx.showToast({ title: error.message, icon: 'none' });
        },

        // 下载进度
        onDownloadProgress: (progress) => {
          console.log('Download progress:', progress);
        }
      });

      this.canvasAdapter = canvasAdapter;

      // 初始化
      return this.avatar.init({
        initModel: 'normal'
      });
    }).then(() => {
      console.log('SDK initialized');
      this.setData({
        isInitialized: true,
        status: 'inited'
      });
      wx.showToast({ title: '初始化成功', icon: 'success' });
    }).catch((err) => {
      console.error('Init failed:', err);
      wx.showToast({ title: '初始化失败: ' + err.message, icon: 'none' });
    });
  },

  /**
   * 开始渲染
   */
  handleStart() {
    if (!this.avatar) {
      console.warn('SDK not initialized');
      return;
    }

    console.log('Starting...');

    this.avatar.start().then(() => {
      console.log('Started');
      this.setData({
        isPlaying: true,
        sessionId: this.avatar.getSessionId() || ''
      });
      wx.showToast({ title: '已开始', icon: 'success' });
    }).catch((err) => {
      console.error('Start failed:', err);
      wx.showToast({ title: '启动失败', icon: 'none' });
    });
  },

  /**
   * 暂停
   */
  handlePause() {
    if (!this.avatar) return;

    this.avatar.pause();
    this.setData({ isPlaying: false, status: 'paused' });
    wx.showToast({ title: '已暂停', icon: 'none' });
  },

  /**
   * 停止
   */
  async handleStop() {
    if (!this.avatar) return;

    await this.avatar.stop();
    this.setData({
      isPlaying: false,
      status: 'stopped'
    });
    wx.showToast({ title: '已停止', icon: 'none' });
  },

  /**
   * 销毁
   */
  async handleDestroy() {
    if (!this.avatar) return;

    await this.avatar.destroy();
    this.avatar = null;
    this.canvasAdapter = null;

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

    this.avatar.speak(text, true, true, { client_speak_id: Date.now().toString() });

    // 清空输入
    this.setData({ inputText: '' });
  },

  /**
   * 切换到空闲状态
   */
  handleIdle() {
    if (!this.avatar) return;
    this.avatar.idle();
    this.setData({ status: 'idle' });
  },

  /**
   * 切换到倾听状态
   */
  handleListen() {
    if (!this.avatar) return;
    this.avatar.listen();
    this.setData({ status: 'listen' });
  },

  /**
   * 切换到思考状态
   */
  handleThink() {
    if (!this.avatar) return;
    this.avatar.think();
    this.setData({ status: 'think' });
  },

  /**
   * 音量调节
   */
  handleVolumeChange(e) {
    const volume = e.detail.value / 100;
    this.setData({ volume });

    if (this.avatar) {
      this.avatar.setVolume(volume);
    }
  },

  onUnload() {
    // 页面卸载时销毁 SDK
    if (this.avatar) {
      this.avatar.destroy();
      this.avatar = null;
    }
  }
});
