/**
 * PLT-12 «التنزيلات»: what can be downloaded in three sections (lessons,
 * Quran, library) with each item's size and state; what this device
 * downloaded, in any language, with delete one / delete all (R4); and the
 * space Rafeeq takes in three parts plus what the browser says is left (R1).
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconArrowRight, IconTrash } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { TopBar } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import { DownloadControl } from "./DownloadControl"
import { removeAll, resume, storageSummary, type StorageSummary } from "./manager"
import { formatSize, itemName, useCatalog } from "./queries"
import { totalStored, useDownloads } from "./store"
import type { CatalogItem, Section } from "./types"

const SECTIONS: Section[] = ["lessons", "quran", "library"]

export default function DownloadsScreen() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const catalog = useCatalog(locale)
  const items = useDownloads((s) => s.items)
  const downloaded = Object.values(items)
  const stored = totalStored(items)
  const [space, setSpace] = React.useState<StorageSummary | null>(null)

  React.useEffect(() => {
    void resume() // R5: an interrupted download continues here
  }, [])
  React.useEffect(() => {
    let live = true
    void storageSummary(stored).then((s) => live && setSpace(s))
    return () => {
      live = false
    }
  }, [stored])

  const sizeOf = (n: number) => formatSize(n, t)

  return (
    <>
      <TopBar
        className="sticky top-0"
        start={
          <Button variant="ghost" size="icon" aria-label={t("common.back")} onClick={() => navigate("/me")}>
            <IconArrowRight className="ltr:rotate-180" stroke={1.75} />
          </Button>
        }
        title={<span className="font-heading text-h3">{t("downloads.title")}</span>}
      />
      <div className="flex flex-col gap-8 px-4 pt-5 pb-12">
        <p className="text-body text-muted-foreground">{t("downloads.intro")}</p>

        <section aria-labelledby="dl-space" className="flex flex-col gap-3">
          <h2 id="dl-space" className="text-label font-bold text-muted-foreground">
            {t("downloads.storage.title")}
          </h2>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {(
              [
                ["downloads.storage.app", space?.app],
                ["downloads.storage.saved", space?.saved],
                ["downloads.storage.downloads", stored],
              ] as [Key, number | undefined][]
            ).map(([key, n]) => (
              <div key={key} className="flex flex-col gap-1 rounded-card bg-secondary px-2 py-3 text-secondary-foreground">
                <dt className="text-caption">{t(key)}</dt>
                <dd className="text-body font-bold tabular-nums">{n == null ? "…" : sizeOf(n)}</dd>
              </div>
            ))}
          </dl>
          {space?.available != null && <p className="text-label tabular-nums text-muted-foreground">{t("downloads.storage.available", { size: sizeOf(space.available) })}</p>}
          <p className="text-caption text-muted-foreground">{t("downloads.cacheNote")}</p>
        </section>

        <section aria-labelledby="dl-mine" className="flex flex-col gap-3">
          <h2 id="dl-mine" className="text-label font-bold text-muted-foreground">
            {t("downloads.mine")}
          </h2>
          {downloaded.length === 0 ? (
            <p className="text-body text-muted-foreground">{t("downloads.mineEmpty")}</p>
          ) : (
            <>
              <ul className="flex flex-col divide-y">
                {downloaded.map((it) => (
                  <li key={it.id} className="flex flex-col gap-2 py-4">
                    <span dir="auto" className="text-body font-bold">
                      {itemName(it, t, locale)}
                    </span>
                    {it.lang !== locale && <span className="text-caption text-muted-foreground">{t("downloads.otherLang")}</span>}
                    <DownloadControl itemId={it.id} lang={it.lang} withDelete openable={it.section === "library"} />
                  </li>
                ))}
              </ul>
              <DeleteAll />
            </>
          )}
        </section>

        {catalog.isLoading && <Skeleton className="h-64 rounded-card" />}
        {catalog.isError && (
          <p role="status" className="rounded-card bg-muted p-4 text-label text-muted-foreground">
            {typeof navigator !== "undefined" && navigator.onLine === false ? t("downloads.offline") : t("downloads.loadError")}
          </p>
        )}
        {catalog.data &&
          SECTIONS.map((section) => (
            <CatalogSection key={section} section={section} items={catalog.data.sections[section]} lang={locale} />
          ))}
      </div>
    </>
  )
}

function CatalogSection({ section, items, lang }: { section: Section; items: CatalogItem[]; lang: string }) {
  const { t, locale } = useT()
  const id = `dl-${section}`
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-heading text-h3 font-bold">
        {t(`downloads.section.${section}` as Key)}
      </h2>
      {items.length === 0 ? (
        <p className="text-body text-muted-foreground">{t("downloads.empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {items.map((it) => (
            <li key={it.id} className="flex flex-col gap-2 py-4">
              <span dir="auto" className="text-body font-bold">
                {itemName(it, t, locale)}
              </span>
              {it.kind === "surah" && it.title && <span className="text-caption text-muted-foreground">{t("downloads.byReciter", { name: it.title })}</span>}
              <DownloadControl itemId={it.id} lang={lang} withDelete openable={section === "library"} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DeleteAll() {
  const { t } = useT()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="self-start">
          <IconTrash data-icon="inline-start" stroke={1.75} />
          {t("downloads.deleteAll")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("downloads.deleteAll.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("downloads.deleteAll.body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void removeAll()}>{t("downloads.deleteAll.confirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
