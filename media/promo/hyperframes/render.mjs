#!/usr/bin/env node
/**
 * Build the composition, render it with HyperFrames, then encode the
 * deliverable: ../rafeeq-promo-ar.mp4 (H.264, yuv420p, faststart) and
 * ../rafeeq-promo-poster.png. Uses the npm-provided static ffmpeg/ffprobe,
 * so nothing has to be installed system-wide.
 *   node render.mjs            final quality
 *   node render.mjs --draft    fast draft (renders/draft.mp4 only)
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { build } from "./build.mjs"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const ffmpeg = require("ffmpeg-static")
const ffprobe = require("ffprobe-static").path
const env = { ...process.env, PATH: [path.dirname(ffmpeg), path.dirname(ffprobe), process.env.PATH].join(path.delimiter) }
const draft = process.argv.includes("--draft")

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: HERE, env, stdio: "inherit" })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`)
}

const total = build()
if (total >= 90) throw new Error(`The cut is ${total.toFixed(2)} s; it must stay under 90 s. Shorten scenes in scenes.json or re-record faster.`)
fs.mkdirSync(path.join(HERE, "renders"), { recursive: true })
const raw = path.join("renders", draft ? "draft.mp4" : "raw.mp4")
run("npx", ["hyperframes", "render", "--quality", draft ? "draft" : "high", "--fps", "30", "--output", raw])
if (draft) process.exit(0)

const hasAudio = spawnSync(ffprobe, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", raw], { encoding: "utf8" }).stdout.trim() !== ""
const out = path.resolve(HERE, "../rafeeq-promo-ar.mp4")
run(ffmpeg, [
  "-y", "-loglevel", "error", "-i", raw,
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart",
  ...(hasAudio ? ["-c:a", "aac", "-b:a", "160k", "-ar", "48000"] : ["-an"]),
  out,
])
// Poster: the Home screen in the night sky (scene 2, after the language screen).
const { T } = await import("./build.mjs")
const s2 = T.find((s) => s.scene === "languages")
run(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(s2.start + s2.dur * 0.85), "-i", out, "-frames:v", "1", path.resolve(HERE, "../rafeeq-promo-poster.png")])
const mb = fs.statSync(out).size / 1e6
console.log(`render: ${out} (${total.toFixed(2)} s, ${mb.toFixed(1)} MB${hasAudio ? ", with voice" : ", captions only"})`)
