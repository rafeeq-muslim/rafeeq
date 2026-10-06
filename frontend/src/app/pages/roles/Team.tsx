/**
 * MOT-08 / MOT-09 for the team: aggregate numbers only, last 7 or 30 days,
 * "not enough data" below 10 people, release markers. No names, no device
 * ids, nothing per user. Also the CMP-04 report queue and the CMP-01
 * reminder of languages without a sister or a brother to answer.
 */
import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TopBar } from "@/components/rafeeq"
import { num, useT, type Key } from "@/app/i18n"
import { api } from "@/app/lib/api"
import { useContent } from "@/app/learning/useContent"
import { ReportsQueue } from "@/app/companion/mentor/ReportsQueue"
import { ResponderCoverage } from "@/app/companion/mentor/ResponderCoverage"

type Rate = number | null
type Indicators = {
  users: number
  counts: Record<string, number>
  rates: { active: Rate; at_risk: Rate; dropout: Rate; return: Rate; mentor_contact: Rate }
  learning: { lessons_per_day: { day: string; count: number }[]; per_lesson: Record<string, number>; units_completed: Record<string, number>; opted_out: number }
  markers: { day: string; label: string }[]
  understanding: {
    objectives: Record<string, { lesson: Rate; review: Rate }>
    placement: { distribution: Record<string, number>; skipped: number }
    weakest: string[]
    why_experiment: { ai_explanation: Rate; card_only: Rate }
    guide_followed: Rate
  }
}

const STATUSES = ["new", "active", "at_risk", "lapsed", "returning"] as const
const pct = (r: Rate) => (r === null ? null : `${Math.round(r * 100)}%`)

export default function Team() {
  const { t } = useT()
  const [days, setDays] = React.useState<7 | 30>(7)
  const q = useQuery({ queryKey: ["indicators", days], queryFn: () => api<Indicators>(`/api/team/indicators?days=${days}`) })
  const { content } = useContent()
  const lessonTitle = (id: string) => content?.lessons[id]?.title ?? id
  const objectiveText = (id: string) => {
    for (const l of Object.values(content?.lessons ?? {})) {
      const o = l.objectives.find((x) => x.id === id)
      if (o) return `${o.text} — ${l.title}`
    }
    return id
  }
  const d = q.data

  return (
    <>
      <TopBar className="sticky top-0" title={<span className="font-heading text-h3">{t("team.title")}</span>} />
      <div className="flex flex-col gap-8 px-4 pt-4 pb-12">
        <ToggleGroup type="single" variant="outline" value={String(days)} onValueChange={(v) => v && setDays(Number(v) as 7 | 30)} className="w-full">
          {[7, 30].map((n) => (
            <ToggleGroupItem key={n} value={String(n)} className="flex-1">
              {t("team.days", { n: num(n) })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {q.isLoading && <Skeleton className="h-96 rounded-card" />}
        {d && (
          <>
            <section className="flex flex-col gap-3" aria-labelledby="st">
              <h2 id="st" className="flex items-baseline justify-between gap-2">
                <span className="font-heading text-h3 font-bold">{t("team.users")}</span>
                <span className="font-heading text-h2 font-bold tabular-nums">{num(d.users)}</span>
              </h2>
              <div className="flex h-4 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                {STATUSES.map((s, i) =>
                  d.users ? (
                    <span key={s} style={{ width: `${((d.counts[s] ?? 0) / d.users) * 100}%`, opacity: 1 - i * 0.16 }} className="bg-primary" />
                  ) : null,
                )}
              </div>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {STATUSES.map((s) => (
                  <li key={s} className="rounded-md bg-card px-3 py-2">
                    <span className="block text-caption text-muted-foreground">{t(`team.status.${s}` as Key)}</span>
                    <span className="font-bold tabular-nums">{num(d.counts[s] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="grid grid-cols-2 gap-3">
              {(
                [
                  ["team.rate.active", d.rates.active],
                  ["team.rate.at_risk", d.rates.at_risk],
                  ["team.rate.dropout", d.rates.dropout],
                  ["team.rate.return", d.rates.return],
                  ["team.rate.mentor", d.rates.mentor_contact],
                ] as [Key, Rate][]
              ).map(([k, v]) => (
                <Stat key={k} label={t(k)} value={pct(v)} />
              ))}
            </section>

            <section className="flex flex-col gap-3" aria-labelledby="lpd">
              <h2 id="lpd" className="font-heading text-h3 font-bold">
                {t("team.lessonsPerDay")}
              </h2>
              <Bars rows={d.learning.lessons_per_day.map((r) => ({ label: r.day.slice(5), value: r.count, marker: d.markers.find((m) => m.day === r.day)?.label }))} vertical />
              <p className="text-label text-muted-foreground">{t("team.optedOut", { n: num(d.learning.opted_out) })}</p>
            </section>

            <section className="flex flex-col gap-3" aria-labelledby="pl">
              <h2 id="pl" className="font-heading text-h3 font-bold">
                {t("team.perLesson")}
              </h2>
              <Bars rows={Object.entries(d.learning.per_lesson).map(([id, v]) => ({ label: lessonTitle(id), value: v }))} />
            </section>

            <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="und">
              <h2 id="und" className="font-heading text-h3 font-bold">
                {t("team.understanding")}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <Stat label={t("team.whyAi")} value={pct(d.understanding.why_experiment.ai_explanation)} />
                <Stat label={t("team.whyCard")} value={pct(d.understanding.why_experiment.card_only)} />
                <Stat label={t("team.guide")} value={pct(d.understanding.guide_followed)} />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-label font-bold text-muted-foreground">{t("team.lessonVsReview")}</h3>
                <ul className="flex flex-col gap-1.5">
                  {Object.entries(d.understanding.objectives).map(([id, r]) => (
                    <li key={id} className="flex items-center gap-3 rounded-md bg-card px-3 py-2 text-label">
                      <span className="min-w-0 flex-1 truncate">{objectiveText(id)}</span>
                      <span className="tabular-nums">{pct(r.lesson) ?? "—"}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="tabular-nums font-bold">{pct(r.review) ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {d.understanding.weakest.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-label font-bold text-muted-foreground">{t("team.weakest")}</h3>
                  <ol className="flex list-decimal flex-col gap-1 ps-5 text-body">
                    {d.understanding.weakest.map((o) => (
                      <li key={o}>{objectiveText(o)}</li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <h3 className="text-label font-bold text-muted-foreground">{t("team.placement")}</h3>
                {Object.entries(d.understanding.placement.distribution).map(([n, c]) => (
                  <p key={n} className="text-body tabular-nums">
                    {t("team.placementRow", { n: num(Number(n)), c: num(c) })}
                  </p>
                ))}
                <p className="text-body tabular-nums">{t("team.skipped", { n: num(d.understanding.placement.skipped) })}</p>
              </div>
            </section>

            <Markers markers={d.markers} />
            <section className="flex flex-col gap-3 border-t pt-6">
              <ReportsQueue />
            </section>
          </>
        )}
        {/* CMP-01 open question: a sister and a brother per language (shown even without indicators). */}
        <div className="border-t pt-6">
          <ResponderCoverage />
        </div>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string | null }) {
  const { t } = useT()
  return (
    <div className="flex flex-col gap-1 rounded-card border-2 bg-card p-4">
      <span className="text-label text-muted-foreground">{label}</span>
      {value ? (
        <span className="font-heading text-h1 font-bold tabular-nums">{value}</span>
      ) : (
        <span className="text-label text-muted-foreground">{t("team.notEnough")}</span>
      )}
    </div>
  )
}

function Bars({ rows, vertical }: { rows: { label: string; value: number; marker?: string }[]; vertical?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (vertical) {
    return (
      <div className="flex h-36 items-end gap-1" role="img" aria-label={rows.map((r) => `${r.label}: ${r.value}`).join(", ")}>
        {rows.map((r) => (
          <div key={r.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={r.marker ?? `${r.label}: ${r.value}`}>
            <span className={cn("w-full rounded-t-sm bg-primary", r.marker && "bg-foreground")} style={{ height: `${(r.value / max) * 100}%`, minHeight: 2 }} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="flex flex-col gap-1">
          <span className="flex justify-between gap-2 text-label">
            <span className="truncate">{r.label}</span>
            <span className="tabular-nums font-bold">{num(r.value)}</span>
          </span>
          <span className="h-2.5 rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  )
}

function Markers({ markers }: { markers: { day: string; label: string }[] }) {
  const { t } = useT()
  const qc = useQueryClient()
  const [label, setLabel] = React.useState("")
  const [day, setDay] = React.useState(new Date().toISOString().slice(0, 10))
  const add = useMutation({
    mutationFn: () => api("/api/team/markers", { method: "POST", body: { day, label } }),
    onSuccess: () => {
      setLabel("")
      void qc.invalidateQueries({ queryKey: ["indicators"] })
    },
  })
  return (
    <section className="flex flex-col gap-3 border-t pt-6" aria-labelledby="mk">
      <h2 id="mk" className="font-heading text-h3 font-bold">
        {t("team.markers")}
      </h2>
      <ul className="flex flex-col gap-1">
        {markers.map((m) => (
          <li key={`${m.day}${m.label}`} className="text-body">
            <span dir="ltr" className="tabular-nums text-muted-foreground">
              {m.day}
            </span>{" "}
            {m.label}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Input type="date" dir="ltr" value={day} onChange={(e) => setDay(e.target.value)} className="w-40" aria-label={t("team.markers")} />
        <Input dir="auto" placeholder={t("team.markerLabel")} value={label} onChange={(e) => setLabel(e.target.value)} className="min-w-48 flex-1" />
        <Button variant="secondary" disabled={label.trim().length < 2 || add.isPending} onClick={() => add.mutate()}>
          {t("team.addMarker")}
        </Button>
      </div>
    </section>
  )
}
