/** MOT-02 forgiving streak, MOT-03 badge names and one-time announcement,
 * MOT-05 in-app reminder and /next, on the device (server side in
 * backend/tests/test_mot0*.py). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useMotivation } from "@/app/stores/motivation"
import type { Content, Lesson } from "@/app/learning/types"
import { addDay, dayBefore, localDay, newStreakBadges, streakView } from "./streak"
import { badgeView } from "./badges"
import { inAppDue, type InAppReminder } from "./reminder"

const state: { content: Content | undefined } = { content: undefined }
vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({
    content: state.content,
    isLoading: false,
    isError: false,
    lessons: state.content ? Object.values(state.content.lessons) : [],
    preview: false,
  }),
}))
const { PendingBadges } = await import("./PendingBadges")
const { ReviewDone } = await import("@/app/pages/Review")
const { nextStep } = await import("@/app/pages/Next")

const ar = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate("ar", k, v)

const unit = (over: Partial<Content["units"][number]> = {}) => ({
  id: "u1",
  order: 1,
  title: "دليل اليوم الأول",
  badge_name: "أكملت دليل اليوم الأول",
  source_credit: "",
  lessons: ["l1", "l2"],
  approved: true,
  ...over,
})

const lesson = (id: string, objectives: string[] = []) =>
  ({ id, unit: "u1", order: Number(id.slice(1)), title: id, approved: true, cards: [], objectives: objectives.map((o) => ({ id: o, text: o, cards: [] })),
    exercises: objectives.map((o) => ({ id: `e-${o}`, type: "choose", prompt: o, objectives: [o], cards: [], options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], answer: "a" })),
  }) as unknown as Lesson

const days = (from: string, n: number) => {
  const out = [from]
  while (out.length < n) out.unshift(dayBefore(out[0]))
  return out
}

beforeEach(() => {
  useDevice.setState({ locale: "ar", reminderOn: false })
  useMotivation.setState({ days: [], badges: {}, pending: [] })
  state.content = undefined
})
afterEach(cleanup)

// MOT-02 -----------------------------------------------------------------------

describe("mot-02 forgiving streak", () => {
  const today = "2026-10-10"

  it("mot02_r1_a_lesson_today_adds_a_day", () => {
    const four = days("2026-10-09", 4)
    expect(streakView(addDay(four, today), today)).toEqual({ count: 5, paused: false })
  })

  it("mot02_r1_repeating_a_lesson_counts_the_day_once", () => {
    const once = addDay([], today)
    expect(addDay(once, today)).toBe(once)
    expect(streakView(once, today).count).toBe(1)
  })

  it("mot02_r1_opening_the_app_without_a_lesson_does_not_count", () => {
    const four = days("2026-10-09", 4)
    expect(streakView(four, today).count).toBe(4) // nothing recorded by opening
  })

  it("mot02_r2_11_50_pm_and_12_10_am_are_two_days", () => {
    const late = localDay(new Date(2026, 9, 10, 23, 50))
    const after = localDay(new Date(2026, 9, 11, 0, 10))
    expect(addDay(addDay([], late), after)).toEqual(["2026-10-10", "2026-10-11"])
  })

  it("mot02_r2_travel_keeps_counted_days", () => {
    const before = ["2026-10-08", "2026-10-09"]
    // a new time zone where it is still the 9th: nothing counted is removed
    expect(addDay(before, "2026-10-09")).toEqual(before)
    expect(addDay(before, "2026-10-10")).toEqual([...before, "2026-10-10"])
  })

  it("mot02_r3_two_days_without_learning_pauses_and_keeps_the_count", () => {
    const twelve = days("2026-10-08", 12)
    expect(streakView(twelve, today)).toEqual({ count: 12, paused: true })
    expect(streakView(twelve, "2026-10-09")).toEqual({ count: 12, paused: false }) // yesterday is not a pause yet
  })

  it("mot02_r4_first_lesson_after_the_pause_resumes_from_the_count", () => {
    const twelve = days("2026-10-08", 12)
    expect(streakView(addDay(twelve, today), today)).toEqual({ count: 13, paused: false })
  })

  it("mot02_r4_return_is_welcomed_by_the_store", () => {
    useMotivation.setState({ days: days(dayBefore(dayBefore(localDay())), 12) })
    const r = useMotivation.getState().recordLearningDay()
    expect(r.resumedAfterPause).toBe(true)
    expect(useMotivation.getState().days).toHaveLength(13)
  })

  it("mot03_r1_seventh_learning_day_earns_the_badge_once", () => {
    expect(newStreakBadges(7, {})).toEqual(["days-7"])
    expect(newStreakBadges(8, { "days-7": {} })).toEqual([])
  })
})

// MOT-03 -----------------------------------------------------------------------

describe("mot-03 badge names and announcement", () => {
  const label = (n: number) => `${n} days`

  it("mot03_r3_unit_badge_shows_its_approved_name_not_the_unit_title", () => {
    expect(badgeView("unit-u1", { units: [unit()] }, label)).toMatchObject({ kind: "unit", label: "أكملت دليل اليوم الأول" })
  })

  it("mot03_r3_unit_badge_without_an_approved_name_is_kept_but_not_shown", () => {
    expect(badgeView("unit-u1", { units: [unit({ badge_name: "" })] }, label)).toBeNull()
    expect(badgeView("unit-u1", { units: [] }, label)).toBeNull() // unit not approved in this language
  })

  it("mot03_r4_badge_missed_while_closed_is_announced_once_on_next_open", () => {
    state.content = { lang: "ar", preview: false, units: [unit()], lessons: {} }
    useMotivation.setState({ badges: { "unit-u1": { id: "unit-u1", earnedAt: "2026-10-10T10:00:00Z" } }, pending: ["unit-u1"] })
    render(<PendingBadges />)
    expect(screen.getByText("أكملت دليل اليوم الأول")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: ar("common.continue") }))
    expect(useMotivation.getState().pending).toEqual([])
    cleanup()
    render(<PendingBadges />)
    expect(screen.queryByText("أكملت دليل اليوم الأول")).toBeNull()
  })

  it("mot03_r4_badge_without_an_approved_name_stays_queued_unseen", () => {
    state.content = { lang: "ar", preview: false, units: [unit({ badge_name: "" })], lessons: {} }
    useMotivation.setState({ pending: ["unit-u1"] })
    const { container } = render(<PendingBadges />)
    expect(container.innerHTML).toBe("")
    expect(useMotivation.getState().pending).toEqual(["unit-u1"])
  })

  it("mot03_r4_review_done_back_home_takes_the_badge_off_the_queue", () => {
    useMotivation.setState({ pending: ["days-7"] })
    render(
      <MemoryRouter>
        <ReviewDone badges={["days-7"]} objectives={[]} />
      </MemoryRouter>,
    )
    expect(screen.getByText(ar("lesson.streakTitle", { n: 7 }))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: ar("lesson.backHome") }))
    expect(useMotivation.getState().pending).toEqual([])
  })

  it("mot03_r4_no_comparison_with_others", () => {
    state.content = { lang: "ar", preview: false, units: [unit()], lessons: {} }
    useMotivation.setState({ pending: ["unit-u1"] })
    render(<PendingBadges />)
    expect(document.body.textContent).not.toMatch(/ترتيب|شخص|people|rank/i)
  })
})

// MOT-05 -----------------------------------------------------------------------

describe("mot-05 reminder shown inside Rafeeq (no push on this device)", () => {
  const r = (over: Partial<InAppReminder> = {}): InAppReminder => ({ on: true, time: "21:00", shownOn: null, ignored: 0, ...over })
  const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m)

  it("mot05_r1_off_until_turned_on_with_a_time", () => {
    expect(inAppDue(r({ on: false }), [], at(10, 22)).due).toBe(false)
    expect(inAppDue(r({ time: null }), [], at(10, 22)).due).toBe(false)
  })

  it("mot05_r1_shows_once_at_the_chosen_time", () => {
    expect(inAppDue(r(), [], at(10, 20, 55)).due).toBe(false)
    expect(inAppDue(r(), [], at(10, 21)).due).toBe(true)
    expect(inAppDue(r({ shownOn: "2026-10-10" }), [], at(10, 23)).due).toBe(false)
  })

  it("mot05_r2_not_on_a_day_already_learned", () => {
    expect(inAppDue(r(), ["2026-10-10"], at(10, 21)).due).toBe(false)
  })

  it("mot05_r4_three_ignored_then_every_other_day", () => {
    const s = r({ shownOn: "2026-10-09", ignored: 2 })
    expect(inAppDue(s, ["2026-10-01"], at(10, 21))).toEqual({ due: false, ignored: 3 })
    expect(inAppDue(s, ["2026-10-01"], at(11, 21))).toEqual({ due: true, ignored: 3 })
  })

  it("mot05_r4_weekly_after_six_and_learning_brings_it_back_daily", () => {
    const s = r({ shownOn: "2026-10-10", ignored: 5 })
    expect(inAppDue(s, ["2026-10-01"], at(16, 21)).due).toBe(false)
    expect(inAppDue(s, ["2026-10-01"], at(17, 21))).toEqual({ due: true, ignored: 6 })
    expect(inAppDue(r({ shownOn: "2026-10-10", ignored: 7 }), ["2026-10-11"], at(12, 21))).toEqual({ due: true, ignored: 0 })
  })

  it("mot05_r3_in_app_text_is_neutral", () => {
    for (const lang of ["ar", "en", "tl"] as const) {
      const text = translate(lang, "reminder.inApp")
      for (const word of ["رفيق", "Rafeeq", "الله", "صلا", "pray", "Islam", "سلسلة", "streak", "أيام", "days"]) expect(text).not.toContain(word)
    }
  })
})

describe("mot-05 r5 the reminder opens one step", () => {
  const content = {
    lang: "ar",
    preview: false,
    units: [unit()],
    lessons: { l1: lesson("l1", ["o1"]), l2: lesson("l2", ["o2"]) },
  } as unknown as Content
  const lessons = [content.lessons.l1, content.lessons.l2]
  const done = { first: "2026-10-01T10:00:00Z", last: "2026-10-01T10:00:00Z", times: 1 }

  it("mot05_r5_next_lesson_when_one_is_open", () => {
    expect(nextStep(content, lessons, { completed: { l1: done }, unlockedUnits: [], mastery: {} })).toBe("/learn/lesson/l2")
  })

  it("mot05_r5_review_when_the_unit_is_done_and_objectives_are_due", () => {
    const weak = { p: 0.3, seen: true, answered: true, lastAnswerAt: "2026-10-01T10:00:00Z", checksDone: 0 }
    const progress = { completed: { l1: done, l2: done }, unlockedUnits: [], mastery: { o1: weak, o2: weak } } as never
    expect(nextStep(content, lessons, progress, new Date("2026-10-10T10:00:00Z"))).toBe("/learn/review")
  })
})
