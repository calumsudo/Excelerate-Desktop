import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from 'path';
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    tailwindcss(),
  ],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
    resolve: {
    alias: {
      "@":           path.resolve(__dirname, "./src"),
      "@utils":      path.resolve(__dirname, "./src/utils"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@assets":     path.resolve(__dirname, "./src/assets"),
      "@pages":      path.resolve(__dirname, "./src/pages"),
      "@features":   path.resolve(__dirname, "./src/features"),
      "@service":    path.resolve(__dirname, "./src/service"),
      "@services":   path.resolve(__dirname, "./src/services"),
      "@webdesk":    path.resolve(__dirname, "./src/web")
    },
  },
  define: {
    global: 'window',
    'process.env': {}
  },
  optimizeDeps: {
    include: ['buffer']
  },
}));
