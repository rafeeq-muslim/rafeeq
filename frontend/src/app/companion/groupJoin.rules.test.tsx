/**
 * CMP-05 R5 (and CMP-04 R4 ex2): a member the mentor or the team removed
 * gets a neutral message, in the learner's language, when they try the same
 * code again. The server side is in backend/tests/test_cmp05_groups.py.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { translate } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { JoinGroup } from "./GroupPage"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

beforeEach(() => {
  useAuth.getState().set({ token: null, me: null, ready: true })
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("/api/groups/join") ? json({ detail: "group_unavailable" }, 403) : json({ detail: "not found" }, 404),
    ),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe("CMP-05 R5 removed member", () => {
  it.each(["ar", "en", "tl"] as const)("sees a neutral refusal in %s, with no reason", async (locale) => {
    useDevice.getState().set({ locale })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <JoinGroup />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText(translate(locale, "cmp.group.code")), { target: { value: "ABCD2345" } })
    fireEvent.click(screen.getByRole("button", { name: translate(locale, "cmp.group.join") }))
    const text = translate(locale, "cmp.group.err.unavailable")
    expect(await screen.findByText(text)).toBeTruthy()
    expect(text).not.toBe(translate(locale, "common.error"))
  })
})
