import type { MouthSignalFrame } from '../modules/face-signal-adapter';

export interface LipSyncControllerOptions {
  attackRate?: number;
  releaseRate?: number;
  holdFrames?: number;
  minVisibleThreshold?: number;
}

export class LipSyncControllerMP {
  private attackRate: number;
  private releaseRate: number;
  private holdFrames: number;
  private minVisibleThreshold: number;

  private currentOpen = 0;
  private holdLeft = 0;
  private lastFrameIndex = -1;

  constructor(options?: LipSyncControllerOptions) {
    this.attackRate = options?.attackRate ?? 0.58;
    this.releaseRate = options?.releaseRate ?? 0.28;
    this.holdFrames = options?.holdFrames ?? 3;
    this.minVisibleThreshold = options?.minVisibleThreshold ?? 0.03;
  }

  reset(): void {
    this.currentOpen = 0;
    this.holdLeft = 0;
    this.lastFrameIndex = -1;
  }

  update(frameIndex: number, signal: MouthSignalFrame): number {
    const nextFrame = this.lastFrameIndex < 0 || frameIndex > this.lastFrameIndex;
    this.lastFrameIndex = frameIndex;

    const hasSignal = signal.confidence >= 0.2 && signal.mouthOpen > 0;
    if (hasSignal) {
      this.holdLeft = this.holdFrames;
    } else if (nextFrame && this.holdLeft > 0) {
      this.holdLeft--;
    }

    const targetOpen = hasSignal ? signal.mouthOpen : (this.holdLeft > 0 ? this.currentOpen : 0);
    const rate = targetOpen > this.currentOpen ? this.attackRate : this.releaseRate;
    this.currentOpen += (targetOpen - this.currentOpen) * rate;

    if (this.currentOpen < this.minVisibleThreshold) {
      this.currentOpen = 0;
    }
    if (this.currentOpen > 1) {
      this.currentOpen = 1;
    }
    return this.currentOpen;
  }
}

