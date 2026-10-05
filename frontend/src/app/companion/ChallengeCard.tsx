/**
 * MOT-06 on the group page (CMP-05 R6): the week's goal as «زهرة المجموعة»,
 * one petal per member, coloured as members complete it. Only the count is
 * shown («6 من 8 أتمّوا»), never who did or did not (R4); the mentor also
 * sees who is done among those sharing progress with them (R4 ex3). The
 * end is announced with encouragement and no names (R5). No points, no
 * ranking (rules.md §3).
 */
import { IconCheck, IconClock, IconHourglass } from "@tabler/icons-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PetalPattern, UnitBloom } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { useContent } from "@/app/learning/useContent"
import { type Challenge, type Member, challengeApi } from "./api"
import { useSendError } from "./Chat"
import { weekdayDate } from "./format"

const MAX_PETALS = 12

/** The goal in words, in the reader's language. */
export function useGoalText() {
  const { t } = useT()
  const { content } = useContent()
  return (c: Pick<Challenge, "type" | "target_id" | "target_count" | "text">) => {
    const n = num(c.target_count ?? 0)
    switch (c.type) {
      case "lesson":
        return t("cmp.ch.lesson", { title: (c.target_id && content?.lessons[c.target_id]?.title) || c.target_id || "" })
      case "unit":
        return t("cmp.ch.unit", { title: content?.units.find((u) => u.id === c.target_id)?.title || c.target_id || "" })
      case "lessons_each":
        return t("cmp.ch.lessonsEach", { n })
      case "days_each":
        return t("cmp.ch.daysEach", { n })
      case "group_total":
        return t("cmp.ch.groupTotal", { n })
      default:
        return c.text ?? ""
    }
  }
}

/** «6 من 8 أتمّوا» or «14 من 20 درسًا معًا». */
export function progressText(t: ReturnType<typeof useT>["t"], c: Pick<Challenge, "done" | "of" | "counts">) {
  return t(c.counts === "lessons" ? "cmp.ch.progressLessons" : "cmp.ch.progress", { done: num(c.done), of: num(c.of) })
}

function petals(c: Challenge) {
  if (c.counts === "members" && c.of <= MAX_PETALS) return { total: Math.max(1, c.of), done: c.done }
  const total = MAX_PETALS
  return { total, done: c.of ? Math.round((Math.min(c.done, c.of) / c.of) * total) : 0 }
}

export function ChallengeCard({ challenge, members = [], className }: { challenge: Challenge; members?: Member[]; className?: string }) {
  const { t, locale } = useT()
  const goal = useGoalText()
  const qc = useQueryClient()
  const toMessage = useSendError()
  const c = challenge

  if (c.status !== "active") {
    // Mentor only: a free text waiting for the Sharia reviewer, or refused (R3).
    return (
      <section className={cn("flex flex-col gap-2 rounded-card border border-dashed p-5", className)}>
        <div className="flex items-center gap-2">
          <IconHourglass className="size-5 text-muted-foreground" stroke={1.75} aria-hidden="true" />
          <h3 className="text-body font-bold">{t("cmp.ch.title")}</h3>
          <Badge variant={c.status === "rejected" ? "destructive" : "warning"}>{c.status === "rejected" ? t("cmp.ch.rejected") : t("cmp.ch.pending")}</Badge>
        </div>
        <p dir="auto" className="text-body text-muted-foreground">
          {goal(c)}
        </p>
      </section>
    )
  }

  const p = petals(c)
  const names = (c.shared_done ?? []).map((id) => members.find((m) => m.id === id)?.display_name).filter(Boolean) as string[]
  const toggle = async (done: boolean) => {
    try {
      await challengeApi.check(c.id, done)
      await qc.invalidateQueries({ queryKey: ["cmp", "challenge"] })
    } catch (e) {
      toast.error(toMessage(e))
    }
  }

  return (
    <section
      data-slot="group-challenge"
      aria-label={t("cmp.ch.title")}
      className={cn(
        "dark relative isolate overflow-hidden rounded-card bg-[linear-gradient(160deg,var(--rf-ink)_0%,var(--rf-deep)_100%)] p-5 text-foreground",
        className
      )}
    >
      <PetalPattern className="-z-10 text-white/[0.045]" />
      <div className="flex items-center gap-4">
        <UnitBloom total={p.total} done={p.done} size={104} className="shrink-0" label={t("cmp.ch.bloom", { done: num(c.done), of: num(c.of) })} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex items-center gap-1.5 text-caption text-white/70">
            <IconClock className="size-3.5" stroke={1.75} aria-hidden="true" />
            {c.ended ? t("cmp.ch.ended") : `${t("cmp.ch.title")} · ${t("cmp.ch.endsOn", { date: weekdayDate(c.ends_at!, locale) })}`}
          </p>
          <h3 dir="auto" className="text-body font-bold text-balance text-white">
            {goal(c)}
          </h3>
          <p className="font-heading text-h2 font-bold text-white tabular-nums">{progressText(t, c)}</p>
        </div>
      </div>

      {c.ended ? (
        <p className="mt-4 text-body text-white/85">{t("cmp.ch.endedBody", { done: num(c.done), of: num(c.of) })}</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {c.mine !== null && (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-label text-white">
              {c.mine && <IconCheck className="size-4" stroke={2} aria-hidden="true" />}
              {c.mine ? t("cmp.ch.mineDone") : t("cmp.ch.mineNot")}
            </p>
          )}
          {c.my_lessons !== null && (
            <p className="rounded-full bg-white/10 px-3 py-1.5 text-label text-white tabular-nums">{t("cmp.ch.myLessons", { n: num(c.my_lessons) })}</p>
          )}
          {c.type === "free_text" && c.mine !== null && (
            <Button size="sm" variant={c.mine ? "outline" : "secondary"} className="ms-auto" onClick={() => void toggle(!c.mine)}>
              {c.mine ? t("cmp.ch.uncheck") : t("cmp.ch.check")}
            </Button>
          )}
        </div>
      )}

      {names.length > 0 && (
        <p className="mt-3 text-caption text-white/70">
          {t("cmp.ch.sharedDone", { names: names.join(locale === "ar" ? "، " : ", ") })}
        </p>
      )}
    </section>
  )
}
