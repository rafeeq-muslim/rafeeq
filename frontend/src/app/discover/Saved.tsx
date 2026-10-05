/**
 * KNW-09 saved items. Ids resolve to the current approved content; anything
 * withdrawn shows «لم تعد متاحة» without its old text (R6). Delete one or all
 * (R5). Private: nothing here is shared with a mentor or group (R4).
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconArrowLeft, IconEyeOff, IconTrash } from "@tabler/icons-react"

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
import { SpotIllustration } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { CardBody } from "./CardView"
import { DiscoverBar } from "./parts"
import { useCards, useLibrary } from "./queries"
import { resolveSaved } from "./resolve"
import { pushSaved, useSaved } from "./saved"
import type { DailyCardData, LibraryItemData } from "./types"

export default function Saved() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const items = useSaved((s) => s.items)
  const remove = useSaved((s) => s.remove)
  const clear = useSaved((s) => s.clear)
  const signedIn = useAuth((s) => !!s.token)
  const cards = useCards(locale)
  const libLangs = [...new Set(items.filter((e) => e.kind === "library").map((e) => e.ref.split("-").pop() ?? locale))]
  const libAr = useLibrary("ar", libLangs.includes("ar"))
  const libEn = useLibrary("en", libLangs.includes("en"))
  const libTl = useLibrary("tl", libLangs.includes("tl"))
  const [open, setOpen] = React.useState<string | null>(null)

  // R3: merge the device list with the account copy when signed in.
  React.useEffect(() => {
    if (signedIn) void pushSaved()
  }, [signedIn])

  const loading = cards.isLoading || [libAr, libEn, libTl].some((q) => q.isLoading && q.fetchStatus !== "idle")
  const approved = {
    cards: new Map<string, DailyCardData>((cards.data?.cards ?? []).map((c) => [c.id, c])),
    library: new Map<string, LibraryItemData>(
      [libAr, libEn, libTl].flatMap((q) => q.data?.topics.flatMap((tp) => tp.items) ?? []).map((i) => [i.id, i]),
    ),
  }
  const rows = resolveSaved(items, approved)

  return (
    <>
      <DiscoverBar title={t("discover.saved")} />
      <div className="flex flex-col gap-5 px-4 pt-5 pb-12">
        <p className="flex items-start gap-2 text-label text-muted-foreground">
          <IconEyeOff className="mt-0.5 size-4 shrink-0" stroke={1.75} aria-hidden="true" />
          {t("discover.saved.private")}
        </p>

        {items.length === 0 ? (
          <section className="flex flex-col items-center gap-4 py-10 text-center">
            <SpotIllustration kind="saved" size={104} />
            <p className="max-w-sm text-body text-muted-foreground">{t("discover.saved.empty")}</p>
          </section>
        ) : loading ? (
          <Skeleton className="h-48 rounded-card" />
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const key = `${row.entry.kind}:${row.entry.ref}`
              const kindLabel = t(`discover.saved.kind.${row.entry.kind}` as Key)
              if (!row.available) {
                return (
                  <li key={key} className="flex items-center gap-3 rounded-card border border-dashed p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-caption text-muted-foreground">{kindLabel}</p>
                      <p className="text-body font-bold">{t("discover.saved.unavailable")}</p>
                      <p className="text-label text-muted-foreground">{t("discover.saved.unavailableBody")}</p>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={t("discover.saved.remove")} onClick={() => remove(row.entry.kind, row.entry.ref)}>
                      <IconTrash stroke={1.75} />
                    </Button>
                  </li>
                )
              }
              const isCard = row.entry.kind === "card"
              const title = (row.content as DailyCardData | LibraryItemData).title
              return (
                <li key={key} className="flex flex-col rounded-card bg-card shadow-card">
                  <div className="flex items-center gap-2 p-2 ps-4">
                    <button
                      type="button"
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-start"
                      aria-expanded={isCard ? open === key : undefined}
                      onClick={() => (isCard ? setOpen(open === key ? null : key) : navigate(`/discover/library/${row.entry.ref}`))}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-caption text-muted-foreground">{kindLabel}</span>
                        <span dir="auto" className="line-clamp-2 block text-body font-bold">
                          {title}
                        </span>
                      </span>
                      {!isCard && <IconArrowLeft className="size-5 shrink-0 text-muted-foreground ltr:rotate-180" aria-hidden="true" />}
                    </button>
                    <Button variant="ghost" size="icon" aria-label={t("discover.saved.remove")} onClick={() => remove(row.entry.kind, row.entry.ref)}>
                      <IconTrash stroke={1.75} />
                    </Button>
                  </div>
                  {isCard && open === key && (
                    <div className="border-t px-4 pt-4 pb-5">
                      <CardBody card={row.content as DailyCardData} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {items.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="self-start">
                <IconTrash data-icon="inline-start" stroke={1.75} />
                {t("discover.saved.clear")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("discover.saved.clearTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("discover.saved.clearBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={clear}>
                  {t("discover.saved.clear")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </>
  )
}
