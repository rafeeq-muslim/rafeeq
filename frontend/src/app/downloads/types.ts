/** PLT-12: shapes of GET /api/downloads/catalog (backend/app/platform/downloads.py). */

export type CatalogFile = {
  id: string
  /** Same-origin URL the device fetches (the pass-through for external files). */
  url: string
  /** URL the app itself requests (<video>/<audio> src, API URL); the cache key. */
  key: string
  bytes: number | null
  mime: string
  kind: "text" | "media"
}

export type Section = "lessons" | "quran" | "library"

export type CatalogItem = {
  id: string
  section: Section
  /** unit | video | quran_text | surah | books | audios | videos | articles */
  kind: string
  /** unit id, surah number, "all", library item id, or (video) the first lesson showing it. */
  ref: string
  title: string
  /** A lesson video (owner decision 2026-10-10: never part of its unit's download): its unit. */
  unit?: string
  files: CatalogFile[]
  bytes: number
  sizes_known: boolean
  version: string
  downloadable: boolean
  reason: "too_large" | null
}

export type Catalog = { lang: string; cap_bytes: number; sections: Record<Section, CatalogItem[]> }
