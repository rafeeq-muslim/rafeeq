/**
 * KNW-09 saved items. Ids resolve to the current approved content; anything
 * withdrawn shows «لم تعد متاحة» without its old text (R6). A saved answer
 * shows its wording, its sources and its date, never the question; its Quran
 * and hadith words come from the stored records by id (R2). Delete one or all
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
import { segments } from "@/app/ask/answer"
import { AnswerMessage } from "@/app/ask/parts"
import type { SourceCard } from "@/app/ask/types"
import { CardBody } from "./CardView"
import { DiscoverBar } from "./parts"
import { usePassages, useCards, useLibrary } from "./queries"
import { liveSourceCard, resolveAnswer, resolveSaved, type SavedAnswerView } from "./resolve"
import { pushSaved, savedAnswer, useSaved } from "./savedStore"
import type { DailyCardData, LibraryItemData } from "./types"
import { unreachable } from "@/app/offline/online"

const DATE_TAG: Record<string, string> = { ar: "ar-u-nu-latn", en: "en-US", tl: "fil-PH" }

type AnswerView = SavedAnswerView<SourceCard>

/** The first line of Rafeeq's wording, without any scripture marker. */
const answerTitle = (v: AnswerView) => segments(v.text.answer, []).find((s) => s.type === "text")?.text ?? ""

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
  const answerTexts = new Map(items.filter((e) => e.kind === "answer").flatMap((e) => (savedAnswer(e.ref) ? [[e.ref, savedAnswer(e.ref)!]] : [])))
  // PRD live v3: live source ids are not stored records; they resolve from their saved link.
  const passages = usePassages([...answerTexts.values()].flatMap((a) => a.source_ids).filter((id) => !id.startsWith("live:")))
  const [open, setOpen] = React.useState<string | null>(null)

  // R3: merge the device list with the account copy when signed in.
  React.useEffect(() => {
    if (signedIn) void pushSaved()
  }, [signedIn])

  const loading =
    cards.isLoading || passages.isLoading || [libAr, libEn, libTl].some((q) => q.isLoading && q.fetchStatus !== "idle")
  const records = passages.data ?? new Map<string, SourceCard>()
  const answers = new Map<string, AnswerView>()
  for (const [ref, text] of answerTexts) {
    const view = resolveAnswer(text, records, liveSourceCard)
    if (view) answers.set(ref, view)
  }
  const approved = {
    cards: new Map<string, DailyCardData>((cards.data?.cards ?? []).map((c) => [c.id, c])),
    library: new Map<string, LibraryItemData>(
      [libAr, libEn, libTl].flatMap((q) => q.data?.topics.flatMap((tp) => tp.items) ?? []).map((i) => [i.id, i]),
    ),
    answers,
  }
  const rows = resolveSaved(items, approved)
  const dateFmt = new Intl.DateTimeFormat(DATE_TAG[locale] ?? "en-US", { day: "numeric", month: "long", year: "numeric" })

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
              const removeButton = (
                <Button variant="ghost" size="icon" aria-label={t("discover.saved.remove")} onClick={() => remove(row.entry.kind, row.entry.ref)}>
                  <IconTrash stroke={1.75} />
                </Button>
              )
              if (!row.available) {
                // Offline: the sources could not be fetched, which is not a withdrawal.
                const answerOffline = row.entry.kind === "answer" && answerTexts.has(row.entry.ref) && unreachable(passages)
                // PLT-15 R4: nor is a card or library list that never reached this device.
                const listOffline =
                  (row.entry.kind === "card" && unreachable(cards)) ||
                  (row.entry.kind === "library" && [libAr, libEn, libTl].some((q) => unreachable(q)))
                const offline = answerOffline || listOffline
                return (
                  <li key={key} className="flex items-center gap-3 rounded-card border border-dashed p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-caption text-muted-foreground">{kindLabel}</p>
                      {offline ? (
                        <p className="text-label text-muted-foreground">{t(answerOffline ? "discover.saved.answerOffline" : "offline.savedItem")}</p>
                      ) : (
                        <>
                          <p className="text-body font-bold">{t("discover.saved.unavailable")}</p>
                          <p className="text-label text-muted-foreground">{t("discover.saved.unavailableBody")}</p>
                        </>
                      )}
                    </div>
                    {removeButton}
                  </li>
                )
              }
              const kind = row.entry.kind
              const expands = kind === "card" || kind === "answer"
              const answer = kind === "answer" ? (row.content as AnswerView) : null
              const title = answer ? answerTitle(answer) : (row.content as DailyCardData | LibraryItemData).title
              return (
                <li key={key} className="flex flex-col rounded-card bg-card shadow-card">
                  <div className="flex items-center gap-2 p-2 ps-4">
                    <button
                      type="button"
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-start"
                      aria-expanded={expands ? open === key : undefined}
                      onClick={() => (expands ? setOpen(open === key ? null : key) : navigate(`/discover/library/${row.entry.ref}`))}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-caption text-muted-foreground">
                          {kindLabel}
                          {answer && ` · ${t("discover.saved.answerOn", { d: dateFmt.format(new Date(row.entry.saved_at)) })}`}
                        </span>
                        <span dir="auto" className="line-clamp-2 block text-body font-bold">
                          {title}
                        </span>
                      </span>
                      {!expands && <IconArrowLeft className="size-5 shrink-0 text-muted-foreground ltr:rotate-180" aria-hidden="true" />}
                    </button>
                    {removeButton}
                  </div>
                  {open === key && kind === "card" && (
                    <div className="border-t px-4 pt-4 pb-5">
                      <CardBody card={row.content as DailyCardData} />
                    </div>
                  )}
                  {open === key && answer && (
                    <div className="border-t px-2 pt-4 pb-4">
                      <AnswerMessage answer={answer.text.answer} sources={answer.sources} />
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
