/** PRC-05 (prayer reminder, web in-app delivery): one test per example. */
import { describe, expect, it } from "vitest"

import { ar } from "@/app/i18n/ar"
import { en } from "@/app/i18n/en"
import { tl } from "@/app/i18n/tl"
import { DEFAULT_REMINDERS, type ReminderSettings } from "./store"
import { reminderText, upcomingReminders } from "./reminders"
import { formatTime } from "./times"

const RIYADH = { lat: 24.68773, lng: 46.72185, country: "SA", tz: "Asia/Riyadh" }
const MANILA = { lat: 14.6042, lng: 120.9822, country: "PH", tz: "Asia/Manila" }
const on = (patch: Partial<ReminderSettings> = {}): ReminderSettings => ({ ...DEFAULT_REMINDERS, enabled: true, ...patch })
const at = (iso: string) => new Date(iso)

describe("PRC-05 R1: off until chosen; chosen prayers only; never backs off", () => {
  it("a fresh install gets no reminder", () => {
    expect(DEFAULT_REMINDERS.enabled).toBe(false)
    expect(upcomingReminders(RIYADH, DEFAULT_REMINDERS, at("2026-10-05T11:00:00+03:00"))).toEqual([])
  })

  it("with Fajr and Maghrib chosen, nothing comes at Dhuhr", () => {
    const r = upcomingReminders(RIYADH, on({ prayers: ["fajr", "maghrib"] }), at("2026-10-05T11:00:00+03:00"))
    expect(r.map((x) => x.key)).toEqual(["maghrib", "fajr", "maghrib"])
  })

  it("a week of ignored reminders changes nothing: the next prayer still comes", () => {
    const s = on()
    const weekLater = upcomingReminders(RIYADH, s, at("2026-10-12T11:00:00+03:00"))
    expect(weekLater[0].key).toBe("dhuhr")
    expect(weekLater.filter((x) => x.id.startsWith("2026-10-12")).length).toBe(4) // Dhuhr…Isha still ahead today
  })

  it("in Ramadan, suhoor and iftar reminders exist and stay off until turned on", () => {
    const now = at("2027-02-08T12:00:00+03:00")
    const ramadan = () => true
    expect(upcomingReminders(RIYADH, on({ prayers: [] }), now, ramadan)).toEqual([])
    const keys = upcomingReminders(RIYADH, on({ prayers: [], suhoor: true, iftar: true }), now, ramadan).map((x) => x.key)
    expect(keys).toEqual(["iftar", "suhoor", "iftar"])
  })
})

describe("PRC-05 R2: neutral text by default", () => {
  const [asr] = upcomingReminders(RIYADH, on({ prayers: ["asr"], offset: 10 }), at("2026-10-05T12:00:00+03:00"))

  it("shows only «تذكير» with no prayer name or religious word", () => {
    expect(reminderText(asr, on(), "ar", RIYADH.tz)).toBe("تذكير")
    expect(reminderText(asr, on(), "en", RIYADH.tz)).toBe("Reminder")
  })

  it("names the prayer when the learner chose that", () => {
    expect(reminderText(asr, on({ showName: true, offset: 10 }), "ar", RIYADH.tz)).toBe("العصر بعد 10 دقائق")
  })
})

describe("PRC-05 R3: at the time or minutes before, from the city's times", () => {
  it("10 minutes before Asr in Riyadh on 5 Oct 2026 is 2:55 (Asr 3:05)", () => {
    const [asr] = upcomingReminders(RIYADH, on({ prayers: ["asr"], offset: 10 }), at("2026-10-05T12:00:00+03:00"))
    expect(formatTime(asr.at, RIYADH.tz)).toBe("2:55")
    expect(formatTime(asr.time, RIYADH.tz)).toBe("3:05")
  })

  it("after moving to Manila, reminders follow Manila's times", () => {
    const s = on({ prayers: ["asr"] })
    const riyadh = upcomingReminders(RIYADH, s, at("2026-10-05T05:00:00Z"))[0]
    const manila = upcomingReminders(MANILA, s, at("2026-10-05T05:00:00Z"))[0]
    expect(manila.at.getTime()).not.toBe(riyadh.at.getTime())
    expect(formatTime(manila.time, MANILA.tz)).toBe("3:07")
  })
})

describe("PRC-05 R5: no tracking and no reminder for a time that passed", () => {
  it("once Dhuhr has passed, no Dhuhr reminder is left for today", () => {
    const r = upcomingReminders(RIYADH, on({ prayers: ["dhuhr"] }), at("2026-10-05T13:00:00+03:00"))
    expect(r.map((x) => x.id)).toEqual(["2026-10-06:dhuhr:0"])
  })
})

describe("PRC-05 R6: the web says honestly where reminders work", () => {
  it("the note exists in all three languages", () => {
    for (const d of [ar, en, tl]) expect((d as Record<string, string>)["practice.reminders.webNote"]).toBeTruthy()
  })
})
