declare function executeLog(consoleMethod: any, ...args: any[]): void;
declare function setLoggingEnabled(enabled: any): void;
declare let isLoggingEnabled: boolean;
declare namespace sdkLog {
    function log(...args: any[]): void;
    function info(...args: any[]): void;
    function warn(...args: any[]): void;
    function error(...args: any[]): void;
}
