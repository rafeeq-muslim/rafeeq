/**
 * KNW-06 library live search (PRD-LIBRARY-LIVE-SEARCH §3, §4, §8).
 *
 * A search field above the library. Before a search (and after clearing it)
 * the reviewed catalogue (`children`) is shown unchanged (B01, B08); a sent
 * search shows the sources' results in the same place. Results are the
 * sources' own titles and snippets as plain text (B12), with the source's
 * name, its type when the source gives one, and the original link; they are
 * never presented as reviewed by Rafeeq (B15).
 */
import * as React from "react"
import { IconArrowRight, IconExternalLink, IconSearch, IconX } from "@tabler/icons-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { LOCALES, num, useT, type Key } from "@/app/i18n"
import { useLibrarySearchSources } from "./queries"
import {
  checkQuery,
  FAILED_STATUSES,
  listOf,
  safeExternalUrl,
  useLibrarySearch,
  type QueryCheck,
  type SearchFailure,
  type SearchState,
} from "./libraryLiveSearch"
import type { LibrarySearchItem, LibrarySearchSources, LibrarySearchType, LibrarySourceId } from "./types"

const TYPE_ORDER: LibrarySearchType[] = ["book", "article", "audio", "video", "qa", "fatwa", "khutbah", "poster"]
const typeKey = (type: LibrarySearchType) => `discover.lib.search.type.${type}` as Key
const FAILURE_KEY: Record<SearchFailure, Key> = {
  sources: "discover.lib.search.failSources",
  rate: "discover.lib.search.failRate",
  expired: "discover.lib.search.failExpired",
  timeout: "discover.lib.search.failTimeout",
  offline: "discover.lib.search.failOffline",
  invalid: "discover.lib.search.short",
  other: "discover.lib.search.failOther",
}
type Src = LibrarySearchSources["sources"][number]

export function LibrarySearch({ children }: { children: React.ReactNode }) {
  const { t, locale } = useT()
  const cfg = useLibrarySearchSources(locale)
  const { state, search, loadMore, clear, cancel } = useLibrarySearch(locale)
  const [draft, setDraft] = React.useState("")
  const [hint, setHint] = React.useState<QueryCheck | null>(null)
  const [source, setSource] = React.useState<"all" | LibrarySourceId>("all")
  const [type, setType] = React.useState<"all" | LibrarySearchType>("all")
  const input = React.useRef<HTMLInputElement>(null)

  const all = cfg.data?.enabled ? cfg.data.sources : []
  const available = all.filter((s) => s.available && s.langs.includes(locale))
  if (available.length === 0) return <>{children}</> // switched off, still loading or nothing to search: the library as it was

  const unconnected = all.filter((s) => !s.available)
  const nameOf = (id: string) => all.find((s) => s.id === id)?.name ?? id
  const offered = available.filter((s) => source === "all" || s.id === source)
  const types = TYPE_ORDER.filter((ty) => offered.some((s) => s.types.includes(ty)))

  const run = (words: string, src = source, kind = type) => {
    const check = checkQuery(words)
    setHint(check === "ok" ? null : check)
    if (check !== "ok") return
    search(words, src === "all" ? null : [src], kind === "all" ? null : kind)
  }
  const back = () => {
    clear()
    setDraft("")
    setHint(null)
    input.current?.focus()
  }
  const refilter = (src: "all" | LibrarySourceId, kind: "all" | LibrarySearchType) => {
    setSource(src)
    setType(kind)
    if (state.phase !== "idle" && state.query) run(state.query, src, kind) // a new filter is a new search (§7)
  }

  const offline = state.phase === "failed" && state.failure === "offline"
  const active = state.phase !== "idle" && !offline

  return (
    <>
      <section aria-label={t("discover.lib.search.label")} className="flex flex-col gap-2">
        <form
          role="search"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            run(draft)
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="library-search" className="text-label font-bold">
            {t("discover.lib.search.label")}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <IconSearch
                className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                stroke={1.75}
                aria-hidden="true"
              />
              <input
                ref={input}
                id="library-search"
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                spellCheck={false}
                dir="auto"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  if (hint) setHint(null)
                }}
                onKeyDown={(e) => {
                  // B02: Enter that ends an IME composition never sends the search.
                  if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault()
                  if (e.key === "Escape" && draft) {
                    e.preventDefault()
                    back()
                  }
                }}
                placeholder={t("discover.lib.search.placeholder")}
                aria-invalid={hint ? true : undefined}
                aria-describedby={hint ? "library-search-hint library-search-note" : "library-search-note"}
                className="h-12 w-full rounded-md border border-input bg-card ps-12 pe-12 text-body outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive [&::-webkit-search-cancel-button]:hidden"
              />
              {draft && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("discover.lib.search.clear")}
                  onClick={back}
                  className="absolute end-0.5 top-1/2 -translate-y-1/2"
                >
                  <IconX stroke={1.75} />
                </Button>
              )}
            </div>
            <Button type="submit">{t("discover.lib.search.submit")}</Button>
          </div>
          {hint && (
            <p id="library-search-hint" className="text-caption text-destructive">
              {t(hint === "short" ? "discover.lib.search.short" : "discover.lib.search.long")}
            </p>
          )}
          <p id="library-search-note" className="text-caption text-muted-foreground">
            {t("discover.lib.search.intro", { sources: listOf(locale, available.map((s) => s.name)) })}
            {". "}
            {t("discover.lib.search.sendsNote")}
          </p>
          {unconnected.map((s) => (
            <p key={s.id} className="text-caption text-muted-foreground">
              {t("discover.lib.search.notConnected", { source: s.name })}
            </p>
          ))}
        </form>
        {offline && (
          <Alert variant="info">
            <AlertDescription>{t("discover.lib.search.failOffline")}</AlertDescription>
          </Alert>
        )}
      </section>

      <p aria-live="polite" className="sr-only">
        {liveText(t, state, nameOf, locale)}
      </p>

      {active ? (
        <section aria-label={t("discover.lib.search.label")} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={back}>
              <IconArrowRight data-icon="inline-start" className="ltr:rotate-180" stroke={1.75} />
              {t("discover.lib.search.back")}
            </Button>
            {state.phase === "done" && state.items.length > 0 && (
              <p className="text-label text-muted-foreground tabular-nums">{t("discover.lib.search.count", { n: num(state.items.length) })}</p>
            )}
          </div>

          <Filters
            available={available}
            types={types}
            source={source}
            type={type}
            onSource={(v) => refilter(v, "all")}
            onType={(v) => refilter(source, v)}
          />

          {state.phase === "loading" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-label text-muted-foreground">
                <Spinner />
                <span className="flex-1">{t("discover.lib.search.loading")}</span>
                <Button variant="secondary" size="sm" onClick={cancel}>
                  {t("discover.lib.search.cancel")}
                </Button>
              </div>
              <Skeleton className="h-24 rounded-card" />
              <Skeleton className="h-24 rounded-card" />
            </div>
          )}

          {state.phase === "failed" && state.failure && (
            <Alert variant={state.failure === "rate" || state.failure === "expired" ? "warning" : "destructive"}>
              <AlertDescription className="flex flex-col items-start gap-3">
                {t(FAILURE_KEY[state.failure])}
                {state.failure !== "invalid" && (
                  <Button size="sm" variant="secondary" onClick={() => run(state.query)}>
                    {t("discover.lib.search.retry")}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          {state.phase === "done" && <Results state={state} nameOf={nameOf} onMore={loadMore} onRetry={() => run(state.query)} />}
        </section>
      ) : (
        children
      )}
    </>
  )
}

function Filters({
  available,
  types,
  source,
  type,
  onSource,
  onType,
}: {
  available: Src[]
  types: LibrarySearchType[]
  source: "all" | LibrarySourceId
  type: "all" | LibrarySearchType
  onSource: (v: "all" | LibrarySourceId) => void
  onType: (v: "all" | LibrarySearchType) => void
}) {
  const { t } = useT()
  if (available.length < 2 && types.length < 2) return null
  return (
    <div className="flex flex-col gap-2">
      {available.length > 1 && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={source}
          onValueChange={(v) => v && onSource(v as "all" | LibrarySourceId)}
          aria-label={t("discover.lib.search.source")}
          className="flex-wrap justify-start"
        >
          <ToggleGroupItem value="all">{t("discover.lib.search.all")}</ToggleGroupItem>
          {available.map((s) => (
            <ToggleGroupItem key={s.id} value={s.id}>
              <bdi>{s.name}</bdi>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {types.length > 1 && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={type}
          onValueChange={(v) => v && onType(v as "all" | LibrarySearchType)}
          aria-label={t("discover.lib.search.typeFilter")}
          className="flex-wrap justify-start"
        >
          <ToggleGroupItem value="all">{t("discover.lib.search.all")}</ToggleGroupItem>
          {types.map((ty) => (
            <ToggleGroupItem key={ty} value={ty}>
              {t(typeKey(ty))}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  )
}

function Results({
  state,
  nameOf,
  onMore,
  onRetry,
}: {
  state: SearchState
  nameOf: (id: string) => string
  onMore: () => void
  onRetry: () => void
}) {
  const { t, locale } = useT()
  const failed = state.sourceStatus.filter((s) => FAILED_STATUSES.includes(s.status)).map((s) => nameOf(s.source_id))
  const unsupported = state.sourceStatus.filter((s) => s.status === "unsupported_language" || s.status === "unsupported_type")
  return (
    <>
      {failed.length > 0 && state.items.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>{t("discover.lib.search.partial", { sources: listOf(locale, failed) })}</AlertDescription>
        </Alert>
      )}
      {unsupported.map((s) => (
        <p key={s.source_id} className="text-caption text-muted-foreground">
          {t(s.status === "unsupported_language" ? "discover.lib.search.unsupportedLang" : "discover.lib.search.unsupportedType", {
            source: nameOf(s.source_id),
          })}
        </p>
      ))}

      {state.items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-card bg-muted p-4">
          <p className="text-body text-muted-foreground">
            {t(failed.length ? "discover.lib.search.nonePartial" : "discover.lib.search.none")}
          </p>
          {failed.length > 0 && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              {t("discover.lib.search.retry")}
            </Button>
          )}
        </div>
      ) : (
        <>
          <p className="text-caption text-muted-foreground">{t("discover.lib.search.external")}</p>
          <ul className="divide-y" aria-label={t("discover.lib.search.count", { n: num(state.items.length) })}>
            {state.items.map((it) => (
              <ResultRow key={it.id} item={it} />
            ))}
          </ul>
        </>
      )}

      {state.moreFailure && (
        <p role="status" className="text-label text-destructive">
          {t(FAILURE_KEY[state.moreFailure])}
        </p>
      )}
      {state.cursor && (
        <Button variant="secondary" onClick={onMore} disabled={state.loadingMore} className="self-center">
          {state.loadingMore && <Spinner data-icon="inline-start" />}
          {t(state.loadingMore ? "discover.lib.search.loadingMore" : "discover.lib.search.more")}
        </Button>
      )}
    </>
  )
}

function ResultRow({ item }: { item: LibrarySearchItem }) {
  const { t, locale } = useT()
  const href = safeExternalUrl(item.url, item.source_id)
  const otherLang = item.lang !== locale ? (LOCALES.find((l) => l.code === item.lang)?.label ?? item.lang) : null
  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap items-center gap-2 text-label text-muted-foreground">
        <bdi className="font-medium">{item.source_name}</bdi>
        {item.type && <Badge variant="secondary">{t(typeKey(item.type))}</Badge>}
        {otherLang && <span>{t("discover.lib.search.inLang", { lang: otherLang })}</span>}
      </div>
      {/* The source's words, rendered as text only (never HTML, never instructions). */}
      <h3 dir="auto" lang={item.lang} className="text-body font-bold">
        {item.title}
      </h3>
      {item.snippet && (
        <p dir="auto" lang={item.lang} className="line-clamp-3 text-label text-muted-foreground">
          {item.snippet}
        </p>
      )}
      {href && (
        <Button asChild variant="outline" size="sm" className="self-start">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            aria-label={t("discover.lib.search.openLabel", { title: item.title, source: item.source_name })}
          >
            <IconExternalLink data-icon="inline-start" stroke={1.75} />
            {t("discover.lib.search.open")}
          </a>
        </Button>
      )}
    </li>
  )
}

/** One polite announcement per state change (§3: no noisy repeats). */
function liveText(t: ReturnType<typeof useT>["t"], state: SearchState, nameOf: (id: string) => string, locale: string): string {
  if (state.phase === "loading") return t("discover.lib.search.loading")
  if (state.phase === "failed" && state.failure) return t(FAILURE_KEY[state.failure])
  if (state.phase !== "done" || state.loadingMore) return ""
  const failed = state.sourceStatus.filter((s) => FAILED_STATUSES.includes(s.status)).map((s) => nameOf(s.source_id))
  if (state.items.length === 0) return t(failed.length ? "discover.lib.search.nonePartial" : "discover.lib.search.none")
  const count = t("discover.lib.search.count", { n: num(state.items.length) })
  return failed.length ? `${count}. ${t("discover.lib.search.partial", { sources: listOf(locale, failed) })}` : count
}
