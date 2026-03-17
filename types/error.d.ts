/**
 * @file 错误码和类型定义
 */
export declare enum EErrorCode {
    NETWORK_ERROR = 1001,
    REQUEST_TIMEOUT = 1002,
    DATA_PARSE_ERROR = 2001,
    INVALID_DATA_STRUCTURE = 2002,
    DECODING_ERROR = 2003,
    RENDER_ERROR = 3001,
    RESOURCE_MANAGEMENT_ERROR = 4001,
    RESOURCE_NOT_FOUND = 4002,
    RESOURCE_LOAD_ERROR = 4003,
    UNKNOWN_ERROR = 9999
}
export interface SDKError {
    code: EErrorCode;
    message: string;
    timestamp: number;
    originalError?: any;
}
