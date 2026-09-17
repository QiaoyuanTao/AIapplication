import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  //讲前端请求路径以 /api 开头的请求转发到后端的服务器的 http://localhost:7001
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:7001",
        //把请求头里的 Host 字段改成 localhost:7001
        changeOrigin: true,
        //把请求路径中的 /api 去掉
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
