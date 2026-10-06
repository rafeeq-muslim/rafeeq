import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { viteSingleFile } from "vite-plugin-singlefile"

// `vite build --mode review` produces one self-contained HTML file of the
// design gallery (see scripts/build-review.mjs). Every other mode builds the
// PWA.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === "review"
      ? [viteSingleFile()]
      : [
          VitePWA({
            strategies: "injectManifest",
            srcDir: "src",
            filename: "sw.ts",
            injectRegister: false,
            manifest: {
              name: "Rafeeq",
              short_name: "Rafeeq",
              description: "A companion for your first year",
              lang: "ar",
              dir: "rtl",
              start_url: "/",
              scope: "/",
              display: "standalone",
              orientation: "portrait",
              background_color: "#1d1645",
              theme_color: "#1d1645",
              icons: [
                { src: "/brand/rafeeq-app-icon-180.png", sizes: "180x180", type: "image/png" },
                { src: "/brand/rafeeq-app-icon-512.png", sizes: "512x512", type: "image/png" },
                { src: "/brand/rafeeq-app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
              ],
            },
            injectManifest: { globPatterns: ["**/*.{js,css,html,svg,woff2,png}"], globIgnores: ["landing/**", "brand/*-1024.png", "assets/App-*.js", "assets/ibm-plex-*", "assets/noto-naskh-*"], maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 },
            devOptions: { enabled: false },
          }),
        ]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build:
    mode === "review"
      ? { outDir: "dist-review", emptyOutDir: true, copyPublicDir: false }
      : { chunkSizeWarningLimit: 900 },
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  // The token contrast test (PLT-04) reads these two stylesheets as text.
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test-setup.ts"],
    testTimeout: 15000,
    css: { include: [/src\/styles\/tokens\.css/, /src\/index\.css/] },
  },
}))
