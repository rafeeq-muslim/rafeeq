/** PLT-10 R1–R3: landing page at /, the app under /app, installs and notifications open the app. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryRouter, RouterProvider, useLocation } from "react-router"

import AppLayout from "@/app/AppLayout"
import { APP_BASE, APP_NAVIGATION, appUrl, notificationTarget, stripBase } from "@/app/lib/base"
import { inLearningFlow } from "@/app/lib/pwa"
import { useDevice } from "@/app/stores/device"
import landingHtml from "../../public/landing/index.html?raw"
import landingJs from "../../public/landing/landing.js?raw"
import standaloneJs from "../../public/landing/standalone.js?raw"
import viteConfig from "../../vite.config.ts?raw"
import swTs from "../sw.ts?raw"
import mainTsx from "../main.tsx?raw"

function At() {
  const l = useLocation()
  return <p data-testid="at">{l.pathname + l.search}</p>
}

function app(url: string) {
  const router = createMemoryRouter(
    [
      { path: "/welcome", element: <At /> },
      { path: "/", element: <AppLayout />, children: [{ index: true, element: <p>home</p> }, { path: "learn", element: <p>the path</p> }] },
    ],
    { basename: APP_BASE, initialEntries: [url] },
  )
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function runStandalone(opts: { standalone?: boolean; iosStandalone?: boolean; search?: string }) {
  const replace = vi.fn()
  const win = { matchMedia: () => ({ matches: !!opts.standalone }), navigator: { standalone: !!opts.iosStandalone } }
  new Function("window", "location", standaloneJs)(win, { search: opts.search ?? "", replace })
  return replace
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useDevice.setState({ onboarded: false })
})

describe("plt-10-r1 the bare address shows the landing page", () => {
  it("plt10_r1_first_visit_at_the_bare_address_sees_the_landing_page", () => {
    // nginx serving / with the landing page: backend/tests/test_plt10_app_path.py
    expect(APP_NAVIGATION.test("/")).toBe(false) // the worker never answers "/" with the app shell
    expect(swTs).toMatch(/precacheAndRoute\(self\.__WB_MANIFEST, \{ directoryIndex: "" \}\)/)
  })

  it("plt10_r1_someone_with_an_account_still_sees_the_landing_page_with_a_link_to_the_app", () => {
    expect(landingHtml).toMatch(/class="btn btn--night btn--sm" href="\/app\/" data-start/)
    expect(landingJs).toContain('"/app/?lang="')
    expect(landingHtml).not.toMatch(/rel="manifest"/) // installs start inside /app only
  })

  it("plt10_r1_landing_assets_resolve_when_served_at_the_bare_address", () => {
    const local = [...landingHtml.matchAll(/(?:src|href)="([^"#?][^"]*)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|\/)/.test(u))
    expect(local).toEqual([])
  })
})

describe("plt-10-r2 the app lives under /app", () => {
  it("plt10_r2_a_learner_who_finished_the_start_opens_home_at_app", () => {
    useDevice.setState({ onboarded: true })
    app("/app")
    expect(screen.getByText("home")).toBeTruthy()
    expect(mainTsx).toMatch(/\{ basename: APP_BASE \}/)
  })

  it("plt10_r2_a_new_device_at_app_goes_to_welcome_keeping_only_the_language_and_org_code", () => {
    const router = app("/app?lang=tl&org=K7M2QX9P&name=Joseph")
    expect(screen.getByTestId("at").textContent).toBe("/welcome?lang=tl&org=K7M2QX9P")
    expect(router.state.location.pathname).toBe("/app/welcome") // the browser URL carries the base
  })

  it("plt10_r2_raw_links_get_the_app_base_once", () => {
    expect(appUrl("/welcome?lang=tl")).toBe("/app/welcome?lang=tl")
    expect(appUrl("/app/welcome")).toBe("/app/welcome")
    expect(appUrl("https://example.org/")).toBe("https://example.org/")
    expect(stripBase("/app/learn/lesson/x")).toBe("/learn/lesson/x")
    expect(inLearningFlow("/learn/lesson/x")).toBe(true)
  })

})

describe("plt-10-r3 an installed Rafeeq opens the app", () => {
  it("plt10_r3_an_install_after_the_move_starts_in_the_app", () => {
    expect(viteConfig).toMatch(/start_url: "\/app\/",\s*scope: "\/app\/",/)
    expect(swTs).toContain("allowlist: [APP_NAVIGATION]")
  })

  it("plt10_r3_an_old_install_launching_the_bare_address_goes_straight_into_the_app", () => {
    expect(runStandalone({ standalone: true })).toHaveBeenCalledWith("/app/")
    expect(runStandalone({ iosStandalone: true, search: "?lang=tl" })).toHaveBeenCalledWith("/app/?lang=tl")
    expect(landingHtml.indexOf("/landing/standalone.js")).toBeLessThan(landingHtml.indexOf("/landing/lang.js"))
  })

  it("plt10_r3_in_a_browser_tab_the_landing_page_stays", () => {
    expect(runStandalone({})).not.toHaveBeenCalled()
  })

  it("plt10_r3_a_reminder_tap_opens_the_next_lesson_inside_the_app", () => {
    expect(notificationTarget("/app/next")).toBe("/app/next")
    expect(notificationTarget("/next")).toBe("/app/next") // pushes queued before the move
    expect(notificationTarget(undefined)).toBe("/app/")
  })
})
