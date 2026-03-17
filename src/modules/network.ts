interface NetworkOptions {
  offlineCallback(message?: string): void
  onlineCallback(message?: string): void
  // retryCallback(count: number): Promise<void>
}

export default class NetworkMonitor {
  private TAG = "[NetworkMonitor]";
  static ONLINE = true;
  private readonly options: NetworkOptions;
  private retryCount = 1;
  private retryTimer = -1;
  private bindHandleOnline: () => void;
  private bindHandleOffline: () => void;
  public constructor(options: NetworkOptions) {
    this.options = options;
    this.bindHandleOnline = this._handleOnline.bind(this);
    this.bindHandleOffline = this._handleOffline.bind(this);
    this._initEventListeners();
  }

  private _initEventListeners(): void {
    window.addEventListener('online', this.bindHandleOnline);
    window.addEventListener('offline', this.bindHandleOffline);
  }

  private _handleOnline(): void {
    window.clearTimeout(this.retryTimer)
    NetworkMonitor.ONLINE = true
    this.options.onlineCallback('[NetworkMonitor] 网络已恢复');
  }

  private _handleOffline(): void {
    NetworkMonitor.ONLINE = false
    this.options.offlineCallback('[NetworkMonitor] 网络已断开');
    this._attempt();
  }

  private _attempt(): void {
    let delay = 1000
    if (this.retryCount > 1) {
      delay = Math.pow(2, this.retryCount) * 1000;
    }
    this.retryTimer = window.setTimeout(() => {
      // this.options.retryCallback(this.retryCount)
      //   .then((result) => {
      //     if (result === null) {
      //       this.retryCount += 1;
      //       this._attempt();
      //     } else {
      //       this._handleOnline()
      //     }
      //   })
      //   .catch(() => {
      //     this.retryCount += 1;
      //     this._attempt();
      //   });
    }, delay);
  };

  setState(isOnline: boolean) {
    NetworkMonitor.ONLINE = isOnline;
  }

  destroy() {
    window.removeEventListener('online', this.bindHandleOnline);
    window.removeEventListener('offline', this.bindHandleOffline);
    this.retryTimer = -1;
    this.retryCount = 1;
  }
}