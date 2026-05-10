import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
