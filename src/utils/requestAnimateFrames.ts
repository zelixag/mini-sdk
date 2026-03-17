interface FrameAnimationControllerOptions {
  defaultSpeed?: number;
  frameRate?: number;
  frameCallback?: (frame: number) => void;
}

export default class FrameAnimationController {
  private startTime: number | null; // 新增：开始时间
  private currentFrame: number;
  private speed: number;
  private frameCallback: ((frame: number) => void) | null;
  private isPlaying: boolean;
  private animationId: number | null;
  private frameRate: number; // 新增：帧率

  constructor({
    defaultSpeed = 1,
    frameRate = 24,
    frameCallback,
  }: FrameAnimationControllerOptions = {}) {
    this.startTime = null; // 初始化开始时间为null
    this.currentFrame = 1;
    this.speed = defaultSpeed;
    this.frameCallback = frameCallback || null;
    this.frameRate = frameRate; // 保存帧率

    this.isPlaying = false;
    this.animationId = null;
  }

  get playing() {
    return this.isPlaying;
  }

  // 启动动画
  play(): void {
    if (this.isPlaying) return;

    this.isPlaying = true;

    // 记录开始时间（如果还没有开始时间）
    if (this.startTime === null) {
      this.startTime = performance.now();
    }

    this.animationId = requestAnimationFrame(this._animate.bind(this));
  }

  // 暂停动画
  pause(): void {
    this.isPlaying = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  // 重置动画
  reset(): void {
    this.pause();
    this.startTime = null; // 重置开始时间
    this.currentFrame = 1;
    this._updateFrame();
  }

  // 设置速度
  setSpeed(speed: number): void {
    this.speed = speed;
  }

  // 跳转到指定帧
  gotoFrame(frameNumber: number): void {
    if (frameNumber < 1) frameNumber = 1;

    this.currentFrame = frameNumber;
    this._updateFrame();
  }

  // 下一帧
  nextFrame(): void {
    this.currentFrame++;
    this._updateFrame();
  }

  // 上一帧
  prevFrame(): void {
    this.gotoFrame(this.currentFrame - 1);
  }

  // 清理资源，在组件销毁时调用
  destroy(): void {
    this.pause();
    this.frameCallback = null;
    this.startTime = null;
    this.currentFrame = 1;
    this.speed = 1;
  }

  // 动画循环
  private _animate(timestamp: number): void {
    if (!this.isPlaying) return;

    // 基于开始时间计算当前应该显示的帧数
    if (this.startTime !== null) {
      const elapsedTime = timestamp - this.startTime;
      // 使用1/48秒的计算速率来提高准确度，然后除以2来保持1/24秒的显示速率
      const calculatedFrame =
        Math.floor(
          Math.floor(elapsedTime / (1000 / (this.frameRate * 2))) / 2
        ) + 1;

      // 如果计算出的帧号与当前帧号不同，更新帧号
      if (calculatedFrame !== this.currentFrame) {
        this.currentFrame = calculatedFrame;
        this._updateFrame();
      }
    }

    if (this.isPlaying) {
      this.animationId = requestAnimationFrame(this._animate.bind(this));
    }
  }

  // 更新帧 - 基于时间的帧计算
  private _updateFrame(): void {
    if (this.frameCallback) {
      // 执行帧更新回调
      this.frameCallback(this.currentFrame);
    }
  }

  // 获取当前帧
  getCurrentFrame(): number {
    // 这里不能直接返回this.currentFrame，因为存在用户将游览器置到后台，
    // 游览器会暂停requestAnimationFrame，导致this.currentFrame不更新
    // 这里需要重新计算
    if (this.startTime !== null) {
      const elapsedTime = performance.now() - this.startTime;
      const calculatedFrame =
        Math.floor(
          Math.floor(elapsedTime / (1000 / (this.frameRate * 2))) / 2
        ) + 1;
      return calculatedFrame;
    }
    return this.currentFrame;
  }
}
