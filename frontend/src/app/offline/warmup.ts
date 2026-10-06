/**
 * PLT-15: what the device keeps for offline use without being opened first.
 *
 * - R2 / open question default: the whole path text in the learner's
 *   language (one /api/content request, ~30 KB), and, for a lesson the
 *   learner opens, all its verses and images, not only the cards seen.
 * - R3: the approved adhkar text of every chapter in the learner's language
 *   (~2 KB a chapter) and the verses they quote; the practice lines and
 *   sighting announcements; the city list while no city is chosen (R3 ex3).
 *   Adhkar audio is not kept (PLT-12 decides).
 * - R4: the cards and library lists that saved items are shown from.
 *
 * Runs in the background once the app is open and online, again for a new
 * language, and at most once a week per language. Responses go straight into
 * the caches the service worker reads (sw.ts, sw/plt15-offline.ts), so it
 * works even before the worker controls the page. Nothing personal is sent:
 * the requests carry the language only (rules.md §4).
 */
import * as React from "react"

import type { Lesson } from "@/app/learning/types"
import type { AdhkarChapter, AdhkarIndex } from "@/app/practice/api"
import { loadCities } from "@/app/practice/cities"
import { useDevice } from "@/app/stores/device"
import { savedAnswer, useSaved } from "@/app/discover/savedStore"
import { useT } from "@/app/i18n"
import { CONTENT_CACHE, MEDIA_CACHE, OFFLINE_CACHE } from "./paths"
import { isOnline, whenOnline } from "./online"

const WARMED = "rafeeq.offline.warmed"
const WEEK = 7 * 24 * 60 * 60 * 1000
const PARALLEL = 4

const hasCaches = () => typeof caches !== "undefined"

/** Fetches `url` and stores a successful answer in `cacheName`. */
async function keep(cacheName: string, url: string, onlyIfMissing = false): Promise<Response | null> {
  try {
    const cache = await caches.open(cacheName)
    if (onlyIfMissing && (await cache.match(url))) return null
    const res = await fetch(url, { credentials: "same-origin" })
    if (!res.ok) return null
    await cache.put(url, res.clone())
    return res
  } catch {
    return null // offline again or refused: the next open tries again
  }
}

async function pool<T>(items: T[], work: (item: T) => Promise<unknown>) {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item)
    }),
  )
}

const quranUrl = (sura: number, from: number, to: number, lang: string) => `/api/scripture/quran?sura=${sura}&from=${from}&to=${to}&lang=${lang}`

/** R3: the adhkar index, every approved chapter and the verses they quote. Returns the chapters kept. */
export async function warmAdhkar(lang: string): Promise<number> {
  const index = await keep(OFFLINE_CACHE, `/api/practice/adhkar?lang=${lang}`)
  if (!index) return 0
  const data = (await index.json()) as AdhkarIndex
  const ids = data.groups.flatMap((g) => g.chapters.filter((c) => c.approved_count > 0).map((c) => c.id))
  let kept = 0
  await pool(ids, async (id) => {
    const res = await keep(OFFLINE_CACHE, `/api/practice/adhkar/${id}?lang=${lang}`)
    if (!res) return
    kept += 1
    const chapter = (await res.json()) as AdhkarChapter
    const verses = chapter.items.flatMap((d) => d.segments.flatMap((s) => (s.t === "quran" ? [quranUrl(s.sura, s.from, s.to, lang)] : [])))
    await pool(verses, (url) => keep(CONTENT_CACHE, url, true))
  })
  return kept
}

function readWarmed(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(WARMED) ?? "{}")
    return v && typeof v === "object" ? v : {}
  } catch {
    return {}
  }
}

function markWarmed(lang: string, at: number) {
  try {
    localStorage.setItem(WARMED, JSON.stringify({ ...readWarmed(), [lang]: at }))
  } catch {
    /* private mode: warm again next time */
  }
}

/** The whole warm-up for one language; skipped when done this week. */
export async function warmOffline(lang: string, now = Date.now()): Promise<boolean> {
  if (!hasCaches() || !isOnline()) return false
  if (now - (readWarmed()[lang] ?? 0) < WEEK) return false
  const chapters = await warmAdhkar(lang)
  await Promise.all([
    keep(CONTENT_CACHE, `/api/content?lang=${lang}`, true),
    keep(OFFLINE_CACHE, `/api/glossary?lang=${lang}`),
    keep(OFFLINE_CACHE, `/api/practice/lines?lang=${lang}`),
    keep(OFFLINE_CACHE, "/api/practice/sightings"),
    useDevice.getState().city ? null : loadCities().catch(() => null),
  ])
  if (chapters > 0) markWarmed(lang, now) // a failed index is retried next open
  return chapters > 0
}

/** The /api/scripture/passages requests the Saved screen makes for these ids
 * (same order and batches as discover/queries.ts usePassages, so the cached
 * answer matches it offline). */
export function passageUrls(ids: string[]): string[] {
  const wanted = [...new Set(ids)].sort()
  const urls: string[] = []
  for (let i = 0; i < wanted.length; i += 40) {
    const q = new URLSearchParams()
    for (const id of wanted.slice(i, i + 40)) q.append("ids", id)
    urls.push(`/api/scripture/passages?${q}`)
  }
  return urls
}

/** R4: what the Saved screen shows saved items from, fetched only if missing. */
export async function warmSaved(lang: string): Promise<void> {
  if (!hasCaches() || !isOnline()) return
  const saved = useSaved.getState().items
  const sourceIds = saved.filter((e) => e.kind === "answer").flatMap((e) => savedAnswer(e.ref)?.source_ids ?? [])
  const libLangs = [...new Set(saved.filter((e) => e.kind === "library").map((e) => e.ref.split("-").pop() ?? lang))]
  await Promise.all([
    ...passageUrls(sourceIds).map((url) => keep(CONTENT_CACHE, url, true)),
    saved.some((e) => e.kind === "card") ? keep(OFFLINE_CACHE, `/api/discover/cards?lang=${lang}`, true) : null,
    ...libLangs.map((l) => keep(OFFLINE_CACHE, `/api/discover/library?lang=${l}`, true)),
  ])
}

/** AppLayout: warm once the app is open and online, and for each new language;
 * saved items again whenever the list changes. */
export function useOfflineWarmUp() {
  const { locale } = useT()
  const saved = useSaved((s) => s.items)
  React.useEffect(() => {
    let live = true
    whenOnline(() => live && void warmSaved(locale))
    return () => {
      live = false
    }
  }, [saved, locale])
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let live = true
    whenOnline(() => {
      if (live) timer = setTimeout(() => void warmOffline(locale), 3000) // after the first screen
    })
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [locale])
}

/** R2: an opened lesson keeps all its verses and its images (same origin), seen or not. */
export async function warmLesson(lesson: Lesson, lang: string): Promise<void> {
  if (!hasCaches() || !isOnline()) return
  const verses = lesson.cards.flatMap((c) => (c.quran ? [quranUrl(c.quran.sura, c.quran.ayat[0], c.quran.ayat[1], lang)] : []))
  const images = lesson.cards
    .flatMap((c) => [c.image_url, ...(c.extra_images ?? [])])
    .filter((src): src is string => !!src && new URL(src, location.href).origin === location.origin)
  await Promise.all([pool(verses, (url) => keep(CONTENT_CACHE, url, true)), pool(images, (url) => keep(MEDIA_CACHE, url, true))])
}

export function useWarmLesson(lesson: Lesson | undefined) {
  const { locale } = useT()
  React.useEffect(() => {
    if (lesson) void warmLesson(lesson, locale)
  }, [lesson, locale])
}
