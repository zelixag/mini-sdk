/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ID?: string;
  readonly VITE_APP_SECRET?: string;
  readonly VITE_GATEWAY_SERVER?: string;
  readonly VITE_DEFAULT_CONFIG?: string; // JSON 字符串格式的默认配置
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  IPC?: any;
  IS_WALK_WINDOW?: boolean;
}