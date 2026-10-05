/** Client-side examples of CMP-01, CMP-05 R6 and MOT-06 (the server side is
 * in backend/tests/test_cmp0*.py and test_mot06_challenges.py). */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import type { Challenge } from "./api"
import { ChallengeCard, progressText } from "./ChallengeCard"
import { ago } from "./format"
import { UrgentNotice } from "./HelpScreen"
import { diffEntries } from "./learningLog"

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  id: "c1",
  type: "lessons_each",
  target_id: null,
  target_count: 3,
  text: null,
  text_lang: null,
  status: "active",
  starts_at: "2026-10-05T10:00:00Z",
  ends_at: "2026-10-12T10:00:00Z",
  ended: false,
  done: 6,
  of: 8,
  counts: "members",
  mine: true,
  my_lessons: null,
  shared_done: null,
  ...over,
})

const members = [
  { id: "u1", display_name: "نخلة الهادئ", is_me: false },
  { id: "u2", display_name: "Joseph", is_me: true },
]

beforeEach(() => useDevice.getState().set({ locale: "ar" }))
afterEach(cleanup)

describe("CMP-01 R6 urgent conversation", () => {
  it("cmp01_r6_urgent_screen_shows_emergency_guidance_first", () => {
    render(<UrgentNotice />)
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("اتصل بالطوارئ في بلدك")
    expect(alert.textContent).toContain("لست وحدك")
    // no helpline number we have not verified, and no "numbers" button
    expect(alert.textContent).not.toMatch(/\d/)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("cmp01_r6_guidance_reads_in_the_learner_language", () => {
    useDevice.getState().set({ locale: "en" })
    render(<UrgentNotice />)
    expect(screen.getByRole("alert").textContent).toContain("emergency number")
  })
})

describe("CMP-05 R6 / MOT-06 R4 the group page shows a count only", () => {
  it("cmp05_r6_group_page_challenge_shows_count_only", () => {
    wrap(<ChallengeCard challenge={challenge()} members={members} />)
    expect(screen.getByText("6 من 8 أتمّوا")).toBeTruthy()
    const card = document.querySelector("[data-slot=group-challenge]")!
    expect(card.textContent).not.toContain("نخلة الهادئ")
    expect(card.textContent).not.toContain("Joseph")
  })

  it("mot06_r4_group_total_counts_lessons_together", () => {
    const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate("ar", k, v)
    expect(progressText(t, { done: 11, of: 20, counts: "lessons" })).toBe("11 من 20 درسًا معًا")
  })

  it("mot06_r4_mentor_sees_names_only_of_members_sharing_with_him", () => {
    wrap(<ChallengeCard challenge={challenge({ mine: null, shared_done: ["u2"] })} members={members} />)
    const card = document.querySelector("[data-slot=group-challenge]")!
    expect(card.textContent).toContain("Joseph")
    expect(card.textContent).not.toContain("نخلة الهادئ")
  })

  it("mot06_r5_ended_challenge_encourages_without_names", () => {
    wrap(<ChallengeCard challenge={challenge({ ended: true, done: 5 })} members={members} />)
    const card = document.querySelector("[data-slot=group-challenge]")!
    expect(card.textContent).toContain("بلغت المجموعة 5 من 8")
    expect(card.textContent).not.toContain("Joseph")
  })
})

describe("MOT-06 learning log from the device stores", () => {
  const empty = { completed: {}, badges: {}, days: [] as string[] }

  it("mot06_r2_lesson_repeats_and_learning_days_are_logged", () => {
    const next = {
      completed: { "u1-l1": { first: "2026-10-05T08:00:00Z", last: "2026-10-05T09:00:00Z", times: 2 } },
      badges: { "unit-u1": { id: "unit-u1", earnedAt: "2026-10-05T09:00:00Z" }, "days-7": { id: "days-7", earnedAt: "2026-10-05T09:00:00Z" } },
      days: ["2026-10-05"],
    }
    const out = diffEntries(empty, next)
    expect(out).toEqual([
      { kind: "lesson", item_id: "u1-l1", at: "2026-10-05T09:00:00Z", day: expect.any(String), is_repeat: true },
      { kind: "unit", item_id: "u1", at: "2026-10-05T09:00:00Z" },
      { kind: "day", item_id: "2026-10-05" },
    ])
  })

  it("mot06_r2_nothing_new_logs_nothing", () => {
    const same = { completed: { a: { first: "x", last: "y", times: 1 } }, badges: {}, days: ["2026-10-05"] }
    expect(diffEntries(same, same)).toEqual([])
  })
})

describe("copy uses Latin digits in Arabic (brand guide)", () => {
  it("relative time in Arabic uses Latin digits", () => {
    const now = Date.parse("2026-10-05T12:00:00Z")
    expect(ago("2026-10-05T11:40:00Z", "ar", now)).toMatch(/20/)
  })
})
