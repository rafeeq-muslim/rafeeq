import { describe, expect, it } from "vitest"
import { segments } from "./answer"
import { buildSummary, fixedMessage, nextHref } from "./guide"
import type { SourceCard } from "./types"
import type { Lesson } from "@/app/learning/types"

const card = (id: string, quote: string): SourceCard => ({
  id,
  source_id: "hadeethenc",
  source_name: "HadeethEnc",
  kind: "hadith",
  lang: "en",
  ref: { hadith_id: 1 },
  ref_key: "1",
  quote_text: quote,
  arabic_text: null,
  translation: null,
  grade: null,
  attribution: null,
  title: null,
  origin_url: "https://example.test",
  version: "1",
})

describe("knw-01-r1 answer segments", () => {
  it("replaces a marker with the stored record, never model text", () => {
    const s = segments("It teaches mercy. {{q:hadeethenc:en:1}} That is all.", [card("hadeethenc:en:1", "TEST_STORED_TEXT")])
    expect(s).toEqual([
      { type: "text", text: "It teaches mercy." },
      { type: "quote", source: expect.objectContaining({ quote_text: "TEST_STORED_TEXT" }) },
      { type: "text", text: "That is all." },
    ])
  })

  it("drops a marker whose record is missing and shows each record once", () => {
    const s = segments("A {{q:x}} B {{q:hadeethenc:en:1}}. {{q:hadeethenc:en:1}}", [card("hadeethenc:en:1", "T")])
    expect(s.map((x) => x.type)).toEqual(["text", "text", "quote"])
    expect(JSON.stringify(s)).not.toContain("{{q:")
  })
})

const lesson = (id: string, objectives: string[]): Lesson =>
  ({ id, unit: "u", order: 1, title: `TITLE_${id}`, cards: [], exercises: [], approved: true, objectives: objectives.map((o) => ({ id: o, text: `TEXT_${o}`, cards: [] })) }) as Lesson

describe("knw-10-r3 learning guide summary", () => {
  const lessons = [lesson("l1", ["o1", "o2"]), lesson("l2", ["o3"])]
  const progress = {
    completed: { l1: { first: "2026-10-01", last: "2026-10-01", times: 1 } },
    unlockedUnits: [],
    mastery: {
      o1: { p: 0.99, seen: true, answered: true, masteredAt: "2026-10-01", checksDone: 0 },
      o2: { p: 0.5, seen: true, answered: true, checksDone: 0 },
      zz: { p: 0.99, seen: true, answered: true, masteredAt: "2026-10-01", checksDone: 0 },
    },
  }

  it("sends ids only: mastered, reviewing, next lesson", () => {
    const s = buildSummary("en", lessons, progress as never)
    expect(s).toEqual({ lang: "en", mastered: ["o1"], reviewing: ["o2"], next: { lesson_id: "l2" } })
    expect(nextHref(s)).toBe("/learn/lesson/l2")
  })

  it("builds the fixed message from the same summary", () => {
    const s = buildSummary("en", lessons, progress as never)
    const t = (k: string, v?: Record<string, string>) => `${k}:${JSON.stringify(v ?? {})}`
    const msg = fixedMessage(s, lessons, t as never)
    // issue #9: lesson titles, never the team-facing objective texts
    expect(msg).toContain("TITLE_l1")
    expect(msg).not.toContain("TEXT_o1")
    expect(msg).toContain("TITLE_l2")
  })

  it("uses each objective's learner name, never its team text (LRN-10 R1)", () => {
    const named = lessons.map((l) => ({ ...l, objectives: l.objectives.map((o) => ({ ...o, label: `LABEL_${o.id}` })) }))
    const s = buildSummary("en", named, progress as never)
    const t = (k: string, v?: Record<string, string>) => `${k}:${JSON.stringify(v ?? {})}`
    const msg = fixedMessage(s, named, t as never)
    expect(msg).toContain("LABEL_o1")
    expect(msg).toContain("LABEL_o2")
    expect(msg).not.toContain("TEXT_")
  })

  it("leaves out lessons not yet completed (issue #9)", () => {
    const s = buildSummary("en", lessons, { ...progress, completed: {} } as never)
    expect(s.mastered).toEqual([])
    expect(s.reviewing).toEqual([])
  })
})
