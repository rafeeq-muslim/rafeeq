/**
 * CMP-04 R3: the team's review queue, high risk first, then oldest. Keep a
 * message hidden, show it again, or remove its author from the group.
 * Exported for the Team screen as well as the inbox's «البلاغات» tab.
 */
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SpotIllustration } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { type QueueItem, inboxApi, useReportQueue } from "../api"
import { ago } from "../format"

function ReportCard({ item }: { item: QueueItem }) {
  const { t, locale } = useT()
  const qc = useQueryClient()
  const act = async (action: "keep_hidden" | "restore" | "remove_member") => {
    try {
      await inboxApi.act(item.id, action)
      await qc.invalidateQueries({ queryKey: ["cmp", "reports"] })
    } catch {
      toast.error(t("common.error"))
    }
  }
  return (
    <article className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-1.5">
        {item.priority === "high" && <Badge variant="destructive">{t("cmp.reports.high")}</Badge>}
        <Badge variant="secondary">{t(`cmp.reason.${item.reason}`)}</Badge>
        {item.hidden && <Badge variant="warning">{t("cmp.reports.hiddenNow")}</Badge>}
        <span className="ms-auto text-caption text-muted-foreground tabular-nums">{ago(item.created_at, locale)}</span>
      </div>
      {item.body && (
        <blockquote dir="auto" className="border-s-4 border-border ps-3 text-body">
          {item.body}
        </blockquote>
      )}
      <p className="text-caption text-muted-foreground">
        {item.author_name && <bdi>{t("cmp.reports.by", { name: item.author_name })}</bdi>}
        {item.place && (
          <>
            {" · "}
            <bdi>{item.place === "help" ? t("cmp.reports.inHelp") : item.place}</bdi>
          </>
        )}
      </p>
      {item.note && (
        <p dir="auto" className="rounded-md bg-muted px-3 py-2 text-label">
          {item.note}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void act("keep_hidden")}>
          {t("cmp.reports.keep")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void act("restore")}>
          {t("cmp.reports.restore")}
        </Button>
        {item.target_type === "group_message" && (
          <Button size="sm" variant="destructive" onClick={() => void act("remove_member")}>
            {t("cmp.reports.remove")}
          </Button>
        )}
      </div>
    </article>
  )
}

export function ReportsQueue() {
  const { t } = useT()
  const isTeam = useAuth((s) => !!s.me?.roles.some((r) => r === "team" || r === "admin"))
  const queue = useReportQueue(isTeam)
  if (!isTeam) return null
  if (queue.isLoading) return <Skeleton className="h-40 rounded-card" />
  const items = queue.data ?? []
  if (items.length === 0)
    return (
      <section className="flex flex-col items-center gap-3 py-10 text-center">
        <SpotIllustration kind="saved" size={96} />
        <p className="text-body text-muted-foreground">{t("cmp.reports.empty")}</p>
      </section>
    )
  return (
    <ul className="flex flex-col gap-3">
      {items.map((i) => (
        <li key={i.id}>
          <ReportCard item={i} />
        </li>
      ))}
    </ul>
  )
}
