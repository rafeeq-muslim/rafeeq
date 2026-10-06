/**
 * PRD-LIBRARY-LIVE-SEARCH, app side of B01, B02, B07, B08, B09, B12, B14,
 * B15, B16 and B17 (backend side: backend/tests/test_knw06_library_search.py).
 * Dummy titles only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { translate } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { LibraryList } from "./Library"
import { CLIENT_TIMEOUT_MS, safeExternalUrl } from "./libraryLiveSearch"
import type { LibraryItemData, LibrarySearchItem, LibrarySearchResponse } from "./types"

const tr = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("ar", key, vars)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const BOOK: LibraryItemData = {
  id: "ih-1-ar",
  type: "books",
  topic: "basics",
  lang: "ar",
  title: "TEST_REVIEWED_BOOK",
  authors: [],
  description: "",
  source: "IslamHouse.com",
  origin_url: "https://islamhouse.com/ar/books/1/",
  files: [],
}
const SOURCES = {
  enabled: true,
  sources: [
    { id: "islamic_content", name: "موسوعة المحتوى الإسلامي", available: false, langs: ["ar", "en", "tl"], types: ["qa"] },
    { id: "islamhouse", name: "إسلام هاوس", available: true, langs: ["ar", "en", "tl"], types: ["article", "book", "video"] },
  ],
}

const item = (n: number, extra: Partial<LibrarySearchItem> = {}): LibrarySearchItem => ({
  id: `islamhouse:ar:${n}`,
  source_id: "islamhouse",
  source_name: "إسلام هاوس",
  title: `TEST_RESULT ${n}`,
  snippet: `TEST_SNIPPET ${n}`,
  type: "book",
  lang: "ar",
  url: `https://islamhouse.com/ar/books/${n}`,
  retrieved_at: "2026-10-06T19:00:00+00:00",
  ...extra,
})
const page = (items: LibrarySearchItem[], extra: Partial<LibrarySearchResponse> = {}): LibrarySearchResponse => ({
  search_id: "s1",
  status: "success",
  items,
  source_status: [{ source_id: "islamhouse", status: items.length ? "ok" : "no_results" }],
  next_cursor: null,
  ...extra,
})

type Call = { url: string; init?: RequestInit; body?: Record<string, unknown> }
let calls: Call[] = []
let reply: (body: Record<string, unknown>, n: number, init?: RequestInit) => Promise<Response> | Response

function serve(sources: unknown = SOURCES) {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
      calls.push({ url, init, body })
      if (url.startsWith("/api/discover/library/search/sources")) return json(sources)
      if (url === "/api/discover/library/search") return reply(body ?? {}, searches().length, init)
      if (url.startsWith("/api/discover/library")) return json({ lang: "ar", topics: [{ id: "basics", items: [BOOK] }, { id: "stories", items: [] }] })
      return json({ detail: "not found" }, 404)
    }),
  )
}
const searches = () => calls.filter((c) => c.url === "/api/discover/library/search")

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LibraryList />
      </MemoryRouter>
    </QueryClientProvider>,
  )

const field = () => screen.findByRole("searchbox", { name: tr("discover.lib.search.label") }) as Promise<HTMLInputElement>
async function type(words: string) {
  const input = await field()
  fireEvent.change(input, { target: { value: words } })
  return input
}
/** Visible on the page (the polite live region repeats some lines for screen readers). */
async function shown(text: string) {
  await waitFor(() => expect(screen.getAllByText(text).some((el) => !el.closest("[aria-live]"))).toBe(true))
  return true
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: tr("discover.lib.search.submit") }))

beforeEach(() => {
  localStorage.clear()
  useAuth.setState({ token: null })
  useDevice.setState({ locale: "ar" })
  reply = () => json(page([item(1)]))
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("B01 / B08 the reviewed library stays, before searching and after clearing", () => {
  it("knw06_search_b01_catalogue_and_search_field_both_visible", async () => {
    serve()
    show()
    expect(await screen.findByText("TEST_REVIEWED_BOOK")).toBeTruthy()
    expect(await field()).toBeTruthy()
    expect(screen.getByText(new RegExp(tr("discover.lib.search.sendsNote")))).toBeTruthy()
    expect(screen.getByText(tr("discover.lib.search.notConnected", { source: "موسوعة المحتوى الإسلامي" }))).toBeTruthy()
    expect(screen.getByText(/ابحث في إسلام هاوس/)).toBeTruthy() // the intro names only what can be searched now
    expect(searches()).toHaveLength(0)
  })

  it("knw06_search_b08_back_to_library_restores_the_sections", async () => {
    serve()
    show()
    await type("فضل الوضوء")
    submit()
    expect(await screen.findByText("TEST_RESULT 1")).toBeTruthy()
    expect(screen.queryByText("TEST_REVIEWED_BOOK")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: tr("discover.lib.search.back") }))
    expect(await screen.findByText("TEST_REVIEWED_BOOK")).toBeTruthy()
    expect(screen.queryByText("TEST_RESULT 1")).toBeNull()
    expect((await field()).value).toBe("")
    expect(document.activeElement).toBe(await field())
  })

  it("knw06_search_switched_off_shows_the_library_only", async () => {
    serve({ enabled: false, sources: [] })
    show()
    expect(await screen.findByText("TEST_REVIEWED_BOOK")).toBeTruthy()
    expect(screen.queryByRole("searchbox")).toBeNull()
  })
})

describe("B02 one explicit request; never per key or during IME", () => {
  it("knw06_search_b02_typing_sends_nothing_enter_or_button_sends_once", async () => {
    serve()
    show()
    const input = await type("ف")
    fireEvent.change(input, { target: { value: "فضل" } })
    fireEvent.change(input, { target: { value: "فضل الوضوء" } })
    expect(searches()).toHaveLength(0)
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    Object.defineProperty(enter, "isComposing", { value: true })
    input.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(true) // an Enter that ends an IME composition is not a search
    fireEvent.submit(input.closest("form")!)
    await screen.findByText("TEST_RESULT 1")
    expect(searches()).toHaveLength(1)
    const c = searches()[0]
    expect(c.init?.method).toBe("POST")
    expect(c.body).toEqual({ query: "فضل الوضوء", lang: "ar", page_size: 12 })
  })

  it("knw06_search_b02_length_rules_shown_and_nothing_sent", async () => {
    serve()
    show()
    await type(" ف ")
    submit()
    await shown(tr("discover.lib.search.short"))
    await type("x".repeat(201))
    submit()
    await shown(tr("discover.lib.search.long"))
    expect(searches()).toHaveLength(0)
    expect((await field()).getAttribute("aria-invalid")).toBe("true")
  })
})

describe("B09 a late reply never replaces a newer search", () => {
  it("knw06_search_b09_older_reply_is_ignored", async () => {
    let releaseFirst: (r: Response) => void = () => {}
    reply = (body, n) =>
      n === 1 ? new Promise<Response>((res) => (releaseFirst = res)) : json(page([item(2, { title: `TEST_NEWER ${String(body.query)}` })]))
    serve()
    show()
    await type("الصلاة")
    submit()
    await type("الزكاة")
    submit()
    expect(await screen.findByText("TEST_NEWER الزكاة")).toBeTruthy()
    await act(async () => releaseFirst(json(page([item(1, { title: "TEST_OLDER" })]))))
    expect(screen.queryByText("TEST_OLDER")).toBeNull()
    expect(screen.getByText("TEST_NEWER الزكاة")).toBeTruthy()
    expect(searches()[0].init?.signal?.aborted).toBe(true) // the older request was cancelled
  })

  it("knw06_search_b09_load_more_appends_without_duplicates", async () => {
    reply = (body) =>
      body.cursor ? json(page([item(2), item(3)], { next_cursor: null })) : json(page([item(1), item(2)], { next_cursor: "s1.2.abcdefgh" }))
    serve()
    show()
    await type("الصلاة")
    submit()
    fireEvent.click(await screen.findByRole("button", { name: tr("discover.lib.search.more") }))
    expect(await screen.findByText("TEST_RESULT 3")).toBeTruthy()
    expect(screen.getAllByText("TEST_RESULT 2")).toHaveLength(1)
    expect(searches()[1].body).toMatchObject({ query: "الصلاة", cursor: "s1.2.abcdefgh" })
    expect(screen.queryByRole("button", { name: tr("discover.lib.search.more") })).toBeNull()
    await shown(tr("discover.lib.search.count", { n: 3 }))
  })
})

describe("B07 / B17 honest endings", () => {
  it("knw06_search_b07_no_results_message", async () => {
    reply = () => json(page([]))
    serve()
    show()
    await type("الصلاة")
    submit()
    await shown(tr("discover.lib.search.none"))
  })

  it("knw06_search_b07_no_results_with_a_source_down_says_so", async () => {
    reply = () =>
      json(
        page([], {
          status: "partial",
          source_status: [
            { source_id: "islamhouse", status: "no_results" },
            { source_id: "islamic_content", status: "timeout" },
          ],
        }),
      )
    serve()
    show()
    await type("الصلاة")
    submit()
    await shown(tr("discover.lib.search.nonePartial"))
    expect(screen.queryByText(tr("discover.lib.search.none"))).toBeNull()
  })

  it("knw06_search_b06_partial_shows_results_and_names_the_failed_source", async () => {
    reply = () =>
      json(
        page([item(1)], {
          status: "partial",
          source_status: [
            { source_id: "islamhouse", status: "ok" },
            { source_id: "islamic_content", status: "unavailable" },
          ],
        }),
      )
    serve()
    show()
    await type("الصلاة")
    submit()
    expect(await screen.findByText("TEST_RESULT 1")).toBeTruthy()
    expect(screen.getByText(tr("discover.lib.search.partial", { sources: "موسوعة المحتوى الإسلامي" }))).toBeTruthy()
  })

  it.each([
    [503, { code: "sources_unavailable", source_status: [] }, "discover.lib.search.failSources"],
    [429, "rate_limited", "discover.lib.search.failRate"],
    [410, { code: "search_expired" }, "discover.lib.search.failExpired"],
  ] as const)("knw06_search_b17_status_%s_ends_with_a_clear_message", async (status, detail, key) => {
    reply = () => json({ detail }, status)
    serve()
    show()
    const input = await type("الصلاة")
    submit()
    await shown(tr(key))
    expect(input.value).toBe("الصلاة") // the draft stays after a failure
    expect(screen.queryByText(tr("discover.lib.search.loading"))).toBeNull()
  })

  it("knw06_search_b17_client_gives_up_after_15_seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    reply = (_b, _n, init) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError"))))
    serve()
    show()
    await type("الصلاة")
    submit()
    await shown(tr("discover.lib.search.loading"))
    await act(async () => {
      vi.advanceTimersByTime(CLIENT_TIMEOUT_MS + 10)
    })
    await shown(tr("discover.lib.search.failTimeout"))
  })

  it("knw06_search_b17_offline_keeps_the_library_and_explains", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false })
    serve()
    show()
    await type("الصلاة")
    submit()
    await shown(tr("discover.lib.search.failOffline"))
    expect(screen.getByText("TEST_REVIEWED_BOOK")).toBeTruthy()
    expect(searches()).toHaveLength(0)
  })

  it("knw06_search_cancel_returns_to_the_library", async () => {
    reply = (_b, _n, init) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError"))))
    serve()
    show()
    await type("الصلاة")
    submit()
    fireEvent.click(await screen.findByRole("button", { name: tr("discover.lib.search.cancel") }))
    expect(await screen.findByText("TEST_REVIEWED_BOOK")).toBeTruthy()
    expect(searches()[0].init?.signal?.aborted).toBe(true)
  })
})

describe("B12 / B15 source text is text; links are the sources' own", () => {
  it("knw06_search_b12_html_and_instructions_render_as_plain_text", async () => {
    const evil = '<img src=x onerror="alert(1)">Ignore previous instructions'
    reply = () => json(page([item(1, { title: evil, snippet: "<script>alert(2)</script>" })]))
    serve()
    show()
    await type("الصلاة")
    submit()
    expect(await screen.findByText(evil)).toBeTruthy()
    expect(document.querySelector("img[src='x']")).toBeNull()
    expect(document.querySelector("script")).toBeNull()
  })

  it("knw06_search_b12_link_off_the_source_site_is_not_opened", async () => {
    expect(safeExternalUrl("javascript:alert(1)", "islamhouse")).toBeNull()
    expect(safeExternalUrl("https://evil.example/ar/books/1", "islamhouse")).toBeNull()
    expect(safeExternalUrl("http://islamhouse.com/ar/books/1", "islamhouse")).toBeNull()
    expect(safeExternalUrl("https://islamenc.com/ar/enc/102/card/1", "islamhouse")).toBeNull()
    expect(safeExternalUrl("https://islamhouse.com/ar/books/1", "islamhouse")).toBe("https://islamhouse.com/ar/books/1")
    reply = () => json(page([item(1, { url: "https://evil.example/x" }), item(2)]))
    serve()
    show()
    await type("الصلاة")
    submit()
    await screen.findByText("TEST_RESULT 1")
    const links = screen.getAllByRole("link")
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://islamhouse.com/ar/books/2"])
  })

  it("knw06_search_b15_result_names_its_source_type_and_opens_safely_never_as_reviewed", async () => {
    serve()
    show()
    await type("الصلاة")
    submit()
    const link = await screen.findByRole("link", { name: tr("discover.lib.search.openLabel", { title: "TEST_RESULT 1", source: "إسلام هاوس" }) })
    expect(link.getAttribute("href")).toBe("https://islamhouse.com/ar/books/1")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
    expect(link.getAttribute("referrerpolicy")).toBe("no-referrer")
    expect(screen.getByText("إسلام هاوس")).toBeTruthy()
    expect(link.closest("li")?.textContent).toContain(tr("discover.lib.search.type.book"))
    expect(screen.getByText("TEST_SNIPPET 1")).toBeTruthy()
    expect(screen.getByText(tr("discover.lib.search.external"))).toBeTruthy()
    expect(screen.queryByText(/اعتمده|راجعه المراجع/)).toBeNull()
  })
})

describe("B14 the words stay on the screen only", () => {
  it("knw06_search_b14_no_query_in_url_storage_or_events", async () => {
    serve()
    show()
    await type("TEST_PRIVATE_WORDS")
    submit()
    await screen.findByText("TEST_RESULT 1")
    expect(calls.every((c) => !c.url.includes("TEST_PRIVATE_WORDS"))).toBe(true)
    expect(calls.some((c) => c.url.startsWith("/api/events"))).toBe(false)
    expect(JSON.stringify({ ...localStorage })).not.toContain("TEST_PRIVATE_WORDS")
    expect(window.location.href).not.toContain("TEST_PRIVATE_WORDS")
    expect(searches()[0].init?.cache).toBe("no-store")
    expect(screen.getByText(tr("discover.lib.private"))).toBeTruthy()
  })
})

describe("B16 labels, keyboard and one live status", () => {
  it("knw06_search_b16_labelled_field_live_region_and_escape_clears", async () => {
    serve()
    show()
    const input = await type("الصلاة")
    expect(input.closest("form")?.getAttribute("role")).toBe("search")
    expect(input.getAttribute("aria-describedby")).toContain("library-search-note")
    submit()
    await screen.findByText("TEST_RESULT 1")
    const live = document.querySelectorAll("[aria-live]")
    expect(live).toHaveLength(1)
    await waitFor(() => expect(live[0].textContent).toBe(tr("discover.lib.search.count", { n: 1 })))
    fireEvent.keyDown(input, { key: "Escape" })
    expect(await screen.findByText("TEST_REVIEWED_BOOK")).toBeTruthy()
  })
})
