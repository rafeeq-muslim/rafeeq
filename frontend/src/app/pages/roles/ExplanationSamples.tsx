/**
 * LRN-03 R6 in the review desk: the Sharia reviewer reads samples of the
 * «لماذا؟» explanations Rafeeq showed (stored with the exercise and language
 * only, no identity) and can block the explanation for one exercise in one
 * language; learners then see the card text alone. Reviewer only (the
 * server refuses team members too).
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IconBan, IconCircleCheck } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TopBar } from "@/components/rafeeq"
import { LOCALES, dirOf, useT, type Locale } from "@/app/i18n"
import { api } from "@/app/lib/api"

type Info = { lesson_id?: string; lesson_title?: string; prompt?: string }
export type Sample = Info & { id: string; at: string; exercise_id: string; lang: Locale; text: string; blocked: boolean }
export type Block = Info & { exercise_id: string; lang: Locale; at: string }
export type Samples = { items: Sample[]; blocks: Block[] }

export function ExplanationSamples() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [lang, setLang] = React.useState<Locale>(locale)
  const q = useQuery({
    queryKey: ["explanation-samples", lang],
    queryFn: () => api<Samples>(`/api/learning/explanations?lang=${lang}&limit=50`),
  })

  const toggle = useMutation({
    mutationFn: ({ exercise_id, block }: { exercise_id: string; block: boolean }) =>
      api(`/api/learning/explanations/blocks/${encodeURIComponent(exercise_id)}/${lang}`, { method: block ? "PUT" : "DELETE" }),
    onSuccess: async (_, { block }) => {
      toast.success(t(block ? "desk.explain.blockedToast" : "desk.explain.unblockedToast"))
      await qc.invalidateQueries({ queryKey: ["explanation-samples"] })
    },
    onError: () => toast.error(t("common.error")),
  })

  const blocks = (q.data?.blocks ?? []).filter((b) => b.lang === lang)

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        className="sticky top-0"
        start={
          <Button variant="ghost" size="sm" onClick={() => navigate("/review-desk")}>
            {t("common.back")}
          </Button>
        }
        title={<span className="font-heading text-h3">{t("desk.explain.title")}</span>}
      />
      <div className="flex flex-col gap-5 px-4 pt-4 pb-12">
        <p className="text-label text-muted-foreground">{t("desk.explain.hint")}</p>
        <ToggleGroup type="single" variant="outline" value={lang} onValueChange={(v) => v && setLang(v as Locale)} className="w-full">
          {LOCALES.map((l) => (
            <ToggleGroupItem key={l.code} value={l.code} lang={l.code} className="flex-1">
              {l.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {q.isLoading && <Skeleton className="h-64 rounded-card" />}
        {q.isError && <p className="py-8 text-center text-body text-muted-foreground">{t("common.error")}</p>}

        {blocks.length > 0 && (
          <section aria-labelledby="blocked" className="flex flex-col gap-2">
            <h2 id="blocked" className="text-label font-bold text-muted-foreground">
              {t("desk.explain.blockedList")}
            </h2>
            <ul className="flex flex-col gap-2">
              {blocks.map((b) => (
                <li key={b.exercise_id} className="flex items-center gap-3 rounded-card border-2 bg-card p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-caption text-muted-foreground" dir="ltr">
                      {b.exercise_id}
                    </span>
                    <span lang={lang} dir={dirOf(lang)} className="block text-body">
                      {b.prompt}
                    </span>
                  </span>
                  <Button variant="outline" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate({ exercise_id: b.exercise_id, block: false })}>
                    <IconCircleCheck data-icon="inline-start" />
                    {t("desk.explain.unblock")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {q.data && q.data.items.length === 0 && <p className="py-8 text-center text-body text-muted-foreground">{t("desk.explain.empty")}</p>}

        <ul className="flex flex-col gap-3">
          {q.data?.items.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 rounded-card border-2 bg-card p-4">
              <span className="text-caption text-muted-foreground" dir="ltr">
                {s.exercise_id} · {new Date(s.at).toLocaleString("en-GB")}
              </span>
              {s.prompt && (
                <p lang={s.lang} dir={dirOf(s.lang)} className="text-label font-bold">
                  {t("desk.explain.exercise")}: {s.prompt}
                </p>
              )}
              <p lang={s.lang} dir={dirOf(s.lang)} className="font-reading text-reading whitespace-pre-line">
                {s.text}
              </p>
              {s.blocked ? (
                <span className="w-fit rounded-full bg-danger-surface px-2.5 py-1 text-caption font-bold text-destructive">{t("desk.explain.blocked")}</span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ exercise_id: s.exercise_id, block: true })}
                >
                  <IconBan data-icon="inline-start" />
                  {t("desk.explain.block")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
