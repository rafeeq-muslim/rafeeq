import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// `vite build --mode review` produces one self-contained HTML file of the
// gallery (scripts, styles, images and fallback fonts inlined) for review
// and for publishing as an artifact. See scripts/build-review.mjs.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "review" ? [viteSingleFile()] : [])],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build:
    mode === "review"
      ? { outDir: "dist-review", emptyOutDir: true, copyPublicDir: false }
      : undefined,
}))
