/**
 * Rollup 构建配置 - MiniProgram SDK 2.0
 * 输出 UMD 格式供小程序使用
 */

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import path from 'path';

const cwd = process.cwd();

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
      // document → undefined（小程序没有 document）
      .replace(/\bdocument\./g, '(undefined && undefined.)')
      // navigator → __navigator
      .replace(/\bnavigator\./g, '(typeof navigator !== "undefined" ? navigator.)');
  }
};

export default {
  input: path.resolve(cwd, 'src/index.ts'),
  output: [
    {
      file: path.resolve(cwd, 'dist/xmov-avatar-mp2.js'),
      format: 'umd',
      name: 'XmovAvatarMP',
      sourcemap: true,
      globals: {
        wx: 'wx',
        globalThis: 'globalThis'
      },
      exports: 'named'
    }
  ],
  plugins: [
    resolve({
      preferBuiltins: false,
      browser: true
    }),
    commonjs(),
    typescript({
      tsconfig: path.resolve(cwd, 'tsconfig.json'),
      declaration: false,
      declarationDir: undefined
    }),
    replaceGlobals,
    terser({
      compress: {
        drop_console: false,
        drop_debugger: true
      },
      format: {
        comments: false
      }
    })
  ],
  external: ['wx', 'globalThis'],
  treeshake: {
    moduleSideEffects: false
  }
};
