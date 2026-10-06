#!/usr/bin/env node
/**
 * PLT-15 success check (manual tool, not run in CI): open Rafeeq once online,
 * then offline, and walk the learner screens; any error screen fails it.
 *
 *   cd frontend && npx vite build && node scripts/offline-smoke.mjs
 *
 * Serves dist/ the way infra/web.nginx.conf does (landing at /, the app under
 * /app/) with a small mock of the public /api answers (no backend, no
 * database, no personal data), so the service worker, its precache and its
 * runtime caches are the real ones. Playwright is NOT a dependency of this
 * repo: point PLAYWRIGHT_DIR at any node_modules that has playwright-core,
 * and CHROME at a Chromium binary.
 *
 * Online: Home, the path and lesson u01-l1 are opened, then the app idles so
 * the background warm-up (app/offline/warmup.ts) runs. The adhkar are never
 * opened online. Offline (context.setOffline): Home, the path, the lesson,
 * prayer times, qibla, the adhkar index and a chapter, saved items, Ask and
 * human help. Exit code 1 if any screen shows an error.
 */
import { createRequire } from "node:module"
import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist")
const PLAYWRIGHT_DIR = process.env.PLAYWRIGHT_DIR ?? "/home/naser/projects/mi/node_modules/"
const CHROME = process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`
const PORT = Number(process.env.PORT ?? 4179)
const { chromium } = createRequire(PLAYWRIGHT_DIR)("playwright-core")

// --- mock of the public API (same for every learner; shapes from the frontend types) ------
const lesson = {
  id: "u01-l1",
  unit: "u01",
  order: 1,
  title: "أتوضأ",
  cards: [
    { id: "c1", kind: "text", text: "الوضوء طهارة بالماء.", image_url: "/api/content/media/u01/wudu.png", quran: { sura: 5, ayat: [6, 6] } },
    { id: "c2", kind: "text", text: "يبدأ الوضوء بالنية." },
  ],
  objectives: [],
  exercises: [],
  approved: true,
  media: { video: "https://d1.islamhouse.com/data/ar/ih_videos/sample.mp4" },
}
const API = {
  "/api/content": { lang: "ar", preview: false, units: [{ id: "u01", order: 1, title: "دليل اليوم الأول", badge_name: "", source_credit: "", lessons: ["u01-l1"], approved: true }], lessons: { "u01-l1": lesson } },
  "/api/scripture/quran": { ayat: [{ aya: 6, arabic: "يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا قُمْتُمْ إِلَى الصَّلَاةِ", translation: null, url: "https://quran.ksu.edu.sa" }], source: { name: "مصحف", translation: null, version: "1" } },
  "/api/practice/adhkar": {
    groups: [{ key: "morning_evening", chapters: [{ id: 27, title: "أذكار الصباح والمساء", approved_count: 1, total: 1 }] }],
    source: { name: "حصن المسلم", url: "https://example.org" },
  },
  "/api/practice/adhkar/27": {
    id: 27,
    group: "morning_evening",
    title: "أذكار الصباح والمساء",
    items: [{ id: "hisn-75", title: "", chapter: 27, segments: [{ t: "text", text: "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ" }], meaning: null, repeat: 1, audio: false }],
    source: { name: "حصن المسلم", url: "https://example.org" },
  },
  "/api/practice/lines": { lines: {} },
  "/api/practice/sightings": { items: [] },
  "/api/glossary": { lang: "ar", terms: [] },
  "/api/discover/cards": {
    lang: "ar",
    total: 1,
    previous: null,
    cards: [{ id: "card-1", order: 1, kind: "benefit", title: "فائدة محفوظة", text: "نص الفائدة", benefits: [], explanation: "", grade: "", attribution: "", source: { name: "s", url: "https://example.org", version: "1" } }],
  },
}
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64")
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" }

async function file(res, p) {
  try {
    if (!(await stat(p)).isFile()) return false
    res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] ?? "application/octet-stream", "Cache-Control": "no-store" })
    res.end(await readFile(p))
    return true
  } catch {
    return false
  }
}

const apiCalls = []
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const p = url.pathname
  if (p.startsWith("/api/")) {
    apiCalls.push(p + url.search)
    if (p.startsWith("/api/content/media/")) return res.writeHead(200, { "Content-Type": "image/png" }).end(PNG)
    const body = API[p]
    res.writeHead(body ? 200 : 404, { "Content-Type": "application/json", "Cache-Control": "no-store" })
    return res.end(JSON.stringify(body ?? { detail: "not found" }))
  }
  if (await file(res, path.join(DIST, path.normalize(p)))) return
  if (p === "/" && (await file(res, path.join(DIST, "landing/index.html")))) return
  if (p.startsWith("/app") && (await file(res, path.join(DIST, "index.html")))) return
  res.writeHead(404).end("not found")
})
await new Promise((ok) => server.listen(PORT, "127.0.0.1", ok))
const BASE = `http://127.0.0.1:${PORT}`

// --- the walk --------------------------------------------------------------------------------
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar" })
await ctx.addInitScript(() => {
  if (localStorage.getItem("rafeeq.device")) return
  const city = { id: "108410", name: { ar: "الرياض", en: "Riyadh" }, country: "SA", lat: 24.6877, lng: 46.7219, tz: "Asia/Riyadh" }
  localStorage.setItem("rafeeq.device", JSON.stringify({ state: { locale: "ar", onboarded: true, city }, version: 1 }))
  localStorage.setItem("rafeeq.saved", JSON.stringify({ state: { items: [{ kind: "card", ref: "card-1", saved_at: "2026-10-06T08:00:00Z" }] }, version: 1 }))
})
// Chromium's offline emulation resets navigator.onLine to true on each new
// document (a real phone in airplane mode reports false), so the walk says
// what the device would.
await ctx.addInitScript(() => {
  if (localStorage.getItem("smoke.offline") === "1") Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false })
})
const page = await ctx.newPage()
const pageErrors = []
page.on("pageerror", (e) => pageErrors.push(e.message))

const ERROR_SIGNS = ["Unexpected Application Error", "ERR_INTERNET_DISCONNECTED", "This site can’t be reached", "No internet"]
async function check(label, url, expect = [], wantNeedsConnection = false) {
  pageErrors.length = 0
  let nav = "ok"
  await page.goto(BASE + url, { waitUntil: "load" }).catch((e) => (nav = e.message.split("\n")[0]))
  await page.waitForTimeout(2500)
  const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "")
  const sign = ERROR_SIGNS.find((s) => text.includes(s))
  const needs = text.includes("تحتاج اتصالًا أول مرة")
  const missing = expect.filter((s) => !text.includes(s))
  const indicator = text.includes("دون اتصال")
  const ok = nav === "ok" && !sign && needs === wantNeedsConnection && text.trim().length > 20 && missing.length === 0
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label.padEnd(26)} ${url.padEnd(28)} ${indicator ? "[indicator]" : "           "} ${
      ok ? "" : JSON.stringify({ nav, sign, needsConnection: needs, missing, chars: text.trim().length, pageErrors })
    }`,
  )
  return ok
}

console.log(`Serving ${DIST} at ${BASE}\n\n-- online, once`)
await page.goto(`${BASE}/app/`, { waitUntil: "load" })
await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
await page.reload({ waitUntil: "load" }) // now controlled by the worker
await page.waitForTimeout(1500)
let pass = true
pass = (await check("home", "/app/")) && pass
pass = (await check("path", "/app/learn")) && pass
pass = (await check("lesson (opened)", "/app/learn/lesson/u01-l1", ["الوضوء طهارة بالماء."])) && pass
await page.waitForTimeout(8000) // background warm-up (starts 3 s after the app opens)
const kept = await page.evaluate(async () => {
  const out = {}
  for (const n of await caches.keys()) out[n] = (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search)
  return out
})
for (const [n, urls] of Object.entries(kept)) if (!n.startsWith("workbox-precache")) console.log(`  cache ${n}: ${urls.join(", ")}`)

console.log("\n-- offline (airplane mode)")
await page.evaluate(() => localStorage.setItem("smoke.offline", "1"))
await ctx.setOffline(true)
const before = apiCalls.length
pass = (await check("home", "/app/")) && pass
pass = (await check("path", "/app/learn")) && pass
pass = (await check("lesson (opened)", "/app/learn/lesson/u01-l1", ["الوضوء طهارة بالماء.", "تنزيل الوحدة"])) && pass
pass = (await check("prayer times", "/app/practice", ["الرياض"])) && pass
pass = (await check("qibla", "/app/practice/qibla")) && pass
pass = (await check("adhkar (never opened)", "/app/practice/adhkar", ["أذكار الصباح والمساء"])) && pass
pass = (await check("adhkar chapter", "/app/practice/adhkar/27", ["أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ"])) && pass
pass = (await check("saved", "/app/discover/saved", ["فائدة محفوظة"])) && pass
pass = (await check("ask (needs network)", "/app/ask", ["السؤال يحتاج إلى اتصال"])) && pass
pass = (await check("human help (helplines)", "/app/mentor/help?from=ask", ["أرقام المساعدة الرسمية", "طلب إنسان يحتاج اتصالًا"])) && pass
// R1 (error): a screen whose code never reached the device (PLT-11 loads some on
// first use). Simulated by dropping the «كل ما في رفيق» chunk from the precache.
const dropped = await page.evaluate(async () => {
  for (const n of await caches.keys()) {
    if (!n.startsWith("workbox-precache")) continue
    const c = await caches.open(n)
    for (const r of await c.keys()) if (/\/assets\/GuideScreen-[^/]+\.js/.test(r.url)) return c.delete(r)
  }
  return false
})
if (dropped) pass = (await check("never-loaded screen", "/app/guide", ["دون اتصال"], true)) && pass
else console.log("SKIP  never-loaded screen (chunk not in precache)")
console.log(`\nrequests reaching the server while offline: ${apiCalls.length - before}`)
console.log(pass ? "\nOFFLINE SMOKE: PASS" : "\nOFFLINE SMOKE: FAIL")

await browser.close()
server.close()
process.exit(pass ? 0 : 1)
