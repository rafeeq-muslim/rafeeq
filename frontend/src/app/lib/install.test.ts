/** PLT-16: the pure rules. Tests are named plt16_r<rule>_… after the PRD's examples. */
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  INSTALL_GAP_DAYS,
  INSTALL_MAX_SHOWINGS,
  INSTALL_VISIT_DAYS,
  cadenceAllows,
  canInstallHere,
  daysBetween,
  installCardEligible,
  installWay,
  isStandalone,
  promptInstall,
  promptReady,
  watchInstall,
  type CardContext,
  type InstallEnv,
} from "./install"
import { UA } from "./install.fixtures"

const env = (userAgent: string, p: Partial<InstallEnv> = {}): InstallEnv => ({ userAgent, platform: "", maxTouchPoints: 0, ...p })

const ctx = (p: Partial<CardContext> = {}): CardContext => ({
  installed: false,
  way: { mode: "ios-share" },
  promptReady: false,
  firstLessonDone: true,
  visitDays: 1,
  dismissed: false,
  shownDays: [],
  today: "2026-10-01",
  ...p,
})

/** A Chromium `beforeinstallprompt` event, as the browser hands it over. */
function promptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: ReturnType<typeof vi.fn>; userChoice: Promise<{ outcome: string }> }
  e.prompt = vi.fn(async () => undefined)
  e.userChoice = Promise.resolve({ outcome })
  return e
}

let stop: (() => void) | undefined
afterEach(() => {
  stop?.()
  stop = undefined
})

describe("plt-16 r2: the way to install fits the device and browser", () => {
  it("plt16_r2_chromium_on_phone_and_computer_gets_the_browser_install_window", () => {
    for (const ua of [UA.androidChrome, UA.desktopChrome, UA.desktopEdge, UA.samsung]) expect(installWay(env(ua))).toEqual({ mode: "prompt" })
  })

  it("plt16_r2_safari_on_iphone_and_ipad_gets_share_then_add_to_home_screen", () => {
    expect(installWay(env(UA.iphoneSafari))).toEqual({ mode: "ios-share" })
    // An iPad asking for the desktop site calls itself a Mac; touch points give it away (lib/push isIOS).
    expect(installWay(env(UA.macSafari17, { platform: "MacIntel", maxTouchPoints: 5 }))).toEqual({ mode: "ios-share" })
  })

  it("plt16_r2_safari_17_on_a_mac_gets_file_then_add_to_dock", () => {
    expect(installWay(env(UA.macSafari17, { platform: "MacIntel" }))).toEqual({ mode: "mac-dock" })
    expect(installWay(env(UA.macSafari16, { platform: "MacIntel" }))).toEqual({ mode: "other-browser", reason: "unsupported", open: "chromeEdge" })
  })

  it("plt16_r2_firefox_on_a_computer_is_told_which_browser_installs", () => {
    expect(installWay(env(UA.desktopFirefox))).toEqual({ mode: "other-browser", reason: "unsupported", open: "chromeEdge" })
  })

  it("plt16_r2_a_browser_inside_another_app_is_told_which_browser_to_open", () => {
    expect(installWay(env(UA.iphoneInstagram))).toEqual({ mode: "other-browser", reason: "inApp", open: "safari" })
    expect(installWay(env(UA.iphoneWebView))).toEqual({ mode: "other-browser", reason: "inApp", open: "safari" })
    expect(installWay(env(UA.androidFacebook))).toEqual({ mode: "other-browser", reason: "inApp", open: "chrome" })
    expect(installWay(env(UA.iphoneChrome))).toEqual({ mode: "other-browser", reason: "iosOther", open: "safari" })
  })

  it("plt16_r2_the_browser_window_opens_only_from_promptInstall_and_never_by_itself", async () => {
    const target = new EventTarget() as unknown as Window
    const available = vi.fn()
    stop = watchInstall(target, { available })
    expect(promptReady()).toBe(false)
    expect(await promptInstall()).toBe("unavailable") // nothing to show before the browser offers

    const e = promptEvent("accepted")
    target.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true) // the browser's own bar does not appear either
    expect(available).toHaveBeenCalledTimes(1)
    expect(promptReady()).toBe(true)
    expect(e.prompt).not.toHaveBeenCalled() // R2 ex4: kept, not shown

    expect(await promptInstall()).toBe("accepted") // the tap
    expect(e.prompt).toHaveBeenCalledTimes(1)
    expect(promptReady()).toBe(false) // the kept event works once
    expect(await promptInstall()).toBe("unavailable")
  })

  it("plt16_r2_a_declined_browser_window_is_just_declined", async () => {
    const target = new EventTarget() as unknown as Window
    stop = watchInstall(target)
    target.dispatchEvent(promptEvent("dismissed"))
    expect(await promptInstall()).toBe("dismissed")
  })
})

describe("plt-16 r1: installed is known from the display mode or the browser's event", () => {
  it("plt16_r1_standalone_display_mode_or_ios_standalone_means_installed", () => {
    const mm = (matches: boolean) => (q: string) => ({ matches: matches && q === "(display-mode: standalone)" })
    expect(isStandalone({ matchMedia: mm(true) })).toBe(true)
    expect(isStandalone({ matchMedia: mm(false), navigator: { standalone: true } })).toBe(true)
    expect(isStandalone({ matchMedia: mm(false), navigator: {} })).toBe(false)
  })

  it("plt16_r1_the_appinstalled_event_reports_the_install", () => {
    const target = new EventTarget() as unknown as Window
    const installed = vi.fn()
    stop = watchInstall(target, { installed })
    target.dispatchEvent(promptEvent())
    target.dispatchEvent(new Event("appinstalled"))
    expect(installed).toHaveBeenCalledTimes(1)
    expect(promptReady()).toBe(false)
  })
})

describe("plt-16 r3: the card is eligible only when all four hold", () => {
  it("plt16_r3_the_two_numbers_live_in_one_place", () => {
    expect([INSTALL_GAP_DAYS, INSTALL_MAX_SHOWINGS, INSTALL_VISIT_DAYS]).toEqual([14, 3, 3])
  })

  it("plt16_r3_first_visit_without_a_lesson_no_card", () => {
    expect(installCardEligible(ctx({ firstLessonDone: false, visitDays: 1 }))).toBe(false)
  })

  it("plt16_r3_after_the_first_lesson_the_card_is_eligible_the_next_day", () => {
    expect(installCardEligible(ctx({ firstLessonDone: true, visitDays: 2, today: "2026-10-02" }))).toBe(true)
  })

  it("plt16_r3_three_distinct_visit_days_make_it_eligible_without_a_lesson", () => {
    expect(installCardEligible(ctx({ firstLessonDone: false, visitDays: 2 }))).toBe(false)
    expect(installCardEligible(ctx({ firstLessonDone: false, visitDays: 3 }))).toBe(true)
  })

  it("plt16_r3_a_browser_that_cannot_install_never_gets_the_card", () => {
    expect(installCardEligible(ctx({ way: installWay(env(UA.desktopFirefox)) }))).toBe(false)
    expect(installCardEligible(ctx({ way: installWay(env(UA.iphoneInstagram)) }))).toBe(false)
    // Chromium: only once the browser offered installing.
    expect(canInstallHere({ mode: "prompt" }, false)).toBe(false)
    expect(installCardEligible(ctx({ way: { mode: "prompt" }, promptReady: false }))).toBe(false)
    expect(installCardEligible(ctx({ way: { mode: "prompt" }, promptReady: true }))).toBe(true)
    expect(installCardEligible(ctx({ way: { mode: "mac-dock" } }))).toBe(true)
  })
})

describe("plt-16 r4: three showings at most, 14 days apart, never after installing or hiding", () => {
  it("plt16_r4_seen_on_day_1_hidden_on_day_5_eligible_again_on_day_15", () => {
    const shownDays = ["2026-10-01"]
    expect(daysBetween("2026-10-01", "2026-10-15")).toBe(14)
    expect(installCardEligible(ctx({ shownDays, today: "2026-10-01" }))).toBe(true) // it keeps its place that day
    expect(installCardEligible(ctx({ shownDays, today: "2026-10-05" }))).toBe(false)
    expect(installCardEligible(ctx({ shownDays, today: "2026-10-14" }))).toBe(false)
    expect(installCardEligible(ctx({ shownDays, today: "2026-10-15" }))).toBe(true)
  })

  it("plt16_r4_after_three_showing_days_it_does_not_come_back_a_month_later", () => {
    const shownDays = ["2026-10-01", "2026-10-15", "2026-10-29"]
    expect(cadenceAllows(shownDays, "2026-10-29")).toBe(true) // still the third day
    expect(installCardEligible(ctx({ shownDays, today: "2026-11-29" }))).toBe(false)
    expect(installCardEligible(ctx({ shownDays, today: "2027-10-29" }))).toBe(false)
  })

  it("plt16_r4_hidden_with_one_tap_it_does_not_come_back_after_14_days", () => {
    expect(installCardEligible(ctx({ dismissed: true, shownDays: ["2026-10-01"], today: "2026-10-15" }))).toBe(false)
  })

  it("plt16_r4_installed_it_does_not_come_back", () => {
    expect(installCardEligible(ctx({ installed: true }))).toBe(false)
    expect(installCardEligible(ctx({ installed: true, shownDays: ["2026-10-01"], today: "2026-10-15" }))).toBe(false)
  })

  it("plt16_r4_a_device_clock_moved_back_does_not_bring_it_early", () => {
    expect(installCardEligible(ctx({ shownDays: ["2026-10-10"], today: "2026-10-01" }))).toBe(false)
  })
})
