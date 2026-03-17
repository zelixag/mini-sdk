interface NetworkOptions {
    offlineCallback(message?: string): void;
    onlineCallback(message?: string): void;
}
export default class NetworkMonitor {
    private TAG;
    static ONLINE: boolean;
    private readonly options;
    private retryCount;
    private retryTimer;
    private bindHandleOnline;
    private bindHandleOffline;
    constructor(options: NetworkOptions);
    private _initEventListeners;
    private _handleOnline;
    private _handleOffline;
    private _attempt;
    setState(isOnline: boolean): void;
    destroy(): void;
}
export {};
