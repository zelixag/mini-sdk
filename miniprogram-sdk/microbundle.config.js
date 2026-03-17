/**
 * Microbundle 构建配置 - 小程序 SDK
 * 
 * 说明：使用 microbundle 替代 rollup，与主项目保持一致
 * 
 * 功能：
 * 1. Alias 替换（通过 rollup-plugin-alias）
 * 2. 字符串替换（通过自定义插件）
 * 3. 代码分割（microbundle 不支持，需要 rollup）
 * 4. 代码压缩（microbundle 内置）
 * 5. Source Map 生成（microbundle 内置）
 */

import alias from '@rollup/plugin-alias';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cwd = path.resolve(__dirname);

// Alias 配置
const aliasConfig = [
  // Socket.IO 适配
  {
    find: 'socket.io-client',
    replacement: path.resolve(cwd, 'src/utils/socket-io-adapter.ts')
  },
  {
    find: 'socket.io-client/dist/socket.io.js',
    replacement: path.resolve(cwd, 'src/utils/socket-io-adapter.ts')
  },
  
  // 网络请求适配
  {
    find: '../utils/request',
    replacement: path.resolve(cwd, 'src/utils/request-adapter-wrapper.ts')
  },
  {
    find: './utils/request',
    replacement: path.resolve(cwd, 'src/utils/request-adapter-wrapper.ts')
  },
  {
    find: '../../utils/request',
    replacement: path.resolve(cwd, 'src/utils/request-adapter-wrapper.ts')
  },
  
  // Audio Worklet 适配（小程序不支持）
  {
    find: './AudioWorklet',
    replacement: path.resolve(cwd, 'src/adapters/audio-worklet-adapter.ts')
  },
  {
    find: 'baseRender/AudioWorklet',
    replacement: path.resolve(cwd, 'src/adapters/audio-worklet-adapter.ts')
  },
  {
    find: '../baseRender/AudioWorklet',
    replacement: path.resolve(cwd, 'src/adapters/audio-worklet-adapter.ts')
  }
];

// 字符串替换插件
const replaceGlobals = {
  name: 'replace-globals',
  transform(code, id) {
    // 跳过 node_modules
    if (id.includes('/node_modules/')) {
      return null;
    }
    
    return code
      // window → globalThis
      .replace(/\bwindow\./g, 'globalThis.')
      // document → getDocument()（需要实现 getDocument polyfill）
      .replace(/\bdocument\./g, 'getDocument().')
      // navigator → __navigator（需要实现 navigator polyfill）
      .replace(/\bnavigator\./g, '__navigator.')
      // 移除 Worker 相关（小程序不支持）
      .replace(/new\s+Worker\([^)]+\)/g, 'createWorkerAdapter()');
  }
};

export default {
  input: 'src/index.ts',
  output: {
    format: 'cjs,es',
    name: 'XmovAvatarMP',
    sourcemap: true,
    file: 'dist/xmov-avatar-mp.heavy.js'
  },
  plugins: [
    alias({ entries: aliasConfig }),
    replaceGlobals
  ],
  external: [
    // 小程序全局对象，不打包
    'wx',
    'globalThis'
  ],
  // microbundle 配置
  define: {
    'process.env.NODE_ENV': '"production"'
  }
};
