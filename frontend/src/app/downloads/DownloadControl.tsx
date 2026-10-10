/**
 * PLT-12: the one download control, used in place (a path unit, a surah in
 * listening, a library item: R1) and on each row of the download center.
 * Shows the size before anything is fetched (R2), asks before downloading
 * (R3; a unit with videos asks whether they come too, each choice with its
 * total size: owner 2026-10-10; a unit without videos starts at once), then progress, «منزّلة», «تحديث متاح» (R3), «لا تكفي المساحة» (R5).
 */
import * as React from "react"
import { IconAlertTriangle, IconCircleCheck, IconDownload, IconFileDownload, IconRefresh, IconTrash, IconWifiOff } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useT } from "@/app/i18n"
import { api } from "@/app/lib/api"
import { download, downloadAll, openDownloaded, remove } from "./manager"
import { formatSize, itemName, unitVideos, useCatalog } from "./queries"
import { storedBytes, useDownloads, type SavedItem } from "./store"
import type { CatalogItem } from "./types"

type Props = {
  itemId: string
  lang: string
  /** Center rows also offer delete; in place it stays one small control. */
  withDelete?: boolean
  /** Library: open the downloaded copy instead of the website. */
  openable?: boolean
  /** The catalogue entry when the caller has it (a lesson video): the whole catalogue is not loaded. */
  entry?: CatalogItem
  /** The download button's words in place of «نزّل» (a lesson video says what it is for). */
  action?: string
}

export function DownloadControl({ itemId, lang, withDelete = false, openable = false, entry, action }: Props) {
  const { t, locale } = useT()
  const catalog = useCatalog(lang, !entry)
  const item = entry ?? (catalog.data ? Object.values(catalog.data.sections).flat().find((i) => i.id === itemId) : undefined)
  const saved = useDownloads((s) => s.items[itemId])
  const progress = useDownloads((s) => s.progress[itemId] ?? 0)
  const [asking, setAsking] = React.useState<{ item: CatalogItem; videos: CatalogItem[] } | null>(null)
  const [preparing, setPreparing] = React.useState(false)
  const withoutRef = React.useRef<HTMLButtonElement>(null)

  if (!item && !saved) return null
  const name = itemName((saved ?? item)!, t, locale)

  // R2: the size before the download, every file's size known (the catalogue may not know all yet).
  const sized = async (base: CatalogItem) => {
    try {
      return base.sizes_known ? base : await api<CatalogItem>(`/api/downloads/catalog/${encodeURIComponent(base.id)}?lang=${lang}`)
    } catch {
      return base
    }
  }
  const ask = async (base: CatalogItem) => {
    setPreparing(true)
    try {
      // Owner 2026-10-10: a unit with videos asks whether they come too (its videos: the catalogue's own items).
      const own = base.kind === "unit" ? unitVideos(catalog.data, base.ref).filter((v) => v.downloadable) : []
      const [full, ...videos] = await Promise.all([sized(base), ...own.map(sized)])
      // A unit without videos downloads at once: its size is on the button already.
      if (base.kind === "unit" && videos.length === 0) void download(full, lang)
      else setAsking({ item: full, videos })
    } finally {
      setPreparing(false)
    }
  }

  const sizeText = (items: CatalogItem[]) => {
    const n = items.reduce((a, i) => a + i.bytes, 0)
    return items.every((i) => i.sizes_known) ? formatSize(n, t) : `≥ ${formatSize(n, t)}`
  }
  const choose = asking && asking.videos.length > 0
  const confirmDialog = (
    <AlertDialog open={!!asking} onOpenChange={(o) => !o && setAsking(null)}>
      <AlertDialogContent
        onOpenAutoFocus={(e) => {
          if (!withoutRef.current) return
          e.preventDefault() // the first choice (without videos) is the default
          withoutRef.current.focus()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t("downloads.confirm.title", { name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {choose ? t("downloads.choice.body") : t("downloads.confirm.body", { size: asking ? sizeText([asking.item]) : "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {choose ? (
          <AlertDialogFooter className="flex-col sm:flex-col sm:justify-stretch">
            <AlertDialogAction ref={withoutRef} className="w-full" onClick={() => void download(asking.item, lang)}>
              {t("downloads.choice.without", { size: sizeText([asking.item]) })}
            </AlertDialogAction>
            <AlertDialogAction variant="outline" className="w-full" onClick={() => void downloadAll([asking.item, ...asking.videos], lang)}>
              {t("downloads.choice.with", { size: sizeText([asking.item, ...asking.videos]) })}
            </AlertDialogAction>
            <AlertDialogCancel className="w-full">{t("common.cancel")}</AlertDialogCancel>
          </AlertDialogFooter>
        ) : (
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (asking) void download(asking.item, lang)
                setAsking(null)
              }}
            >
              {t("downloads.confirm.go")}
            </AlertDialogAction>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )

  const del = withDelete && saved && (
    <Button variant="ghost" size="icon" aria-label={t("downloads.deleteLabel", { name })} onClick={() => void remove(itemId)}>
      <IconTrash stroke={1.75} />
    </Button>
  )

  if (!saved) {
    if (!item) return null
    if (!item.downloadable) {
      return <p className="text-caption text-muted-foreground">{t("downloads.tooLarge", { size: formatSize(item.bytes, t) })}</p>
    }
    return (
      <>
        <Button
          variant="outline"
          disabled={preparing}
          aria-label={t("downloads.downloadLabel", { name, size: formatSize(item.bytes, t) })}
          onClick={() => void ask(item)}
        >
          <IconDownload data-icon="inline-start" stroke={1.75} />
          {action ?? t("downloads.download")} <span className="tabular-nums text-muted-foreground">{item.sizes_known ? formatSize(item.bytes, t) : `≥ ${formatSize(item.bytes, t)}`}</span>
        </Button>
        {confirmDialog}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <SavedState saved={saved} progress={progress} name={name} />
      <div className="flex flex-wrap items-center gap-2">
        {saved.status === "done" && saved.update && item && (
          <Button variant="secondary" size="sm" onClick={() => void download(item, lang)}>
            <IconRefresh data-icon="inline-start" stroke={1.75} />
            {t("downloads.update", { size: formatSize(saved.update.bytes, t) })}
          </Button>
        )}
        {saved.status === "failed" && item && (
          <Button variant="outline" size="sm" onClick={() => void ask(item)}>
            <IconRefresh data-icon="inline-start" stroke={1.75} />
            {t("downloads.retry")}
          </Button>
        )}
        {openable && saved.status === "done" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const file = saved.files.find((f) => f.kind === "media")
              if (file) void openDownloaded(file.key)
            }}
          >
            <IconFileDownload data-icon="inline-start" stroke={1.75} />
            {t("downloads.openCopy")}
          </Button>
        )}
        {del}
      </div>
      {confirmDialog}
    </div>
  )
}

function SavedState({ saved, progress, name }: { saved: SavedItem; progress: number; name: string }) {
  const { t } = useT()
  if (saved.status === "done")
    return (
      <Badge variant="success">
        <IconCircleCheck data-icon="inline-start" stroke={1.75} />
        {t("downloads.status.done")} · <span className="tabular-nums">{formatSize(storedBytes(saved), t)}</span>
      </Badge>
    )
  if (saved.status === "failed" && saved.error === "quota")
    return (
      <div role="alert" className="flex items-start gap-2 rounded-md bg-danger-surface p-3 text-destructive">
        <IconAlertTriangle className="mt-1 size-5 shrink-0" stroke={1.75} aria-hidden="true" />
        <p className="text-label">
          <span className="block font-bold">{t("downloads.quota.title")}</span>
          {t("downloads.quota.body", { size: formatSize(saved.needed ?? saved.bytes, t) })}
        </p>
      </div>
    )
  if (saved.status === "failed") return <p className="text-caption text-destructive">{t("downloads.status.unavailable")}</p>
  if (saved.status === "paused")
    return (
      <p className="flex items-center gap-2 text-caption text-muted-foreground">
        <IconWifiOff className="size-4" stroke={1.75} aria-hidden="true" />
        {t("downloads.status.paused")}
      </p>
    )
  const done = storedBytes(saved) + progress
  const pct = saved.bytes ? Math.min(100, Math.round((done / saved.bytes) * 100)) : 0
  return (
    <div className="flex flex-col gap-1">
      <Progress value={pct} aria-label={name} />
      <p className="text-caption tabular-nums text-muted-foreground" aria-live="polite">
        {saved.status === "queued"
          ? t("downloads.status.queued")
          : t("downloads.status.downloading", { done: formatSize(done, t), total: formatSize(saved.bytes, t) })}
      </p>
    </div>
  )
}

/** R6 error example: a reciter whose licence does not allow offline copies. */
export function OnlineOnlyNote() {
  const { t } = useT()
  return (
    <p className="flex items-center gap-2 text-caption text-muted-foreground">
      <IconWifiOff className="size-4" stroke={1.75} aria-hidden="true" />
      {t("downloads.onlineOnly")}
    </p>
  )
}
