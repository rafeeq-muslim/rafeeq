/**
 * KNW-10 R3 / LRN-07: "What should I learn now?" in the Ask chat. The
 * learning summary is built here on the device (objective levels, next
 * step, review objectives, language; no identity, no question text) and
 * sent to /api/learning/guide. The server keeps nothing. When it returns no
 * text (outage, offline, checker refused), the fixed message built from the
 * same summary is shown (LRN-07 R4).
 */
import { api } from "@/app/lib/api"
import { levelOf, type ObjectiveState } from "@/app/learning/bkt"
import { firstIncomplete, type Progress } from "@/app/learning/path"
import { inReview } from "@/app/learning/review"
import type { Lesson } from "@/app/learning/types"

export type Summary = {
  lang: string
  mastered: string[]
  reviewing: string[]
  next: { lesson_id: string } | { review: true } | null
  /** LRN-07 R5: back after a pause; the message welcomes, never counts missed days. */
  returning?: boolean
}

const MAX = 5

export function buildSummary(
  lang: string,
  lessons: Lesson[],
  progress: Progress & { mastery: Record<string, ObjectiveState> },
  now = new Date(),
): Summary {
  const known = new Set(lessons.flatMap((l) => l.objectives.map((o) => o.id)))
  const entries = Object.entries(progress.mastery).filter(([id]) => known.has(id))
  const mastered = entries
    .filter(([, s]) => levelOf(s) === "mastered")
    .sort(([, a], [, b]) => (b.masteredAt ?? "").localeCompare(a.masteredAt ?? ""))
    .slice(0, MAX)
    .map(([id]) => id)
  const reviewing = entries
    .filter(([, s]) => inReview(s, now))
    .sort(([, a], [, b]) => a.p - b.p)
    .slice(0, MAX)
    .map(([id]) => id)
  const nextLesson = firstIncomplete(lessons, progress)
  const next = nextLesson ? { lesson_id: nextLesson.id } : reviewing.length ? ({ review: true } as const) : null
  return { lang, mastered, reviewing, next }
}

/** The fixed message (LRN-07 R4): «أتقنت: … · راجع: … · خطوتك التالية: …». */
export function fixedMessage(
  s: Summary,
  lessons: Lesson[],
  t: (key: "ask.guide.mastered" | "ask.guide.review" | "ask.guide.next" | "ask.guide.reviewStep" | "ask.guide.start", vars?: Record<string, string>) => string,
  sep = ", ",
): string {
  const names = new Map(lessons.flatMap((l) => l.objectives.map((o) => [o.id, o.text] as const)))
  const titles = new Map(lessons.map((l) => [l.id, l.title]))
  const parts: string[] = []
  if (s.mastered.length) parts.push(t("ask.guide.mastered", { list: s.mastered.map((id) => names.get(id)).join(sep) }))
  if (s.reviewing.length) parts.push(t("ask.guide.review", { list: s.reviewing.map((id) => names.get(id)).join(sep) }))
  if (s.next && "lesson_id" in s.next) parts.push(t("ask.guide.next", { step: titles.get(s.next.lesson_id) ?? "" }))
  else if (s.next) parts.push(t("ask.guide.next", { step: t("ask.guide.reviewStep") }))
  return parts.length ? parts.join(" · ") : t("ask.guide.start")
}

export function nextHref(s: Summary): string | null {
  if (!s.next) return null
  return "lesson_id" in s.next ? `/learn/lesson/${s.next.lesson_id}` : "/learn/review"
}

export async function requestGuide(s: Summary): Promise<string | null> {
  if (!s.mastered.length && !s.reviewing.length && !s.next) return null
  if (typeof navigator !== "undefined" && !navigator.onLine) return null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    const r = await api<{ text: string | null }>("/api/learning/guide", { method: "POST", body: s, signal: ctrl.signal }).finally(() =>
      clearTimeout(timer),
    )
    return r.text
  } catch {
    return null
  }
}
