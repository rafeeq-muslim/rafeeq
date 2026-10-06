/**
 * PLT-11 R1-R4 and R6: the worker's runtime caches, the learner-only
 * precache, media never cached or preloaded, the size budget and the live
 * cache-header check (pure parts).
 */
import { describe, expect, it } from "vitest"

import { ASSET_CACHE, FONT_CACHE, plt11CacheFor } from "./plt11-caching"
import { checkBudget, manifestUrls, type SizeBudget } from "./plt11-budget"
import { cacheProblems, pickTargets } from "./plt11-live-check"
import { chunkFileName, isOnDemand, PRECACHE_GLOB_IGNORES } from "./plt11-precache"

const ORIGIN = "https://rafeeq.nan.sa"
const req = (headers: Record<string, string> = {}, destination = "") => ({ destination, headers: new Headers(headers) })
const notPrecached = () => false
const cacheFor = (href: string, r = req(), precached: (h: string) => boolean = notPrecached) => plt11CacheFor(new URL(href), r, ORIGIN, precached)

describe("PLT-11 R1: what came down once is not downloaded again", () => {
  it("test_plt11_r1_repeat_open_serves_scripts_and_fonts_from_the_worker_cache", () => {
    expect(cacheFor(`${ORIGIN}/assets/Admin-RJLcPfUW.js`)).toBe(ASSET_CACHE)
    expect(cacheFor(`${ORIGIN}/assets/index-DZTWf8Ot.css`)).toBe(ASSET_CACHE)
    expect(cacheFor(`${ORIGIN}/fonts/thmanyah/thmanyahsans-Regular.woff2`)).toBe(FONT_CACHE)
    expect(cacheFor(`${ORIGIN}/assets/ibm-plex-sans-arabic-arabic-400-normal-CyU-ddYS.woff2`)).toBe(FONT_CACHE)
    expect(cacheFor(`${ORIGIN}/assets/amiri-quran-arabic-400-normal-wRcqfVJx.woff2`)).toBe(FONT_CACHE)
  })

  it("test_plt11_r1_precached_files_index_and_api_are_left_to_their_own_routes", () => {
    expect(cacheFor(`${ORIGIN}/assets/index-BP4MZ73F.js`, req(), () => true)).toBeNull()
    expect(cacheFor(`${ORIGIN}/index.html`)).toBeNull()
    expect(cacheFor(`${ORIGIN}/sw.js`)).toBeNull()
    expect(cacheFor(`${ORIGIN}/api/content?lang=ar`)).toBeNull()
    expect(cacheFor("https://other.example/assets/x.js")).toBeNull() // same origin only
  })

  it("test_plt11_r1_live_check_names_file_and_header_when_no_store", () => {
    const html = '<script type="module" crossorigin src="/assets/index-nvLnjLmJ.js"></script><link rel="stylesheet" crossorigin href="/assets/index-T2bpsG4z.css">'
    const css = '@font-face{src:url(/fonts/thmanyah/thmanyahsans-Regular.woff2)}@font-face{src:url(/assets/ibm-plex-a.woff2) format("woff2"),url(/assets/ibm-plex-a.woff)}'
    expect(pickTargets(html, { "/assets/index-T2bpsG4z.css": css })).toEqual([
      "/assets/index-nvLnjLmJ.js",
      "/assets/index-T2bpsG4z.css",
      "/fonts/thmanyah/thmanyahsans-Regular.woff2",
      "/assets/ibm-plex-a.woff2",
    ])
    const bad = "public, max-age=31536000, immutable, no-store, no-cache, must-revalidate"
    expect(
      cacheProblems([
        { url: "/assets/index-nvLnjLmJ.js", status: 200, cacheControl: bad },
        { url: "/fonts/thmanyah/thmanyahsans-Regular.woff2", status: 200, cacheControl: "public, max-age=31536000, immutable" },
      ]),
    ).toEqual([`/assets/index-nvLnjLmJ.js: Cache-Control: ${bad}`])
  })
})

describe("PLT-11 R2/R3: the first open precaches the learner shell only", () => {
  it("test_plt11_r2_role_pages_gallery_cities_and_quran_font_are_not_precached", () => {
    for (const f of [
      "assets/Admin-RJLcPfUW.js",
      "assets/Team-DqKgs7-f.js",
      "assets/Inbox-Bov_pDr0.js",
      "assets/ReviewDesk-CerQkqxR.js",
      "assets/Referrals-DEXsWh52.js",
      "assets/Org-FtEKj791.js",
      "assets/ReportsQueue-C5_u2E9s.js",
      "assets/App-CVC5Ajko.js",
      "assets/cities-data-CAEsTo8v.js",
      "assets/amiri-quran-arabic-400-normal-wRcqfVJx.woff2",
      "fonts/thmanyah/thmanyahsans-Bold.woff2",
    ])
      expect(isOnDemand(f), f).toBe(true)
  })

  it("test_plt11_r2_learner_screens_stay_precached", () => {
    for (const f of [
      "index.html",
      "assets/index-BP4MZ73F.js",
      "assets/Home-CEHjZT65.js",
      "assets/Learn-DIQIGltO.js",
      "assets/Lesson-DgiNqD7t.js",
      "assets/Review-8ZKLvTFW.js",
      "assets/Ask-CoGTqWxF.js",
      "assets/Me-CRtQUNXn.js",
      "assets/Welcome-6_5V-wl3.js",
      "assets/Privacy-BYTXjhWb.js",
      "assets/Mentor-bm3y7prq.js", // the learner's «مرشدي»
      "assets/OrgQuestion-dksKcZ0x.js", // not the Org page
      "assets/cities-BziqJqjf.js", // the small loader, not the data
    ])
      expect(isOnDemand(f), f).toBe(false)
    // Every on-demand pattern is really ignored by the build.
    expect(PRECACHE_GLOB_IGNORES).toEqual(expect.arrayContaining(["assets/Admin-*.js", "assets/cities-data-*.js", "assets/amiri-quran-*", "fonts/**"]))
  })

  it("test_plt11_r2_cities_data_chunk_has_a_predictable_name", () => {
    expect(chunkFileName({ facadeModuleId: "/repo/frontend/src/app/practice/cities.json" })).toBe("assets/cities-data-[hash].js")
    expect(chunkFileName({ facadeModuleId: "/repo/frontend/src/app/practice/cities.ts" })).toBe("assets/[name]-[hash].js")
    expect(chunkFileName({})).toBe("assets/[name]-[hash].js")
  })
})

describe("PLT-11 R4: audio and video stream on play only and are never cached", () => {
  it("test_plt11_r4_worker_never_caches_audio_video_or_range_requests", () => {
    expect(cacheFor(`${ORIGIN}/assets/clip-abc.mp3`)).toBeNull()
    expect(cacheFor(`${ORIGIN}/assets/wudu-abc.mp4`)).toBeNull()
    expect(cacheFor(`${ORIGIN}/assets/x-abc.js`, req({ range: "bytes=0-" }))).toBeNull()
    expect(cacheFor(`${ORIGIN}/assets/x-abc.js`, req({}, "audio"))).toBeNull()
    expect(cacheFor(`${ORIGIN}/assets/x-abc.js`, req({}, "video"))).toBeNull()
  })

  it("test_plt11_r4_every_video_and_audio_element_has_preload_none", () => {
    const sources = import.meta.glob<string>(["../**/*.tsx", "!../**/*.test.tsx"], { query: "?raw", import: "default", eager: true })
    const offenders: string[] = []
    let players = 0
    for (const [f, text] of Object.entries(sources)) {
      for (const m of text.matchAll(/<(video|audio)\b[^>]*>/g)) {
        players++
        if (!/preload="none"/.test(m[0])) offenders.push(`${f}: ${m[0].slice(0, 80)}`)
      }
    }
    expect(players).toBeGreaterThan(3) // Lesson, VerseBlock, Quran, ReciterSample, ReviewDesk
    expect(offenders).toEqual([])
  })
})

describe("PLT-11 R6: every build measures the precache against the budget", () => {
  const budget: SizeBudget = { files: 100, raw: 1_000_000, gzip: 400_000, tolerance: 0.1, maxDataFileBytes: 512_000 }
  const shell = (raw: number) => [{ url: "assets/index-a.js", raw, gzip: raw / 3 }]

  it("test_plt11_r6_small_page_passes_and_reports_size_next_to_budget", () => {
    const r = checkBudget([...shell(1_000_000), { url: "assets/NewPage-b.js", raw: 5_000, gzip: 2_000 }], budget, isOnDemand)
    expect(r.ok).toBe(true)
    expect(r.total).toEqual({ files: 2, raw: 1_005_000, gzip: 1_000_000 / 3 + 2_000 })
  })

  it("test_plt11_r6_two_megabyte_data_file_fails_naming_file_and_size", () => {
    const r = checkBudget([...shell(500_000), { url: "assets/big-data.json", raw: 2_000_000, gzip: 300_000 }], { ...budget, raw: 3_000_000 }, isOnDemand)
    expect(r.ok).toBe(false)
    expect(r.errors.join("\n")).toContain("assets/big-data.json (1953.1 KB)")
  })

  it("test_plt11_r6_growth_over_ten_percent_fails", () => {
    expect(checkBudget(shell(1_100_000), budget).ok).toBe(true)
    const r = checkBudget(shell(1_100_001), budget)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toContain("more than 10% over the budget")
  })

  it("test_plt11_r6_role_page_entering_the_precache_fails", () => {
    const r = checkBudget([...shell(1000), { url: "assets/Admin-x1.js", raw: 7000, gzip: 2000 }], budget, isOnDemand)
    expect(r.errors).toEqual(["assets/Admin-x1.js must load on demand, not be precached (PLT-11 R2)"])
  })

  it("test_plt11_r6_reads_the_manifest_injected_into_sw_js", () => {
    const sw = 'precacheAndRoute([{"revision":"a1","url":"theme.js"},{"revision":null,"url":"assets/index-x.js"}],{})'
    expect(manifestUrls(sw)).toEqual(["theme.js", "assets/index-x.js"])
  })
})
