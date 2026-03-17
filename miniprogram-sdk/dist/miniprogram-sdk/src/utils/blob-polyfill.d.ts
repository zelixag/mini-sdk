/**
 * Blob Polyfill - 小程序版本（熵减优化）
 * 小程序已支持 Blob，这里只是确保可用性和兼容性
 *
 * 设计原则：
 * 1. 信息密度：单一职责，仅处理 Blob 兼容性
 * 2. 系统秩序：清晰的兼容性检查逻辑
 * 3. 抽象层次：隐藏平台差异
 * 4. 负熵实现：静默处理，避免不必要的警告
 */
export declare const Blob: {
    new (blobParts?: BlobPart[], options?: BlobPropertyBag): Blob;
    prototype: Blob;
} | undefined;
