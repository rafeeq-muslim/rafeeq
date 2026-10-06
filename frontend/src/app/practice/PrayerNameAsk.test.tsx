/**
 * PLT-06 R3 / PRC-05 R2 (product owner's approval, 2026-10-06): no default for
 * the prayer name; the first time prayer reminders are turned on, the learner
 * is asked once. The «حسابي» switch is covered in platform.rules.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import RemindersScreen from "./RemindersScreen"
import { DEFAULT_REMINDERS, usePractice } from "./store"
import { needsNameAsk } from "./PrayerNameAsk"
import { reminderText, type Reminder } from "./reminders"

const ar_ = (k: Key) => translate("ar", k)
const RIYADH = { id: "riyadh", name: { ar: "الرياض", en: "Riyadh" }, country: "SA", lat: 24.68773, lng: 46.72185, tz: "Asia/Riyadh" }
const ASR: Reminder = { id: "x", key: "asr", at: new Date(), time: new Date() }

const screenWith = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <RemindersScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )

const enableSwitch = () => screen.getByRole("switch", { name: ar_("practice.reminders.enable") })
const question = () => screen.queryByRole("dialog", { name: ar_("practice.reminders.ask.title") })
const reminders = () => usePractice.getState().reminders

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }), { headers: { "Content-Type": "application/json" } })))
  useDevice.setState({ locale: "ar", city: RIYADH, discreet: false })
  usePractice.setState({ reminders: { ...DEFAULT_REMINDERS } })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("prc-05-r2 / plt-06-r3: ask once whether the reminder shows the prayer name", () => {
  it("prc05_r2_first_enable_asks_and_stays_neutral_until_answered", () => {
    screenWith()
    expect(question()).toBeNull()
    fireEvent.click(enableSwitch())
    expect(question()).toBeTruthy()
    expect(screen.getByText(ar_("practice.reminders.ask.body"))).toBeTruthy()
    expect(reminders()).toMatchObject({ enabled: true, showName: false })
    expect(reminderText(ASR, reminders(), "ar", RIYADH.tz, false)).toBe(ar_("practice.reminders.neutral"))
  })

  it("prc05_r2_show_the_name_answer_sets_showName", () => {
    screenWith()
    fireEvent.click(enableSwitch())
    fireEvent.click(screen.getByRole("button", { name: ar_("practice.reminders.ask.show") }))
    expect(question()).toBeNull()
    expect(reminders()).toMatchObject({ enabled: true, showName: true, askedName: true })
    expect(reminderText(ASR, reminders(), "ar", RIYADH.tz, false)).toContain(ar_("practice.prayer.asr" as Key))
  })

  it("prc05_r2_reminder_only_answer_keeps_it_neutral", () => {
    screenWith()
    fireEvent.click(enableSwitch())
    fireEvent.click(screen.getByRole("button", { name: ar_("practice.reminders.ask.neutral") }))
    expect(question()).toBeNull()
    expect(reminders()).toMatchObject({ enabled: true, showName: false, askedName: true })
    expect(reminderText(ASR, reminders(), "ar", RIYADH.tz, false)).toBe(ar_("practice.reminders.neutral"))
  })

  it("prc05_r2_second_enable_does_not_ask_again", () => {
    screenWith()
    fireEvent.click(enableSwitch())
    fireEvent.click(screen.getByRole("button", { name: ar_("practice.reminders.ask.neutral") }))
    fireEvent.click(enableSwitch()) // off
    expect(reminders().enabled).toBe(false)
    fireEvent.click(enableSwitch()) // on again
    expect(reminders().enabled).toBe(true)
    expect(question()).toBeNull()
    expect(needsNameAsk(reminders())).toBe(false)
  })

  it("prc05_r2_dismissing_without_an_answer_keeps_it_neutral", () => {
    screenWith()
    fireEvent.click(enableSwitch())
    fireEvent.keyDown(question() as HTMLElement, { key: "Escape" })
    expect(question()).toBeNull()
    expect(reminders()).toMatchObject({ enabled: true, showName: false })
    expect(reminders().askedName).toBeFalsy() // not an answer: asked again on the next first turn-on
    expect(reminderText(ASR, reminders(), "ar", RIYADH.tz, false)).toBe(ar_("practice.reminders.neutral"))
  })

  it("prc05_r2_the_switch_changes_the_choice_later_and_counts_as_an_answer", () => {
    usePractice.setState({ reminders: { ...DEFAULT_REMINDERS, enabled: true, askedName: true } })
    screenWith()
    fireEvent.click(screen.getByRole("switch", { name: new RegExp(ar_("practice.reminders.showName")) }))
    expect(reminders()).toMatchObject({ showName: true, askedName: true })
  })

  it("prc05_r2_the_hint_claims_no_default", () => {
    for (const l of ["ar", "en", "tl"] as const) {
      const hint = translate(l, "practice.reminders.showNameHint")
      expect(hint).not.toMatch(/افتراضيًا|by default|bilang default/)
    }
  })
})
