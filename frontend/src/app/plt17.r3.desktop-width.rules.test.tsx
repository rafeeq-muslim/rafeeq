/**
 * PLT-17 R3: on a computer the role dashboards (team, review desk, admin,
 * organisation) get a wider column for their cards and tables; the learner
 * screens keep the 600px column. The conversation composer bar belongs to
 * its page's column (it has no width of its own).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { useDevice } from "@/app/stores/device"
import { AppShell, ComposerBar } from "@/components/rafeeq"
import { Composer } from "@/app/companion/Chat"

vi.mock("@/app/learning/useContent", () => ({
  useContent: () => ({ content: undefined, isLoading: false, isError: false, refetch: () => undefined, lessons: [], preview: false }),
}))

const { default: AppLayout, shellWidth } = await import("@/app/AppLayout")

const WIDE_CLASS = "@min-[52.5rem]/shell:max-w-[60rem]"
const main = () => document.querySelector<HTMLElement>('[data-slot="app-shell"] main')!

function at(entry: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<p>screen</p>} />
            <Route path="*" element={<p>screen</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  expect(screen.getByText("screen")).toBeTruthy()
}

beforeEach(() => {
  useDevice.setState({ locale: "ar", onboarded: true, quickExit: false, discreet: false, theme: "light" })
})
afterEach(cleanup)

const DASHBOARDS = ["/team", "/review-desk", "/admin", "/org"]
const LEARNER = ["/", "/learn", "/learn/lesson/u01-l1", "/ask", "/mentor", "/mentor/help/t1", "/mentor/group", "/me", "/me/account", "/practice", "/discover/library", "/downloads"]
// conversations and reading/decision screens of the roles keep the column too
const ROLE_COLUMN = ["/inbox", "/inbox/r/t1", "/referrals", "/mentor-applications", "/review-desk/unit/unit-01", "/review-desk/explanations", "/review-desk/challenges"]

describe("PLT-17 R3: which screens are wide", () => {
  it.each(DASHBOARDS)("%s is a dashboard: wide", (path) => {
    expect(shellWidth(path)).toBe("wide")
  })
  it.each([...LEARNER, ...ROLE_COLUMN])("%s keeps the column", (path) => {
    expect(shellWidth(path)).toBe("column")
  })
})

describe("PLT-17 R3 example: a team member opens the dashboard on a 1280 computer", () => {
  it.each(DASHBOARDS)("%s: the shell's column may grow on expanded widths only", (path) => {
    at(path)
    expect(main().dataset.width).toBe("wide")
    const cls = main().className.split(/\s+/)
    expect(cls).toContain(WIDE_CLASS)
    // phones are unchanged: the base cap stays, the wider one is behind the expanded container query
    expect(cls).toContain("max-w-[37.5rem]")
  })

  it.each(LEARNER)("%s (learner): the column is as before", (path) => {
    at(path)
    expect(main().dataset.width).toBe("column")
    expect(main().className).not.toContain("60rem")
    // a lesson is a full-screen flow (PLT-04), as before; every other learner screen keeps the 600px cap
    expect(main().className).toContain(path.startsWith("/learn/lesson/") ? "max-w-none" : "max-w-[37.5rem]")
  })

  it("AppShell is the one mechanism: column by default, wide on request", () => {
    const { unmount } = render(<AppShell active="home">x</AppShell>)
    expect(main().className).not.toContain(WIDE_CLASS)
    unmount()
    render(
      <AppShell active="account" width="wide">
        x
      </AppShell>,
    )
    expect(main().className.split(/\s+/)).toContain(WIDE_CLASS)
  })
})

describe("the composer bar follows its page's column", () => {
  it("sits inside the column, sticks to its bottom and sets no width of its own", () => {
    render(
      <AppShell active="mentor">
        <div className="px-4">
          <Composer placeholder="اكتب ردك" onSend={async () => undefined} />
        </div>
      </AppShell>,
    )
    const bar = document.querySelector<HTMLElement>('[data-slot="composer-bar"]')!
    expect(main().contains(bar)).toBe(true)
    const cls = bar.className.split(/\s+/)
    expect(cls).toContain("sticky")
    expect(cls).toContain("bottom-0")
    expect(cls).not.toContain("fixed")
    expect(cls.filter((c) => /^(@[^:]+:)?(w-|max-w-|min-w-)/.test(c))).toEqual([])
    // the thread's 16px gutters are undone by the bar and given back inside it, so the box lines up with the messages
    expect(cls).toContain("-mx-4")
    expect(cls).toContain("px-4")
    expect(bar.querySelector("textarea")).toBeTruthy()
  })

  it("is opaque, and on expanded widths only its surface (not its content) runs edge to edge", () => {
    render(<ComposerBar>x</ComposerBar>)
    const cls = document.querySelector<HTMLElement>('[data-slot="composer-bar"]')!.className.split(/\s+/)
    expect(cls).toContain("bg-card")
    expect(cls.some((c) => c.includes("backdrop-blur") || /bg-card\/\d/.test(c))).toBe(false)
    expect(cls.filter((c) => c.includes("inset-x"))).toEqual(["@min-[52.5rem]/shell:before:-inset-x-[100vw]"])
  })
})
