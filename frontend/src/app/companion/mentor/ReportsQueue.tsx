/**
 * CMP-04 R3–R4: the team's review queue: «خطر على أحد» first, then the
 * dangerous reasons, then the oldest. Keep a message hidden, show it again,
 * or remove its author from the group.
 * «السجل» adds reviewed reports and the messages a group's mentor hid at once
 * (R4 ex3): the team sees that record and can undo the hide.
 * Exported for the Team screen as well as the inbox's «البلاغات» tab.
 */
import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SpotIllustration } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { type QueueItem, inboxApi, useReportQueue } from "../api"
import { ago } from "../format"

function ReportCard({ item }: { item: QueueItem }) {
  const { t, locale } = useT()
  const qc = useQueryClient()
  const open = item.status === "open"
  const act = async (action: "keep_hidden" | "restore" | "remove_member") => {
    try {
      await inboxApi.act(item.id, action)
      await qc.invalidateQueries({ queryKey: ["cmp", "reports"] })
    } catch {
      toast.error(t("common.error"))
    }
  }
  return (
    <article className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card" data-status={item.status}>
      <div className="flex flex-wrap items-center gap-1.5">
        {item.priority === "danger" && <Badge variant="destructive">{t("cmp.reports.danger")}</Badge>}
        {item.priority === "high" && <Badge variant="destructive">{t("cmp.reports.high")}</Badge>}
        <Badge variant="secondary">{t(`cmp.reason.${item.reason}`)}</Badge>
        {item.hidden ? (
          <Badge variant="warning">{t("cmp.reports.hiddenNow")}</Badge>
        ) : (
          !open && <Badge variant="success">{t("cmp.gaps.reports.restored")}</Badge>
        )}
        {!open && <Badge variant="outline">{t("cmp.gaps.reports.reviewed")}</Badge>}
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
      {open ? (
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
      ) : (
        item.hidden && (
          <Button size="sm" variant="outline" className="w-fit" onClick={() => void act("restore")}>
            {t("cmp.gaps.reports.undo")}
          </Button>
        )
      )}
    </article>
  )
}

export function ReportsQueue() {
  const { t } = useT()
  const isTeam = useAuth((s) => !!s.me?.roles.some((r) => r === "team" || r === "admin"))
  const [view, setView] = React.useState<"open" | "history">("open")
  const queue = useReportQueue(isTeam, view === "history")
  if (!isTeam) return null
  const items = queue.data ?? []
  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup type="single" variant="outline" value={view} onValueChange={(v) => v && setView(v as typeof view)} className="w-full">
        <ToggleGroupItem value="open" className="flex-1">
          {t("cmp.gaps.reports.open")}
        </ToggleGroupItem>
        <ToggleGroupItem value="history" className="flex-1">
          {t("cmp.gaps.reports.history")}
        </ToggleGroupItem>
      </ToggleGroup>
      {queue.isLoading ? (
        <Skeleton className="h-40 rounded-card" />
      ) : items.length === 0 ? (
        <section className="flex flex-col items-center gap-3 py-10 text-center">
          <SpotIllustration kind="saved" size={96} />
          <p className="text-body text-muted-foreground">{t(view === "open" ? "cmp.reports.empty" : "cmp.gaps.reports.historyEmpty")}</p>
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.id}>
              <ReportCard item={i} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
