#!/usr/bin/env node
/**
 * Generates index.html (the HyperFrames composition) from scenes.json.
 * Every scene lasts exactly its phrase's length, so swapping in recorded
 * phrases (voice.mjs) re-times the whole video without editing HTML.
 *
 * Fonts: Thmanyah is licensed for bundling in the app only, so it is never
 * committed here. setupFonts() copies it from the git-ignored
 * frontend/public/fonts/thmanyah/ (or $RAFEEQ_THMANYAH_DIR) into the
 * git-ignored ./fonts/; the committed IBM Plex Sans Arabic / Noto Naskh
 * Arabic fallbacks are copied from frontend/public/landing/fonts/.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, "../../..")
const cfg = JSON.parse(fs.readFileSync(path.join(HERE, "scenes.json"), "utf8"))

// ---------- fonts (git-ignored copies) ----------
function setupFonts() {
  const out = path.join(HERE, "fonts")
  fs.mkdirSync(out, { recursive: true })
  const thm = process.env.RAFEEQ_THMANYAH_DIR || path.join(REPO, "frontend/public/fonts/thmanyah")
  const want = ["thmanyahsans-Regular", "thmanyahsans-Medium", "thmanyahsans-Bold", "thmanyahserifdisplay-Bold", "thmanyahserifdisplay-Medium"]
  let thmanyah = true
  for (const f of want) {
    const src = path.join(thm, f + ".woff2")
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, f + ".woff2"))
    else thmanyah = false
  }
  const fb = path.join(REPO, "frontend/public/landing/fonts")
  for (const f of ["plex-arabic-400", "plex-arabic-700", "plex-latin-400", "plex-latin-700", "naskh-arabic", "naskh-latin"]) {
    const src = path.join(fb, f + ".woff2")
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, f + ".woff2"))
  }
  if (!thmanyah) console.warn("build: Thmanyah not found; rendering with IBM Plex Sans Arabic / Noto Naskh Arabic. Set RAFEEQ_THMANYAH_DIR.")
  return thmanyah
}

// ---------- timing ----------
const P = cfg.phrases
let acc = 0
const T = P.map((p) => {
  const d = Math.max(p.min ?? 0, p.duration ?? p.seconds)
  const s = { ...p, start: +acc.toFixed(3), dur: +d.toFixed(3) }
  acc += d
  return s
})
const TOTAL = +acc.toFixed(3)
const at = (id) => T.find((s) => s.scene === id)

// ---------- small helpers ----------
const ICONS = {
  sparkles: '<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6"/>',
  school: '<path d="M22 9l-10 -4l-10 4l10 4l10 -4v6"/><path d="M6 10.6v5.4a6 3 0 0 0 12 0v-5.4"/>',
  message: '<path d="M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1"/>',
  headset: '<path d="M4 14v-3a8 8 0 1 1 16 0v3"/><path d="M18 19c0 1.657 -2.686 3 -6 3"/><path d="M4 14a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2v-3"/><path d="M15 14a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2v-3"/>',
  lock: '<path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6"/><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/><path d="M8 11v-4a4 4 0 1 1 8 0v4"/>',
  compass: '<path d="M8 16l2 -6l6 -2l-2 6l-6 2"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 3l0 2"/><path d="M12 19l0 2"/><path d="M3 12l2 0"/><path d="M19 12l2 0"/>',
  shield: '<path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06"/><path d="M15 19l2 2l4 -4"/>',
  flame: '<path d="M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235"/>',
  rosette: '<path d="M5 7.2a2.2 2.2 0 0 1 2.2 -2.2h1a2.2 2.2 0 0 0 1.55 -.64l.7 -.7a2.2 2.2 0 0 1 3.12 0l.7 .7c.412 .41 .97 .64 1.55 .64h1a2.2 2.2 0 0 1 2.2 2.2v1c0 .58 .23 1.138 .64 1.55l.7 .7a2.2 2.2 0 0 1 0 3.12l-.7 .7a2.2 2.2 0 0 0 -.64 1.55v1a2.2 2.2 0 0 1 -2.2 2.2h-1a2.2 2.2 0 0 0 -1.55 .64l-.7 .7a2.2 2.2 0 0 1 -3.12 0l-.7 -.7a2.2 2.2 0 0 0 -1.55 -.64h-1a2.2 2.2 0 0 1 -2.2 -2.2v-1a2.2 2.2 0 0 0 -.64 -1.55l-.7 -.7a2.2 2.2 0 0 1 0 -3.12l.7 -.7a2.2 2.2 0 0 0 .64 -1.55v-1"/><path d="M9 12l2 2l4 -4"/>',
  book: '<path d="M19 4v16h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12"/><path d="M19 16h-12a2 2 0 0 0 -2 2"/><path d="M9 8h6"/>',
  eyeoff: '<path d="M10.585 10.587a2 2 0 0 0 2.829 2.828"/><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87"/><path d="M3 3l18 18"/>',
  exit: '<path d="M13 12v.01"/><path d="M3 21h18"/><path d="M5 21v-16a2 2 0 0 1 2 -2h7.5m2.5 10.5v7.5"/><path d="M14 7h7m-3 -3l3 3l-3 3"/>',
  download: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 11l5 5l5 -5"/><path d="M12 4l0 12"/>',
  heart: '<path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"/><path d="M12 6l-3.293 3.293a1 1 0 0 0 0 1.414l.543 .543c.69 .69 1.81 .69 2.5 0l1 -1a3.182 3.182 0 0 1 4.5 0l2.25 2.25"/>',
}
const icon = (k, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`

// The logo flower: 12 hollow petals every 30°, tilted 18°, violet/amber (frontend/src/components/rafeeq/brand.tsx).
function flower(id, { stroke = 3.5, mono = null, cls = "" } = {}) {
  const petals = Array.from({ length: 12 }, (_, k) =>
    `<g transform="rotate(${k * 30} 60 60)"><ellipse class="petal" cx="60" cy="32" rx="8" ry="22" transform="rotate(18 60 50)" fill="none" stroke="${mono ?? `url(#${id}${k % 2 ? "a" : "v"})`}" stroke-width="${stroke}" pathLength="100"/></g>`,
  ).join("")
  const defs = mono ? "" : `<defs>
    <linearGradient id="${id}v" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3B2D99"/><stop offset=".55" stop-color="#7A5CE0"/><stop offset="1" stop-color="#C47AD0"/></linearGradient>
    <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC77D"/><stop offset="1" stop-color="#F08A4B"/></linearGradient>
    <radialGradient id="${id}c"><stop offset="0" stop-color="#FFD38F"/><stop offset="1" stop-color="#F5A23A"/></radialGradient></defs>`
  return `<svg id="${id}" class="${cls}" viewBox="0 0 120 120" aria-hidden="true">${defs}${petals}<circle class="core" cx="60" cy="60" r="9" fill="${mono ?? `url(#${id}c)`}"/></svg>`
}

const img = (name, id = "scr-" + name) => `<img class="scr" id="${id}" src="assets/screens/${name}.jpg" alt="">`
const SCREENS = ["welcome", "home-ar", "path", "verse", "order", "order-done", "match", "choose", "wrong", "why", "done", "review", "referral", "danger", "help", "help-2", "practice", "qibla-150", "qibla-175", "qibla-200", "qibla-220", "qibla-235", "qibla-244", "badge", "habits", "privacy", "desk"]

// Kicker (scene label at the top) and callout chips, per scene.
const KICK = {
  languages: { icon: "message", text: "العربية · English · Tagalog" },
  learning: { icon: "school", text: "التعلّم" },
  why: { icon: "sparkles", text: "شرح الخطأ بالذكاء الاصطناعي", ai: true },
  coach: { icon: "sparkles", text: "الموجّه التعليمي والمراجعة", ai: true },
  ask: { icon: "book", text: "اسأل رفيق" },
  verify: { icon: "sparkles", text: "تحقّق من كل جملة", ai: true },
  safety: { icon: "shield", text: "الأمان أولًا" },
  human: { icon: "headset", text: "أريد إنسانًا" },
  practice: { icon: "compass", text: "يومك مسلمًا" },
  motivation: { icon: "flame", text: "التحفيز" },
  privacy: { icon: "lock", text: "الخصوصية" },
  review: { icon: "rosette", text: "المراجعة الشرعية" },
}
// Callout chips. Placed over parts of the screen that carry nothing (the empty
// lower half of exercises, the composer and tab bar), never over content.
// side: left | right | row (rows are centred; chips sharing scene+y share a row).
// [scene, id, text, side, y (px), from, until (fractions of the scene), icon, ai]
const ROW1 = 1376
const ROW2 = 1458
const CHIPS = [
  ["learning", "c-choose", "اختيار", "right", 1210, 0.44, 0.62, "school"],
  ["learning", "c-order", "ترتيب الخطوات", "left", 1210, 0.64, 0.82, "school"],
  ["learning", "c-match", "مطابقة", "right", 1210, 0.84, 1, "school"],
  ["why", "c-nohearts", "بلا قلوب ولا عقوبات", "left", 1060, 0.08, 0.32, "heart"],
  ["why", "c-checked", "يُتحقَّق منه قبل العرض", "right", 1040, 0.42, 1, "sparkles", true],
  ["coach", "c-lesson-only", "من أهداف الدرس الذي أتمّه", "row", 1150, 0.2, 0.56, "sparkles", true],
  ["coach", "c-weak", "يبدأ بالأقل إتقانًا", "row", 1290, 0.62, 1, "sparkles", true],
  ["verify", "c-hadeethenc", "HadeethEnc", "row", ROW1, 0.1, 1, "book"],
  ["verify", "c-quranenc", "QuranEnc", "row", ROW1, 0.17, 1, "book"],
  ["verify", "c-islamqa", "IslamQA", "row", ROW1, 0.24, 1, "book"],
  ["verify", "c-islamhouse", "IslamHouse", "row", ROW2, 0.31, 1, "book"],
  ["verify", "c-binbaz", "binbaz.org.sa", "row", ROW2, 0.38, 1, "book"],
  ["safety", "c-person", "حالتك يجيب عنها إنسان", "row", ROW1, 0.12, 0.48, "headset"],
  ["safety", "c-lines", "أرقام رسمية تعمل دون اتصال", "row", ROW2, 0.58, 1, "shield"],
  ["human", "c-gender", "أخ أم أخت؟ يُسأل مرة واحدة", "row", ROW1, 0.12, 1, "headset"],
  ["human", "c-life", "العمل · السكن · المال · الأسرة", "row", ROW2, 0.5, 1, "heart"],
  ["practice", "c-device", "لا يخرج موقعك من جهازك", "row", ROW1, 0.1, 0.4, "lock"],
  ["practice", "c-qibla", "تدور مع اتجاه هاتفك", "row", ROW2, 0.5, 1, "compass"],
  ["motivation", "c-pause", "السلسلة تتوقف ولا تعود إلى الصفر", "row", ROW1, 0.1, 0.48, "flame"],
  ["motivation", "c-private", "العبادة خاصة بك، بلا مكافأة", "row", ROW2, 0.56, 1, "lock"],
  ["privacy", "c-shift", "خروج سريع: Shift ×3", "row", ROW1, 0.1, 1, "exit"],
  ["privacy", "c-discreet", "وضع خفي", "row", ROW2, 0.28, 1, "eyeoff"],
  ["privacy", "c-copy", "نسخة من بياناتي", "row", ROW2, 0.42, 1, "download"],
  ["review", "c-org", "قريبًا: الانضمام عبر جهة دعوية", "row", ROW2, 0.3, 1, "heart"],
]

// Highlight rings over the phone screen, in screen pixels (390-wide CSS layout).
// [scene, id, box, from, until]
const RINGS = [
  ["why", "r-why", { x: 14, y: 609, w: 304, h: 108 }, 0.4, 1],
  ["coach", "r-guide", { x: 18, y: 419, w: 354, h: 96 }, 0.16, 0.56],
]

// ---------- html ----------
const S = 554 / 390 // phone screen scale
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
const words = (s) => s.split(/\s+/).filter(Boolean).length

function captionClips() {
  let i = 0
  const out = []
  for (const s of T) {
    if (s.scene === "intro" || s.scene === "outro") continue
    const parts = s.caption.split("|").map((x) => x.trim())
    const a = s.start + cfg.lead
    const b = s.start + s.dur - 0.2
    const total = parts.reduce((n, p) => n + words(p), 0)
    let t = a
    parts.forEach((p, k) => {
      const d = k === parts.length - 1 ? b - t : ((b - a) * words(p)) / total
      out.push(`<div id="cap-${s.id}-${k}" class="clip cap" data-start="${t.toFixed(3)}" data-duration="${d.toFixed(3)}" data-track-index="${20 + (i++ % 2)}"><p>${esc(p)}</p></div>`)
      t += d
    })
  }
  return out.join("\n      ")
}

function audioClips() {
  return T.filter((s) => s.audio)
    .map((s, i) => `<audio id="vo-${s.id}" data-start="${(s.start + cfg.lead).toFixed(3)}" data-duration="${s.audio.seconds.toFixed(3)}" data-track-index="${30 + (i % 2)}" src="${s.audio.file}" data-volume="1"></audio>`)
    .join("\n      ")
}

function build() {
  const thmanyah = setupFonts()
  const ff = (name, file, w) => `@font-face{font-family:"${name}";src:url("fonts/${file}.woff2") format("woff2");font-weight:${w};font-display:block}`
  const fonts = [
    thmanyah && ff("Thmanyah Sans", "thmanyahsans-Regular", 400),
    thmanyah && ff("Thmanyah Sans", "thmanyahsans-Medium", 500),
    thmanyah && ff("Thmanyah Sans", "thmanyahsans-Bold", 700),
    thmanyah && ff("Thmanyah Serif Display", "thmanyahserifdisplay-Medium", 500),
    thmanyah && ff("Thmanyah Serif Display", "thmanyahserifdisplay-Bold", 700),
    ff("IBM Plex Sans Arabic", "plex-arabic-400", 400),
    ff("IBM Plex Sans Arabic", "plex-arabic-700", 700),
    ff("IBM Plex Sans Arabic", "plex-latin-400", 400),
    ff("Noto Naskh Arabic", "naskh-arabic", 700),
  ].filter(Boolean).join("\n")

  const kickers = Object.entries(KICK)
    .map(([k, v]) => `<div class="kicker${v.ai ? " ai" : ""}" id="k-${k}">${icon(v.icon)}<span>${esc(v.text)}</span></div>`)
    .join("\n        ")
  const chip = ([, id, text, side, y, , , ic, ai]) =>
    `<div class="chip ${side}${ai ? " ai" : ""}" id="${id}"${side === "row" ? "" : ` style="top:${y}px"`}>${icon(ic)}<span dir="auto">${esc(text)}</span></div>`
  const rows = new Map()
  for (const c of CHIPS.filter((c) => c[3] === "row")) {
    const key = `${c[0]}@${c[4]}`
    if (!rows.has(key)) rows.set(key, [])
    rows.get(key).push(c)
  }
  const chips = [
    ...CHIPS.filter((c) => c[3] !== "row").map(chip),
    ...[...rows.values()].map((cs) => `<div class="chiprow" style="top:${cs[0][4]}px">${cs.map(chip).join("")}</div>`),
  ].join("\n        ")
  const rings = RINGS.map(([, id, r]) => `<div class="ring" id="${id}" style="left:${(r.x * S).toFixed(1)}px;top:${(r.y * S).toFixed(1)}px;width:${(r.w * S).toFixed(1)}px;height:${(r.h * S).toFixed(1)}px"></div>`).join("")

  const html = `<!doctype html>
<!-- GENERATED by build.mjs from scenes.json. Edit those, not this file. -->
<html lang="ar">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${cfg.width}, height=${cfg.height}" />
    <title>رفيق: فيديو تعريفي</title>
    <script src="node_modules/gsap/dist/gsap.min.js"></script>
    <style>
${fonts}
:root{--ink:#1D1645;--deep:#3B2D99;--violet:#5A48D6;--lavender:#7A5CE0;--orchid:#C47AD0;--apricot:#FFC77D;--amber:#F5A23A;--dawn:#F08A4B;--glow:#FFD38F;--mist:#F7F6FB;--v300:#B4A9F5;--v100:#ECE9FF;
  --sans:"Thmanyah Sans","IBM Plex Sans Arabic",sans-serif;--display:"Thmanyah Serif Display","Noto Naskh Arabic",serif}
*{margin:0;padding:0;box-sizing:border-box;letter-spacing:0}
html,body{width:${cfg.width}px;height:${cfg.height}px;overflow:hidden;background:var(--ink);font-family:var(--sans);color:#fff}
#root{position:relative;width:${cfg.width}px;height:${cfg.height}px;overflow:hidden}
/* direction is scoped to text (an rtl <html> renders blank in HyperFrames) */
.kicker,.chip,.cap,#intro-title,#outro h2,#brand{direction:rtl}
.layer{position:absolute;inset:0}
/* night sky: solid ink + localized radial light (no full-frame linear gradient: H.264 banding) */
#sky{background:radial-gradient(ellipse 120% 70% at 50% 18%,#2f2486 0%,rgba(47,36,134,0) 70%),radial-gradient(ellipse 90% 45% at 50% 105%,rgba(122,92,224,.35) 0%,rgba(122,92,224,0) 70%),var(--ink)}
#pattern{opacity:.05}
#halo{position:absolute;width:1500px;height:1500px;left:-210px;top:110px;opacity:.10}
#halo .petal{stroke-width:.8}
/* brand bar */
#brand{position:absolute;top:70px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:18px}
#brand svg{width:78px;height:78px}
#brand img{height:66px}
.kicker{position:absolute;top:196px;left:0;right:0;margin-inline:auto;width:max-content;display:flex;align-items:center;gap:14px;white-space:nowrap;
  padding:14px 30px;border-radius:999px;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.16);font-weight:700;font-size:34px;line-height:44px;opacity:0}
.kicker .ic{width:36px;height:36px;color:var(--apricot)}
.kicker.ai{background:var(--violet);border-color:var(--v300)}
.kicker.ai .ic{color:#fff}
/* phone */
#phone{position:absolute;left:${(cfg.width - 582) / 2}px;top:300px;width:582px;height:1226px;border-radius:66px;background:#0d0a26;padding:14px;
  box-shadow:0 0 0 2px rgba(255,255,255,.14),0 40px 120px rgba(8,5,30,.65),0 0 140px rgba(122,92,224,.25)}
.screen{position:relative;width:554px;height:1198px;border-radius:52px;overflow:hidden;background:var(--mist)}
.scr{position:absolute;left:0;top:0;width:554px;height:1198px;opacity:0}
#ask{position:absolute;inset:0;opacity:0;background:var(--mist)}
#ask-head{position:absolute;top:0;left:0;width:554px;z-index:2}
#ask-body{position:absolute;top:${(222 * S) / 2}px;left:0;width:554px}
#ask-foot{position:absolute;bottom:0;left:0;width:554px;z-index:2}
.ring{position:absolute;border-radius:22px;border:5px solid var(--v300);box-shadow:0 0 0 6px rgba(180,169,245,.25),0 0 40px rgba(122,92,224,.55);opacity:0;z-index:100}
.side{position:absolute;top:520px;width:582px;height:1226px;border-radius:66px;background:#0d0a26;padding:14px;opacity:0;
  box-shadow:0 0 0 2px rgba(255,255,255,.12),0 30px 80px rgba(8,5,30,.6)}
.side img{width:554px;height:1198px;border-radius:52px;display:block}
#side-en{left:-150px;transform:scale(.62) rotate(-8deg)}
#side-tl{left:648px;transform:scale(.62) rotate(8deg)}
/* callout chips */
.chip{position:absolute;display:flex;align-items:center;gap:12px;padding:16px 26px;border-radius:24px;background:#fff;color:var(--ink);font-weight:700;font-size:32px;line-height:42px;
  white-space:nowrap;box-shadow:0 18px 50px rgba(8,5,30,.45);opacity:0;z-index:8}
.chip .ic{width:34px;height:34px;color:var(--violet);flex:none}
.chip.ai{background:var(--violet);color:#fff;box-shadow:0 0 0 2px var(--v300),0 18px 50px rgba(8,5,30,.45)}
.chip.ai .ic{color:#fff}
.chiprow{position:absolute;left:0;right:0;display:flex;justify-content:center;gap:16px;z-index:8;direction:rtl}
.chiprow .chip{position:relative}
.chip.left{left:34px}
.chip.right{right:34px}
/* captions */
#capband{position:absolute;left:0;right:0;bottom:0;height:420px;background:radial-gradient(ellipse 80% 100% at 50% 100%,rgba(13,10,38,.96) 0%,rgba(13,10,38,.85) 55%,rgba(13,10,38,0) 100%)}
.cap{position:absolute;left:70px;right:70px;top:1584px;height:300px;display:flex;align-items:center;justify-content:center;text-align:center;z-index:20}
.cap p{font-weight:500;font-size:50px;line-height:78px;color:#fff;text-wrap:balance;text-shadow:0 2px 16px rgba(13,10,38,.8)}
/* intro / outro */
#intro{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:90px;padding:0 90px}
#intro-flower{width:520px;height:520px}
#intro-title{font-family:var(--display);font-weight:700;font-size:84px;line-height:128px;text-align:center;text-wrap:balance}
#outro{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:44px;opacity:0}
#outro-flower{width:340px;height:340px}
#outro img{height:150px}
#outro h2{font-family:var(--display);font-weight:700;font-size:76px;line-height:116px;text-align:center}
#outro .url{direction:ltr;font-weight:700;font-size:44px;line-height:56px;padding:18px 44px;border-radius:999px;background:var(--violet);box-shadow:0 6px 0 var(--deep)}
#glow{position:absolute;left:50%;top:50%;width:900px;height:900px;margin:-560px 0 0 -450px;border-radius:50%;
  background:radial-gradient(circle,rgba(255,211,143,.42) 0%,rgba(255,211,143,.12) 24%,rgba(255,211,143,0) 46%);opacity:0}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="rafeeq-promo" data-start="0" data-duration="${TOTAL}" data-width="${cfg.width}" data-height="${cfg.height}">
      <div class="layer" id="sky"></div>
      <svg class="layer" id="pattern" aria-hidden="true"><defs><pattern id="pp" width="96" height="96" patternUnits="userSpaceOnUse">
        <g transform="translate(8 8) scale(.27)">${Array.from({ length: 12 }, (_, k) => `<g transform="rotate(${k * 30} 60 60)"><ellipse cx="60" cy="32" rx="8" ry="22" transform="rotate(18 60 50)" fill="none" stroke="#fff" stroke-width="5"/></g>`).join("")}</g>
        <g transform="translate(56 56) scale(.27)">${Array.from({ length: 12 }, (_, k) => `<g transform="rotate(${k * 30} 60 60)"><ellipse cx="60" cy="32" rx="8" ry="22" transform="rotate(18 60 50)" fill="none" stroke="#fff" stroke-width="5"/></g>`).join("")}</g>
      </pattern></defs><rect width="100%" height="100%" fill="url(#pp)"/></svg>
      ${flower("halo", { mono: "#fff", stroke: 0.8 })}
      <div id="glow"></div>

      <div id="intro">
        ${flower("intro-flower")}
        <h1 id="intro-title">${esc(at("intro").caption)}</h1>
      </div>

      <div id="brand" style="opacity:0">${flower("brand-flower", { stroke: 6.2 })}<img src="assets/brand/rafeeq-wordmark-ar-reverse.svg" alt="رفيق"></div>
      <div id="kickers">
        ${kickers}
      </div>

      <div class="side" id="side-en"><img src="assets/screens/home-en.jpg" alt=""></div>
      <div class="side" id="side-tl"><img src="assets/screens/home-tl.jpg" alt=""></div>
      <div id="phone" style="opacity:0"><div class="screen">
        ${SCREENS.map((n) => img(n)).join("\n        ")}
        <div id="ask"><img id="ask-head" src="assets/screens/ask-head.jpg" alt=""><img id="ask-body" src="assets/screens/ask-body.jpg" alt=""><img id="ask-foot" src="assets/screens/ask-foot.jpg" alt=""></div>
        ${rings}
      </div></div>
      <div id="chips">
        ${chips}
      </div>

      <div id="outro">
        ${flower("outro-flower")}
        <img src="assets/brand/rafeeq-wordmark-ar-reverse.svg" alt="رفيق">
        <h2>${esc(at("outro").caption.replace(/^رفيق\s*/, ""))}</h2>
        <div class="url">rafeeq.nan.sa</div>
      </div>

      <div id="capband"></div>
      ${captionClips()}
      ${audioClips()}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      (function () {
        const T = ${JSON.stringify(T.map(({ id, scene, start, dur }) => ({ id, scene, start, dur })))};
        const TOTAL = ${TOTAL};
        const CHIPS = ${JSON.stringify(CHIPS.map(([scene, id, , side, , f, u]) => ({ scene, id, side, f, u })))};
        const RINGS = ${JSON.stringify(RINGS.map(([scene, id, , f, u]) => ({ scene, id, f, u })))};
        const SCALE_ASK = ${S};
        const tl = gsap.timeline({ paused: true });
        const sc = (name) => T.find((s) => s.scene === name);
        const X = 0.4; // cross-fade length between scenes and screens

        // --- persistent ambience: the big halo turns slowly for the whole piece
        tl.fromTo("#halo", { rotation: 0 }, { rotation: 36, duration: TOTAL, ease: "none", transformOrigin: "50% 50%" }, 0);

        // --- phone screen switching (one visible screen at a time)
        // "push" = app navigation in RTL: the new screen slides in from the left over the old one.
        let cur = null;
        let z = 1;
        const screen = (id, t, mode = "push") => {
          if (cur === id) return;
          tl.set(id, { zIndex: z++ }, t);
          if (mode === "fade" || !cur) {
            tl.fromTo(id, { opacity: 0 }, { opacity: 1, duration: mode === "fade" ? 0.14 : X, ease: "power1.out" }, t);
          } else {
            tl.fromTo(id, { opacity: 1, x: -580 }, { x: 0, duration: 0.5, ease: "power3.inOut" }, t);
            tl.to(cur, { x: 170, duration: 0.5, ease: "power3.inOut" }, t);
          }
          if (cur) tl.set(cur, { opacity: 0, x: 0 }, t + (mode === "fade" ? 0.15 : 0.52));
          cur = id;
        };
        const at = (s, f) => s.start + s.dur * f;

        // --- kickers: one per scene, cross-fade at scene change
        let curK = null;
        for (const s of T) {
          const k = document.getElementById("k-" + s.scene);
          if (curK) tl.to(curK, { opacity: 0, y: -10, duration: 0.3, ease: "power1.in" }, s.start);
          if (k) {
            tl.fromTo(k, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, ease: "back.out(1.6)" }, s.start + 0.12);
            curK = k;
          } else curK = null;
        }

        // --- chips: enter at their fraction, leave at the end of their scene
        for (const c of CHIPS) {
          const s = sc(c.scene);
          const from = c.side === "row" ? { opacity: 0, y: 26, scale: 0.92 } : { opacity: 0, x: c.side === "left" ? -60 : 60, scale: 0.92 };
          tl.fromTo("#" + c.id, from, { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.45, ease: "expo.out" }, at(s, c.f));
          tl.to("#" + c.id, { opacity: 0, duration: 0.3, ease: "power1.in" }, c.u >= 1 ? s.start + s.dur - 0.05 : at(s, c.u));
        }
        for (const r of RINGS) {
          const s = sc(r.scene);
          tl.fromTo("#" + r.id, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }, at(s, r.f));
          tl.to("#" + r.id, { opacity: 0, duration: 0.3 }, r.u >= 1 ? s.start + s.dur - 0.1 : at(s, r.u));
        }

        // 01 intro: the logo flower draws itself petal by petal, then the line
        {
          const s = sc("intro");
          tl.fromTo("#intro-flower .petal", { strokeDasharray: 100, strokeDashoffset: 100 }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.out", stagger: 0.07 }, 0.15);
          tl.fromTo("#intro-flower .core", { scale: 0, transformOrigin: "60px 60px" }, { scale: 1, duration: 0.6, ease: "back.out(2)" }, 0.9);
          tl.fromTo("#intro-flower", { rotation: -20, scale: 0.9 }, { rotation: 0, scale: 1, duration: 2.2, ease: "power2.out" }, 0.1);
          tl.fromTo("#intro-title", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, 1.0);
          // transition: the flower flies up into the brand mark
          tl.to("#intro-title", { opacity: 0, y: -30, duration: 0.45, ease: "power2.in" }, s.dur - 0.25);
          tl.to("#intro-flower", { y: -642, scale: 0.15, opacity: 0, duration: 0.7, ease: "power3.inOut" }, s.dur - 0.3);
        }

        // 02 languages: brand, phone rises with the language screen, then Home in three languages
        {
          const s = sc("languages");
          tl.fromTo("#brand", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, s.start + 0.1);
          tl.fromTo("#phone", { opacity: 0, y: 420 }, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out" }, s.start);
          screen("#scr-welcome", s.start);
          screen("#scr-home-ar", at(s, 0.42));
          tl.fromTo("#side-en", { opacity: 0, x: 260 }, { opacity: 1, x: 0, duration: 0.8, ease: "power3.out" }, at(s, 0.5));
          tl.fromTo("#side-tl", { opacity: 0, x: -260 }, { opacity: 1, x: 0, duration: 0.8, ease: "power3.out" }, at(s, 0.56));
          tl.to(["#side-en", "#side-tl"], { opacity: 0, y: 160, duration: 0.5, ease: "power2.in" }, s.start + s.dur - 0.1);
        }
        // 03 learning
        { const s = sc("learning"); screen("#scr-path", s.start); screen("#scr-verse", at(s, 0.22)); screen("#scr-choose", at(s, 0.42)); screen("#scr-order", at(s, 0.62)); screen("#scr-match", at(s, 0.82)); }
        // 04 why: a wrong answer, then the explanation written from the card text
        { const s = sc("why"); screen("#scr-wrong", s.start); screen("#scr-why", at(s, 0.32)); }
        // 05 coach: lesson done with the guide message, then the adaptive review
        { const s = sc("coach"); screen("#scr-done", s.start); screen("#scr-review", at(s, 0.58)); }
        // 06–07 ask: the answer scrolls from the question to its sources
        {
          const s = sc("ask"), v = sc("verify");
          screen("#ask", s.start);
          const view = 1198 - 158 - 213;
          const body = 2860 * SCALE_ASK / 2 * 1; // css px of the tall capture (2x) at phone scale
          tl.fromTo("#ask-body", { y: 0 }, { y: -430, duration: s.dur - 0.6, ease: "power1.inOut" }, s.start + 0.6);
          tl.to("#ask-body", { y: -(body - view - 4), duration: v.dur - 0.9, ease: "power1.inOut" }, v.start + 0.3);
        }
        // 08 safety: referral for a personal case, then the danger panel
        { const s = sc("safety"); screen("#scr-referral", s.start); screen("#scr-danger", at(s, 0.5)); }
        // 09 human
        { const s = sc("human"); screen("#scr-help", s.start); screen("#scr-help-2", at(s, 0.55)); }
        // 10 practice: prayer times, then the compass turning toward the qibla
        {
          const s = sc("practice");
          screen("#scr-practice", s.start);
          const q = ["150", "175", "200", "220", "235", "244"];
          q.forEach((h, i) => screen("#scr-qibla-" + h, at(s, 0.42 + i * 0.075), i ? "fade" : "push"));
        }
        // 11 motivation
        { const s = sc("motivation"); screen("#scr-badge", s.start); screen("#scr-habits", at(s, 0.5)); }
        // 12 privacy
        { const s = sc("privacy"); screen("#scr-privacy", s.start); }
        // 13 review desk
        { const s = sc("review"); screen("#scr-desk", s.start); }
        // 14 outro: the phone sinks, the flower blooms into the logo
        {
          const s = sc("outro");
          tl.to("#phone", { opacity: 0, y: 300, scale: 0.9, duration: 0.6, ease: "power2.in" }, s.start - 0.05);
          tl.to("#brand", { opacity: 0, duration: 0.4 }, s.start);
          tl.to("#outro", { opacity: 1, duration: 0.01 }, s.start + 0.2);
          tl.fromTo("#glow", { opacity: 0, scale: 0.6 }, { opacity: 0.9, scale: 1, duration: 1.4, ease: "power2.out" }, s.start + 0.2);
          tl.fromTo("#outro-flower .petal", { strokeDasharray: 100, strokeDashoffset: 100 }, { strokeDashoffset: 0, duration: 0.9, ease: "power2.out", stagger: 0.05 }, s.start + 0.2);
          tl.fromTo("#outro-flower", { rotation: -30, scale: 0.7 }, { rotation: 0, scale: 1, duration: 1.6, ease: "power3.out" }, s.start + 0.2);
          tl.fromTo("#outro img", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, s.start + 0.8);
          tl.fromTo("#outro h2", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, s.start + 1.1);
          tl.fromTo("#outro .url", { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.8)" }, s.start + 1.5);
          tl.to(["#outro", "#glow"], { opacity: 0, duration: 0.5, ease: "power1.in" }, TOTAL - 0.5);
        }
        // captions fade in
        document.querySelectorAll(".cap").forEach((c) => {
          tl.fromTo(c.querySelector("p"), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" }, parseFloat(c.dataset.start));
        });
        tl.to({}, { duration: TOTAL }, 0); // the timeline fills the whole composition
        window.__timelines["rafeeq-promo"] = tl;
      })();
    </script>
  </body>
</html>
`
  fs.writeFileSync(path.join(HERE, "index.html"), html)
  const meta = { id: "rafeeq-promo", name: "Rafeeq promo (Arabic)", width: cfg.width, height: cfg.height, fps: cfg.fps }
  fs.writeFileSync(path.join(HERE, "meta.json"), JSON.stringify(meta, null, 2) + "\n")
  console.log(`build: index.html, ${T.length} scenes, ${TOTAL.toFixed(2)} s${T.some((s) => s.audio) ? ", with voice" : ", silent slots"}`)
  return TOTAL
}

export { build, T, TOTAL }
if (import.meta.url === `file://${process.argv[1]}`) build()
