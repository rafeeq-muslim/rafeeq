/**
 * KNW-06 library live search (PRD-LIBRARY-LIVE-SEARCH §3, §4, §8): the request
 * side. Sent only on an explicit search (never per key), POST with the words in
 * the body, one request id per send so an older reply never replaces a newer
 * search (B09), AbortController on a new search, on clearing and after 15 s.
 * The words live in React state only: never in the URL, localStorage or an
 * event (B14).
 */
import * as React from "react"
import { api, ApiError } from "@/app/lib/api"
import type { LibrarySearchItem, LibrarySearchResponse, LibrarySearchType, LibrarySourceId, LibrarySourceStatus } from "./types"

export const MIN_CHARS = 2
export const MAX_CHARS = 200
export const PAGE_SIZE = 12
export const CLIENT_TIMEOUT_MS = 15_000

/** B12: a result link is opened only when it is https on its own source's site. */
const LINK_HOSTS: Record<string, string[]> = { islamhouse: ["islamhouse.com"], islamic_content: ["islamenc.com"] }
export function safeExternalUrl(url: string, sourceId: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null
    return (LINK_HOSTS[sourceId] ?? []).includes(u.hostname) ? u.href : null
  } catch {
    return null
  }
}

/** "A and B" in the screen's language (Tagalog uses the Filipino list rules). */
export function listOf(locale: string, names: string[]): string {
  try {
    return new Intl.ListFormat(locale === "tl" ? "fil" : locale, { type: "conjunction" }).format(names)
  } catch {
    return names.join(", ")
  }
}

export type QueryCheck = "ok" | "short" | "long"
export function checkQuery(raw: string): QueryCheck {
  const n = raw.trim().length
  return n < MIN_CHARS ? "short" : n > MAX_CHARS ? "long" : "ok"
}

/** What went wrong, as the screen words it (§8 table). */
export type SearchFailure = "sources" | "rate" | "expired" | "timeout" | "offline" | "invalid" | "other"

export type SearchState = {
  phase: "idle" | "loading" | "done" | "failed"
  /** The words of the search on screen (kept so a failed search keeps its draft). */
  query: string
  sources: LibrarySourceId[] | null
  type: LibrarySearchType | null
  items: LibrarySearchItem[]
  status: "success" | "partial" | null
  sourceStatus: { source_id: LibrarySourceId; status: LibrarySourceStatus }[]
  cursor: string | null
  loadingMore: boolean
  failure: SearchFailure | null
  /** A "load more" that failed keeps the items already shown. */
  moreFailure: SearchFailure | null
}

export const IDLE: SearchState = {
  phase: "idle",
  query: "",
  sources: null,
  type: null,
  items: [],
  status: null,
  sourceStatus: [],
  cursor: null,
  loadingMore: false,
  failure: null,
  moreFailure: null,
}

export const FAILED_STATUSES: LibrarySourceStatus[] = ["timeout", "unavailable", "not_connected"]

function failureOf(e: unknown, timedOut: boolean): SearchFailure {
  if (timedOut) return "timeout"
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline"
  if (e instanceof ApiError) {
    if (e.status === 429) return "rate"
    if (e.status === 410) return "expired"
    if (e.status === 422) return e.code === "cursor_mismatch" ? "expired" : "invalid"
    if (e.status === 503) return "sources"
  }
  return "other"
}

function sourceStatusOf(e: unknown): SearchState["sourceStatus"] {
  if (e instanceof ApiError && e.detail && typeof e.detail === "object" && "source_status" in e.detail) {
    return (e.detail as { source_status: SearchState["sourceStatus"] }).source_status
  }
  return []
}

export function useLibrarySearch(lang: string) {
  const [state, setState] = React.useState<SearchState>(IDLE)
  const seq = React.useRef(0)
  const ctrl = React.useRef<AbortController | null>(null)

  const abort = React.useCallback(() => {
    ctrl.current?.abort()
    ctrl.current = null
  }, [])
  React.useEffect(() => abort, [abort])

  const send = React.useCallback(
    async (query: string, sources: LibrarySourceId[] | null, type: LibrarySearchType | null, cursor: string | null) => {
      abort()
      const id = ++seq.current
      const c = new AbortController()
      ctrl.current = c
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        c.abort()
      }, CLIENT_TIMEOUT_MS)
      const more = cursor !== null
      setState((s) =>
        more
          ? { ...s, loadingMore: true, moreFailure: null }
          : { ...IDLE, phase: "loading", query, sources, type },
      )
      try {
        const body: Record<string, unknown> = { query: query.trim(), lang, page_size: PAGE_SIZE }
        if (sources) body.sources = sources
        if (type) body.type = type
        if (cursor) body.cursor = cursor
        const r = await api<LibrarySearchResponse>("/api/discover/library/search", { method: "POST", body, signal: c.signal, cache: "no-store" })
        if (id !== seq.current) return // an older reply never replaces a newer search (B09)
        setState((s) => ({
          ...s,
          phase: "done",
          items: more ? [...s.items, ...r.items.filter((it) => !s.items.some((x) => x.id === it.id))] : r.items,
          status: r.status,
          sourceStatus: r.source_status,
          cursor: r.next_cursor,
          loadingMore: false,
          failure: null,
        }))
      } catch (e) {
        if (id !== seq.current) return
        if (c.signal.aborted && !timedOut) return // cleared or replaced on purpose
        const failure = failureOf(e, timedOut)
        setState((s) =>
          more
            ? { ...s, loadingMore: false, moreFailure: failure, cursor: failure === "expired" ? null : s.cursor }
            : { ...s, phase: "failed", failure, sourceStatus: sourceStatusOf(e) },
        )
      } finally {
        clearTimeout(timer)
        if (ctrl.current === c) ctrl.current = null
      }
    },
    [abort, lang],
  )

  const search = React.useCallback(
    (query: string, sources: LibrarySourceId[] | null, type: LibrarySearchType | null) => {
      if (checkQuery(query) !== "ok") return false
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        seq.current++
        abort()
        setState({ ...IDLE, phase: "failed", query, sources, type, failure: "offline" })
        return true
      }
      void send(query, sources, type, null)
      return true
    },
    [abort, send],
  )

  const loadMore = React.useCallback(() => {
    if (state.cursor && !state.loadingMore) void send(state.query, state.sources, state.type, state.cursor)
  }, [send, state.cursor, state.loadingMore, state.query, state.sources, state.type])

  /** Back to the library: cancels anything running and forgets the words. */
  const clear = React.useCallback(() => {
    seq.current++
    abort()
    setState(IDLE)
  }, [abort])

  /** Stop waiting; the screen stays on the library. */
  const cancel = clear

  return { state, search, loadMore, clear, cancel }
}
