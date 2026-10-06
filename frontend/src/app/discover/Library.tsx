/**
 * KNW-06 library: approved items in the learner's language by topic (R2),
 * English only when asked for (R2 edge), no thumbnails (R4), and the source
 * card on each item (R3). What the learner opens is never recorded (R6).
 */
import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { IconArrowLeft, IconExternalLink, IconFileDownload, IconShieldLock } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PetalBullet, RafeeqSymbol, SpotIllustration } from "@/components/rafeeq"
import { LOCALES, useT, type Key } from "@/app/i18n"
import { DiscoverBar, SaveToggle, SourceLine } from "./parts"
import { LibrarySearch } from "./LibrarySearch"
import { useLibrary } from "./queries"
import type { LibraryItemData } from "./types"
import { OfflineNote, OfflineOnly } from "@/app/offline/NeedsConnection"
import { unreachable } from "@/app/offline/online"

import { DownloadControl } from "@/app/downloads/DownloadControl" // PLT-12 R1

const typeKey = (type: string) => `discover.lib.type.${type}` as Key
const langLabel = (code: string) => LOCALES.find((l) => l.code === code)?.label ?? code

/** Neutral tile from the brand grammar instead of any thumbnail (R4). */
function ItemTile({ large = false }: { large?: boolean }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-md bg-secondary", large ? "size-18" : "size-12")}>
      <RafeeqSymbol size={large ? 44 : 30} title="" aria-hidden="true" />
    </span>
  )
}

function ItemRow({ item, onOpen }: { item: LibraryItemData; onOpen: () => void }) {
  const { t } = useT()
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex min-h-16 w-full items-center gap-3 py-3 text-start">
        <ItemTile />
        <span className="min-w-0 flex-1">
          <span dir="auto" className="line-clamp-2 block text-body font-bold">
            {item.title}
          </span>
          <span className="block truncate text-label text-muted-foreground">
            {t(typeKey(item.type))}
            {item.authors[0] && (
              <>
                {" · "}
                <bdi>{item.authors[0]}</bdi>
              </>
            )}
          </span>
        </span>
        <IconArrowLeft className="size-5 shrink-0 text-muted-foreground ltr:rotate-180" aria-hidden="true" />
      </button>
    </li>
  )
}

export function LibraryList() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const [english, setEnglish] = React.useState<Record<string, boolean>>({})
  const wantsEnglish = locale !== "en" && Object.values(english).some(Boolean)
  const lib = useLibrary(locale)
  const en = useLibrary("en", wantsEnglish)

  const topics = lib.data?.topics ?? []
  const nothing = !lib.isLoading && topics.every((tp) => tp.items.length === 0)

  return (
    <>
      <DiscoverBar title={t("discover.library")} />
      <div className="flex flex-col gap-8 px-4 pt-5 pb-12">
        <p className="flex items-start gap-2 text-label text-muted-foreground">
          <IconShieldLock className="mt-0.5 size-4 shrink-0" stroke={1.75} aria-hidden="true" />
          {t("discover.lib.private")}
        </p>

        {/* KNW-06 library live search: the catalogue below stays as it is before a search and after clearing it. */}
        <LibrarySearch>
          {lib.isLoading && <Skeleton className="h-64 rounded-card" />}
          {lib.isError && <p className="text-body text-muted-foreground">{t("discover.loadError")}</p>}
          {nothing && !lib.isError && !wantsEnglish && (
            <section className="flex flex-col items-center gap-4 py-8 text-center">
              <SpotIllustration kind="start" size={96} />
              <p className="max-w-sm text-body text-muted-foreground">{t("discover.lib.none")}</p>
              {locale !== "en" && !wantsEnglish && (
                <Button variant="secondary" size="sm" onClick={() => setEnglish(Object.fromEntries(topics.map((tp) => [tp.id, true])))}>
                  {t("discover.lib.showEnglish")}
                </Button>
              )}
            </section>
          )}

          {(!nothing || wantsEnglish) &&
            topics.map((topic) => {
              const showEn = english[topic.id] && locale !== "en"
              const enItems = showEn ? (en.data?.topics.find((x) => x.id === topic.id)?.items ?? []) : []
              return (
                <section key={topic.id} aria-labelledby={`topic-${topic.id}`} className="flex flex-col gap-2">
                  <h2 id={`topic-${topic.id}`} className="flex items-center gap-2 font-heading text-h3 font-bold">
                    <PetalBullet />
                    {topic.title ?? t(`discover.lib.topic.${topic.id}` as Key)}
                  </h2>
                  {topic.items.length > 0 ? (
                    <ul className="divide-y">
                      {topic.items.map((it) => (
                        <ItemRow key={it.id} item={it} onOpen={() => navigate(`/discover/library/${it.id}`)} />
                      ))}
                    </ul>
                  ) : (
                    <div className="flex flex-col items-start gap-3 rounded-card bg-muted p-4">
                      <p className="text-body text-muted-foreground">{t("discover.lib.empty")}</p>
                      {locale !== "en" && !showEn && (
                        <Button variant="secondary" size="sm" onClick={() => setEnglish((s) => ({ ...s, [topic.id]: true }))}>
                          {t("discover.lib.showEnglish")}
                        </Button>
                      )}
                    </div>
                  )}
                  {showEn && enItems.length > 0 && (
                    <>
                      <p className="mt-2 text-label font-bold text-muted-foreground">{t("discover.lib.inEnglish")}</p>
                      <ul className="divide-y" lang="en">
                        {enItems.map((it) => (
                          <ItemRow key={it.id} item={it} onOpen={() => navigate(`/discover/library/${it.id}`)} />
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              )
            })}
        </LibrarySearch>
      </div>
    </>
  )
}

export function LibraryItemPage() {
  const { t, locale } = useT()
  const { itemId = "" } = useParams()
  const itemLang = itemId.split("-").pop() ?? locale
  const lib = useLibrary(itemLang)
  const item = lib.data?.topics.flatMap((tp) => tp.items).find((i) => i.id === itemId)

  return (
    <>
      <DiscoverBar title={t("discover.library")} back="/discover/library" end={item && <SaveToggle kind="library" refId={item.id} />} />
      <div className="flex flex-col gap-6 px-4 pt-5 pb-12">
        {lib.isLoading ? (
          <Skeleton className="h-64 rounded-card" />
        ) : !item && unreachable(lib) ? (
          <OfflineNote text="offline.libraryList" />
        ) : !item ? (
          <p className="text-body text-muted-foreground">{t("discover.lib.notFound")}</p>
        ) : (
          <article className="flex flex-col gap-6" lang={item.lang}>
            <header className="flex items-start gap-4">
              <ItemTile large />
              <div className="min-w-0 flex-1">
                <p className="text-label text-muted-foreground">{t(typeKey(item.type))}</p>
                <h1 dir="auto" className="font-heading text-h2 font-bold text-balance">
                  {item.title}
                </h1>
              </div>
            </header>

            {item.description && item.description !== item.title && (
              <p dir="auto" className="font-reading text-reading text-foreground/90">
                {item.description}
              </p>
            )}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-label">
              {item.authors.length > 0 && (
                <>
                  <dt className="text-muted-foreground">{t("discover.lib.author")}</dt>
                  <dd dir="auto">{item.authors.join("، ")}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{t("discover.lib.language")}</dt>
              <dd>{langLabel(item.lang)}</dd>
              <dt className="text-muted-foreground">{t("discover.lib.type")}</dt>
              <dd>{t(typeKey(item.type))}</dd>
            </dl>

            <div className="flex flex-col gap-3">
              <OfflineOnly text="offline.libraryFile" />{/* PLT-15 R4: files open online or once downloaded (PLT-12) */}
              {item.files.map((f, i) => (
                <Button key={f.url} asChild size="lg" variant={i === 0 ? "default" : "secondary"}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    <IconFileDownload data-icon="inline-start" stroke={1.75} />
                    {t("discover.lib.open", { ext: f.ext.toUpperCase(), size: f.size })}
                  </a>
                </Button>
              ))}
              {/* PLT-12 R1: keep this item on the device; offline it opens from the download */}
              <DownloadControl itemId={`lib:${item.id}`} lang={item.lang} openable />
              <Button asChild variant="ghost">
                <a href={item.origin_url} target="_blank" rel="noopener noreferrer">
                  <IconExternalLink data-icon="inline-start" stroke={1.75} />
                  {t("discover.lib.origin")}
                </a>
              </Button>
            </div>

            <SourceLine href={item.origin_url}>
              <bdi>{item.source}</bdi>
            </SourceLine>
          </article>
        )}
      </div>
    </>
  )
}
