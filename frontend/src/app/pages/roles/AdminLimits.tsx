/**
 * plt-admin-limits (owner decision 2026-10-10): «الحدود», the abuse and traffic
 * limits of the 2026-10-07 security work, edited by the admin. Each row shows
 * the limit in plain words, its current value, its default and the allowed
 * range; «احفظ» sets it, «القيمة الافتراضية» returns it to the default.
 * The server checks the bounds again and audits every change.
 */
import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { num, useT, type Key } from "@/app/i18n"
import { api, ApiError } from "@/app/lib/api"

export type Limit = { key: string; group: string; kind: "int" | "usd" | "minutes"; min: number; max: number; default: number; value: number }

const GROUPS = ["ai", "budget", "urgent", "reports", "orgs"] as const

/** The value to send, or null when the text is not a value the limit accepts. */
export function parseLimit(l: Limit, text: string): number | null {
  const s = text.trim()
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const v = Number(s)
  if (l.kind !== "usd" && !Number.isInteger(v)) return null
  return v >= l.min && v <= l.max ? v : null
}

export const shown = (l: Limit, v: number) => (l.kind === "usd" ? `$${v.toFixed(2)}` : num(v))

export function AdminLimits() {
  const { t } = useT()
  const list = useQuery({ queryKey: ["admin-limits"], queryFn: () => api<Limit[]>("/api/admin/limits") })
  return (
    <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="plt-limits">
      <h2 id="plt-limits" className="font-heading text-h3 font-bold">
        {t("plt.limits.title")}
      </h2>
      <p className="text-label text-muted-foreground">{t("plt.limits.hint")}</p>
      {list.isError && <p className="text-label text-destructive">{t("plt.limits.loadFailed")}</p>}
      {GROUPS.map((g) => {
        const rows = list.data?.filter((l) => l.group === g) ?? []
        if (!rows.length) return null
        return (
          <div key={g} className="flex flex-col gap-3">
            <h3 className="text-body font-bold">{t(`plt.limits.group.${g}` as Key)}</h3>
            {g === "ai" && <p className="text-caption text-muted-foreground">{t("plt.limits.aiNote")}</p>}
            {g === "budget" && <p className="text-caption text-muted-foreground">{t("plt.limits.budgetNote")}</p>}
            <ul className="flex flex-col gap-3 @min-[52.5rem]/shell:grid @min-[52.5rem]/shell:grid-cols-2 @min-[52.5rem]/shell:items-start">
              {rows.map((l) => (
                <LimitRow key={l.key} limit={l} />
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

function LimitRow({ limit }: { limit: Limit }) {
  const { t } = useT()
  const qc = useQueryClient()
  const [text, setText] = React.useState(String(limit.value))
  React.useEffect(() => setText(String(limit.value)), [limit.value])
  const parsed = parseLimit(limit, text)
  const onDone = (r: Limit) => {
    qc.setQueryData<Limit[]>(["admin-limits"], (old) => old?.map((x) => (x.key === r.key ? r : x)))
    toast.success(t("plt.limits.saved"))
  }
  const onFail = (e: unknown) =>
    toast.error(e instanceof ApiError && e.status === 422 ? t("plt.limits.range", { min: shown(limit, limit.min), max: shown(limit, limit.max) }) : t("common.error"))
  const save = useMutation({
    mutationFn: (value: number) => api<Limit>(`/api/admin/limits/${limit.key}`, { method: "PUT", body: { value } }),
    onSuccess: onDone,
    onError: onFail,
  })
  const reset = useMutation({
    mutationFn: () => api<Limit>(`/api/admin/limits/${limit.key}`, { method: "DELETE" }),
    onSuccess: onDone,
    onError: onFail,
  })
  const id = `limit-${limit.key}`
  const busy = save.isPending || reset.isPending
  const invalid = text.trim() !== "" && parsed === null
  return (
    <li className="rounded-card border-2 bg-card p-4" data-limit={limit.key}>
      <Field data-invalid={invalid || undefined}>
        <FieldLabel htmlFor={id} className="text-label font-bold">
          {t(`plt.limits.k.${limit.key}` as Key)}
        </FieldLabel>
        <FieldDescription className="text-caption">
          {t("plt.limits.current", { value: shown(limit, limit.value) })} · {t("plt.limits.default", { value: shown(limit, limit.default) })}
        </FieldDescription>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={id}
            dir="ltr"
            inputMode={limit.kind === "usd" ? "decimal" : "numeric"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={`${id}-range`}
            className="w-32 tabular-nums"
          />
          <Button variant="secondary" disabled={busy || parsed === null || parsed === limit.value} onClick={() => parsed !== null && save.mutate(parsed)}>
            {t("plt.limits.save")}
          </Button>
          <Button variant="ghost" disabled={busy || limit.value === limit.default} onClick={() => reset.mutate()}>
            {t("plt.limits.reset")}
          </Button>
        </div>
        <p id={`${id}-range`} className={invalid ? "text-caption text-destructive" : "text-caption text-muted-foreground"}>
          {t("plt.limits.range", { min: shown(limit, limit.min), max: shown(limit, limit.max) })}
        </p>
      </Field>
    </li>
  )
}
