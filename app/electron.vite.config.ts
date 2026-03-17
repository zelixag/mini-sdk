import path from 'node:path'
import process from 'node:process'
import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'electron-vite'
import { loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  const dir = path.resolve(__dirname)
  const env = loadEnv(mode, path.join(dir, 'envs'))
  const isWebBuild = process.argv.includes('web-build')

  return {
    main: {
      build: {
        outDir: isWebBuild
          ? path.resolve(__dirname, 'dist/main')
          : path.resolve(__dirname, 'out/main'),
        rollupOptions: {
          input: {
            index: path.resolve(__dirname, 'electron/main/index.ts'),
          },
        },
      },
      resolve: {
        conditions: command === 'serve' ? ['development', 'default'] : ['production', 'default'],
      },
    },
    preload: {
      build: {
        outDir: isWebBuild
          ? path.resolve(__dirname, 'dist/preload')
          : path.resolve(__dirname, 'out/preload'),
        rollupOptions: {
          input: {
            index: path.resolve(__dirname, 'electron/preload/index.ts'),
            walk: path.resolve(__dirname, 'electron/preload/walk.ts'),
          },
        },
      },
      resolve: {
        conditions: command === 'serve' ? ['development', 'default'] : ['production', 'default'],
      },
    },
    renderer: {
      root: '.',
      base: '/',
      publicDir: path.resolve(__dirname, 'public'),
      envDir: path.resolve(__dirname, 'envs'),

      build: {
        outDir: isWebBuild
          ? path.resolve(__dirname, 'dist')
          : path.resolve(__dirname, 'out/renderer'),
        rollupOptions: {
          input: {
            index: path.resolve(__dirname, 'index.html'),
          },
          output: {
            manualChunks: {
              'vue-vendor': ['vue'],
            },
          },
        },
      },

      define: {
        __IS_BUILD__: command === 'build',
      },

      plugins: [
        Vue(),
      ],

      server: {
        port: 9950,
        host: '0.0.0.0',
        cors: true,
        proxy: {
          [env.VITE_API_BASE]: {
            target: env.VITE_API_PROXY_TARGET,
            changeOrigin: true,
            rewrite: (path: string) => {
              return path.replace(new RegExp(`^${env.VITE_API_BASE}`), '')
            },
          },
        },
      },

      resolve: {
        alias: {
          // 关键配置：指向 dist 目录的 ES 模块入口
          "youling-lite": path.resolve(__dirname, "../dist/index.module.js"),
        },
      },
      optimizeDeps: {
        esbuildOptions: {
          sourcemap: true,
        },
      },
    },
  } as any
})
