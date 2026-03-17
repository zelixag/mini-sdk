/**
 * @file 时间处理工具函数
 */

/**
 * 格式化时间戳字符串为 'YYYY-MM-DD HH:mm:ss' 格式
 * @param timestamp - ISO 格式的时间字符串, e.g., "2025-07-02T15:02:36.391615"
 * @returns 格式化后的时间字符串，如果输入无效则返回 'N/A'
 */
export function formatTimestamp(timestamp: string): string {
  if (!timestamp || typeof timestamp !== 'string') {
    return 'N/A';
  }
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
        return 'Invalid Date';
    }

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    (window as any).avatarSDKLogger.error('Error formatting timestamp:', error);
    return timestamp; // 如果格式化失败，返回原始字符串
  }
} 