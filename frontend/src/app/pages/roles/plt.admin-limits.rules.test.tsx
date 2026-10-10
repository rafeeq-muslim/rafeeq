// @vitest-environment jsdom
// plt-admin-limits (owner decision 2026-10-10): «الحدود» on the admin page.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import type { Limit } from "./AdminLimits"

const base: Limit[] = [
  { key: "ask_per_day", group: "ai", kind: "int", min: 1, max: 100000, default: 120, value: 120 },
  { key: "ai_daily_budget_usd", group: "budget", kind: "usd", min: 0, max: 1000, default: 0.75, value: 2 },
  { key: "report_hides_per_reporter_day", group: "reports", kind: "int", min: 0, max: 100, default: 5, value: 5 },
]
let rows: Limit[] = []
const calls: { path: string; method?: string; body?: unknown }[] = []

vi.mock("@/app/lib/api", async (orig) => {
  const real = await orig<typeof import("@/app/lib/api")>()
  return {
    ...real,
    api: vi.fn(async (path: string, opts?: { method?: string; body?: unknown }) => {
      calls.push({ path, method: opts?.method, body: opts?.body })
      if (path === "/api/admin/limits") return rows
      const key = path.split("/").pop()!
      const row = rows.find((r) => r.key === key)!
      if (opts?.method === "PUT") return { ...row, value: (opts.body as { value: number }).value }
      if (opts?.method === "DELETE") return { ...row, value: row.default }
      return []
    }),
  }
})

const { AdminLimits, parseLimit } = await import("./AdminLimits")
const en = (k: Parameters<typeof translate>[1], p?: Record<string, string | number>) => translate("en", k, p)

beforeEach(() => {
  rows = base.map((r) => ({ ...r }))
  calls.length = 0
})
afterEach(cleanup)

function show(locale: "en" | "ar" = "en") {
  useDevice.setState({ locale })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AdminLimits />
    </QueryClientProvider>,
  )
}

const row = async (key: string) => {
  await screen.findByText(en(`plt.limits.k.${key}` as never))
  return document.querySelector(`[data-limit="${key}"]`) as HTMLElement
}

describe("plt-admin-limits: the admin edits the limits", () => {
  it("lists each limit with its words, current value and default, under its group", async () => {
    show()
    expect(await screen.findByRole("heading", { name: en("plt.limits.title") })).toBeTruthy()
    expect(await screen.findByRole("heading", { name: en("plt.limits.group.ai") })).toBeTruthy()
    expect(screen.getByText(en("plt.limits.aiNote"))).toBeTruthy()
    const budget = await row("ai_daily_budget_usd")
    expect(within(budget).getByText(`${en("plt.limits.current", { value: "$2.00" })} · ${en("plt.limits.default", { value: "$0.75" })}`)).toBeTruthy()
    expect((within(budget).getByRole("textbox") as HTMLInputElement).value).toBe("2")
  })

  it("saves a new value and resets one to its default", async () => {
    show()
    const ask = await row("ask_per_day")
    const save = within(ask).getByRole("button", { name: en("plt.limits.save") }) as HTMLButtonElement
    expect(save.disabled).toBe(true) // unchanged
    expect((within(ask).getByRole("button", { name: en("plt.limits.reset") }) as HTMLButtonElement).disabled).toBe(true) // already the default
    fireEvent.change(within(ask).getByRole("textbox"), { target: { value: "300" } })
    fireEvent.click(save)
    await waitFor(() => expect(calls).toContainEqual({ path: "/api/admin/limits/ask_per_day", method: "PUT", body: { value: 300 } }))

    const budget = await row("ai_daily_budget_usd")
    fireEvent.click(within(budget).getByRole("button", { name: en("plt.limits.reset") }))
    await waitFor(() => expect(calls).toContainEqual({ path: "/api/admin/limits/ai_daily_budget_usd", method: "DELETE", body: undefined }))
    await waitFor(() => expect((within(budget).getByRole("textbox") as HTMLInputElement).value).toBe("0.75"))
  })

  it("does not send a value outside the allowed range or a fraction where a count is needed", async () => {
    show()
    const ask = await row("ask_per_day")
    for (const bad of ["0", "100001", "2.5", "-3", "lots"]) {
      fireEvent.change(within(ask).getByRole("textbox"), { target: { value: bad } })
      expect((within(ask).getByRole("button", { name: en("plt.limits.save") }) as HTMLButtonElement).disabled).toBe(true)
      expect(within(ask).getByRole("textbox").getAttribute("aria-invalid")).toBe("true")
    }
    expect(calls.filter((c) => c.method === "PUT")).toEqual([])
  })

  it("parses values by kind", () => {
    expect(parseLimit(base[0], " 42 ")).toBe(42)
    expect(parseLimit(base[0], "4.2")).toBeNull()
    expect(parseLimit(base[1], "1.25")).toBe(1.25)
    expect(parseLimit(base[1], "1001")).toBeNull()
    expect(parseLimit(base[2], "0")).toBe(0)
  })

  it("has Arabic, English and Tagalog words for every limit", () => {
    for (const r of base) for (const l of ["ar", "en", "tl"] as const) expect(translate(l, `plt.limits.k.${r.key}` as never)).not.toContain("plt.limits")
  })
})
