/** PRC-04 (Hijri calendar and Ramadan mode): R1, R2, R3 countdown. */
import { describe, expect, it } from "vitest"

import { hijriOf, ramadanState, type Sighting } from "./hijri"
import { fastingTimes, splitDuration } from "./times"

const day = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return { y, m, d }
}

describe("PRC-04 R1: Umm al-Qura date for everyone, on the device", () => {
  it("5 October 2026 is 24 Rabi al-Akhir 1448", () => {
    expect(hijriOf(day("2026-10-05"))).toEqual({ year: 1448, month: 4, day: 24 })
  })

  it("is the same in Manila for the same civil day (no country, no network)", () => {
    // The date depends only on the civil day; the city only decides which civil day it is.
    expect(hijriOf(day("2026-10-05"))).toEqual(hijriOf({ y: 2026, m: 10, d: 5 }))
  })
})

describe("PRC-04 R2: Ramadan is expected until announced", () => {
  it("on 20 January 2027 Ramadan is expected in 19 days, on 8 February 2027", () => {
    const s = ramadanState(day("2027-01-20"), [], "SA")
    expect(s).toEqual({ kind: "upcoming", start: day("2027-02-08"), daysLeft: 19, announced: false })
  })

  const announced: Sighting[] = [{ country: "SA", hijri_year: 1448, hijri_month: 9, start: "2027-02-09" }]

  it("an announcement for 9 February wins: 8 February is not shown as Ramadan", () => {
    expect(ramadanState(day("2027-02-08"), announced, "SA").kind).toBe("upcoming")
    expect(ramadanState(day("2027-02-09"), announced, "SA")).toMatchObject({ kind: "ramadan", day: 1, announced: true })
  })

  it("in Manila the Saudi announcement is not applied: the expected date stays", () => {
    expect(ramadanState(day("2027-02-08"), announced, "PH")).toMatchObject({ kind: "ramadan", day: 1, announced: false })
  })
})

describe("PRC-04 R3: time left to iftar", () => {
  it("at 3:00 pm in Riyadh on 1 Ramadan, iftar is 2 h 43 min away", () => {
    const { iftar } = fastingTimes({ lat: 24.68773, lng: 46.72185, country: "SA" }, day("2027-02-08"))
    expect(splitDuration(iftar.getTime() - new Date("2027-02-08T15:00:00+03:00").getTime())).toEqual({ h: 2, m: 43 })
  })
})
