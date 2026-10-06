/**
 * PRC-07 R4 «لا يُحفظ أنه فتحها» meets PLT-08 R3 «لا يظهر بعد أن يفتح المستخدم
 * الميزة»: opening the adhkar ends their suggestion without any record that
 * they were opened — the stored state is the same as a «not now».
 */
import { beforeEach, describe, expect, it } from "vitest"

import { migrateGuide, useGuide } from "./store"
import { LESSON_LAST_DAY_ONE, MOMENTS, QUIET_MOMENTS, quietKeys, suggestion, usedKeys, type GuideContext } from "./suggest"

const ctx = (over: Partial<GuideContext> = {}): GuideContext => ({
  completed: { "u01-l1": {}, [LESSON_LAST_DAY_ONE]: {} },
  learningDays: 0,
  ramadan: null,
  today: "2026-10-06",
  ...over,
})

const memory = () => {
  const { dismissed, used, lastShown } = useGuide.getState()
  return { dismissed, used, lastShown }
}

beforeEach(() => useGuide.setState({ dismissed: {}, used: {}, lastShown: null }))

describe("PRC-07 R4: opening the adhkar is not stored", () => {
  it("prc-07-r4 the adhkar moment is quiet and its key is fixed", () => {
    expect(QUIET_MOMENTS.has("adhkar")).toBe(true)
    const adhkar = MOMENTS.find((m) => m.id === "adhkar")!
    expect(adhkar.key(ctx())).toBe("adhkar")
  })

  it("prc-07-r4 opening adhkar records no «used» flag, only a dateless dismissal", () => {
    const c = ctx()
    useGuide.getState().markUsed(usedKeys("/practice/adhkar", c))
    useGuide.getState().switchOff(quietKeys("/practice/adhkar", c))
    expect(memory().used).toEqual({})
    expect(memory().dismissed).toEqual({ adhkar: "" })
    expect(JSON.stringify(memory())).not.toMatch(/used.*adhkar/)
  })

  it("prc-07-r4 opening and dismissing leave the same stored state", () => {
    const c = ctx()
    useGuide.getState().switchOff(quietKeys("/practice/adhkar/27", c))
    const afterOpen = memory()
    useGuide.setState({ dismissed: {}, used: {}, lastShown: null })
    useGuide.getState().dismiss("adhkar", c.today)
    expect(memory()).toEqual(afterOpen)
  })

  it("plt-08-r3 adhkar opened by hand before the suggestion are still not suggested", () => {
    const early = ctx({ completed: {} }) // the adhkar moment is not ready yet
    useGuide.getState().switchOff(quietKeys("/practice/adhkar", early))
    const later = ctx({ completed: { [LESSON_LAST_DAY_ONE]: {} } })
    expect(suggestion(later, { ...memory(), used: { human: true } })).toBeNull()
  })

  it("prc-07-r4 other features still count as used (no change to PLT-08 R3)", () => {
    expect(usedKeys("/practice/qibla", ctx())).toEqual(["prayer"])
    expect(quietKeys("/practice/qibla", ctx())).toEqual([])
  })

  it("prc-07-r4 a device that stored used.adhkar (version 1) keeps no trace of it after the update", () => {
    const v1 = { dismissed: { prayer: "2026-10-05" }, used: { adhkar: true, human: true }, lastShown: { key: "prayer", day: "2026-10-05" } }
    expect(migrateGuide(v1, 1)).toEqual({
      dismissed: { prayer: "2026-10-05", adhkar: "" },
      used: { human: true },
      lastShown: { key: "prayer", day: "2026-10-05" },
    })
    const dated = { dismissed: { adhkar: "2026-10-04" }, used: {}, lastShown: null }
    expect(migrateGuide(dated, 1).dismissed).toEqual({ adhkar: "" })
  })
})
