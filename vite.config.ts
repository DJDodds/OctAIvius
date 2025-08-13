import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: "src/renderer/react",
  base: "./",
  build: {
    outDir: "../../../dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/renderer/react/index.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/renderer/react"),
      "@components": resolve(__dirname, "src/renderer/react/components"),
      "@hooks": resolve(__dirname, "src/renderer/react/hooks"),
      "@styles": resolve(__dirname, "src/renderer/react/styles"),
    },
  },
  server: {
    port: 3000,
  },
});
