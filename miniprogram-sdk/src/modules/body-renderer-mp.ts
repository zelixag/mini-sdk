/**
 * 身体渲染器（小程序版）
 *
 * 职责：将 body_data 对应的视频帧渲染到 Canvas
 * 流程：body_data → 视频预加载 → VideoDecoder 解码 → getFrameData → texImage2D → 绘制
 *
 * 对齐 video-test：使用 WebGL + texImage2D（已验证可渲染）
 * 当前：仅身体渲染，不做脸部融合
 */

import type { IRawBodyFrameData } from '../types/frame-data';
import type { ResourceManagerMP } from './resource-manager-adapter';
import type { DataCacheQueueMP } from '../control/DataCacheQueueMP';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('BodyRenderer');

function getWx(): any {
  const g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? (window as any) : null));
  return g?.wx;
}

export interface BodyRendererMPOptions {
  resourceManager: ResourceManagerMP;
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  canvas: any;
  frameRate?: number;
  onMessage?: (msg: string) => void;
}

/** 默认帧率（与主项目一致） */
const DEFAULT_FPS = 24;

export class BodyRendererMP {
  private resourceManager: ResourceManagerMP;
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  private canvas: any;
  private onMessage?: (msg: string) => void;

  private bodyQueue: IRawBodyFrameData[] = [];
  private dataCacheQueue: DataCacheQueueMP | null = null;
  private firstStartTimeMs: number = 0;
  private videoDecoder: any = null;
  private currentVideoName: string = '';
  /** 正在启动中的视频名，避免重复 start */
  private pendingVideoName: string = '';
  /** seek 回退路径下，记录最后一次 seek 到的本地帧 */
  private lastSoughtLocalFrame: number = -1;
  /** 连续取帧失败计数（用于触发补偿 seek） */
  private noFrameCount: number = 0;
  /** 避免重复打印能力探测日志 */
  private decoderCapabilityLogged = false;
  private texture: WebGLTexture | null = null;
  private program: WebGLProgram | null = null;
  private animId: number | null = null;
  private destroyed = false;
  private frameRate: number = DEFAULT_FPS;
  private decoderReady = false;
  private lastDecoderResetAt = 0;
  private decoderRestarting = false;
  private lastDecoderErrorAt = 0;
  private decoderErrorCooldownMs = 300;
  private decoderRestartDebounceMs = 500;
  private decoderDisabledUntil = 0;
  private decoderDisableBackoffMs = 1500;
  /** 口部区域参数（单画布嘴型遮罩） */
  private mouthCenterX = 0.5;
  private mouthCenterY = 0.2;
  private mouthWidth = 0.085;
  private mouthHeightBase = 0.022;
  private mouthHeightOpen = 0.032;
  private mouthStrength = 0.32;
  private mouthMaskEnabled = false;
  private autoTrackMouth = true;
  private trackedMouthCenterX = 0.5;
  private trackedMouthCenterY = 0.2;
  private mouthTrackFrameCounter = 0;

  private isDecoderTaskNotFoundError(error: any): boolean {
    const msg = String(error?.errMsg || error?.message || error || '');
    return msg.includes('task not found') || msg.includes('errCode: 100');
  }

  private resetDecoder(reason: string, error?: any): void {
    const now = Date.now();
    if (now - this.lastDecoderResetAt < 800) return;
    const details = String(error?.errMsg || error?.message || error || '');
    log.warn('decoder reset:', reason, details || '');
    if (this.videoDecoder) {
      try { this.videoDecoder.stop?.(); } catch (_) {}
      try { this.videoDecoder.remove?.(); } catch (_) {}
    }
    this.videoDecoder = null;
    this.decoderReady = false;
    this.lastDecoderResetAt = Date.now();
    this.decoderDisabledUntil = this.lastDecoderResetAt + this.decoderDisableBackoffMs;
    this.currentVideoName = '';
    this.pendingVideoName = '';
    this.lastSoughtLocalFrame = -1;
    this.noFrameCount = 0;
  }

  constructor(options: BodyRendererMPOptions) {
    this.resourceManager = options.resourceManager;
    this.gl = options.gl;
    this.canvas = options.canvas;
    this.frameRate = (options.frameRate && options.frameRate > 0) ? options.frameRate : DEFAULT_FPS;
    this.onMessage = options.onMessage;
  }

  /** 设置首帧时间戳（ms） */
  setFirstStartTime(ms: number): void {
    this.firstStartTimeMs = ms;
  }

  /** 设置渲染帧率（用于时间轴与 seek 计算） */
  setFrameRate(fps: number): void {
    if (Number.isFinite(fps) && fps > 0) this.frameRate = fps;
  }

  /** 设置嘴型遮罩区域参数（便于按角色校准） */
  setMouthRegion(params?: {
    centerX?: number;
    centerY?: number;
    width?: number;
    heightBase?: number;
    heightOpen?: number;
    strength?: number;
    enabled?: boolean;
    autoTrack?: boolean;
  }): void {
    if (!params) return;
    if (typeof params.centerX === 'number') this.mouthCenterX = params.centerX;
    if (typeof params.centerY === 'number') this.mouthCenterY = params.centerY;
    if (typeof params.width === 'number') this.mouthWidth = params.width;
    if (typeof params.heightBase === 'number') this.mouthHeightBase = params.heightBase;
    if (typeof params.heightOpen === 'number') this.mouthHeightOpen = params.heightOpen;
    if (typeof params.strength === 'number') this.mouthStrength = params.strength;
    if (typeof params.enabled === 'boolean') this.mouthMaskEnabled = params.enabled;
    if (typeof params.autoTrack === 'boolean') this.autoTrackMouth = params.autoTrack;
    this.trackedMouthCenterX = this.mouthCenterX;
    this.trackedMouthCenterY = this.mouthCenterY;
  }

  /**
   * 从右半 alpha 区估计头部区域，再推导嘴部锚点。
   * 目的：避免固定口部坐标在不同机型/比例下漂移到额头或胸口。
   */
  private updateTrackedMouthCenter(frameData: any): void {
    if (!this.autoTrackMouth) return;
    const width = frameData?.width | 0;
    const height = frameData?.height | 0;
    if (!width || !height) return;
    this.mouthTrackFrameCounter++;
    // 降低 CPU 负担：每 4 帧更新一次锚点
    if ((this.mouthTrackFrameCounter & 3) !== 0) return;

    const raw = frameData.data;
    const data: Uint8Array = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const halfW = Math.floor(width * 0.5);
    const scanTop = 0;
    const scanBottom = Math.max(scanTop + 1, Math.floor(height * 0.58));
    const stepX = Math.max(1, Math.floor(halfW / 64));
    const stepY = Math.max(1, Math.floor(height / 96));
    const alphaThreshold = 28;

    let minX = width;
    let maxX = halfW;
    let minY = scanBottom;
    let maxY = scanTop;
    let count = 0;

    for (let y = scanTop; y < scanBottom; y += stepY) {
      for (let x = halfW; x < width; x += stepX) {
        const idx = ((y * width + x) << 2);
        const a = data[idx];
        if (a > alphaThreshold) {
          count++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (count < 24 || maxX <= minX || maxY <= minY) return;

    const headW = maxX - minX + 1;
    const headH = maxY - minY + 1;
    // alpha 区是右半屏，映射回 v_uv.x(0~1)
    const alphaCenterX = (minX + maxX) * 0.5;
    const targetX = Math.max(0.25, Math.min(0.75, (alphaCenterX - halfW) / Math.max(1, halfW)));
    const targetY = Math.max(0.1, Math.min(0.45, (minY + headH * 0.74) / Math.max(1, height)));

    // 低通平滑，抑制口部锚点抖动
    this.trackedMouthCenterX = this.trackedMouthCenterX * 0.82 + targetX * 0.18;
    this.trackedMouthCenterY = this.trackedMouthCenterY * 0.82 + targetY * 0.18;
  }

  /** 设置 DataCacheQueue（集成 RenderScheduler 时使用） */
  setDataCacheQueue(queue: DataCacheQueueMP | null): void {
    this.dataCacheQueue = queue;
  }

  /** 追加 body 帧到队列（按 sf 排序，兼容旧版） */
  pushBodyFrames(frames: IRawBodyFrameData[]): void {
    if (!frames?.length) return;
    this.bodyQueue.push(...frames);
    this.bodyQueue.sort((a, b) => a.sf - b.sf);
  }

  /** 获取当前应渲染的帧索引 */
  getCurrentFrameIndex(): number {
    if (!this.firstStartTimeMs) return 0;
    const elapsed = (Date.now() - this.firstStartTimeMs) / 1000;
    return Math.floor(elapsed * this.frameRate);
  }

  /** 根据帧索引找到对应的 body 块（优先 DataCacheQueue） */
  findBodyChunk(frameIndex: number): IRawBodyFrameData | null {
    if (this.dataCacheQueue) return this.dataCacheQueue.findBodyChunk(frameIndex);
    for (const chunk of this.bodyQueue) {
      if (frameIndex >= chunk.sf && frameIndex <= chunk.ef) return chunk;
    }
    return null;
  }

  /** 初始化 WebGL 纹理与着色器（对齐 video-test） */
  private initWebGL(): void {
    if (this.texture) return;
    const gl = this.gl;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const vs = `attribute vec2 a_pos;attribute vec2 a_uv;varying vec2 v_uv;void main(){gl_Position=vec4(a_pos,0.,1.);v_uv=a_uv;}`;
    // 对齐 Web SDK GLPipeline fs_background：body 纹理左右分半
    // 左半(0-0.5): char_color, 右半(0.5-1.0): char_alpha (R=back, R-B=front)
    // body-only 无 mesh 时: final = char_alpha_back * char_color + bg * (1 - char_alpha_back)
    const fs = `precision mediump float;
uniform sampler2D u_tex;
uniform vec3 u_bgColor;
uniform vec2 u_texelSize;
uniform vec4 u_mouth;
uniform float u_mouthOpen;
uniform float u_mouthHeightOpen;
uniform float u_mouthStrength;
uniform float u_mouthEnabled;
varying vec2 v_uv;
void main(){
  vec2 uvColor=vec2(v_uv.x*0.5,v_uv.y);
  vec2 uvAlpha=vec2(v_uv.x*0.5+0.5,v_uv.y);
  vec4 charColor=texture2D(u_tex,uvColor);
  float a0=texture2D(u_tex,uvAlpha).r;
  float a1=texture2D(u_tex,uvAlpha+vec2(u_texelSize.x,0.0)).r;
  float a2=texture2D(u_tex,uvAlpha-vec2(u_texelSize.x,0.0)).r;
  float a3=texture2D(u_tex,uvAlpha+vec2(0.0,u_texelSize.y)).r;
  float a4=texture2D(u_tex,uvAlpha-vec2(0.0,u_texelSize.y)).r;
  float a=a0*0.5+(a1+a2+a3+a4)*0.125;
  a=smoothstep(0.02,0.98,a);
  vec3 rgb=charColor.rgb;
  rgb=rgb*a+u_bgColor*(1.0-a);
  if (u_mouthEnabled > 0.5 && u_mouthOpen > 0.001) {
    float h = u_mouth.w + u_mouthOpen * u_mouthHeightOpen;
    vec2 d = (v_uv - u_mouth.xy) / vec2(u_mouth.z, h);
    float dist = length(d);
    float mask = 1.0 - smoothstep(0.9, 1.0, dist);
    float k = clamp(mask * u_mouthOpen * u_mouthStrength, 0.0, 1.0);
    rgb = mix(rgb, rgb * (1.0 - k), k);
  }
  gl_FragColor=vec4(rgb,1.0);
}`;
    const vsh = gl.createShader(gl.VERTEX_SHADER);
    const fsh = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vsh || !fsh) {
      log.error('createShader failed');
      return;
    }
    gl.shaderSource(vsh, vs);
    gl.shaderSource(fsh, fs);
    gl.compileShader(vsh);
    gl.compileShader(fsh);
    if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
      log.error('VS compile:', gl.getShaderInfoLog(vsh) || '');
    }
    if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
      log.error('FS compile:', gl.getShaderInfoLog(fsh) || '');
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    this.program = prog;
  }

  /** 启动指定视频的解码器 */
  private async startDecoderForVideo(name: string): Promise<boolean> {
    if (Date.now() < this.decoderDisabledUntil) return false;
    if (this.decoderRestarting) return false;
    const wx = getWx();
    if (!wx?.createVideoDecoder) {
      log.warn('当前环境不支持 createVideoDecoder');
      return false;
    }
    const path = this.resourceManager.getCachedVideoPath(name);
    if (!path) {
      log.warn('视频未就绪:', name);
      return false;
    }
    if (this.videoDecoder) {
      try { this.videoDecoder.stop?.(); } catch (_) {}
      try { this.videoDecoder.remove?.(); } catch (_) {}
      this.videoDecoder = null;
    }
    this.decoderRestarting = true;
    this.videoDecoder = wx.createVideoDecoder();
    try {
      await this.videoDecoder.start({ source: path });
      this.currentVideoName = name;
      this.decoderReady = true;
      this.lastSoughtLocalFrame = -1;
      this.noFrameCount = 0;
      this.decoderRestarting = false;
      return true;
    } catch (e) {
      log.error('VideoDecoder 启动失败:', name, e);
      if (this.videoDecoder) {
        try { this.videoDecoder.stop?.(); } catch (_) {}
        try { this.videoDecoder.remove?.(); } catch (_) {}
      }
      this.videoDecoder = null;
      this.decoderReady = false;
      this.currentVideoName = '';
      this.decoderRestarting = false;
      this.decoderDisabledUntil = Date.now() + this.decoderDisableBackoffMs;
      return false;
    }
  }

  /** 渲染一帧（可被 RenderScheduler 外部调用；无 frameIndex 时走内部循环） */
  renderFrame(frameIndex?: number, mouthOpen?: number): void {
    if (this.destroyed || !this.gl || !this.program || !this.texture) return;
    const idx = frameIndex ?? this.getCurrentFrameIndex();
    this._renderOneFrame(idx, frameIndex, mouthOpen);
  }

  /** 内部循环时续接下一帧 */
  private _maybeNextFrame(callerFrameIndex: number | undefined): void {
    if (callerFrameIndex === undefined) this.nextFrame();
  }

  /** 内部：获取当前帧的原始数据（解码但不渲染） */
  getRawFrame(frameIndex: number): { data: ArrayBuffer; width: number; height: number } | null {
    const chunk = this.findBodyChunk(frameIndex);

    if (!chunk) {
      return null;
    }

    if (chunk.n !== this.currentVideoName) {
      if (chunk.n !== this.pendingVideoName) {
        this.pendingVideoName = chunk.n;
        if (!this.resourceManager.getCachedVideoPath(chunk.n)) {
          this.resourceManager.loadVideo(chunk.n).catch(() => {});
        }
        this.startDecoderForVideo(chunk.n)
          .then(() => { this.pendingVideoName = ''; })
          .catch(() => { this.pendingVideoName = ''; });
      }
      return null;
    }

    const decoder = this.videoDecoder;
    if (!decoder || !this.decoderReady) {
      return null;
    }

    const hasSeekToNextFrame = typeof decoder.seekToNextFrame === 'function';
    const hasSeek = typeof decoder.seek === 'function';
    if (!this.decoderCapabilityLogged) {
      this.decoderCapabilityLogged = true;
      log.info('decoder capability seekToNextFrame=' + String(hasSeekToNextFrame) + ', seek=' + String(hasSeek));
    }
    if (!hasSeekToNextFrame && hasSeek) {
      const localFrame = Math.max(0, frameIndex - chunk.sf);
      const drift = this.lastSoughtLocalFrame < 0 ? 999 : (localFrame - this.lastSoughtLocalFrame);
      if (drift < 0 || drift > 4 || this.noFrameCount >= 4) {
        const targetMs = Math.floor((localFrame * 1000) / this.frameRate);
        try {
          decoder.seek(targetMs);
          this.lastSoughtLocalFrame = localFrame;
          this.noFrameCount = 0;
        } catch (e) {
        if (this.isDecoderTaskNotFoundError(e)) {
          const now = Date.now();
          if (now - this.lastDecoderErrorAt >= this.decoderErrorCooldownMs) {
            this.lastDecoderErrorAt = now;
            this.resetDecoder('seek task invalid', e);
            if (chunk?.n && !this.pendingVideoName) {
              this.pendingVideoName = chunk.n;
              setTimeout(() => {
                this.startDecoderForVideo(chunk.n)
                  .then(() => { this.pendingVideoName = ''; })
                  .catch(() => { this.pendingVideoName = ''; });
              }, this.decoderRestartDebounceMs);
            }
          }
            return null;
          }
        }
      }
    }

    let frameData: any = null;
    try {
      frameData = decoder.getFrameData?.();
    } catch (e) {
      const err: any = e;
      if (this.isDecoderTaskNotFoundError(err)) {
        const now = Date.now();
        if (now - this.lastDecoderErrorAt >= this.decoderErrorCooldownMs) {
          this.lastDecoderErrorAt = now;
          this.resetDecoder('getFrameData task invalid', err);
          if (chunk?.n && !this.pendingVideoName) {
            this.pendingVideoName = chunk.n;
            setTimeout(() => {
              this.startDecoderForVideo(chunk.n)
                .then(() => { this.pendingVideoName = ''; })
                .catch(() => { this.pendingVideoName = ''; });
            }, this.decoderRestartDebounceMs);
          }
        }
      } else {
        log.error('getFrameData failed:', err?.errMsg || err?.message || err || '');
      }
      return null;
    }

    if (frameData?.data && frameData?.width && frameData?.height) {
      this.noFrameCount = 0;
      
      // 推进到下一帧
      if (typeof decoder.seekToNextFrame === 'function') {
        try {
          decoder.seekToNextFrame();
        } catch (e) {
          const err: any = e;
          if (this.isDecoderTaskNotFoundError(err)) {
            const now = Date.now();
            if (now - this.lastDecoderErrorAt >= this.decoderErrorCooldownMs) {
              this.lastDecoderErrorAt = now;
              this.resetDecoder('seekToNextFrame task invalid', err);
            }
          } else {
            log.error('seekToNextFrame failed:', err?.errMsg || err?.message || err || '');
          }
        }
      }
      if (!hasSeekToNextFrame) {
        this.lastSoughtLocalFrame = Math.max(0, frameIndex - chunk.sf);
      }

      return {
        data: frameData.data,
        width: frameData.width,
        height: frameData.height
      };
    } else {
      this.noFrameCount++;
      if (typeof decoder.seekToNextFrame === 'function') {
        try { decoder.seekToNextFrame(); } catch (_) {}
      }
      if (this.noFrameCount >= 24) {
        this.resetDecoder('too many empty frames');
      }
      return null;
    }
  }

  /** 内部：渲染单帧逻辑 */
  private _renderOneFrame(frameIndex: number, callerFrameIndex: number | undefined, mouthOpen?: number): void {
    const frameData = this.getRawFrame(frameIndex);

    if (frameData) {
      if (this.mouthMaskEnabled) this.updateTrackedMouthCenter(frameData);
      const gl = this.gl;
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
      const posLoc = gl.getAttribLocation(this.program!, 'a_pos');
      const uvLoc = gl.getAttribLocation(this.program!, 'a_uv');
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
      gl.uniform1i(gl.getUniformLocation(this.program!, 'u_tex'), 0);
      // 背景色：浅灰（对齐 Web SDK 正确效果）
      const bgLoc = gl.getUniformLocation(this.program!, 'u_bgColor');
      if (bgLoc) gl.uniform3f(bgLoc, 0.75, 0.75, 0.75);
      const texelLoc = gl.getUniformLocation(this.program!, 'u_texelSize');
      if (texelLoc) gl.uniform2f(texelLoc, 1 / frameData.width, 1 / frameData.height);
      const mouthLoc = gl.getUniformLocation(this.program!, 'u_mouth');
      if (mouthLoc) {
        const cx = this.autoTrackMouth ? this.trackedMouthCenterX : this.mouthCenterX;
        const cy = this.autoTrackMouth ? this.trackedMouthCenterY : this.mouthCenterY;
        gl.uniform4f(mouthLoc, cx, cy, this.mouthWidth, this.mouthHeightBase);
      }
      const mouthOpenLoc = gl.getUniformLocation(this.program!, 'u_mouthOpen');
      if (mouthOpenLoc) gl.uniform1f(mouthOpenLoc, typeof mouthOpen === 'number' ? mouthOpen : 0);
      const mouthHeightLoc = gl.getUniformLocation(this.program!, 'u_mouthHeightOpen');
      if (mouthHeightLoc) gl.uniform1f(mouthHeightLoc, this.mouthHeightOpen);
      const mouthStrengthLoc = gl.getUniformLocation(this.program!, 'u_mouthStrength');
      if (mouthStrengthLoc) gl.uniform1f(mouthStrengthLoc, this.mouthStrength);
      const mouthEnableLoc = gl.getUniformLocation(this.program!, 'u_mouthEnabled');
      if (mouthEnableLoc) gl.uniform1f(mouthEnableLoc, this.mouthMaskEnabled ? 1 : 0);
      gl.clearColor(0.75, 0.75, 0.75, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } 
    
    this._maybeNextFrame(callerFrameIndex);
  }

  private nextFrame(): void {
    if (this.destroyed) return;
    const raf = (this.canvas?.requestAnimationFrame) || globalThis.requestAnimationFrame;
    this.animId = raf.call(this.canvas || globalThis, () => this.renderFrame());
  }

  /** 初始化 WebGL（供 RenderScheduler 集成时调用） */
  init(): void {
    if (this.destroyed) return;
    this.initWebGL();
  }

  /** 开始渲染循环（独立使用时不走 RenderScheduler） */
  start(): void {
    if (this.destroyed) return;
    this.initWebGL();
    this.nextFrame();
  }

  /** 停止渲染 */
  stop(): void {
    if (this.animId != null) {
      const caf = (this.canvas?.cancelAnimationFrame) || globalThis.cancelAnimationFrame;
      (caf || (() => {})).call(this.canvas || globalThis, this.animId);
      this.animId = null;
    }
    if (this.videoDecoder) {
      this.videoDecoder.stop?.();
      this.videoDecoder.remove?.();
      this.videoDecoder = null;
    }
    this.decoderReady = false;
  }

  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.bodyQueue = [];
    this.texture = null;
    this.program = null;
  }
}
