/**
 * PLT-17 R5 / PRC-04 R2: the team enters the announced start of Ramadan,
 * Shawwal and Dhu al-Hijjah. Ramadan mode starts only from an entry here;
 * a country with no entry of its own follows Saudi Arabia's. Saving and
 * removing ask first: either changes what every learner sees.
 */
import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
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
import { num, useT, type Key } from "@/app/i18n"
import { api, ApiError } from "@/app/lib/api"
import { hijriOf, type Sighting } from "@/app/practice/hijri"

const MONTHS = [9, 10, 12] as const
type Month = (typeof MONTHS)[number]
type Entry = Sighting & { source_url: string }
type Pending = { kind: "save"; body: Entry } | { kind: "remove"; item: Entry }

/** The Hijri year of the next start of this month (this year's if it hasn't passed yet). */
export function upcomingYear(month: number, today = new Date()): number {
  const h = hijriOf({ y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() })
  return h.month <= month ? h.year : h.year + 1
}

const monthKey = (m: number) => `plt17.sight.month.${m}` as Key
const countryKey = (c: string) => `plt17.sight.country.${c}` as Key

export function TeamSightings() {
  const { t } = useT()
  const qc = useQueryClient()
  const [month, setMonth] = React.useState<Month>(9)
  const year = upcomingYear(month)
  const [start, setStart] = React.useState("")
  const [source, setSource] = React.useState("")
  const [error, setError] = React.useState<Key | null>(null)
  const [pending, setPending] = React.useState<Pending | null>(null)

  const list = useQuery({ queryKey: ["sightings"], queryFn: () => api<{ items: Entry[] }>("/api/practice/sightings") })
  const expected = useQuery({
    queryKey: ["sightings-expected", year, month],
    queryFn: () => api<{ expected: string | null; countries: string[] }>(`/api/practice/sightings/expected?hijri_year=${year}&hijri_month=${month}`),
  })
  const country = expected.data?.countries[0] ?? "SA"

  React.useEffect(() => {
    if (expected.data?.expected) setStart(expected.data.expected)
  }, [expected.data?.expected])

  const done = () => {
    setPending(null)
    void qc.invalidateQueries({ queryKey: ["sightings"] })
  }
  const save = useMutation({
    mutationFn: (body: Entry) => api("/api/practice/sightings", { method: "POST", body }),
    onSuccess: () => {
      setSource("")
      done()
    },
    onError: (e) => {
      setPending(null)
      setError(e instanceof ApiError && e.message === "too_far_from_expected" ? "plt17.sight.tooFar" : "common.error")
    },
  })
  const remove = useMutation({
    mutationFn: (s: Entry) => api(`/api/practice/sightings/${s.country}/${s.hijri_year}/${s.hijri_month}`, { method: "DELETE" }),
    onSuccess: done,
    onError: () => {
      setPending(null)
      setError("common.error")
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!source.trim()) return setError("plt17.sight.sourceRequired")
    if (!start) return setError("plt17.sight.dateRequired")
    setPending({ kind: "save", body: { country, hijri_year: year, hijri_month: month, start, source_url: source.trim() } })
  }

  const items = [...(list.data?.items ?? [])].sort((a, b) => b.hijri_year - a.hijri_year || b.hijri_month - a.hijri_month)

  return (
    <section className="flex flex-col gap-4" aria-labelledby="sight">
      <div className="flex flex-col gap-1">
        <h2 id="sight" className="font-heading text-h3 font-bold">
          {t("plt17.sight.title")}
        </h2>
        <p className="text-body text-muted-foreground">{t("plt17.sight.intro")}</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4 rounded-card bg-card p-4" noValidate>
        <p className="text-label">
          <span className="text-muted-foreground">{t("plt17.sight.country")}: </span>
          <span className="font-bold">{t(countryKey(country))}</span>
        </p>
        <ToggleGroup type="single" variant="outline" value={String(month)} onValueChange={(v) => v && setMonth(Number(v) as Month)} className="w-full">
          {MONTHS.map((m) => (
            <ToggleGroupItem key={m} value={String(m)} className="flex-1">
              {t(monthKey(m))}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-caption text-muted-foreground">
          {t("plt17.sight.expected", { month: t(monthKey(month)), year: num(year), date: expected.data?.expected ?? "…" })}
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sight-start">{t("plt17.sight.start")}</Label>
          <Input id="sight-start" type="date" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sight-source">{t("plt17.sight.source")}</Label>
          <Input
            id="sight-source"
            type="url"
            dir="ltr"
            inputMode="url"
            placeholder="https://"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-invalid={error === "plt17.sight.sourceRequired" || undefined}
            required
          />
        </div>
        {error && (
          <p role="alert" className="text-label text-destructive">
            {t(error)}
          </p>
        )}
        <Button type="submit" disabled={save.isPending}>
          {t("plt17.sight.save")}
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        <h3 className="text-label font-bold text-muted-foreground">{t("plt17.sight.list")}</h3>
        {list.isSuccess && items.length === 0 && <p className="text-body text-muted-foreground">{t("plt17.sight.empty")}</p>}
        {list.isError && <p className="text-body text-destructive">{t("common.error")}</p>}
        <ul className="flex flex-col gap-2">
          {items.map((s) => (
            <li key={`${s.country}-${s.hijri_year}-${s.hijri_month}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card px-3 py-2">
              <span className="min-w-0">
                <span className="block font-bold">
                  {t(monthKey(s.hijri_month))} {num(s.hijri_year)} · {t(countryKey(s.country))}
                </span>
                <span className="block text-caption text-muted-foreground tabular-nums" dir="ltr">
                  {s.start}
                </span>
                <a href={s.source_url} target="_blank" rel="noreferrer noopener" className="block truncate text-caption text-primary underline" dir="ltr">
                  {s.source_url}
                </a>
              </span>
              <Button variant="outline" size="sm" onClick={() => setPending({ kind: "remove", item: s })}>
                {t("plt17.sight.remove")}
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(v) => !v && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(pending?.kind === "remove" ? "plt17.sight.removeTitle" : "plt17.sight.saveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t(pending?.kind === "remove" ? "plt17.sight.removeBody" : "plt17.sight.saveBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending?.kind === "save") save.mutate(pending.body)
                else if (pending?.kind === "remove") remove.mutate(pending.item)
              }}
            >
              {t(pending?.kind === "remove" ? "plt17.sight.remove" : "plt17.sight.confirmSave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
