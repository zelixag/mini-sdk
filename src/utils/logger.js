// logger.js - 改进的单例日志系统
let isLoggingEnabled = false;

function executeLog(consoleMethod, ...args) {
  // 边界防护：1. 开关关闭 2. 控制台方法不存在（兼容异常环境）
  if (!isLoggingEnabled || typeof consoleMethod !== 'function') {
    return;
  }
  // 统一拼接前缀，执行原生控制台方法
  consoleMethod( ...args);
}

const sdkLog = {
  log: (...args) => executeLog(console.log, ...args),
  info: (...args) => executeLog(console.info, ...args),
  warn: (...args) => executeLog(console.warn, ...args),
  error: (...args) => executeLog(console.error, ...args)
};


// 对外暴露的配置方法
function setLoggingEnabled(enabled) {
  isLoggingEnabled = enabled;
  // 可选：添加日志说明当前日志状态变化
  if (!enabled) {
    console.log('[AVATAR SDK] version:', VERSION, '日志已禁用');
  } else {
    console.log('[AVATAR SDK] version:', VERSION, '日志已启用');
  }
}

// 定义完整的日志对象
window.avatarSDKLogger = {
  ...sdkLog,
  setEnabled: setLoggingEnabled
};