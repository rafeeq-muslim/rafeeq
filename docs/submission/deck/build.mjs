// Renders src/deck.html to ../rafeeq-deck.pdf (1920x1080 pages) with headless Chromium.
// Usage: node build.mjs <path-to-node_modules-containing-playwright-core> <chrome-executable>
import { createRequire } from "module"
import { readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(process.argv[2] + "/")
const { chromium } = require("playwright-core")
const shots = JSON.parse(readFileSync(join(here, "src/shots.json"), "utf8"))
const fig = (s) => `<div class="shot"><img src="../../screenshots/${s.file}"><span>${s.caption}</span></div>`
let html = readFileSync(join(here, "src/deck.html"), "utf8")
html = html.replace("__SHOTS1__", shots.slide1.map(fig).join("\n")).replace("__SHOTS2__", shots.slide2.map(fig).join("\n"))
const built = join(here, "src/deck.built.html")
writeFileSync(built, html)

const browser = await chromium.launch({ executablePath: process.argv[3], headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto("file://" + built, { waitUntil: "load" })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(500)
await page.pdf({ path: join(here, "../rafeeq-deck.pdf"), width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true })
await browser.close()
console.log("ok")
