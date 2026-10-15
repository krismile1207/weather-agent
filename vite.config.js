import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  build: {
    outDir: "dist",
    // Ant Design 主缓存块约 565KB；业务代码已独立拆分，600KB 阈值更符合该技术栈的基线。
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Ant Design 与 Markdown 体积较大，拆成稳定缓存块以缩短业务代码更新后的下载时间。
        manualChunks(id) {
          if (id.includes("node_modules/antd") || id.includes("node_modules/@ant-design")) return "antd";
          if (id.includes("node_modules/react-markdown") || id.includes("node_modules/remark") || id.includes("node_modules/micromark")) return "markdown";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react";
          return undefined;
        },
      },
    },
  },
});
