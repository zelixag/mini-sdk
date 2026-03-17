/**
 * Rollup 构建配置 - 小程序 SDK（熵减优化版）
 * 
 * 功能：
 * 1. Alias 替换（适配器路径）
 * 2. 字符串替换（window/document）
 * 3. 代码分割（确保单文件 < 500KB）
 * 4. 代码压缩（Terser）
 * 5. Source Map 生成
 */

import { defineConfig } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import alias from '@rollup/plugin-alias';
import terser from '@rollup/plugin-terser';
import esbuild from 'rollup-plugin-esbuild';
import path from 'path';
import fs from 'fs';
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
  
  // 网络请求：构建时桥接，主项目 import request 时自动走 adapter（wx.request）
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

// 代码分割配置
const manualChunks = (id) => {
  // 第三方依赖
  if (id.includes('/node_modules/')) {
    if (id.includes('protobuf') || id.includes('msgpack') || id.includes('pako')) {
      return 'vendor';
    }
    return 'vendor';
  }
  
  // SDK 核心
  if (id.includes('/core/') || id.includes('/adapters/')) {
    return 'core';
  }
  
  // 渲染相关
  if (id.includes('/baseRender/') || id.includes('/control/')) {
    return 'offline1';
  }
  
  // 工具类
  if (id.includes('/utils/') || id.includes('/types/')) {
    return 'offline2';
  }
  
  return 'offline';
};

// 直接将 face_data_pb.js 内容注入到 proto-init.ts，避免被 treeshake
const injectFaceDataPb = {
  name: 'inject-face-data-pb',
  transform(code, id) {
    if (id.includes('proto-init') && (id.endsWith('.ts') || id.endsWith('.js'))) {
      const faceDataPbPath = path.resolve(cwd, '../src/proto/face_data_pb.js');
      if (!fs.existsSync(faceDataPbPath)) {
        console.error('[inject-face-data-pb] face_data_pb.js not found:', faceDataPbPath);
        return null;
      }
      let faceDataPbCode = fs.readFileSync(faceDataPbPath, 'utf-8');
      // 去掉 IIFE 包装，直接执行（假设 $protobuf 就是 pb）
      // 原始：(function($protobuf) { ... })(protobuf);
      // 改为：(function($protobuf) { ... })(pb);
      faceDataPbCode = faceDataPbCode.replace(/\}\)\s*\(\s*protobuf\s*\)/g, '})(pb)');
      
      // 替换函数体（更宽松的匹配）
      const injectedCode = code.replace(
        /function executeFaceDataPb\(\)\s*\{[^}]*\}/,
        `function executeFaceDataPb() {\n  ${faceDataPbCode}\n}`
      );
      if (injectedCode === code) {
        console.warn('[inject-face-data-pb] executeFaceDataPb function not found in proto-init');
      } else {
        console.log('[inject-face-data-pb] Successfully injected face_data_pb.js code');
      }
      return injectedCode;
    }
    return null;
  }
};

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

/** 构建结束后拷贝到小程序 demo（build 与 build:watch 都会执行） */
function copyToDemo() {
  return {
    name: 'copy-to-demo',
    writeBundle(options, bundle) {
      const srcFile = path.resolve(cwd, 'dist/xmov-avatar-mp.heavy.js');
      const destDir = path.resolve(cwd, 'examples', 'basic', 'lib');
      const destFile = path.join(destDir, 'xmov-avatar-mp.heavy.js');
      if (fs.existsSync(srcFile)) {
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(srcFile, destFile);
        console.log('[Rollup] Copied SDK to examples/basic/lib/');
      }
    }
  };
}

export default defineConfig({
  input: path.resolve(cwd, 'src/index.ts'),
  output: [
    {
      file: path.resolve(cwd, 'dist/xmov-avatar-mp.heavy.js'),
      format: 'umd',
      name: 'XmovAvatarMP',
      sourcemap: true,
      // UMD 格式不支持代码分割，如果需要分割需要单独处理
      // manualChunks, // UMD 不支持
      globals: {
        wx: 'wx',
        globalThis: 'globalThis'
      },
      // UMD 格式导出配置
      exports: 'named',
      // 确保兼容小程序环境
      amd: {
        id: 'xmov-avatar-mp'
      }
    }
  ],
  plugins: [
    // 使用 esbuild 先剥离 TS 语法，避免 Rollup parser 直接解析 type assertion
    esbuild({
      include: /\.[jt]sx?$/,
      target: 'es2020',
      sourceMap: true,
      tsconfig: path.resolve(cwd, 'tsconfig.json')
    }),
    // Alias 替换（在解析之前）
    alias({ entries: aliasConfig }),
    // 模块解析
    nodeResolve({
      preferBuiltins: false,
      browser: true
    }),
    // 必须在 commonjs 前处理 face_data_pb 原始源码
    injectFaceDataPb,
    // CommonJS 转换
    commonjs(),
    // 字符串替换（在转换之后）
    replaceGlobals,
    // 代码压缩（最后）
    terser({
      compress: {
        drop_console: false, // 保留 console，便于调试
        drop_debugger: true,
        pure_funcs: ['console.debug'] // 移除 console.debug
      },
      format: {
        comments: false
      }
    }),
    copyToDemo()
  ],
  external: [
    // 小程序全局对象，不打包
    'wx',
    'globalThis'
  ],
  treeshake: {
    moduleSideEffects: (id) => {
      // 这两个文件是纯 side-effect 导入（无显式 export 使用），不能被摇树优化掉
      if (id.includes('src/proto/protobuf.min.js')) return true;
      if (id.includes('src/proto/face_data_pb.js')) return true;
      return false;
    }
  }
});
