import path from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { loadEnv } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    plugins: [vue(), basicSsl()],
    // 动态设置base路径（从环境变量读取）
    base: env.VITE_PUBLIC_PATH || "/",
    server: {
      host: "0.0.0.0",
      cors: true,
      proxy: {
        "^/lite_server": {
          target: "https://test-ttsa-gateway-lite.xmov.ai",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/lite_server/, ""),
        },
      },
    },
    resolve: {
      alias: {
        // 关键配置：指向 dist 目录的 ES 模块入口
        "youling-lite": path.resolve(__dirname, "../dist/index.module.js"),
      },
    },
    build: {
      sourcemap: true,
      outDir: "build",
    },
    optimizeDeps: {
      esbuildOptions: {
        sourcemap: true,
      },
    },
  };
});
