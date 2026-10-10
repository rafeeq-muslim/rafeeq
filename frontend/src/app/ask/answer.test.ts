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

  it("never shows a passage id as text, bracketed or bare (2026-10-10)", () => {
    const s = segments(
      "It is not allowed [islamqa:en:193670:p1, islamqa:en:26771:p2]. Guards too (q:live:binbaz:en:7:c1). See hadeethenc:en:1 here.",
      [],
    )
    expect(s).toEqual([{ type: "text", text: "It is not allowed. Guards too. See here." }])
  })

  it("keeps ordinary brackets, Quran references and times", () => {
    const text = "Read Ayat al-Kursi (2:255) at night [in the evening], at 10:30:00."
    expect(segments(text, [])).toEqual([{ type: "text", text }])
  })
})

const lesson = (id: string, objectives: string[]): Lesson =>
  ({ id, unit: "u", order: 1, title: `TITLE_${id}`, cards: [], exercises: [], approved: true, objectives: objectives.map((o) => ({ id: o, text: `TEXT_${o}`, cards: [] })) }) as Lesson

// A fixed day: o1 (mastered 2026-10-01) is not yet due for its later check.
const NOW = new Date("2026-10-02T12:00:00Z")

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
    const s = buildSummary("en", lessons, progress as never, NOW)
    expect(s).toEqual({ lang: "en", mastered: ["o1"], reviewing: ["o2"], next: { lesson_id: "l2" } })
    expect(nextHref(s)).toBe("/learn/lesson/l2")
  })

  it("builds the fixed message from the same summary", () => {
    const s = buildSummary("en", lessons, progress as never, NOW)
    const t = (k: string, v?: Record<string, string>) => `${k}:${JSON.stringify(v ?? {})}`
    const msg = fixedMessage(s, lessons, t as never)
    // issue #9: lesson titles, never the team-facing objective texts
    expect(msg).toContain("TITLE_l1")
    expect(msg).not.toContain("TEXT_o1")
    expect(msg).toContain("TITLE_l2")
  })

  it("uses each objective's learner name, never its team text (LRN-10 R1)", () => {
    const named = lessons.map((l) => ({ ...l, objectives: l.objectives.map((o) => ({ ...o, label: `LABEL_${o.id}` })) }))
    const s = buildSummary("en", named, progress as never, NOW)
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

describe("lrn-07-r1 shorter guide message (PR #18)", () => {
  const lessons = [lesson("l1", ["o1", "o2", "o3", "o4"]), lesson("l2", ["o5"]), lesson("l3", ["o6"])]
  const m = { p: 0.99, seen: true, answered: true, masteredAt: "2026-10-01", checksDone: 0 }
  const progress = {
    completed: { l1: { first: "2026-10-01", last: "2026-10-01", times: 1 }, l2: { first: "2026-10-01", last: "2026-10-01", times: 1 } },
    unlockedUnits: [],
    mastery: { o1: m, o2: m, o3: m, o4: m, o5: m },
  }
  const t = (k: string, v?: Record<string, string>) => `${k}:${JSON.stringify(v ?? {})}`

  it("names only the objectives of the lesson just finished", () => {
    const s = buildSummary("en", lessons, progress as never, new Date(), ["o5"])
    expect(s.mastered).toEqual(["o5"])
  })

  it("gives a count instead of more than two names", () => {
    const named = lessons.map((l) => ({ ...l, objectives: l.objectives.map((o) => ({ ...o, label: `LABEL_${o.id}` })) }))
    const msg2 = fixedMessage(buildSummary("en", named, progress as never, new Date(), ["o1", "o2", "o3"]), named, t as never)
    expect(msg2).toContain('ask.guide.masteredCount:{"n":"3"}')
    expect(msg2).not.toContain("LABEL_")
  })

  it("keeps up to two names", () => {
    const named = lessons.map((l) => ({ ...l, objectives: l.objectives.map((o) => ({ ...o, label: `LABEL_${o.id}` })) }))
    const msg = fixedMessage(buildSummary("en", named, progress as never, new Date(), ["o1", "o2"]), named, t as never)
    expect(msg).toContain("LABEL_o1, LABEL_o2")
  })

  it("falls back to counts when the names make it too long", () => {
    const long = "word ".repeat(20).trim()
    const named = lessons.map((l) => ({ ...l, title: long, objectives: l.objectives.map((o) => ({ ...o, label: `${long} ${o.id}` })) }))
    const real = (k: string, v?: Record<string, string>) =>
      ({ "ask.guide.mastered": `You mastered: ${v?.list}.`, "ask.guide.masteredCount": `You mastered ${v?.n} ideas.`, "ask.guide.nextLesson": `Next: “${v?.step}”.` })[k] ?? k
    const msg = fixedMessage(buildSummary("en", named, progress as never, new Date(), ["o1", "o2"]), named, real as never)
    expect(msg.startsWith("You mastered 2 ideas.")).toBe(true)
  })
})
