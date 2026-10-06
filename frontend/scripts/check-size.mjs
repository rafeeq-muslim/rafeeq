#!/usr/bin/env node
// PLT-11 R6: after `vite build`, print what the service worker precaches and
// its size next to the budget in size-budget.json; fail when the total grows
// more than the tolerance over the budget, when an audio/video/data file over
// the limit is precached, or when an on-demand chunk (R2) is precached.
//
//   npm run check:size              check dist/ against the budget
//   npm run check:size -- --update  record the current size as the new budget
//                                   (deliberate: say why in the commit message)
//
// Node 24 runs the imported .ts modules directly (type stripping).
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { checkBudget, formatReport, manifestUrls } from "../src/sw/plt11-budget.ts"
import { isOnDemand } from "../src/sw/plt11-precache.ts"

const root = path.resolve(import.meta.dirname, "..")
const dist = path.join(root, "dist")
const budgetFile = path.join(root, "size-budget.json")

const sw = path.join(dist, "sw.js")
if (!fs.existsSync(sw)) {
  console.error("dist/sw.js not found: run `npm run build:app` first")
  process.exit(2)
}
const urls = [...new Set(manifestUrls(fs.readFileSync(sw, "utf8")))]
const files = urls.map((url) => {
  const buf = fs.readFileSync(path.join(dist, url))
  return { url, raw: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length }
})

const budget = JSON.parse(fs.readFileSync(budgetFile, "utf8"))
if (process.argv.includes("--update")) {
  const next = { ...budget, files: files.length, raw: files.reduce((s, f) => s + f.raw, 0), gzip: files.reduce((s, f) => s + f.gzip, 0) }
  fs.writeFileSync(budgetFile, JSON.stringify(next, null, 2) + "\n")
  console.log(`size-budget.json updated: ${next.files} files, ${next.raw} bytes raw, ${next.gzip} bytes gzip`)
  process.exit(0)
}
const result = checkBudget(files, budget, isOnDemand)
console.log(formatReport(files, budget, result))
process.exit(result.ok ? 0 : 1)
