/** Shapes of the Discover API (backend/app/knowledge/discover.py). */

export type DailyCardData = {
  id: string
  order: number
  kind: "benefit" | "story"
  title: string
  text: string
  /** Arabic original for en/tl readers, when the record has it. */
  text_ar?: string
  benefits: string[]
  explanation: string
  grade: string
  attribution: string
  /** Stories only: labelled as Rafeeq's wording (KNW-07 R2). */
  rafeeq_wording?: boolean
  source: { name: string; url: string; version: string }
}

export type CardsResponse = {
  lang: string
  /** Size of the whole ordered set (approved or not): the modulus. */
  total: number
  cards: DailyCardData[]
  /** Set size before the last change, and the day number it changed (plan §8.4 step 6). */
  previous: { count: number; since: number } | null
}

export type LibraryFile = { url: string; ext: string; size: string }

export type LibraryItemData = {
  id: string
  type: "books" | "articles" | "videos" | "audios"
  topic: string
  lang: string
  title: string
  authors: string[]
  description: string
  source: string
  origin_url: string
  files: LibraryFile[]
}

export type LibraryResponse = { lang: string; topics: { id: string; items: LibraryItemData[] }[] }

export type Recitation = {
  id: string
  title: string
  reciter: string
  source: string
  origin_url: string
  suras: Record<string, string>
  /** PLT-11 R5 / PLT-12: bytes of each surah's file (HEAD Content-Length). */
  sizes?: Record<string, number>
}

/** KNW-08 R4: a Quranpedia per-verse Hafs reciter the Sharia reviewer approved. */
export type VerseReciter = { id: string; quranpedia_id: number; reciter: string; source: string; origin_url: string }

export type RecitationResponse = { lang: string; recitation: Recitation | null; reciters?: VerseReciter[] }

/** KNW-06 library live search (POST /api/discover/library/search): external material, never reviewed items. */
export type LibrarySourceId = "islamic_content" | "islamhouse"
export type LibrarySearchType = "book" | "article" | "audio" | "video" | "fatwa" | "poster" | "khutbah" | "qa"
export type LibrarySourceStatus =
  | "ok"
  | "no_results"
  | "timeout"
  | "unavailable"
  | "not_connected"
  | "unsupported_language"
  | "unsupported_type"

export type LibrarySearchItem = {
  id: string
  source_id: LibrarySourceId
  source_name: string
  title: string
  snippet: string | null
  type: LibrarySearchType | null
  lang: string
  url: string
  retrieved_at: string
}

export type LibrarySearchResponse = {
  search_id: string | null
  status: "success" | "partial"
  items: LibrarySearchItem[]
  source_status: { source_id: LibrarySourceId; status: LibrarySourceStatus }[]
  next_cursor: string | null
}

export type LibrarySearchSources = {
  enabled: boolean
  sources: { id: LibrarySourceId; name: string; available: boolean; langs: string[]; types: LibrarySearchType[] }[]
}

export type Aya = { aya: number; arabic: string; translation: string | null; url: string }
export type Verses = { sura: number; ayat: Aya[]; source: { name: string; translation: string | null; version: string } }
