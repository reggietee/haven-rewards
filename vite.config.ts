import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { apiMiddleware } from "./server/devMiddleware.ts";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
Object.assign(process.env, loadEnv("development", process.cwd(), ""));
export default defineConfig({
  plugins: [
    {
      name: "haven-local-api",
      configureServer(server) {
        server.middlewares.use(apiMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(apiMiddleware);
      },
    },
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["brand/*.png", "brand/*.svg"],
      manifest: {
        name: "Spin Your Way to Haven",
        short_name: "Haven Spin",
        description: "Haven Workspace · NFIH Demo Day 2026",
        theme_color: "#100f20",
        background_color: "#100f20",
        display: "standalone",
        orientation: "landscape",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        inlineWorkboxRuntime: true,
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 3500000,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: false,
      },
    }),
  ],
  build: {
    target: "safari15",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/three/") || id.includes("/@react-three/"))
            return "three";
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/dexie/")
          )
            return "vendor";
        },
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup.ts"] },
});
