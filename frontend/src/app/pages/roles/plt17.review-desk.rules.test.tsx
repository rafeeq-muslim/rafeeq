/**
 * PLT-17 R8–R10 (reviewer): every review type has a visible name, the queue
 * filters by type and by text, and a failed load says so instead of «empty».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { translate } from "@/app/i18n"
import { ar } from "@/app/i18n/ar"
import { en } from "@/app/i18n/en"
import { tl } from "@/app/i18n/tl"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import Referrals from "@/app/companion/mentor/Referrals"
import ReviewDesk, { REVIEW_TYPES, filterQueue } from "./ReviewDesk"

const t = (k: Parameters<typeof translate>[1]) => translate("ar", k)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const row = (item_type: string, item_id: string, title: string) => ({
  item_type,
  item_id,
  group: "g",
  title: { ar: title },
  langs: { ar: { status: "in_review", live: false, note: null } },
})
const QUEUE = {
  items: [row("lesson", "u01-l1", "معنى الشهادتين"), row("daily_card", "dc-07", "بطاقة الصبر"), row("dhikr", "morning-01", "ذكر الصباح")],
  counts: { in_review: 3, returned: 0, approved: 0 },
}

let queueResponse: () => Response = () => json(QUEUE)
const settle = () => act(async () => await new Promise((r) => setTimeout(r, 0)))
const mount = (el: React.ReactNode, at: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/review-desk/*" element={el} />
          <Route path="/referrals" element={el} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

beforeEach(() => {
  queueResponse = () => json(QUEUE)
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/review/queue") return queueResponse()
      if (url.includes("referral")) return json({ detail: "boom" }, 500)
      return json([])
    }),
  )
  useDevice.setState({ locale: "ar" })
  useAuth.setState({ token: "t", me: { id: "u", display_name: "م", username: "m", roles: ["sharia_reviewer"] } as never })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useAuth.setState({ token: null, me: null } as never)
})

describe("plt-17 r8: every review type has a visible name", () => {
  it("plt17_r8_every_review_type_has_a_label_in_every_language", () => {
    // backend/tests/test_plt17_review_types.py keeps REVIEW_TYPES equal to what the backend registers.
    expect(REVIEW_TYPES.length).toBeGreaterThan(5)
    for (const ty of REVIEW_TYPES) for (const dict of [ar, en, tl] as Record<string, string>[]) expect(dict[`desk.type.${ty}`], ty).toBeTruthy()
  })

  it("plt17_r8_a_daily_card_reads_its_type_name_before_its_id", async () => {
    mount(<ReviewDesk />, "/review-desk")
    await settle()
    expect(await screen.findByText(`${t("desk.type.daily_card")} · dc-07`)).toBeTruthy()
  })
})

describe("plt-17 r9: the reviewer filters the queue", () => {
  it("plt17_r9_choosing_a_type_shows_only_that_type", async () => {
    mount(<ReviewDesk />, "/review-desk")
    await settle()
    fireEvent.click(await screen.findByRole("radio", { name: t("desk.type.dhikr") }))
    await settle()
    expect(screen.getByText("ذكر الصباح")).toBeTruthy()
    expect(screen.queryByText("معنى الشهادتين")).toBeNull()
    expect(screen.queryByText("بطاقة الصبر")).toBeNull()
  })

  it("plt17_r9_typing_a_word_of_the_title_or_id_shows_only_matches", () => {
    expect(filterQueue(QUEUE.items, "all", "الصبر", "ar").map((r) => r.item_id)).toEqual(["dc-07"])
    expect(filterQueue(QUEUE.items, "all", "U01", "ar").map((r) => r.item_id)).toEqual(["u01-l1"])
    expect(filterQueue(QUEUE.items, "dhikr", "", "ar").map((r) => r.item_id)).toEqual(["morning-01"])
  })

  it("plt17_r9_no_match_says_so_and_show_all_restores_the_queue", async () => {
    mount(<ReviewDesk />, "/review-desk")
    await settle()
    fireEvent.change(await screen.findByRole("searchbox", { name: t("desk.filter.search") }), { target: { value: "لا يطابق شيئًا" } })
    await settle()
    expect(screen.getByText(t("desk.filter.none"))).toBeTruthy()
    expect(screen.queryByText(t("desk.empty"))).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: t("desk.filter.clear") }))
    await settle()
    expect(screen.getByText("معنى الشهادتين")).toBeTruthy()
  })
})

describe("plt-17 r10: a failed load is not shown as empty", () => {
  it("plt17_r10_queue_load_failure_says_so_and_retry_reloads", async () => {
    queueResponse = () => json({ detail: "boom" }, 500)
    mount(<ReviewDesk />, "/review-desk")
    await settle()
    expect(await screen.findByText(t("desk.loadFailed"))).toBeTruthy()
    expect(screen.queryByText(t("desk.empty"))).toBeNull()
    queueResponse = () => json(QUEUE)
    fireEvent.click(screen.getByRole("button", { name: t("desk.retry") }))
    await settle()
    expect(await screen.findByText("معنى الشهادتين")).toBeTruthy()
  })

  it("plt17_r10_referrals_load_failure_says_so", async () => {
    mount(<Referrals />, "/referrals")
    await settle()
    expect(await screen.findByText(t("cmp.referral.loadFailed"))).toBeTruthy()
    expect(screen.queryByText(t("cmp.referral.empty"))).toBeNull()
  })
})
