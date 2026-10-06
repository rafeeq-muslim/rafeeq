/** PRC-02 habits (draft): one test per example. */
import { describe, expect, it } from "vitest"

import { deleteHabit, habitView, localDay, newHabit, SUGGESTED, toggleToday } from "./habits"

const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`)

describe("PRC-02 R1: type is known before saving", () => {
  it("a suggested «pray on time» habit is a worship habit", () => {
    expect(newHabit({ suggested: "prayOnTime" }).worship).toBe(true)
  })
  it("a written habit chosen as daily life is not worship", () => {
    expect(newHabit({ title: "أتصل بأمي", worship: false }).worship).toBe(false)
  })
  it("a written habit left as is counts as worship", () => {
    expect(newHabit({ title: "أقرأ صفحة من القرآن" }).worship).toBe(true)
  })
})

describe("PRC-02 R2: worship habits are private", () => {
  const fajr = newHabit({ suggested: "prayOnTime" })

  it("after ten days only today's mark shows, never a count", () => {
    let log: Record<string, string[]> = {}
    for (const d of days(10)) log = toggleToday(fajr, log, d)
    const v = habitView(fajr, log, "2026-10-10")
    expect(v).toEqual({ id: fajr.id, checkedToday: true, private: true })
    expect(log[fajr.id]).toEqual(["2026-10-10"]) // no history kept
  })
})

describe("PRC-02 R3: other habits show the days kept", () => {
  const call = newHabit({ title: "أتصل بأمي", worship: false })
  const four = { [call.id]: ["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-05"] }

  it("four days → 4", () => {
    expect(habitView(call, four, "2026-10-05").daysKept).toBe(4)
  })
  it("undoing today's mark → 3, with no blame", () => {
    expect(habitView(call, toggleToday(call, four, "2026-10-05"), "2026-10-05")).toMatchObject({ daysKept: 3, checkedToday: false })
  })
})

describe("PRC-02 R5/R6", () => {
  it("after three days away only today is shown (no missed days in the view)", () => {
    const h = newHabit({ title: "x", worship: false })
    const v = habitView(h, { [h.id]: ["2026-10-01"] }, "2026-10-05")
    expect(Object.keys(v).sort()).toEqual(["checkedToday", "daysKept", "id", "private"])
    expect(v.checkedToday).toBe(false)
  })
  it("deleting a habit removes its log", () => {
    const h = newHabit({ title: "x", worship: false })
    const out = deleteHabit([h], { [h.id]: ["2026-10-01"] }, h.id)
    expect(out).toEqual({ habits: [], log: {} })
  })
})

describe("PRC-02 R1: every suggested habit has a known type", () => {
  it("prc-02-r1 the suggestion list carries the type that is saved", () => {
    for (const s of SUGGESTED) expect(newHabit({ suggested: s.key }).worship).toBe(s.worship)
  })
})

describe("PRC-02 R2/R3: «today» is the chosen city's day", () => {
  // 2026-10-05 22:30 UTC: already 6 Oct in Riyadh (UTC+3), still 5 Oct in Los Angeles.
  const at = new Date("2026-10-05T22:30:00Z")

  it("prc-02 a mark made late at night counts for the city's date, not the device's", () => {
    expect(localDay(at, "Asia/Riyadh")).toBe("2026-10-06")
    expect(localDay(at, "America/Los_Angeles")).toBe("2026-10-05")
  })

  it("prc-02 no city chosen → the device's own day", () => {
    const p = (n: number) => String(n).padStart(2, "0")
    expect(localDay(at)).toBe(`${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`)
  })
})
