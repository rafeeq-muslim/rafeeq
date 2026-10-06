#!/usr/bin/env node
// PLT-11 R1: after a deploy, check that the live site lets browsers keep the
// hashed files and fonts. Fetches the public index.html, picks a real /assets/
// script and stylesheet and a font (brand /fonts/ and bundled /assets/), and
// reports every one whose Cache-Control has `no-store`, naming file and header.
//
// Lead decision 2026-10-06: while the host router still adds `no-store` this is
// a loud WARNING (GitHub annotation) and exits 0, so it never fails or rolls
// back a deploy. Set STRICT_CACHE_CHECK=1 to make it fail once the router is fixed.
//
//   node scripts/check-live-cache.mjs [base-url]   (default: $RAFEEQ_URL or https://rafeeq.nan.sa)
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { cacheProblems, pickTargets } from "../src/sw/plt11-live-check.ts"

const base = (process.argv[2] ?? process.env.RAFEEQ_URL ?? "https://rafeeq.nan.sa").replace(/\/$/, "")
const strict = process.env.STRICT_CACHE_CHECK === "1"
const SELF = "frontend/scripts/check-live-cache.mjs"

// curl, not fetch(): Node's own sockets time out on the deploy host, curl does not.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plt11-"))
function get(urlPath) {
  const head = path.join(tmp, "h")
  const body = path.join(tmp, "b")
  try {
    execFileSync("curl", ["-sSL", "-m", "20", "-A", "Rafeeq deploy check (PLT-11 R1)", "-D", head, "-o", body, base + urlPath], {
      stdio: ["ignore", "ignore", "pipe"],
    })
  } catch {
    return null
  }
  // The last header block (after redirects) is the file's own.
  const blocks = fs.readFileSync(head, "utf8").trim().split(/\r?\n\r?\n/)
  const lines = blocks[blocks.length - 1].split(/\r?\n/)
  const status = Number(lines[0].split(" ")[1])
  // Every Cache-Control line counts: browsers combine them and no-store wins.
  const cc = lines.filter((l) => /^cache-control:/i.test(l)).map((l) => l.slice(l.indexOf(":") + 1).trim())
  return { status, ok: status < 400, cacheControl: cc.length ? cc.join(", ") : null, text: () => fs.readFileSync(body, "utf8") }
}

function report(problems) {
  const level = strict ? "error" : "warning"
  console.log("")
  console.log("=".repeat(72))
  console.log(`PLT-11 R1 ${strict ? "FAILED" : "WARNING"}: the live site stops browsers from keeping files`)
  for (const p of problems) {
    console.log(`  ${p}`)
    console.log(`::${level} file=${SELF},title=PLT-11 R1 live cache headers::${p}`)
  }
  console.log("Every open downloads these again. Fix: remove `no-store` for /assets/ and /fonts/ in the host router.")
  if (!strict) console.log("Not failing the deploy (STRICT_CACHE_CHECK is not 1).")
  console.log("=".repeat(72))
  process.exitCode = strict ? 1 : 0
}

function main() {
  let html = ""
  for (const p of ["/app/", "/"]) {
    const r = get(p)
    const text = r?.ok ? r.text() : ""
    if (/\/assets\/[^"]+\.js"/.test(text)) {
      html = text
      break
    }
  }
  if (!html) return report([`${base}/app/ and ${base}/: no index.html with /assets/ files found`])

  const cssByUrl = {}
  for (const m of html.matchAll(/href="([^"]*\/assets\/[^"]+\.css)"/g)) {
    const r = get(m[1])
    if (r?.ok) cssByUrl[m[1]] = r.text()
  }
  const results = pickTargets(html, cssByUrl).map((url) => {
    const r = get(url)
    return { url, status: r?.status ?? 599, cacheControl: r?.cacheControl ?? null }
  })
  for (const r of results) console.log(`${String(r.status).padEnd(4)} ${r.url}  Cache-Control: ${r.cacheControl ?? "(none)"}`)
  const problems = cacheProblems(results)
  if (problems.length) return report(problems)
  console.log(`PLT-11 R1 OK: ${results.length} files cacheable on ${base}`)
}

main()
fs.rmSync(tmp, { recursive: true, force: true })
