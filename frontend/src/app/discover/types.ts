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
}

export type RecitationResponse = { lang: string; recitation: Recitation | null }

export type Aya = { aya: number; arabic: string; translation: string | null; url: string }
export type Verses = { sura: number; ayat: Aya[]; source: { name: string; translation: string | null; version: string } }
