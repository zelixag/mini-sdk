import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import esbuild from 'rollup-plugin-esbuild';
import alias from '@rollup/plugin-alias';
import terser from '@rollup/plugin-terser';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 自定义插件：替换全局变量为小程序兼容版本
 */
function replaceGlobals() {
  return {
    name: 'replace-globals',
    transform(code, id) {
      if (id.includes('node_modules')) return null;
      let transformed = code;
      // window → globalThis
      transformed = transformed.replace(/\bwindow\b/g, 'globalThis');
      // document.createElement 等 → 空操作（小程序无 DOM）
      transformed = transformed.replace(
        /document\.createElement\([^)]*\)/g,
        '({})'
      );
      if (transformed !== code) {
        return { code: transformed, map: null };
      }
      return null;
    },
  };
}

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/xmov-avatar-mp.js',
    format: 'umd',
    name: 'XmovAvatarMP',
    exports: 'named',
    sourcemap: true,
    inlineDynamicImports: true,  // 内联所有动态导入
  },
  plugins: [
    alias({
      entries: [
        { find: '@', replacement: path.resolve(__dirname, 'src') },
      ],
    }),
    esbuild({
      target: 'es2020',
      sourceMap: true,
    }),
    resolve({
      browser: false,
      preferBuiltins: false,
    }),
    commonjs(),
    replaceGlobals(),
    terser({
      compress: {
        drop_console: false,
        passes: 2,
      },
      format: {
        comments: false,
      },
    }),
  ],
  // 内联所有依赖
  external: [],
};
