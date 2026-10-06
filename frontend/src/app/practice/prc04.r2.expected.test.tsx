/** PRC-04 R2: Ramadan stays «expected» until a sighting is announced; the calculation alone never starts Ramadan mode. */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { isRamadan, ramadanState, type Sighting } from "./hijri"
import { dayTimes, nextPrayer } from "./times"
import { RamadanCard } from "./PracticeHome"

afterEach(cleanup)
useDevice.setState({ locale: "ar" })

const day = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return { y, m, d }
}
const RIYADH = { lat: 24.68773, lng: 46.72185, country: "SA", tz: "Asia/Riyadh" }
const MANILA = { lat: 14.6042, lng: 120.9822, country: "PH", tz: "Asia/Manila" }
const hm = (d: Date, tz = RIYADH.tz) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d)
const SA_9_FEB: Sighting[] = [{ country: "SA", hijri_year: 1448, hijri_month: 9, start: "2027-02-09" }]

describe("PRC-04 R2: expected until announced", () => {
  it("prc04_r2_no_announcement_calculated_first_day_is_not_ramadan_mode", () => {
    expect(ramadanState(day("2027-02-08"), [], "SA")).toMatchObject({ kind: "ramadan", announced: false })
    expect(isRamadan(day("2027-02-08"), [], "SA")).toBe(false)
  })

  it("prc04_r2_no_announcement_saudi_isha_is_not_delayed", () => {
    const at = new Date("2027-02-08T19:20:00+03:00") // after the usual 7:13 Isha, before the Ramadan 7:43
    const next = nextPrayer(RIYADH, at, (d) => isRamadan(d, [], "SA"))
    expect(next.key).toBe("fajr")
    expect(hm(dayTimes(RIYADH, day("2027-02-08"), { ramadan: isRamadan(day("2027-02-08"), [], "SA") }).isha)).toBe(hm(dayTimes(RIYADH, day("2027-02-08")).isha))
  })

  it("prc04_r2_ex2_announced_for_9_february_starts_ramadan_mode_that_day_not_the_8th", () => {
    expect(isRamadan(day("2027-02-08"), SA_9_FEB, "SA")).toBe(false)
    expect(isRamadan(day("2027-02-09"), SA_9_FEB, "SA")).toBe(true)
    const plain = dayTimes(RIYADH, day("2027-02-09")).isha.getTime()
    const ramadan = dayTimes(RIYADH, day("2027-02-09"), { ramadan: isRamadan(day("2027-02-09"), SA_9_FEB, "SA") }).isha.getTime()
    expect(ramadan - plain).toBe(30 * 60_000)
  })

  it("prc04_r2_country_without_its_own_announcement_follows_the_saudi_one", () => {
    expect(isRamadan(day("2027-02-08"), SA_9_FEB, "PH")).toBe(false)
    expect(isRamadan(day("2027-02-09"), SA_9_FEB, "PH")).toBe(true)
    expect(ramadanState(day("2027-02-09"), SA_9_FEB, "PH")).toMatchObject({ kind: "ramadan", day: 1, announced: true })
  })

  it("prc04_r2_country_own_announcement_wins_over_the_saudi_one", () => {
    const both: Sighting[] = [...SA_9_FEB, { country: "PH", hijri_year: 1448, hijri_month: 9, start: "2027-02-10" }]
    expect(isRamadan(day("2027-02-09"), both, "PH")).toBe(false)
    expect(ramadanState(day("2027-02-10"), both, "PH")).toMatchObject({ kind: "ramadan", day: 1, announced: true })
    expect(ramadanState(day("2027-02-10"), both, "SA")).toMatchObject({ kind: "ramadan", day: 2, announced: true })
  })

  it("prc04_r2_no_saudi_and_no_own_announcement_stays_expected", () => {
    expect(ramadanState(day("2027-02-08"), [], "PH")).toMatchObject({ kind: "ramadan", day: 1, announced: false })
    expect(isRamadan(day("2027-02-08"), [], "PH")).toBe(false)
  })

  it("prc04_r2_isha_delay_stays_umm_al_qura_only_when_following_saudi", () => {
    const d = day("2027-02-10")
    expect(dayTimes(MANILA, d, { ramadan: isRamadan(d, SA_9_FEB, "PH") }).isha.getTime()).toBe(dayTimes(MANILA, d).isha.getTime())
  })
})

describe("PRC-04 R2 on the practice screen", () => {
  const card = (state: ReturnType<typeof ramadanState>, place: typeof RIYADH, line?: string) =>
    render(<RamadanCard state={state} place={place} today={day("2027-02-08")} now={new Date("2027-02-08T12:00:00+03:00")} tz={place.tz} line={line} />)

  it("prc04_r2_no_announcement_shows_the_day_as_expected_without_fasting_times", () => {
    card(ramadanState(day("2027-02-08"), [], "SA"), RIYADH)
    expect(screen.getByText(translate("ar", "practice.ramadan.expected"))).toBeTruthy()
    expect(screen.getByText(translate("ar", "practice.ramadan.expectedDay", { n: 1 }))).toBeTruthy()
    expect(screen.getByText(translate("ar", "practice.ramadan.bySighting"))).toBeTruthy()
    expect(screen.queryByText(translate("ar", "practice.ramadan.day", { n: 1 }))).toBeNull()
    expect(screen.queryByText(translate("ar", "practice.ramadan.suhoorEnds"))).toBeNull()
  })

  it("prc04_r2_ex5_local_announcement_line_stays_after_the_expected_day_arrives", () => {
    card(ramadanState(day("2027-02-08"), [], "PH"), MANILA, "يبدأ الصوم مع إعلان بلدك أو مسجدك.")
    expect(screen.getByText("يبدأ الصوم مع إعلان بلدك أو مسجدك.")).toBeTruthy()
  })

  it("prc04_r2_announced_shows_ramadan_day_with_suhoor_and_iftar", () => {
    const d = day("2027-02-09")
    render(<RamadanCard state={ramadanState(d, SA_9_FEB, "SA")} place={RIYADH} today={d} now={new Date("2027-02-09T12:00:00+03:00")} tz={RIYADH.tz} />)
    expect(screen.getByText(translate("ar", "practice.ramadan.day", { n: 1 }))).toBeTruthy()
    expect(screen.getByText(translate("ar", "practice.ramadan.suhoorEnds"))).toBeTruthy()
  })
})
