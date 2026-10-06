/**
 * LRN-04 adaptive review, one test per example (audit 2026-10-06):
 * R1 which objectives enter (and the 7- and 30-day rechecks), R2 the order,
 * R3 a wrong first answer, R5 the «أتمّ مراجعة» event, R6 withdrawn
 * exercises. The «اطّلع» eligibility (only objectives of completed lessons)
 * is unchanged here: it waits for a decision.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { useMotivation } from "@/app/stores/motivation"
import { localDay } from "@/app/motivation/streak"
import { levelOf, type ObjectiveState } from "./bkt"
import { dueCheck, inReview, selectReview } from "./review"
import { reviewItems } from "./reviewItems"
import type { Content, Exercise } from "./types"

const NOW = new Date("2026-10-20T12:00:00Z")
const DAY = 86_400_000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()
const ar = (k: Parameters<typeof translate>[1]) => translate("ar", k)

const practising = (p: number, daysAgo = 1, seen: string[] = []): ObjectiveState => ({
  p,
  seen: true,
  answered: true,
  checksDone: 0,
  lastAnswerAt: ago(daysAgo),
  lastExerciseId: seen[seen.length - 1],
  seenExercises: seen,
})
const exposed = (): ObjectiveState => ({ p: 0.1, seen: true, answered: false, checksDone: 0 })
const mastered = (masteredDaysAgo: number, checksDone = 0): ObjectiveState => ({
  p: 0.97,
  seen: true,
  answered: true,
  checksDone,
  masteredAt: ago(masteredDaysAgo),
  lastAnswerAt: ago(masteredDaysAgo),
})
const ex = (id: string, objective: string): Exercise => ({
  id,
  type: "choose",
  objectives: [objective],
  cards: [`${objective}-c`],
  prompt: `PROMPT_${id}`,
  options: [
    { id: "right", text: "الصواب" },
    { id: "wrong", text: "الخطأ" },
  ],
  answer: "right",
})
const poolFor = (ids: string[]) => Object.fromEntries(ids.map((o) => [o, [ex(`${o}-e1`, o), ex(`${o}-e2`, o)]]))

// --- R1 ---------------------------------------------------------------------------------
describe("lrn-04-r1 what enters the review", () => {
  it("lrn-04-r1: a wrong ordering makes «يرتّب خطوات الوضوء» practising, and it enters the review", () => {
    const s = practising(0.3)
    expect(levelOf(s)).toBe("practising")
    expect(inReview(s, NOW)).toBe(true)
  })

  it("lrn-04-r1: mastered 7 days ago, «محل النية القلب» enters for its check; at 6 days it does not", () => {
    expect(dueCheck(mastered(7), NOW)).toBe(true)
    expect(inReview(mastered(7), NOW)).toBe(true)
    expect(dueCheck(mastered(6), NOW)).toBe(false)
    expect(inReview(mastered(6), NOW)).toBe(false)
  })

  it("lrn-04-r1: after the 7-day check, it returns 30 days after mastery, and never after the second check", () => {
    expect(dueCheck(mastered(29, 1), NOW)).toBe(false)
    expect(dueCheck(mastered(30, 1), NOW)).toBe(true)
    expect(dueCheck(mastered(90, 2), NOW)).toBe(false)
  })
})

// --- R2 ---------------------------------------------------------------------------------
describe("lrn-04-r2 the session's order", () => {
  it("lrn-04-r2: practising 0.4 → 0.6 → 0.7, then the «اطّلع» objective, then the oldest due check; five at most", () => {
    const mastery = {
      p04: practising(0.4),
      p07: practising(0.7),
      p06: practising(0.6),
      seenOnly: exposed(),
      checkNewer: mastered(8),
      checkOlder: mastered(10),
    }
    const ids = Object.keys(mastery)
    const picked = selectReview(mastery, poolFor(ids), NOW, 5, new Set(ids))
    expect(picked.map((i) => i.objectiveId)).toEqual(["p04", "p06", "p07", "seenOnly", "checkOlder"])
  })

  it("lrn-04-r2: on a tie, the objective practised longest ago comes first", () => {
    const mastery = { recent: practising(0.5, 1), longAgo: practising(0.5, 5) }
    const picked = selectReview(mastery, poolFor(["recent", "longAgo"]), NOW, 5, new Set(["recent", "longAgo"]))
    expect(picked.map((i) => i.objectiveId)).toEqual(["longAgo", "recent"])
  })

  it("lrn-04-r2: one exercise per objective, not the one answered last time", () => {
    const picked = selectReview({ o: practising(0.4, 1, ["o-e1"]) }, poolFor(["o"]), NOW, 5, new Set(["o"]))
    expect(picked).toHaveLength(1)
    expect(picked[0].exercise.id).toBe("o-e2")
  })
})

// --- R6 ---------------------------------------------------------------------------------
function content(withSecond = true): Content {
  const exercises = [ex("o1-e1", "o1"), ...(withSecond ? [ex("o1-e2", "o1")] : [])]
  return {
    lang: "ar",
    preview: false,
    units: [{ id: "u1", order: 1, title: "U", badge_name: "B", source_credit: "", lessons: ["l1"], approved: true }],
    lessons: {
      l1: {
        id: "l1",
        unit: "u1",
        order: 1,
        title: "أتوضأ (1)",
        approved: true,
        cards: [{ id: "o1-c", kind: "text", text: "CARD_TEXT النية محلها القلب" }],
        objectives: [{ id: "o1", text: "O1", label: "موضع النية", cards: ["o1-c"] }],
        exercises,
      },
    },
  }
}
const completed = { l1: { first: ago(3), last: ago(3), times: 1 } }

describe("lrn-04-r6 only exercises still approved", () => {
  it("lrn-04-r6: the exercise last answered was withdrawn: another approved one is chosen for the objective", () => {
    // The content holds approved exercises only; «o1-e9» (answered before) is gone.
    const items = reviewItems(content(), { o1: practising(0.4, 1, ["o1-e9"]) }, NOW, completed)
    expect(items.map((i) => [i.objectiveId, i.exercise.id])).toEqual([["o1", "o1-e1"]])
  })

  it("lrn-04-r6: with no approved exercise left, the objective leaves the session", () => {
    const empty = content(false)
    empty.lessons.l1.exercises = []
    expect(reviewItems(empty, { o1: practising(0.4) }, NOW, completed)).toEqual([])
  })
})

// --- R3 / R5 on the review screen --------------------------------------------------------
let current = content()
vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content: current, isLoading: false, isError: false, lessons: Object.values(current.lessons), preview: false }),
}))
const events: Record<string, unknown>[] = []
vi.mock("@/app/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/api")>()),
  sendEvent: (e: Record<string, unknown>) => events.push(e),
  api: async () => ({ text: null }),
}))
vi.mock("@/app/lib/sync", () => ({ scheduleSync: () => undefined }))
vi.mock("@/app/lib/push", async (orig) => ({ ...(await orig<typeof import("@/app/lib/push")>()), reportLearnedToday: async () => undefined }))
const { default: Review } = await import("@/app/pages/Review")

beforeEach(() => {
  current = content()
  events.length = 0
  useDevice.setState({ locale: "ar", shareEvents: true })
  useMotivation.setState({ days: [], badges: {}, pending: [] })
})
afterEach(cleanup)

const answer = (option: string) => {
  fireEvent.click(screen.getByRole("radio", { name: option }))
  fireEvent.click(screen.getByRole("button", { name: ar("lesson.check") }))
}

describe("lrn-04-r3 a wrong first answer in review", () => {
  it("lrn-04-r3: a wrong check of a mastered objective drops it below 0.95, shows the card text, and the retry does not count", () => {
    const masteredAt = new Date(Date.now() - 8 * DAY).toISOString()
    useLearning.setState({
      completed: { l1: { first: masteredAt, last: masteredAt, times: 1 } },
      mastery: { o1: { p: 0.97, seen: true, answered: true, checksDone: 0, masteredAt, lastAnswerAt: masteredAt } },
    })
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    )
    answer("الخطأ")
    const after = useLearning.getState().mastery.o1
    expect(after.p).toBeLessThan(0.95)
    expect(levelOf(after)).toBe("practising")
    expect(screen.getByText(new RegExp(`${ar("lesson.cardText")}: CARD_TEXT`))).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/خسرت|للأسف/)
    fireEvent.click(screen.getByRole("button", { name: ar("common.continue") }))
    answer("الصواب") // the same exercise returns before the end
    expect(useLearning.getState().mastery.o1.p).toBe(after.p) // not counted
    expect(events.filter((e) => e.type === "first_answer")).toHaveLength(1)
  })
})

describe("lrn-04-r5 completing a review session", () => {
  it("lrn-04-r5: with no lesson today, finishing a review sends «أتمّ مراجعة» and makes today a learning day", () => {
    const twoHours = new Date(Date.now() - 2 * 3_600_000).toISOString()
    useLearning.setState({ completed: { l1: { first: twoHours, last: twoHours, times: 1 } }, mastery: { o1: { ...practising(0.4), lastAnswerAt: twoHours } } })
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    )
    answer("الصواب")
    fireEvent.click(screen.getByRole("button", { name: ar("common.continue") }))
    expect(events.filter((e) => e.type === "review_completed")).toHaveLength(1)
    expect(useMotivation.getState().days).toContain(localDay())
  })
})
