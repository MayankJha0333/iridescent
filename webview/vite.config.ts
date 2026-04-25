import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/main.tsx",
      output: {
        entryFileNames: "main.js",
        assetFileNames: (info) => (info.name?.endsWith(".css") ? "main.css" : "[name][extname]"),
        format: "iife"
      }
    },
    cssCodeSplit: false,
    minify: true,
    target: "es2022"
  }
});
