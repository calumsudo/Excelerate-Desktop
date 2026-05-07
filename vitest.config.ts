import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    exclude: ["**/node_modules/**", "**/target/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      include: ["src/services/**/*.ts"],
      exclude: ["src/services/supabase.types.ts"],
    },
  },
  define: {
    global: "window",
    "process.env": "{}",
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://test.supabase.co"),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("test-anon-key"),
    "import.meta.env.MODE": JSON.stringify("test"),
    "import.meta.env.DEV": JSON.stringify(false),
    "import.meta.env.PROD": JSON.stringify(false),
    "import.meta.env.SSR": JSON.stringify(false),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@utils": path.resolve(__dirname, "./src/utils"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@assets": path.resolve(__dirname, "./src/assets"),
      "@pages": path.resolve(__dirname, "./src/pages"),
      "@features": path.resolve(__dirname, "./src/features"),
      "@services": path.resolve(__dirname, "./src/services"),
    },
  },
});
