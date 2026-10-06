/**
 * KNW-05 review desk for the Sharia reviewer (team members read only, R5).
 * Queue by status and language; an item opens with its exact learner text in
 * one language (R6), each Quran citation beside the stored verse (R2), the
 * text learners currently see when it changed after approval (R3), and the
 * full decision history. Approving binds to the version read (hash); a
 * return needs a written reason (R4).
 */
import * as React from "react"
import { Route, Routes, useNavigate, useParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IconArrowLeft, IconCheck, IconCornerUpLeft, IconKey } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TopBar } from "@/components/rafeeq"
import { LOCALES, dirOf, num, useT, type Key, type Locale } from "@/app/i18n"
import { ApiError, api } from "@/app/lib/api"
import { useAuth } from "@/app/stores/auth"
import { VerseBlock } from "@/app/lesson/VerseBlock"
import type { QuranRef } from "@/app/learning/types"

type Status = "in_review" | "returned" | "approved"
type Row = { item_type: string; item_id: string; group: string; title: Record<string, string>; langs: Record<string, { status: Status; live: boolean; note: string | null }> }
type Queue = { items: Row[]; counts: Record<Status, number> }
type Detail = {
  item_type: string
  item_id: string
  langs: Record<string, { status: Status; hash: string; current: View; live: View | null }>
  history: { lang: string; decision: "approved" | "returned"; note: string | null; reviewer: string | null; at: string; hash: string }[]
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type View = any

const STATUS_STYLE: Record<Status, string> = {
  in_review: "bg-warning-surface text-warning",
  returned: "bg-danger-surface text-destructive",
  approved: "bg-success-surface text-success",
}

export default function ReviewDesk() {
  return (
    <Routes>
      <Route index element={<QueueView />} />
      <Route path=":type/:id" element={<ItemView />} />
    </Routes>
  )
}

function useQueue() {
  return useQuery({ queryKey: ["review-queue"], queryFn: () => api<Queue>("/api/review/queue"), staleTime: 15_000 })
}

function QueueView() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const q = useQueue()
  const [lang, setLang] = React.useState<Locale>(locale)
  const [status, setStatus] = React.useState<Status>("in_review")

  const rows = (q.data?.items ?? []).filter((r) => r.langs[lang]?.status === status)
  const count = (s: Status) => (q.data?.items ?? []).filter((r) => r.langs[lang]?.status === s).length

  return (
    <>
      <TopBar className="sticky top-0" title={<span className="font-heading text-h3">{t("desk.title")}</span>} />
      <div className="flex flex-col gap-5 px-4 pt-4 pb-12">
        <ToggleGroup type="single" variant="outline" value={lang} onValueChange={(v) => v && setLang(v as Locale)} className="w-full">
          {LOCALES.map((l) => (
            <ToggleGroupItem key={l.code} value={l.code} lang={l.code} className="flex-1">
              {l.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div role="tablist" className="grid grid-cols-3 gap-2">
          {(["in_review", "returned", "approved"] as Status[]).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-card border-2 p-3 text-start",
                status === s ? "border-primary bg-secondary" : "border-border bg-card",
              )}
            >
              <span className="font-heading text-h2 font-bold tabular-nums">{num(count(s))}</span>
              <span className="text-caption text-muted-foreground">{t(`desk.${s}` as Key)}</span>
            </button>
          ))}
        </div>

        {q.isLoading && <Skeleton className="h-64 rounded-card" />}
        {q.data && rows.length === 0 && <p className="py-8 text-center text-body text-muted-foreground">{t("desk.empty")}</p>}

        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={`${r.item_type}:${r.item_id}`}>
              <button
                type="button"
                onClick={() => navigate(`${r.item_type}/${r.item_id}?lang=${lang}`)}
                className="tactile flex w-full items-center gap-3 rounded-card border-2 bg-card p-4 text-start [--lip:var(--outline-lip)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-caption text-muted-foreground" dir="ltr">
                    {t(`desk.type.${r.item_type}` as Key)} · {r.item_id}
                  </span>
                  <span lang={lang} dir={dirOf(lang)} className="block truncate text-body font-bold">
                    {r.title[lang] || r.title.ar}
                  </span>
                  {r.langs[lang]?.note && <span className="block text-label text-destructive">{r.langs[lang].note}</span>}
                </span>
                <span className="flex gap-1" aria-hidden="true">
                  {LOCALES.map((l) => (
                    <span key={l.code} className={cn("rounded-full px-1.5 text-caption font-bold uppercase", r.langs[l.code] ? STATUS_STYLE[r.langs[l.code].status] : "bg-muted text-muted-foreground")}>
                      {l.code}
                    </span>
                  ))}
                </span>
                <IconArrowLeft className="size-5 text-muted-foreground ltr:rotate-180" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function ItemView() {
  const { type = "", id = "" } = useParams()
  const { t, locale } = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const reviewer = useAuth((s) => !!s.me?.roles.includes("sharia_reviewer"))
  const initial = (new URLSearchParams(location.search).get("lang") as Locale) || locale
  const [lang, setLang] = React.useState<Locale>(initial)
  const [returning, setReturning] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [showLive, setShowLive] = React.useState(false)
  const detail = useQuery({ queryKey: ["review-item", type, id], queryFn: () => api<Detail>(`/api/review/items/${type}/${id}`) })
  const queue = useQueue()

  const nextItem = () => {
    const rows = (queue.data?.items ?? []).filter((r) => r.langs[lang]?.status === "in_review" && !(r.item_type === type && r.item_id === id))
    return rows[0]
  }

  const decide = useMutation({
    mutationFn: (decision: "approved" | "returned") =>
      api(`/api/review/items/${type}/${id}/${lang}`, { method: "POST", body: { decision, hash: detail.data!.langs[lang].hash, note: note || null } }),
    onSuccess: async (_, decision) => {
      toast.success(t(decision === "approved" ? "desk.approvedToast" : "desk.returnedToast"))
      setReturning(false)
      setNote("")
      await Promise.all([qc.invalidateQueries({ queryKey: ["review-item", type, id] }), qc.invalidateQueries({ queryKey: ["review-queue"] }), qc.invalidateQueries({ queryKey: ["content"] })])
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        toast.error(t("desk.changed"))
        void qc.invalidateQueries({ queryKey: ["review-item", type, id] })
      } else toast.error(t("common.error"))
    },
  })

  const l = detail.data?.langs[lang]
  const next = nextItem()

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        className="sticky top-0"
        start={
          <Button variant="ghost" size="sm" onClick={() => navigate("/review-desk")}>
            {t("common.back")}
          </Button>
        }
        title={<span dir="ltr">{id}</span>}
        end={l && <span className={cn("rounded-full px-2.5 py-1 text-caption font-bold", STATUS_STYLE[l.status])}>{t(`desk.${l.status}` as Key)}</span>}
      />
      <div className="flex flex-1 flex-col gap-5 px-4 pt-4 pb-48">
        <ToggleGroup type="single" variant="outline" value={lang} onValueChange={(v) => v && setLang(v as Locale)} className="w-full">
          {LOCALES.map((x) => (
            <ToggleGroupItem key={x.code} value={x.code} lang={x.code} disabled={!detail.data?.langs[x.code]} className="flex-1">
              {x.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {detail.isLoading && <Skeleton className="h-96 rounded-card" />}
        {l?.live && (
          <section className="flex flex-col gap-2 rounded-card bg-warning-surface p-4 text-warning">
            <p className="text-label">{t("desk.liveHint")}</p>
            <Button variant="outline" size="sm" className="w-fit" onClick={() => setShowLive(!showLive)}>
              {t("desk.live")}
            </Button>
            {showLive && (
              <div className="rounded-md bg-card p-3 text-foreground">
                <Render type={type} view={l.live} lang={lang} />
              </div>
            )}
          </section>
        )}
        {l && (
          <article lang={lang} dir={dirOf(lang)}>
            <Render type={type} view={l.current} lang={lang} />
          </article>
        )}

        {detail.data && detail.data.history.length > 0 && (
          <section className="flex flex-col gap-2 border-t pt-5" aria-labelledby="hist">
            <h2 id="hist" className="text-label font-bold text-muted-foreground">
              {t("desk.history")}
            </h2>
            <ul className="flex flex-col gap-2">
              {detail.data.history.map((h, i) => (
                <li key={i} className="flex flex-col rounded-md bg-muted px-3 py-2 text-label">
                  <span>
                    <b className={h.decision === "approved" ? "text-success" : "text-destructive"}>{t(`desk.${h.decision}` as Key)}</b> · {h.lang} ·{" "}
                    <bdi>{h.reviewer ?? "—"}</bdi> · <span dir="ltr">{new Date(h.at).toLocaleString("en-GB")}</span>
                  </span>
                  {h.note && <span className="text-muted-foreground">{h.note}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] backdrop-blur">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          {!reviewer ? (
            <p className="text-label text-muted-foreground">{t("desk.readOnly")}</p>
          ) : returning ? (
            <>
              <Textarea dir="auto" placeholder={t("desk.reason")} aria-label={t("desk.reason")} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-24" />
              <div className="flex gap-2">
                <Button className="flex-1" variant="destructive" disabled={!note.trim() || decide.isPending} onClick={() => decide.mutate("returned")}>
                  {t("desk.sendReturn")}
                </Button>
                <Button variant="ghost" onClick={() => setReturning(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Button size="lg" className="flex-1" disabled={!l || l.status === "approved" || decide.isPending} onClick={() => decide.mutate("approved")}>
                <IconCheck data-icon="inline-start" />
                {t("desk.approve")}
              </Button>
              <Button size="lg" variant="outline" disabled={!l || decide.isPending} onClick={() => setReturning(true)}>
                <IconCornerUpLeft data-icon="inline-start" />
                {t("desk.return")}
              </Button>
            </div>
          )}
          {reviewer && l?.status === "approved" && next && (
            <Button variant="ghost" onClick={() => navigate(`/review-desk/${next.item_type}/${next.item_id}?lang=${lang}`)}>
              {t("desk.next")}
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}

/** The exact learner text of one item in one language. */
function Render({ type, view, lang }: { type: string; view: View; lang: Locale }) {
  const { t } = useT()
  if (type === "unit") {
    return (
      <dl className="flex flex-col gap-4">
        <h1 className="font-heading text-h1 font-bold">{view.title}</h1>
        <div>
          <dt className="text-label text-muted-foreground">{t("desk.badge")}</dt>
          <dd className="text-body">{view.badge_name}</dd>
        </div>
        <div>
          <dt className="text-label text-muted-foreground">{t("desk.credit")}</dt>
          <dd className="text-body">{view.source_credit}</dd>
        </div>
      </dl>
    )
  }
  if (type === "lesson") {
    const cardNo = (cid: string) => view.cards.findIndex((c: View) => c.id === cid) + 1
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-h1 font-bold text-balance">{view.title}</h1>
        {view.media?.video && (
          <section className="flex flex-col gap-2">
            <h2 className="text-label font-bold text-muted-foreground">{t("lesson.video")}</h2>
            {/* rules.md: the reviewer watches support videos in full before approving */}
            <video controls playsInline preload="none" src={view.media.video} className="w-full rounded-card bg-black" />
          </section>
        )}
        <section className="flex flex-col gap-3">
          <h2 className="text-label font-bold text-muted-foreground">{t("desk.cards")}</h2>
          {view.cards.map((c: View, i: number) => (
            <div key={c.id} className="flex flex-col gap-3 rounded-card border-2 bg-card p-4">
              <span className="text-caption text-muted-foreground tabular-nums" dir="ltr">
                #{i + 1} · {c.id} · {c.kind}
              </span>
              {c.image_url && <img src={c.image_url} alt="" className="max-h-56 w-full rounded-md object-contain" />}
              {c.text && <p className="font-reading text-reading whitespace-pre-line">{c.text}</p>}
              {c.quran && <VerseBlock quran={c.quran as QuranRef} lang={lang} />}
              {Array.isArray(c.audio) &&
                c.audio.map((src: string) => <audio key={src} controls preload="none" src={src} className="w-full" />)}
            </div>
          ))}
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-label font-bold text-muted-foreground">{t("desk.objectives")}</h2>
          <ul className="flex flex-col gap-2">
            {view.objectives.map((o: View) => (
              <li key={o.id} className="flex items-start gap-2 text-body">
                {o.key ? <IconKey className="mt-1.5 size-4 shrink-0 text-primary" aria-label={t("desk.key")} /> : <span className="size-4 shrink-0" />}
                <span>
                  {o.label && <span className="block font-bold">{o.label}</span>}
                  {o.text} <span className="text-caption text-muted-foreground tabular-nums">({o.cards.map(cardNo).map((n: number) => `#${n}`).join(" ")})</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-label font-bold text-muted-foreground">{t("desk.exercises")}</h2>
          {view.exercises.map((e: View) => (
            <div key={e.id} className="flex flex-col gap-2 rounded-card border-2 bg-card p-4">
              <span className="text-caption text-muted-foreground" dir="ltr">
                {e.id} · {e.type} · {e.cards.map(cardNo).map((n: number) => `#${n}`).join(" ")}
              </span>
              <p className="text-body font-bold">{e.prompt}</p>
              {e.type === "choose" && (
                <ul className="flex flex-col gap-1">
                  {e.options.map((o: View) => (
                    <li key={o.id} className={cn("rounded-md px-3 py-1.5 text-body", o.id === e.answer ? "bg-success-surface font-bold text-success" : "bg-muted")}>
                      {o.text}
                    </li>
                  ))}
                </ul>
              )}
              {e.type === "order" && (
                <ol className="flex flex-col gap-1">
                  {e.answer.map((id: string, i: number) => (
                    <li key={id} className="rounded-md bg-success-surface px-3 py-1.5 text-body text-success">
                      {i + 1}. {e.items.find((x: View) => x.id === id)?.text}
                    </li>
                  ))}
                </ol>
              )}
              {e.type === "match" && (
                <ul className="flex flex-col gap-1">
                  {e.answer.map(([a, b]: [string, string]) => (
                    <li key={a} className="grid grid-cols-2 gap-2 rounded-md bg-success-surface px-3 py-1.5 text-body text-success">
                      <span className="font-bold">{e.left.find((x: View) => x.id === a)?.text}</span>
                      <span>{e.right.find((x: View) => x.id === b)?.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      </div>
    )
  }
  return <Generic view={view} />
}

/** Any other reviewable item type (adhkar, daily cards, library items...). */
function Generic({ view }: { view: View }) {
  if (view == null) return null
  if (typeof view !== "object") return <p className="font-reading text-reading whitespace-pre-line">{String(view)}</p>
  if (Array.isArray(view))
    return (
      <div className="flex flex-col gap-2">
        {view.map((v, i) => (
          <Generic key={i} view={v} />
        ))}
      </div>
    )
  return (
    <dl className="flex flex-col gap-3 rounded-card border-2 bg-card p-4">
      {Object.entries(view).map(([k, v]) => (
        <div key={k}>
          <dt className="text-caption text-muted-foreground" dir="ltr">
            {k}
          </dt>
          <dd>
            <Generic view={v} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
