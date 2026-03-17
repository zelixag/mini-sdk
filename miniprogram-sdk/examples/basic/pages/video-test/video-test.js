/**
 * 视频渲染测试页
 * 使用 VideoDecoder + getFrameData + texImage2D 将视频帧渲染到 Canvas
 * 
 * 说明：
 * 1. 真机调试：开发者工具不支持 VideoDecoder，需真机预览
 * 2. 视频源：优先使用本地 test 目录， fallback 为网络 URL
 * 3. 无需 ImageBitmap：直接用 getFrameData 的 raw RGBA 做 texImage2D
 */
const VIDEO_SOURCE = {
  // 项目内本地视频（需确认路径格式）
  local: 'test/fuwu_idle_youling01_cut_003.mp4',
  // 备用：网络测试视频
  network: 'https://baikebcs.bdimg.com/baike-other/big-buck-bunny.mp4',
};

Page({
  data: {
    status: '',
  },

  videoDecoder: null,
  gl: null,
  canvas: null,
  texture: null,
  program: null,
  animId: null,
  useLocal: true,

  onLoad() {
    this.setData({ status: '点击「开始渲染」测试' });
  },

  onUnload() {
    this.stopRender();
  },

  async startRender() {
    this.setData({ status: '初始化中...' });

    try {
      const source = await this.getVideoSource();
      if (!source) {
        this.setData({ status: '获取视频源失败' });
        return;
      }

      await this.initWebGL();
      if (!this.gl) {
        this.setData({ status: 'WebGL 初始化失败' });
        return;
      }

      let decoderStarted = false;
      try {
        await this.startDecoder(source);
        decoderStarted = true;
      } catch (e) {
        console.warn('[VideoTest] local path fail, try network:', e);
        const netSource = await this.getVideoSourceFromNetwork();
        await this.startDecoder(netSource);
        decoderStarted = true;
      }
      if (decoderStarted) {
        this.setData({ status: '解码中，渲染中...' });
        this.renderLoop();
      }
    } catch (e) {
      console.error('[VideoTest] startRender error:', e);
      this.setData({ status: '失败: ' + (e.message || e) });
    }
  },

  async getVideoSource() {
    return VIDEO_SOURCE.local;
  },

  async getVideoSourceFromNetwork() {
    const res = await new Promise((resolve, reject) => {
      wx.downloadFile({
        url: VIDEO_SOURCE.network,
        success: resolve,
        fail: reject,
      });
    });
    if (res.statusCode === 200 && res.tempFilePath) {
      return res.tempFilePath;
    }
    return VIDEO_SOURCE.network;
  },

  async initWebGL() {
    return new Promise((resolve) => {
      const query = wx.createSelectorQuery();
      query
        .select('#video-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            resolve(null);
            return;
          }
          const canvas = res[0].node;
          const glOpts = { antialias: true, alpha: false };
          const gl = canvas.getContext('webgl2', glOpts) || canvas.getContext('webgl', glOpts);
          if (!gl) {
            resolve(null);
            return;
          }
          this.gl = gl;
          this.canvas = canvas;
          const dpr = wx.getWindowInfo().pixelRatio || 2;
          canvas.width = res[0].width * dpr;
          canvas.height = res[0].height * dpr;
          gl.viewport(0, 0, canvas.width, canvas.height);
          this.createTexture(gl);
          this.createProgram(gl);
          resolve(gl);
        });
    });
  },

  createTexture(gl) {
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  },

  createProgram(gl) {
    const vs = `attribute vec2 a_pos;attribute vec2 a_uv;varying vec2 v_uv;void main(){gl_Position=vec4(a_pos,0.,1.);v_uv=a_uv;}`;
    const fs = `precision mediump float;uniform sampler2D u_tex;varying vec2 v_uv;void main(){gl_FragColor=texture2D(u_tex,v_uv);}`;
    const vsh = gl.createShader(gl.VERTEX_SHADER);
    const fsh = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vsh, vs);
    gl.shaderSource(fsh, fs);
    gl.compileShader(vsh);
    gl.compileShader(fsh);
    const prog = gl.createProgram();
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    this.program = prog;
  },

  async startDecoder(source) {
    if (!wx.createVideoDecoder) {
      throw new Error('当前环境不支持 createVideoDecoder');
    }
    this.videoDecoder = wx.createVideoDecoder();
    this.videoDecoder.on('start', () => console.log('[VideoTest] decoder start'));
    this.videoDecoder.on('stop', () => console.log('[VideoTest] decoder stop'));
    this.videoDecoder.on('ended', () => {
      console.log('[VideoTest] decoder ended');
      this.setData({ status: '播放结束' });
    });
    this.videoDecoder.on('bufferchange', (e) => console.log('[VideoTest] bufferchange', e));
    await this.videoDecoder.start({ source });
  },

  renderLoop() {
    const gl = this.gl;
    const decoder = this.videoDecoder;
    if (!gl || !decoder) return;

    const frameData = decoder.getFrameData();
    if (frameData && frameData.data && frameData.width && frameData.height) {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        frameData.width,
        frameData.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array(frameData.data)
      );
      gl.bindTexture(gl.TEXTURE_2D, null);

      gl.useProgram(this.program);
      const posLoc = gl.getAttribLocation(this.program, 'a_pos');
      const uvLoc = gl.getAttribLocation(this.program, 'a_uv');
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]),
        gl.STATIC_DRAW
      );
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_tex'), 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // 消费当前帧并推进到下一帧（若存在；微信部分版本需此调用才能逐帧更新）
      if (typeof decoder.seekToNextFrame === 'function') {
        decoder.seekToNextFrame();
      }
    }

    const raf = (this.canvas && this.canvas.requestAnimationFrame) || globalThis.requestAnimationFrame;
    this.animId = raf.call(this.canvas || globalThis, () => this.renderLoop());
  },

  stopRender() {
    if (this.animId) {
      const caf = (this.canvas && this.canvas.cancelAnimationFrame) || globalThis.cancelAnimationFrame;
      (caf || (() => {})).call(this.canvas || globalThis, this.animId);
      this.animId = null;
    }
    if (this.videoDecoder) {
      this.videoDecoder.stop();
      this.videoDecoder.remove?.();
      this.videoDecoder = null;
    }
    this.setData({ status: '已停止' });
  },
});
