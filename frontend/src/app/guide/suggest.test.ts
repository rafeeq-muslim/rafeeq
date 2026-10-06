/**
 * PLT-08 «دليل رفيق» (docs/domains/platform/features/PLT-08-rafeeq-guide.md):
 * one suggestion at the moment the journey needs it, never repeated after it
 * is hidden or used, at most one new one a day.
 */
import { describe, expect, it } from "vitest"

import { translate, type Locale } from "@/app/i18n"
import { GROUPS } from "./catalogue"
import {
  DISCOVER_AFTER_DAYS,
  LESSON_LAST_DAY_ONE,
  LESSON_PREPARE_PRAYER,
  localDay,
  suggestion,
  usedKeys,
  type GuideContext,
  type GuideMemory,
} from "./suggest"

const fresh = (): GuideMemory => ({ dismissed: {}, used: {}, lastShown: null })
const ctx = (over: Partial<GuideContext> = {}): GuideContext => ({
  completed: {},
  learningDays: 0,
  ramadan: { kind: "upcoming", start: "2027-02-08", daysLeft: 120 },
  today: "2026-10-06",
  ...over,
})
const after = (...lessons: string[]) => Object.fromEntries(lessons.map((id) => [id, "2026-10-06"]))

describe("plt08 rafeeq guide: suggestions", () => {
  it("test_plt08_r2_nothing_is_suggested_before_the_first_lesson", () => {
    expect(suggestion(ctx(), fresh())).toBeNull()
  })

  it("test_plt08_r2_prayer_times_after_the_prepare_for_prayer_lesson", () => {
    const s = suggestion(ctx({ completed: after("u01-l1", LESSON_PREPARE_PRAYER) }), fresh())
    expect(s?.moment.id).toBe("prayer")
    expect(s?.moment.route).toBe("/practice")
  })

  it("test_plt08_r2_ramadan_comes_first_two_weeks_before", () => {
    const c = ctx({ completed: after("u01-l1", LESSON_PREPARE_PRAYER), ramadan: { kind: "upcoming", start: "2027-02-08", daysLeft: 10 } })
    expect(suggestion(c, fresh())?.moment.id).toBe("ramadan")
    // Not yet at three weeks out.
    expect(suggestion({ ...c, ramadan: { kind: "upcoming", start: "2027-02-08", daysLeft: 21 } }, fresh())?.moment.id).toBe("prayer")
  })

  it("test_plt08_r2_the_moments_in_order_through_the_journey", () => {
    expect(suggestion(ctx({ completed: after("u01-l1") }), fresh())?.moment.id).toBe("human")
    const used = { ...fresh(), used: { prayer: true as const, human: true as const } }
    expect(suggestion(ctx({ completed: after("u01-l1", LESSON_PREPARE_PRAYER, LESSON_LAST_DAY_ONE) }), used)?.moment.id).toBe("adhkar")
    const more = { ...fresh(), used: { human: true as const } }
    expect(suggestion(ctx({ completed: after("u2-l1"), learningDays: DISCOVER_AFTER_DAYS }), more)?.moment.id).toBe("discover")
  })

  it("test_plt08_r3_a_hidden_suggestion_never_returns", () => {
    const c = ctx({ completed: after("u01-l1", LESSON_PREPARE_PRAYER) })
    const m: GuideMemory = { dismissed: { prayer: "2026-10-05" }, used: {}, lastShown: { key: "prayer", day: "2026-10-05" } }
    // The next day the prayer suggestion is gone; the next moment shows.
    expect(suggestion(c, m)?.moment.id).toBe("human")
  })

  it("test_plt08_r3_after_hiding_one_the_next_waits_until_tomorrow", () => {
    const c = ctx({ completed: after("u01-l1", LESSON_PREPARE_PRAYER) })
    const m: GuideMemory = { dismissed: { prayer: "2026-10-06" }, used: {}, lastShown: { key: "prayer", day: "2026-10-06" } }
    expect(suggestion(c, m)).toBeNull()
    expect(suggestion({ ...c, today: "2026-10-07" }, m)?.moment.id).toBe("human")
  })

  it("test_plt08_r3_the_card_stays_the_same_within_a_day", () => {
    // Shown «لست وحدك» this morning; later the prayer moment also becomes ready.
    const m: GuideMemory = { ...fresh(), lastShown: { key: "human", day: "2026-10-06" } }
    expect(suggestion(ctx({ completed: after("u01-l1", LESSON_PREPARE_PRAYER) }), m)?.moment.id).toBe("human")
  })

  it("test_plt08_r3_a_feature_opened_by_hand_is_not_suggested", () => {
    const c = ctx({ completed: after("u01-l1", LESSON_PREPARE_PRAYER, LESSON_LAST_DAY_ONE) })
    expect(usedKeys("/practice/adhkar/27", c)).toEqual(["adhkar"])
    const m = { ...fresh(), used: Object.fromEntries(["adhkar", "prayer", "human"].map((k) => [k, true as const])) }
    expect(suggestion(c, m)).toBeNull()
  })

  it("test_plt08_r3_ramadan_returns_each_year_and_counts_only_in_its_season", () => {
    const off = ctx({ ramadan: { kind: "upcoming", start: "2027-02-08", daysLeft: 120 } })
    expect(usedKeys("/practice", off)).toEqual(["prayer"])
    const on = ctx({ ramadan: { kind: "ramadan", start: "2027-02-08" } })
    expect(usedKeys("/practice", on)).toEqual(["ramadan-2027", "prayer"])
    const nextYear = ctx({ ramadan: { kind: "upcoming", start: "2028-01-28", daysLeft: 5 } })
    expect(suggestion(nextYear, { ...fresh(), used: { "ramadan-2027": true } })?.key).toBe("ramadan-2028")
  })

  it("test_plt08_local_day_uses_the_device_date", () => {
    expect(localDay(new Date(2026, 9, 6, 23, 59))).toBe("2026-10-06")
  })
})

describe("plt08 rafeeq guide: the page", () => {
  it("test_plt08_r4_five_groups_by_the_new_muslims_needs", () => {
    expect(GROUPS.map((g) => g.id)).toEqual(["learn", "ask", "day", "discover", "privacy"])
    expect(GROUPS.every((g) => g.items.length > 0)).toBe(true)
  })

  it("test_plt08_r4_every_feature_opens_a_real_screen", () => {
    const known = [/^\/learn(\/review)?$/, /^\/ask$/, /^\/mentor\/(help|choose|group)$/, /^\/practice(\/(qibla|adhkar|reminders))?$/, /^\/discover\/(card|quran|library|saved)$/, /^\/me(\/account)?$/]
    for (const item of GROUPS.flatMap((g) => g.items)) expect(known.some((r) => r.test(item.route)), item.route).toBe(true)
  })

  it("test_plt08_r4_every_line_is_written_in_all_three_languages", () => {
    const keys = GROUPS.flatMap((g) => [g.title, g.lede, ...g.items.flatMap((i) => [i.title, i.body])])
    for (const locale of ["ar", "en", "tl"] as Locale[]) for (const k of keys) expect(translate(locale, k), `${locale} ${k}`).not.toBe(k)
  })

  it("test_plt08_r4_habits_and_role_tools_are_not_listed", () => {
    const routes = GROUPS.flatMap((g) => g.items.map((i) => i.route))
    expect(routes.some((r) => r.includes("habits") || r.includes("inbox") || r.includes("review-desk") || r.includes("team"))).toBe(false)
  })

  it("test_plt08_r6_suggestion_copy_never_blames_about_worship", () => {
    const words = ["فات", "فاتتك", "قصّرت", "لم تصل", "missed", "you forgot"]
    for (const id of ["ramadan", "prayer", "human", "adhkar", "discover"] as const)
      for (const part of ["title", "body", "cta"] as const)
        for (const locale of ["ar", "en"] as Locale[]) {
          const text = translate(locale, `guide.suggest.${id}.${part}` as never)
          for (const w of words) expect(text.includes(w), `${locale} ${id}.${part}`).toBe(false)
        }
  })
})
