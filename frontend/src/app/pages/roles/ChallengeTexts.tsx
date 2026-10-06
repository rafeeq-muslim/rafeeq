/**
 * MOT-06 R3 in the review desk: mentors' free-text weekly goals wait here
 * until the Sharia reviewer approves them (the group then sees the goal and
 * its seven days start; the text becomes a template) or returns them with a
 * reason the mentor reads. The reviewer sees the text, its language and
 * date only, never the mentor or the group. Reviewer only: the server
 * refuses team members and admins without the role, so they get no list.
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IconCheck, IconCornerUpLeft } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { TopBar } from "@/components/rafeeq"
import { LOCALES, dirOf, useT, type Locale } from "@/app/i18n"
import { ApiError, api } from "@/app/lib/api"
import { useAuth } from "@/app/stores/auth"

export type PendingText = { id: string; text: string | null; text_lang: string | null; created_at: string }

const KEY = ["challenge-texts"]
const DATE: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" } // Latin digits

/** Only the role itself: the server's guard does not let admins in (KNW-05 R5). */
export const useIsShariaReviewer = () => useAuth((s) => !!s.me?.roles.includes("sharia_reviewer"))

export function usePendingTexts(enabled: boolean) {
  return useQuery({ queryKey: KEY, queryFn: () => api<PendingText[]>("/api/challenges/pending"), enabled, staleTime: 15_000 })
}

export function ChallengeTexts() {
  const { t } = useT()
  const navigate = useNavigate()
  const reviewer = useIsShariaReviewer()
  const q = usePendingTexts(reviewer)

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        className="sticky top-0"
        start={
          <Button variant="ghost" size="sm" onClick={() => navigate("/review-desk")}>
            {t("common.back")}
          </Button>
        }
        title={<span className="font-heading text-h3">{t("desk.ch.title")}</span>}
      />
      <div className="flex flex-col gap-5 px-4 pt-4 pb-12">
        {!reviewer ? (
          <p className="text-label text-muted-foreground">{t("desk.readOnly")}</p>
        ) : (
          <>
            <p className="text-label text-muted-foreground">{t("desk.ch.hint")}</p>
            {q.isLoading && <Skeleton className="h-48 rounded-card" />}
            {q.isError && <p className="py-8 text-center text-body text-muted-foreground">{t("common.error")}</p>}
            {q.data && q.data.length === 0 && <p className="py-8 text-center text-body text-muted-foreground">{t("desk.ch.empty")}</p>}
            <ul className="flex flex-col gap-3">
              {q.data?.map((c) => (
                <PendingCard key={c.id} item={c} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function PendingCard({ item }: { item: PendingText }) {
  const { t } = useT()
  const qc = useQueryClient()
  const [returning, setReturning] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const lang = LOCALES.find((l) => l.code === item.text_lang)

  const drop = () => qc.setQueryData<PendingText[]>(KEY, (rows) => rows?.filter((r) => r.id !== item.id))
  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      api(`/api/challenges/${item.id}/review`, { method: "POST", body: approve ? { approve } : { approve, reason: reason.trim() } }),
    onSuccess: (_, approve) => {
      toast.success(t(approve ? "desk.ch.approvedToast" : "desk.ch.returnedToast"))
      drop()
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 404) {
        toast.error(t("desk.ch.gone")) // decided already, or withdrawn by its mentor
        drop()
      } else toast.error(t("common.error"))
    },
  })

  return (
    <li className="flex flex-col gap-3 rounded-card border-2 bg-card p-4">
      <span className="text-caption text-muted-foreground">
        {lang?.label ?? item.text_lang ?? "—"} · <span dir="ltr">{new Date(item.created_at).toLocaleString("en-GB", DATE)}</span>
      </span>
      <p lang={item.text_lang ?? undefined} dir={lang ? dirOf(lang.code as Locale) : "auto"} className="font-reading text-reading whitespace-pre-line">
        {item.text}
      </p>
      {returning ? (
        <>
          <Textarea dir="auto" placeholder={t("desk.ch.reason")} aria-label={t("desk.ch.reason")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="min-h-24" />
          <div className="flex flex-wrap gap-2">
            <Button className="grow" variant="destructive" disabled={!reason.trim() || decide.isPending} onClick={() => decide.mutate(false)}>
              {t("desk.sendReturn")}
            </Button>
            <Button variant="ghost" className="grow" onClick={() => setReturning(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </>
      ) : (
        // Side by side when both labels fit, stacked full width on a narrow phone (360–390px), as on the item screen.
        <div className="flex flex-wrap gap-2">
          <Button className="grow" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
            <IconCheck data-icon="inline-start" />
            {t("desk.ch.approve")}
          </Button>
          <Button variant="outline" className="grow" disabled={decide.isPending} onClick={() => setReturning(true)}>
            <IconCornerUpLeft data-icon="inline-start" />
            {t("desk.ch.return")}
          </Button>
        </div>
      )}
    </li>
  )
}
