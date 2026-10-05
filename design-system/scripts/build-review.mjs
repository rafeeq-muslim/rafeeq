// Builds the review HTML of the gallery.
//   npm run build:review
// Outputs:
//   review/rafeeq-design-system.html       committed copy, fallback fonts only
//   dist-review/rafeeq-design-system.html  with Thmanyah: open locally or send (git-ignored)
//   dist-review/artifact.html              with Thmanyah, body-only, for the claude.ai artifact (git-ignored)
// Thmanyah files are inlined from public/fonts/thmanyah/ when present. The
// licence allows bundling the font inside our product page; it forbids
// redistributing the font files, so these outputs stay out of the repo.
import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
execSync("npx vite build --mode review", { cwd: root, stdio: "inherit" })

const out = path.join(root, "dist-review")
let html = readFileSync(path.join(out, "index.html"), "utf8")

// Repo copy (committed): same page without Thmanyah, which may not be
// redistributed. It renders with the fallback fonts (IBM Plex Sans Arabic,
// Noto Naskh Arabic).
const repoCopy = html
  .replace(/@font-face\{[^}]*fonts\/thmanyah\/[^}]*\}/g, "")
  .replace(/<link rel="(?:icon|apple-touch-icon)"[^>]*>\s*/g, "")
mkdirSync(path.join(root, "review"), { recursive: true })
writeFileSync(path.join(root, "review", "rafeeq-design-system.html"), repoCopy)

// Inline Thmanyah (absolute /fonts/thmanyah/… URLs left by the build).
let inlined = 0
html = html.replace(/url\((["']?)\.?\/fonts\/thmanyah\/([^"')]+)\1\)/g, (m, _q, file) => {
  const p = path.join(root, "public", "fonts", "thmanyah", file)
  if (!existsSync(p)) return m
  inlined++
  return `url(data:font/woff2;base64,${readFileSync(p).toString("base64")})`
})
// Drop links to files that are not part of the single file.
html = html.replace(/<link rel="(?:icon|apple-touch-icon)"[^>]*>\s*/g, "")

const full = path.join(out, "rafeeq-design-system.html")
writeFileSync(full, html)
unlinkSync(path.join(out, "index.html"))

// Artifact version: the claude.ai publish step wraps the page in its own
// doctype/head/body, so keep only what goes inside: title, styles, scripts
// and the root element.
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? ""
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? ""
const keep = [
  head.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? "<title>نظام تصميم رفيق</title>",
  `<script>document.documentElement.lang="ar";document.documentElement.dir="rtl";</script>`,
  ...(head.match(/<style[\s\S]*?<\/style>/g) ?? []),
  body,
  ...(head.match(/<script type="module"[\s\S]*?<\/script>/g) ?? []),
].join("\n")
writeFileSync(path.join(out, "artifact.html"), keep)

const mb = (f) => (readFileSync(f).length / 1048576).toFixed(2)
console.log(`Thmanyah faces inlined: ${inlined}`)
console.log(`rafeeq-design-system.html ${mb(full)} MB, artifact.html ${mb(path.join(out, "artifact.html"))} MB`)
console.log(`review/rafeeq-design-system.html (no Thmanyah) ${mb(path.join(root, "review", "rafeeq-design-system.html"))} MB`)
