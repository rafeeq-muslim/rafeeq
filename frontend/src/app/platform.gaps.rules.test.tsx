/**
 * Platform audit gaps (branch plt-audit-gaps):
 * - PLT-05 R2: quick exit on the screens outside AppLayout (/welcome, /privacy).
 * - PLT-05 R3: the static page title is neutral and «Notes» in discreet mode
 *   from the first moment; the installed name has no religious word.
 * - PLT-05 R3 / PLT-06 R3, R6: the lock-screen line is truthful; discreet
 *   mode gives notifications a neutral icon (service worker: sw.test.ts).
 * - PLT-05 R1: the policy link where data first leaves the device on Ask and
 *   mentor matching.
 * - PLT-08 R1, R5: the next lesson first, then at most one suggestion; the
 *   «كل ما في رفيق» link at the end of Home and first in «حسابي».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { useGuide } from "@/app/guide/store"
import { orderedLessons } from "@/app/learning/path"
import type { Content, Lesson, Unit } from "@/app/learning/types"
import indexHtml from "../../index.html?raw"
import bootTitleJs from "../../public/boot-title.js?raw"
import mainTsx from "../main.tsx?raw"
import viteConfig from "../../vite.config.ts?raw"
import { DISCREET_PREF, NEUTRAL_LOOK, PREF_CACHE, RAFEEQ_LOOK, notificationLook, readDiscreet, saveDiscreet } from "@/app/lib/discreetPref"

// --- content: the day-one unit, enough for Home's next step -----------------------------
function makeContent(): Content {
  const titles = ["أشهد", "أغتسل", "أتوضأ"]
  const ids = titles.map((_, i) => `u01-l${i + 1}`)
  const units: Unit[] = [{ id: "u01", order: 1, title: "دليل اليوم الأول", badge_name: "", source_credit: "", lessons: ids, approved: true }]
  const lessons: Record<string, Lesson> = {}
  titles.forEach((title, i) => {
    const id = ids[i]
    lessons[id] = { id, unit: "u01", order: i + 1, title, cards: [{ id: `${id}-c`, kind: "text", text: title }], objectives: [], exercises: [], approved: true }
  })
  return { lang: "ar", preview: false, units, lessons }
}
const content = makeContent()
const lessons = orderedLessons(content.units, content.lessons)

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content, isLoading: false, isError: false, refetch: () => undefined, lessons, preview: false }),
}))
vi.mock("@/app/lib/privacy", async (orig) => ({ ...(await orig<typeof import("@/app/lib/privacy")>()), exitNow: vi.fn() }))

const { exitNow } = await import("@/app/lib/privacy")
const { PublicFrame } = await import("@/app/AppLayout")
const { default: Welcome } = await import("@/app/pages/Welcome")
const { default: Privacy } = await import("@/app/pages/Privacy")
const { default: Home } = await import("@/app/pages/Home")
const { default: Me } = await import("@/app/pages/Me")
const { default: Ask } = await import("@/app/pages/Ask")
const { MatchForm } = await import("@/app/companion/ChooseMentor")

const BRAND_FILES = Object.keys(import.meta.glob("../../public/brand/*.png")).map((f) => f.replace("../../public", ""))
const ar_ = (k: Key) => translate("ar", k)

/** A minimal Cache Storage, like the browser's, for the discreet pref. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>()
  return {
    stores,
    open: async (name: string) => {
      const m = stores.get(name) ?? new Map<string, Response>()
      stores.set(name, m)
      return {
        put: async (k: string, r: Response) => void m.set(k, r),
        delete: async (k: string) => m.delete(k),
        match: async (k: string) => m.get(k),
      } as unknown as Cache
    },
  }
}

const wrap = (ui: React.ReactNode, entry = "/") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )

/** The routes outside AppLayout, framed as in main.tsx. */
const publicRoutes = (entry: string) =>
  wrap(
    <Routes>
      <Route element={<PublicFrame />}>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/privacy" element={<Privacy />} />
      </Route>
    </Routes>,
    entry,
  )

beforeEach(() => {
  localStorage.clear()
  // PLT-08 R1/R5 are tested on the previous Home, which PLT09_ORGANIZED_HOME=false brings back (PLT-09 replaces them when on).
  useDevice.setState({ locale: "ar", onboarded: true, quickExit: false, discreet: false, organizedHome: false })
  useLearning.setState({ completed: {}, sessions: {}, mastery: {}, unlockedUnits: [] })
  useGuide.setState({ dismissed: {}, used: {}, lastShown: null })
  vi.mocked(exitNow).mockClear()
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ detail: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// --- PLT-05 R2 ---------------------------------------------------------------------------
describe("plt-05-r2 quick exit on every screen, also outside AppLayout", () => {
  it("plt05_r2_the_button_is_on_the_privacy_screen_and_leaves_at_once", () => {
    useDevice.setState({ quickExit: true })
    publicRoutes("/privacy")
    fireEvent.click(screen.getByRole("button", { name: ar_("exit.weather") }))
    expect(exitNow).toHaveBeenCalledTimes(1)
  })

  it("plt05_r2_shift_three_times_works_on_the_language_screen", () => {
    useDevice.setState({ quickExit: true, onboarded: false })
    publicRoutes("/welcome")
    expect(screen.getByRole("button", { name: ar_("exit.weather") })).toBeTruthy()
    for (let i = 0; i < 3; i++) fireEvent.keyUp(window, { key: "Shift" })
    expect(exitNow).toHaveBeenCalledTimes(1)
  })

  it("plt05_r2_nothing_shows_on_those_screens_unless_it_is_on", () => {
    publicRoutes("/privacy")
    expect(screen.queryByRole("button", { name: ar_("exit.weather") })).toBeNull()
    for (let i = 0; i < 3; i++) fireEvent.keyUp(window, { key: "Shift" })
    expect(exitNow).not.toHaveBeenCalled()
  })

  it("plt05_r2_main_frames_welcome_and_privacy_with_quick_exit", () => {
    const main = mainTsx
    const frame = main.slice(main.indexOf("element: <PublicFrame />"), main.indexOf('path: "/",'))
    expect(frame).toContain('path: "/welcome"')
    expect(frame).toContain('path: "/privacy"')
  })
})

// --- PLT-05 R3 ---------------------------------------------------------------------------
describe("plt-05-r3 discreet mode leaves no trace in the page or the app name", () => {
  const html = indexHtml
  const bootTitle = bootTitleJs
  const runBoot = () => {
    document.head.querySelectorAll("title").forEach((t) => t.remove())
    new Function(bootTitle)()
    return document.title
  }

  it("plt05_r3_the_static_page_is_neutral_and_sets_the_title_before_its_fallback", () => {
    const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1])
    expect(titles).toEqual(["Rafeeq"])
    expect(html).not.toContain("نظام تصميم")
    expect(html.indexOf('<script src="/boot-title.js"></script>')).toBeGreaterThan(-1)
    expect(html.indexOf('<script src="/boot-title.js"></script>')).toBeLessThan(html.indexOf("<title>"))
  })

  it("plt05_r3_discreet_mode_shows_notes_from_the_first_moment", () => {
    localStorage.setItem("rafeeq.device", JSON.stringify({ state: { locale: "ar", discreet: true }, version: 1 }))
    expect(runBoot()).toBe("Notes")
  })

  it("plt05_r3_without_discreet_mode_the_title_matches_the_app", () => {
    localStorage.setItem("rafeeq.device", JSON.stringify({ state: { locale: "ar", discreet: false }, version: 1 }))
    expect(runBoot()).toBe("رفيق")
    localStorage.setItem("rafeeq.device", JSON.stringify({ state: { locale: "tl", discreet: false }, version: 1 }))
    expect(runBoot()).toBe("Rafeeq")
    localStorage.clear()
    expect(runBoot()).toBe("Rafeeq")
    localStorage.setItem("rafeeq.device", "{broken")
    expect(runBoot()).toBe("Rafeeq")
  })

  it("plt05_r3_the_installed_name_and_description_have_no_religious_word", () => {
    const config = viteConfig
    const manifest = config.slice(config.indexOf("manifest: {"), config.indexOf("icons: ["))
    expect(manifest).toContain('name: "Rafeeq"')
    expect(manifest).toContain('short_name: "Rafeeq"')
    for (const word of ["Islam", "Muslim", "Quran", "Allah", "إسلام", "مسلم", "قرآن", "الله", "دين"]) expect(manifest).not.toContain(word)
  })
})

// --- PLT-05 R3 / PLT-06 R3, R6 -----------------------------------------------------------
describe("plt-06-r3 plt-06-r6 notifications: truthful line and a neutral icon in discreet mode", () => {
  it("plt06_r3_the_lock_screen_line_promises_only_what_is_true", () => {
    for (const lang of ["ar", "en", "tl"] as const) {
      const line = translate(lang, "notif.neutral")
      // Chrome on Android shows the site address (or the installed app's name): never promise "no Rafeeq name".
      expect(line).not.toMatch(/رفيق|Rafeeq/)
      expect(line).toMatch(/عنوان الموقع|site address|address ng site/)
    }
    expect(ar_("privacy.discreetHint")).not.toContain("بلا اسم رفيق")
  })

  it("plt06_r6_discreet_mode_uses_a_plain_icon_not_the_flower", () => {
    expect(notificationLook(true)).toEqual(NEUTRAL_LOOK)
    expect(notificationLook(false)).toEqual(RAFEEQ_LOOK)
    expect(NEUTRAL_LOOK.icon).not.toMatch(/rafeeq|favicon/)
    expect(NEUTRAL_LOOK.badge).not.toMatch(/rafeeq|favicon/)
    for (const f of Object.values(NEUTRAL_LOOK)) expect(BRAND_FILES).toContain(f)
  })

  it("plt06_r6_the_switch_reaches_the_service_worker_on_this_device_only", async () => {
    const store = fakeCaches()
    expect(await readDiscreet(store)).toBe(false)
    await saveDiscreet(true, store)
    expect(await readDiscreet(store)).toBe(true)
    expect(store.stores.get(PREF_CACHE)?.has(DISCREET_PREF)).toBe(true)
    await saveDiscreet(false, store)
    expect(await readDiscreet(store)).toBe(false)
  })

  it("plt05_r3_turning_discreet_on_is_mirrored_from_any_screen", async () => {
    const store = fakeCaches()
    vi.stubGlobal("caches", store)
    useDevice.setState({ discreet: true })
    publicRoutes("/privacy")
    await waitFor(async () => expect(await readDiscreet(store)).toBe(true))
    expect(document.title).toBe("Notes")
  })
})

// --- PLT-05 R1 ---------------------------------------------------------------------------
const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe("plt-05-r1 the policy is linked where data first leaves the device", () => {
  it("plt05_r1_ask_links_the_policy_before_the_first_question", () => {
    wrap(<Ask />, "/ask")
    const link = screen.getByRole("link", { name: ar_("privacy.beforeYouWrite") })
    expect(link.getAttribute("href")).toBe("/privacy")
    expect(follows(link, screen.getByRole("textbox"))).toBe(true)
  })

  it("plt05_r1_mentor_matching_links_the_policy_before_asking_gender", () => {
    wrap(<MatchForm initialGender={null} initialLanguages={[]} submitLabel="ok" onDone={() => undefined} />, "/mentor/choose")
    const link = screen.getByRole("link", { name: ar_("privacy.beforeYouChoose") })
    expect(link.getAttribute("href")).toBe("/privacy")
    expect(follows(link, screen.getByText(ar_("cmp.choose.brother")))).toBe(true)
  })

  it("plt05_r1_the_new_line_exists_in_all_three_languages", () => {
    for (const lang of ["ar", "en", "tl"] as const) expect(translate(lang, "privacy.beforeYouChoose")).not.toBe("privacy.beforeYouChoose")
    expect(translate("tl", "privacy.beforeYouChoose")).not.toBe(translate("en", "privacy.beforeYouChoose"))
  })
})

// --- PLT-08 R1, R5 -----------------------------------------------------------------------
const done = { first: "2026-10-01", last: "2026-10-01", times: 1 }

describe("plt-08-r1 the journey first: the next lesson, then at most one suggestion", () => {
  it("plt08_r1_next_lesson_first_then_the_suggestion", () => {
    // After the first lesson «لست وحدك» is ready (R2) and the next lesson is «أغتسل».
    useLearning.setState({ completed: { "u01-l1": done } })
    wrap(<Home />)
    const lesson = screen.getByText("أغتسل")
    const cards = document.querySelectorAll("section[aria-labelledby='suggest-title']")
    expect(cards).toHaveLength(1)
    expect(follows(lesson, cards[0])).toBe(true)
  })

  it("plt08_r1_never_more_than_one_suggestion_when_several_are_ready", () => {
    // Prayer (after «أتهيأ للصلاة») and «لست وحدك» both ready: one card only, the higher one.
    useLearning.setState({ completed: { "u01-l1": done, "u01-l5": done } })
    wrap(<Home />)
    expect(document.querySelectorAll("section[aria-labelledby='suggest-title']")).toHaveLength(1)
    expect(screen.queryByText(ar_("guide.suggest.human.title"))).toBeNull()
  })
})

describe("plt-08-r5 «كل ما في رفيق» from the end of Home and first in «حسابي»", () => {
  it("plt08_r5_home_ends_with_everything_in_rafeeq", () => {
    wrap(<Home />)
    const buttons = screen.getAllByRole("button")
    expect(buttons[buttons.length - 1].textContent).toContain(ar_("guide.homeLink"))
  })

  it("plt08_r5_me_tools_start_with_everything_in_rafeeq", () => {
    wrap(<Me />, "/me")
    const section = screen.getByRole("heading", { name: ar_("me.tools") }).closest("section")!
    const first = section.querySelector("button")!
    expect(first.textContent).toContain(ar_("guide.homeLink"))
  })
})
