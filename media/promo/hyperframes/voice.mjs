#!/usr/bin/env node
/**
 * Drop in the recorded phrases and re-render.
 *
 * Put one file per phrase in media/promo/audio/: 01.wav (or .mp3/.m4a/.flac),
 * 02.wav, … 14.wav. For each file found this script:
 *   1. trims leading/trailing silence and normalises loudness (-16 LUFS) into
 *      hyperframes/audio/NN.wav (48 kHz, git-ignored);
 *   2. sets that scene to: lead + phrase length + tail (never below the
 *      scene's visual minimum), so every scene fits its phrase;
 *   3. rebuilds index.html and renders ../rafeeq-promo-ar.mp4 with the voice.
 * Phrases without a file keep their silent slot. The total must stay < 90 s.
 *   node voice.mjs            fit, build and render
 *   node voice.mjs --check    only report the lengths and the total
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const IN = path.resolve(HERE, "../audio")
const OUT = path.join(HERE, "audio")
const require = createRequire(import.meta.url)
const ffmpeg = require("ffmpeg-static")
const ffprobe = require("ffprobe-static").path
const check = process.argv.includes("--check")

const file = path.join(HERE, "scenes.json")
const cfg = JSON.parse(fs.readFileSync(file, "utf8"))
fs.mkdirSync(OUT, { recursive: true })

const seconds = (f) => parseFloat(spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout)
let total = 0
const rows = []
for (const p of cfg.phrases) {
  const src = ["wav", "mp3", "m4a", "flac", "aac"].map((e) => path.join(IN, `${p.id}.${e}`)).find((f) => fs.existsSync(f))
  delete p.duration
  delete p.audio
  if (src) {
    const dst = path.join(OUT, `${p.id}.wav`)
    const trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse"
    const r = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", src, "-af", `${trim},loudnorm=I=-16:TP=-1.5:LRA=11`, "-ar", "48000", "-ac", "1", dst])
    if (r.status !== 0) throw new Error(`ffmpeg could not read ${src}`)
    const len = seconds(dst)
    p.audio = { file: `audio/${p.id}.wav`, seconds: +len.toFixed(3) }
    p.duration = +Math.max(p.min ?? 0, cfg.lead + len + cfg.tail).toFixed(3)
  }
  const d = p.duration ?? p.seconds
  total += d
  rows.push(`${p.id}  ${src ? path.basename(src).padEnd(8) : "(silent)"}  ${p.audio ? p.audio.seconds.toFixed(2).padStart(6) + " s voice" : "".padStart(14)}  scene ${d.toFixed(2)} s`)
}
console.log(rows.join("\n"))
console.log(`total ${total.toFixed(2)} s${total >= 90 ? "  ← over 90 s: re-record the longest phrases a little faster" : ""}`)
if (check) process.exit(total >= 90 ? 1 : 0)
if (total >= 90) process.exit(1)
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n")
const r = spawnSync(process.execPath, [path.join(HERE, "render.mjs")], { cwd: HERE, stdio: "inherit" })
process.exit(r.status ?? 1)
