/** PRC-01 (prayer times and qibla) and PRC-04 R3/R4 (fasting times, Ramadan Isha): one test per example. */
import { afterEach, describe, expect, it, vi } from "vitest"

import official from "./__fixtures__/umm-al-qura.json"
import { dayTimes, fastingTimes, formatTime, methodFor, nextPrayer, qiblaBearing, TIME_KEYS, ymdIn } from "./times"

const RIYADH = { lat: 24.68773, lng: 46.72185, country: "SA", tz: "Asia/Riyadh" }
const MANILA = { lat: 14.6042, lng: 120.9822, country: "PH", tz: "Asia/Manila" }
const day = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return { y, m, d }
}
const hm = (d: Date, tz = "Asia/Riyadh") => formatTime(d, tz)
const minutes = (d: Date, tz: string) => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d)
  const [h, m] = p.split(":").map(Number)
  return h * 60 + m
}

afterEach(() => vi.unstubAllGlobals())

describe("PRC-01 R1: on the device", () => {
  it("computes a full day with no network", () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("offline")
    })
    const t = dayTimes(RIYADH, day("2026-10-05"))
    expect(TIME_KEYS.every((k) => t[k] instanceof Date)).toBe(true)
    expect(qiblaBearing(RIYADH.lat, RIYADH.lng)).toBe(244)
  })
})

describe("PRC-01 R3: the official calendar of the country", () => {
  it("Riyadh on 5 October 2026 matches the Umm al-Qura calendar", () => {
    const t = dayTimes(RIYADH, day("2026-10-05"))
    expect([t.fajr, t.dhuhr, t.asr, t.maghrib, t.isha].map((d) => hm(d))).toEqual(["4:30", "11:42", "3:05", "5:37", "7:07"])
  })

  it("never shows a prayer before its official time, nor sunrise after it (40 official days, 5 cities)", () => {
    for (const [city, days] of Object.entries(official.days)) {
      const [lat, lng] = official.cities[city]
      for (const [date, off] of Object.entries(days)) {
        const ramadan = off.hijri.slice(5, 7) === "09"
        const t = dayTimes({ lat, lng, country: "SA" }, day(date), { ramadan })
        for (const k of ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const) {
          const [h, m] = off[k].split(":").map(Number)
          expect(minutes(t[k], "Asia/Riyadh"), `${city} ${date} ${k}`).toBeGreaterThanOrEqual(h * 60 + m)
        }
        const [sh, sm] = off.sunrise.split(":").map(Number)
        expect(minutes(t.sunrise, "Asia/Riyadh"), `${city} ${date} sunrise`).toBeLessThanOrEqual(sh * 60 + sm)
      }
    }
  })

  it("the Philippines (no official calendar) uses the Muslim World League; no method is ever asked", () => {
    expect(methodFor("PH")).toBe("MuslimWorldLeague")
    expect(methodFor("SA")).toBe("UmmAlQura")
    const t = dayTimes(MANILA, day("2026-10-05"))
    expect(hm(t.fajr, MANILA.tz)).toBe("4:36") // MWL 18°: 04:35 unrounded-up (research/05 §3.1) + cautious minute
  })
})

describe("PRC-01 R4: next prayer in the city's time zone", () => {
  it("after Isha the next prayer is tomorrow's Fajr", () => {
    const now = new Date("2026-10-05T21:00:00+03:00")
    const next = nextPrayer(RIYADH, now)
    expect(next.key).toBe("fajr")
    expect(next.tomorrow).toBe(true)
    expect(ymdIn(RIYADH.tz, next.at)).toEqual(day("2026-10-06"))
  })

  it("shows Riyadh times in Riyadh's zone even when the device is set to Manila time", () => {
    // Times are instants; the screen always formats them with the city's zone, never the device's.
    const t = dayTimes(RIYADH, day("2026-10-05"))
    expect(hm(t.fajr, RIYADH.tz)).toBe("4:30")
    expect(hm(t.fajr, MANILA.tz)).toBe("9:30") // what a device-zone display would wrongly show
  })
})

describe("PRC-01 R5: qibla", () => {
  it("Riyadh faces 244° from north", () => {
    expect(qiblaBearing(24.68773, 46.72185)).toBe(244)
  })
})

describe("PRC-04 R3/R4: Ramadan times in Riyadh", () => {
  it("1 Ramadan 1448 (8 Feb 2027): suhoor ends 5:12, iftar 5:43, and nothing else is called «imsak»", () => {
    const f = fastingTimes(RIYADH, day("2027-02-08"))
    expect(hm(f.suhoorEnds)).toBe("5:12")
    expect(hm(f.iftar)).toBe("5:43")
    expect(Object.keys(f)).toEqual(["suhoorEnds", "iftar"])
  })

  it("Isha moves 7:13 → 7:43 → 7:30 across 30 Sha'ban, 1 Ramadan and 1 Shawwal", () => {
    expect(hm(dayTimes(RIYADH, day("2027-02-07")).isha)).toBe("7:13")
    expect(hm(dayTimes(RIYADH, day("2027-02-08"), { ramadan: true }).isha)).toBe("7:43")
    expect(hm(dayTimes(RIYADH, day("2027-03-09")).isha)).toBe("7:30")
  })

  it("Manila's Isha is not delayed in Ramadan (the delay belongs to Umm al-Qura)", () => {
    const plain = dayTimes(MANILA, day("2027-02-08"))
    const ramadan = dayTimes(MANILA, day("2027-02-08"), { ramadan: true })
    expect(ramadan.isha.getTime()).toBe(plain.isha.getTime())
  })
})
