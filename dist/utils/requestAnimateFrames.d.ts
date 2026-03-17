interface FrameAnimationControllerOptions {
    defaultSpeed?: number;
    frameRate?: number;
    frameCallback?: (frame: number) => void;
}
export default class FrameAnimationController {
    private startTime;
    private currentFrame;
    private speed;
    private frameCallback;
    private isPlaying;
    private animationId;
    private frameRate;
    constructor({ defaultSpeed, frameRate, frameCallback, }?: FrameAnimationControllerOptions);
    get playing(): boolean;
    play(): void;
    pause(): void;
    reset(): void;
    setSpeed(speed: number): void;
    gotoFrame(frameNumber: number): void;
    nextFrame(): void;
    prevFrame(): void;
    destroy(): void;
    private _animate;
    private _updateFrame;
    getCurrentFrame(): number;
}
export {};
