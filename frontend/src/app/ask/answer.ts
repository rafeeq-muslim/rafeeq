/**
 * Splitting an answer into the model's wording and the stored scripture
 * (KNW-01 R1, rules.md §1.3): every {{q:ID}} marker becomes the record with
 * that id from `sources`; the model never supplies the words. A marker whose
 * record is missing is dropped, never shown as text.
 */
import type { LiveSearchEntry, SourceCard } from "./types"

export type Segment = { type: "text"; text: string } | { type: "quote"; source: SourceCard }

const MARKER = /\{\{q:([^{}\s]+)\}\}/g
/** A passage id as text («islamqa:en:193670:p1», «live:binbaz:ar:1:c2»); same shape as the server's textcheck.RAW_ID. */
const RAW_ID = String.raw`(?<![\w{:])(?:q:\s*)?(?:live:)?[a-z][a-z0-9_]*:[a-z][a-z0-9_]*:[A-Za-z0-9_.:-]*[A-Za-z0-9]`
const RAW_ID_LIST = new RegExp(String.raw`\s*[\[(]\s*${RAW_ID}(?:\s*[,;،]\s*${RAW_ID})*\s*[\])]`, "g")
const RAW_ID_ANY = new RegExp(RAW_ID, "g")

/** Trim, and drop punctuation stranded at the start by a marker («{{q:x}}. Then…»). */
const tidy = (s: string) =>
  s
    .replace(/\{\{[^{}]*\}\}/g, " ") // a malformed marker is never shown (the server rejects it too)
    // A passage id is never shown as text, bracketed or bare (the server rejects it too; KNW-01 2026-10-10).
    .replace(RAW_ID_LIST, "")
    .replace(RAW_ID_ANY, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,،;؛])/gu, "$1")
    .trim()
    .replace(/^[.,،;؛:]+\s*/u, "")

export function segments(answer: string, sources: SourceCard[]): Segment[] {
  const byId = new Map(sources.map((s) => [s.id, s]))
  const out: Segment[] = []
  const shown = new Set<string>()
  let last = 0
  for (const m of answer.matchAll(MARKER)) {
    const before = tidy(answer.slice(last, m.index))
    if (before) out.push({ type: "text", text: before })
    const src = byId.get(m[1])
    // One quote per record: a second marker for the same id adds nothing.
    if (src && !shown.has(src.id)) {
      out.push({ type: "quote", source: src })
      shown.add(src.id)
    }
    last = (m.index ?? 0) + m[0].length
  }
  const rest = tidy(answer.slice(last))
  if (rest) out.push({ type: "text", text: rest })
  // Drop bits that are only punctuation left over after a marker («… {{q:x}}.»).
  return out.filter((s) => s.type === "quote" || /[\p{L}\p{N}]/u.test(s.text))
}

export const isQuran = (s: SourceCard) => s.source_id === "quranenc"
export const isHadith = (s: SourceCard) => s.kind === "hadith"

/**
 * KNW-01 reliability R8: one card per reference. Passages of the same
 * source, reference, language and version (two parts of fatwa 6940) are
 * shown once; every passage id stays in `sources` for the markers and the
 * verifier. Different translations or works stay apart. Quran records are
 * already one per ayah.
 */
export type SourceGroup = { key: string; first: SourceCard; cards: SourceCard[] }

export function groupSources(sources: SourceCard[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>()
  for (const s of sources) {
    const key = isQuran(s) ? `id:${s.id}` : [s.source_id, s.ref_key, s.lang, s.version].join("|")
    const g = groups.get(key)
    if (g) g.cards.push(s)
    else groups.set(key, { key, first: s, cards: [s] })
  }
  return [...groups.values()]
}

/** Short source names for the source strips (KNW-02 SC5). */
const SOURCE_SHORT: Record<string, string> = {
  quranenc: "QuranEnc.com",
  hadeethenc: "HadeethEnc.com",
  binbaz: "binbaz.org.sa",
  islamhouse_enc: "IslamHouse.com",
}
/** Source names that differ by language (KNW-02 SC5; product owner 2026-10-06). The link is the passage's own origin_url. */
const SOURCE_BY_LOCALE: Record<string, Partial<Record<string, string>> & { default: string }> = {
  islamqa: { ar: "الإسلام سؤال وجواب", default: "IslamQA" },
  // PRD live v3: the Islamic Content Encyclopedia (islamenc.com), read live.
  islamic_content: { ar: "موسوعة المحتوى الإسلامي", default: "IslamEnc.com" },
  // KNW-02 R6: the team's approved lesson cards; the link opens the lesson.
  rafeeq_cards: { ar: "دروس رفيق", tl: "Mga aralin ng Rafeeq", default: "Rafeeq lessons" },
}

/**
 * PRD live v3 §10: the live-search line is built only from the attempt's
 * real events. A connector that was not called (language not served, not
 * connected) is not mentioned; one that was called is "searched" if it
 * answered (with or without results) and "unreachable" if it failed.
 */
export function liveSummary(entries: LiveSearchEntry[] | undefined): { searched: string[]; unreachable: string[] } {
  const called = (entries ?? []).filter((e) => e.attempted)
  return {
    searched: called.filter((e) => e.status === "ok" || e.status === "no_results").map((e) => e.source_id),
    unreachable: called.filter((e) => e.status === "unavailable" || e.status === "cancelled").map((e) => e.source_id),
  }
}

/** The site the passage came from, never the author quoted inside it (KNW-02 S16). */
export function sourceLabel(s: Pick<SourceCard, "source_id" | "source_name">, locale: string): string {
  const byLocale = SOURCE_BY_LOCALE[s.source_id]
  if (byLocale) return byLocale[locale] ?? byLocale.default
  return SOURCE_SHORT[s.source_id] ?? s.source_name
}
