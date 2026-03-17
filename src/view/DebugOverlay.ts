import { EErrorCode, type SDKError } from "../types/error";
import { type ISessionResponse } from "../modules/ResourceManager";
import { formatTimestamp } from "../utils/time";
/**
 * 调试信息浮层
 */
export class DebugOverlay {
  private container: HTMLDivElement | null = null;
  private sdk: any;
  private sessionInfo: ISessionResponse;
  private startTime: number;
  private updateInterval: number | null = null;
  private errors: SDKError[] = [];

  private fps: number = 0;
  // private lastFrameTime: number = performance.now();
  private frameCount: number = 0;
  private lastFpsUpdate: number = performance.now();
  private videoInfo: {name: string, body_id: number, id: number} = {
    name: "",
    body_id: 0,
    id: 0,
  };
  private audioInfo: {
    sf: number;
    ef: number;
    ad: Uint8Array;
  } = {
    sf: 0,
    ef: 0,
    ad: new Uint8Array(),
  };
  private eventInfo: {
    sf: number;
    ef: number;
    event: Array<any>;
  } = {
    sf: 0,
    ef: 0,
    event: [],
  };

  private memoryInfo: {
    jsHeapSizeLimit?: number;
    totalJSHeapSize?: number;
    usedJSHeapSize?: number;
  } = {};

  private perfMetrics: Record<
    string,
    { times: number[]; avg: number; last: number; count: number }
  > = {};

  private currentFrameIndex: number = 0;

  constructor(sdk: any, sessionInfo: ISessionResponse) {
    this.sdk = sdk;
    this.sessionInfo = sessionInfo;
    this.startTime = Date.now();
    this.trackFPS();
    this.trackMemory();
    this.perfMetrics = {};
    this.videoInfo = {
      name: "",
      body_id: 0,
      id: 0,
    };
    this.audioInfo = {
      sf: 0,
      ef: 0,
      ad: new Uint8Array(),
    };
    this.eventInfo = {
      sf: 0,
      ef: 0,
      event: [],
    };
  }

  setAudioInfo(info: { sf: number; ef: number; ad: Uint8Array }) {
    this.audioInfo = info;
  }
  setEventData(info: { sf: number; ef: number; event: Array<any> }) {
    this.eventInfo = info;
  }

  addError(error: SDKError) {
    // 倒序插入，并且超过10条删除最早的数据
    this.errors.unshift(error);
    if (this.errors.length >= 20) {
      this.errors.pop();
    }
    this.update();
  }
  /**
   * 显示浮层
   */
  public show(): void {
    if (this.container) {
      this.container.style.display = "block";
      return;
    }
    this.createOverlay();
    this.updateInterval = window.setInterval(() => this.update(), 20);
    this.update();
  }

  /**
   * 隐藏浮层
   */
  public hide(): void {
    if (this.container) {
      this.container.style.display = "none";
    }
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * 销毁浮层和定时器
   */
  public destroy(): void {
    this.hide();
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
  }

  setVideoInfo(info: any) {
    this.videoInfo = info;
  }

  /**
   * 更新浮层内容
   */
  private update(): void {
    this.sessionInfo.session_id = this.sdk.resourceManager.session_id;
    this.currentFrameIndex =
      this.sdk.renderScheduler.frameAnimationController?.getCurrentFrame() || 0;
    if (!this.container) return;

    // 获取性能数据
    if ((window as any).performanceTracker) {
      const rawMetrics = (window as any).performanceTracker.getVideoMetrics();
      // 统计每项的所有耗时、平均值、最近一次、次数
      for (const [key, value] of Object.entries(rawMetrics)) {
        if (!this.perfMetrics[key]) {
          this.perfMetrics[key] = { times: [], avg: 0, last: 0, count: 0 };
        }
        // 假设 value.time 是本次耗时
        const time =
          typeof value === "object" &&
          value !== null &&
          typeof (value as any).time === "number"
            ? (value as any).time
            : 0;
        this.perfMetrics[key].times.push(time);
        this.perfMetrics[key].last = time;
        this.perfMetrics[key].count += 1;
        this.perfMetrics[key].avg =
          this.perfMetrics[key].times.reduce((a, b) => a + b, 0) /
          this.perfMetrics[key].times.length;
      }
    }

    const sessionDuration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const networkInfo = (navigator as any).connection
      ? `网络类型: ${(navigator as any).connection.effectiveType}；下行网速: ${
          (navigator as any).connection.downlink
        }Mbps；往返延迟: ${(navigator as any).connection.rtt}ms`
      : "N/A";

    this.container.innerHTML = `
      <div style="margin-bottom: 12px;">
        <h3 style="margin: 0 0 8px 0; color: #00ff88; font-size: 14px; font-weight: bold;">🔍 调试信息</h3>
      </div>
      <div style="margin-bottom: 8px;">
        <span style="color: #888; font-size: 11px;">角色look_name:</span>
        <span style="color: #fff; margin-top: 2px; font-size: 11px;">${
          this.sessionInfo.config.look_name
        }</span>
      </div>
      <div style="margin-bottom: 8px;">
        <span style="color: #888; font-size: 11px;">当前视频:</span>
        <span style="color: #fff; margin-top: 2px; font-size: 11px;">${
          this.videoInfo.name
        }</span>
        <span style="color: #fff; margin-top: 2px; font-size: 11px;">-</span>
        <span style="color: #fff; margin-top: 2px; font-size: 11px;">${
          this.videoInfo.body_id
        }</span>
      </div>
      <div style="margin-bottom: 8px;">
        <span style="color: #888; font-size: 11px;">会话 ID:</span>
        <span style="color: #fff; margin-top: 2px; word-break: break-all;">${
          this.sessionInfo.session_id
        }</span>
      </div>
      <div style="margin-bottom: 8px;">
        <span style="color: #888; font-size: 11px;">当前帧:</span>
        <span style="color: #fff; margin-top: 2px; font-size: 11px;">${
          this.currentFrameIndex
        }</span>
      </div>
      <div style="margin-bottom: 8px;">
        <span style="color: #888; font-size: 11px;">下发音频:</span>
        <span style="color: #fff; margin-top: 2px; word-break: break-all;">开始帧: ${
          this.audioInfo.sf
        } / 结束帧: ${this.audioInfo.ef} / 音频长度: ${
      this.audioInfo.ad.length
    }</span>
      </div>
      <div style="margin-bottom: 8px;">
        <span style="color: #888; font-size: 11px;">下发事件:</span>
        <span style="color: #fff; margin-top: 2px; word-break: break-all;">开始帧: ${
          this.eventInfo.sf
        } / 结束帧: ${this.eventInfo.ef} / 事件长度: ${
      this.eventInfo.event.length
    }</span>
      </div>
      <div style="margin-bottom: 8px;">
        <span style="color: #888; font-size: 11px;">性能耗时:</span>
        <div style="color: #fff; font-size: 11px; margin: 0; background: rgba(0,0,0,0.2); border-radius: 4px; padding: 4px;">
          ${this.formatPerfMetrics()}
        </div>
      </div>
      <div style="border-top: 1px solid #444; padding-top: 8px;">
        <h4 style="margin: 0 0 6px 0; color: ${
          this.errors.length > 0 ? "#ff6b6b" : "#888"
        }; font-size: 12px; font-weight: bold;">
          ${this.errors.length > 0 ? "⚠️" : "✅"} 错误日志 (${
      this.errors.length
    })
        </h4>
        <pre style="margin: 0; padding: 6px; background: rgba(255,255,255,0.05); border-radius: 4px; font-size: 10px; line-height: 1.3; color: ${
          this.errors.length > 0 ? "#ff9999" : "#888"
        }; max-height: 120px; overflow-y: auto;">${this.formatErrors(false)}</pre>
        <pre style="margin: 0; padding: 6px; background: rgba(255,255,255,0.05); border-radius: 4px; font-size: 10px; line-height: 1.3; color: ${
          this.errors.length > 0 ? "#ff9999" : "#888"
        }; max-height: 120px; overflow-y: auto;">${this.formatErrors(true)}</pre>
      </div>
      <div style="margin-bottom: 8px;">
        <span style="color: #888; font-size: 11px;">FPS:</span>
        <span style="color: #fff; font-weight: bold; margin-left: 4px;">${
          this.fps
        }</span>
      </div>
      <div style="margin-bottom: 8px;">
        <span style="color: #888; font-size: 11px;">内存占用:</span>
        <div style="color: #fff; margin-top: 2px; font-size: 11px;">
          ${
            this.memoryInfo.jsHeapSizeLimit !== undefined
              ? `
            限制: ${(this.memoryInfo.jsHeapSizeLimit / 1048576).toFixed(
              1
            )} MB<br/>
            总堆: ${(this.memoryInfo.totalJSHeapSize! / 1048576).toFixed(
              1
            )} MB<br/>
            已用: ${(this.memoryInfo.usedJSHeapSize! / 1048576).toFixed(1)} MB
          `
              : "N/A"
          }
        </div>
      </div>
      <div style="margin-bottom: 8px;">
        <span style="color: #888; font-size: 11px;">会话开始时间:</span>
        <div style="color: #fff; margin-top: 2px;">${formatTimestamp(
          this.sessionInfo.session_start_time
        )}</div>
      </div>
      <div style="margin-bottom: 8px;">
        <span style="color: #888; font-size: 11px;">会话时长:</span>
        <div style="color: #00ff88; font-weight: bold; margin-top: 2px;">${sessionDuration}s</div>
      </div>
      <div style="margin-bottom: 12px;">
        <span style="color: #888; font-size: 11px;">网络信息:</span>
        <div style="color: #fff; margin-top: 2px; line-height: 1.4;">${networkInfo}</div>
      </div>
    `;
  }

  private formatErrors(isTtsa: boolean = false): string {
    if (this.errors.length === 0) {
      return "暂无错误";
    }
    let errors = this.errors;
    if (isTtsa) {
      errors = errors.filter((e) => e.code === EErrorCode.TTSA_ERROR);
    } else {
      errors = errors.filter((e) => e.code !== EErrorCode.TTSA_ERROR);
    }
      return errors
        .map(
          (e) =>
            `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.code}: ${
              e.message
            }`
        )
        .join("\n");
  }

  private formatPerfMetrics(): string {
    if (!this.perfMetrics || Object.keys(this.perfMetrics).length === 0) {
      return "暂无数据";
    }
    return Object.entries(this.perfMetrics)
      .map(
        ([key, value]) =>
          `${key}:  最近一次: ${value.last.toFixed(
            2
          )}ms;  平均: ${value.avg.toFixed(2)}ms;  次数: ${value.count}`
      )
      .join("\n");
  }

  private trackFPS() {
    const loop = (now: number) => {
      this.frameCount++;
      if (now - this.lastFpsUpdate >= 1000) {
        this.fps = this.frameCount;
        this.frameCount = 0;
        this.lastFpsUpdate = now;
        this.update();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private trackMemory() {
    if ((window as any).performance && (window as any).performance.memory) {
      setInterval(() => {
        const memory = (window as any).performance.memory;
        this.memoryInfo = {
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          totalJSHeapSize: memory.totalJSHeapSize,
          usedJSHeapSize: memory.usedJSHeapSize,
        };
        this.update();
      }, 1000);
    }
  }

  /**
   * 创建DOM元素
   */
  private createOverlay(): void {
    this.container = document.createElement("div");
    this.container.id = "sdk-debug-overlay";
    this.applyStyles(this.container);
    document.body.appendChild(this.container);
    // 拖拽支持
    this.enableDrag(this.container);
  }

  /**
   * 应用CSS样式
   * @param element
   */
  private applyStyles(element: HTMLElement): void {
    element.style.position = "fixed";
    element.style.bottom = "50px";
    element.style.right = "10px";
    element.style.width = "350px";
    element.style.maxHeight = "400px";
    element.style.overflowY = "auto";
    element.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    element.style.borderRadius = "8px";
    element.style.padding = "10px";
    element.style.zIndex = "99999";
    element.style.fontSize = "12px";
  }

  private enableDrag(element: HTMLElement) {
    let isDragging = false;
    let startX = 0,
      startY = 0,
      startLeft = 0,
      startTop = 0;
    element.style.cursor = "move";
    element.style.left = "unset";
    element.style.top = "unset";
    element.style.right = "10px";
    element.style.bottom = "50px";
    element.style.position = "fixed";
    element.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = element.offsetLeft;
      startTop = element.offsetTop;
      document.body.style.userSelect = "none";
    });
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = `${startLeft + dx}px`;
      element.style.top = `${startTop + dy}px`;
      element.style.right = "unset";
      element.style.bottom = "unset";
    });
    document.addEventListener("mouseup", () => {
      isDragging = false;
      document.body.style.userSelect = "";
    });
  }
}
