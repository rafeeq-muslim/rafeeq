/**
 * Cross-cutting Practice rules: PRC-01 R6, PRC-02 R2/R4, PRC-04 R5, PRC-05 R5,
 * PRC-07 R4 — nothing in Practice reaches Motivation, counts worship or sends
 * the city anywhere. PRC-07 R6 — the adhkar group suggestion.
 */
import { describe, expect, it } from "vitest"

import { orderedGroups, suggestGroup } from "./adhkar"
import { adhkarLine } from "@/app/home/layout"
import { dayTimes } from "./times"

const sources = import.meta.glob(["./*.ts", "./*.tsx", "../pages/Practice.tsx", "!./*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>

describe("Practice never rewards or reports worship", () => {
  it("imports nothing from Motivation and sends no event", () => {
    for (const [file, src] of Object.entries(sources)) {
      expect(src, file).not.toMatch(/from\s+["'][^"']*motivation[^"']*["']|useMotivation|sendEvent\(/)
    }
  })

  it("never puts the city, coordinates or a time zone in a request", () => {
    for (const [file, src] of Object.entries(sources)) {
      for (const call of src.match(/api<[^>]*>\([^)]*\)|fetch\([^)]*\)/g) ?? []) {
        expect(call, file).not.toMatch(/city|lat|lng|tz|coords/)
      }
    }
  })
})

describe("PRC-07 R6: suggested adhkar group from the time of day", () => {
  const t = dayTimes({ lat: 24.68773, lng: 46.72185, country: "SA" }, { y: 2026, m: 10, d: 5 })

  it("6:30 am in Riyadh, after Fajr → morning and evening first", () => {
    expect(suggestGroup(t, new Date("2026-10-05T06:30:00+03:00"))).toBe("morning_evening")
  })
  it("10:30 pm, after Isha → sleep first", () => {
    expect(suggestGroup(t, new Date("2026-10-05T22:30:00+03:00"))).toBe("sleep")
  })
  it("no city → the book's fixed order, no location asked", () => {
    expect(orderedGroups(suggestGroup(null, new Date()))).toEqual(["morning_evening", "after_prayer", "sleep", "waking", "daily"])
  })
  const at = (d: Date, min: number) => new Date(d.getTime() + min * 60_000)
  it("prc07 r6: 10 min after Fajr → after-prayer adhkar first (every prayer, Fajr included)", () => {
    expect(suggestGroup(t, at(t.fajr, 10))).toBe("after_prayer")
    expect(adhkarLine(t, at(t.fajr, 10))).toBe("afterPrayer")
  })
  it("prc07 r6: 10 min after Asr → after-prayer adhkar first", () => {
    expect(suggestGroup(t, at(t.asr, 10))).toBe("after_prayer")
    expect(adhkarLine(t, at(t.asr, 10))).toBe("afterPrayer")
  })
  it("prc07 r6: the half hour ends: 30 min after Fajr → morning, after Asr → evening", () => {
    expect(suggestGroup(t, at(t.fajr, 29))).toBe("after_prayer")
    expect(suggestGroup(t, at(t.fajr, 30))).toBe("morning_evening")
    expect(adhkarLine(t, at(t.fajr, 30))).toBe("morning")
    expect(adhkarLine(t, at(t.asr, 30))).toBe("evening")
  })
  it("prc07 r6: 00:30 after midnight, still the night after Isha → sleep first", () => {
    expect(suggestGroup(t, new Date("2026-10-05T00:30:00+03:00"))).toBe("sleep")
    expect(adhkarLine(t, new Date("2026-10-05T00:30:00+03:00"))).toBe("sleep")
  })
  it("prc07 r6: one minute before Fajr → sleep; at Fajr → after-prayer", () => {
    expect(suggestGroup(t, at(t.fajr, -1))).toBe("sleep")
    expect(suggestGroup(t, t.fajr)).toBe("after_prayer")
  })
})
