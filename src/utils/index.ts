// @ts-ignore
const DefineENV = ENV
export function isDEV() {
  return DefineENV === "development";
}
export function isSupportMES() {
  const ua = navigator.userAgent;
  const vendor = navigator.vendor;

  // 检查 userAgent 中是否包含 Chrome
  const hasChrome = /Chrome/.test(ua);

  // 检查 vendor 是否为 Google Inc.
  const isGoogleVendor = /Google Inc/.test(vendor);

  // Edge（基于 Chromium 的新版 Edge 也包含 Chrome 标识）
  const isEdge = /Edg/.test(ua);

  // MediaSource 支持性检查（可选）
  const hasMediaSource = typeof (window as any).MediaSource !== "undefined";

  return hasChrome && (isGoogleVendor || isEdge) && hasMediaSource;
}

export function getStyleStr(styles: Record<string, any>) {
  return Object.entries(styles).map(([key, value]) => {
    // 处理zIndex等数字属性转字符串
    const val = typeof value === 'number' ? value.toString() : value;
    // 驼峰转短横线（如zIndex → z-index）
    const cssKey = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
    return `${cssKey}:${val};`;
  }).join('');
}

export function updateCanvasXOffset(canvas, offset_PX) {
  // 1. 获取当前 transform 样式
  const currentTransform = canvas.style.transform || '';
  
  // 2. 正则匹配现有 translateX 的值（提取数字）
  const translateXRegex = /translateX\((-?\d+(\.\d+)?)px\)/;
  
  // 3. 计算新的偏移量（初始为0，匹配到则取原有值）
  
  // 4. 移除原有 translateX，拼接新值（保留其他 transform 效果）
  const newTransform = currentTransform
    .replace(translateXRegex, '') // 移除旧的 translateX
    .trim() + ` translateX(${offset_PX}px)`; // 添加新的 translateX
  
  // 5. 应用新样式（去除多余空格）
  canvas.style.transform = newTransform.replace(/\s+/g, ' ').trim();
}