/**
 * CMP-02 R6 / CMP-03 R5: the learners who chose you. Display name and the
 * day they chose you; «رحّب به» until your first message; engagement status
 * only while they share progress with you (MOT-07 R6, off by default).
 */
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SpotIllustration } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { type EngagementStatus, type Mentee, inboxApi, useMentees } from "../api"
import { dayMonth, initial } from "../format"
import { MenteeBadges } from "@/app/motivation/MenteeBadges"

const STATUS_VARIANT: Record<EngagementStatus, "success" | "info" | "warning" | "secondary"> = {
  active: "success",
  new: "info",
  returning: "info",
  at_risk: "warning",
  lapsed: "secondary",
}

function MenteeRow({ m }: { m: Mentee }) {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const open = async () => {
    try {
      const row = m.thread_id ? { id: m.thread_id } : await inboxApi.menteeThread(m.id)
      navigate(`/inbox/r/${row.id}`)
    } catch {
      toast.error(t("common.error"))
    }
  }
  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar size="lg">
        <AvatarFallback>{initial(m.display_name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-body font-bold">
          <bdi>{m.display_name}</bdi>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {m.needs_welcome && <Badge variant="info">{t("cmp.inbox.welcome")}</Badge>}
          {m.shares_progress ? (
            m.status ? (
              <Badge variant={STATUS_VARIANT[m.status]}>{t(`cmp.status.${m.status}`)}</Badge>
            ) : (
              <span className="text-caption text-muted-foreground">{t("cmp.inbox.noStatusYet")}</span>
            )
          ) : (
            <span className="text-caption text-muted-foreground">{t("cmp.inbox.notShared")}</span>
          )}
        </div>
        {/* MOT-03 R6 (mot-audit-gaps): badges only while progress is shared */}
        {m.shares_progress && <MenteeBadges learnerId={m.id} />}
        <p className="text-caption text-muted-foreground">{t("cmp.inbox.chosenOn", { date: dayMonth(m.chosen_at, locale) })}</p>
      </div>
      <Button size="sm" variant={m.needs_welcome ? "default" : "outline"} onClick={() => void open()}>
        {m.needs_welcome ? t("cmp.inbox.welcome") : t("cmp.inbox.messageThem")}
      </Button>
    </li>
  )
}

export function MenteesTab() {
  const { t } = useT()
  const mentees = useMentees()
  if (mentees.isLoading) return <Skeleton className="h-40 rounded-card" />
  const list = mentees.data ?? []
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-md bg-secondary px-4 py-3 text-label text-secondary-foreground">{t("cmp.inbox.tip")}</p>
      {list.length === 0 ? (
        <section className="flex flex-col items-center gap-3 py-8 text-center">
          <SpotIllustration kind="companion" size={96} />
          <p className="max-w-sm text-body text-muted-foreground">{t("cmp.inbox.noMentees")}</p>
        </section>
      ) : (
        <ul className="flex flex-col divide-y">
          {list.map((m) => (
            <MenteeRow key={m.id} m={m} />
          ))}
        </ul>
      )}
    </div>
  )
}
