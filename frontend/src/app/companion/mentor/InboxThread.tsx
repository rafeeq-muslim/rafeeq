/**
 * CMP-02 a request from the mentor's side — /inbox/r/:id. The first reply
 * claims it (R3). The mentor gives no fatwa: he refers a learner's personal
 * Sharia question to the Sharia reviewer, or hands danger to everyone as
 * urgent (R5). Shows only display name or guest number, language, topic and
 * source (R6).
 */
import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { IconDots } from "@tabler/icons-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { type InboxRow, REFERRAL_NOTICE, inboxApi, useInboxThread } from "../api"
import { type ChatItem, ChatList, Composer } from "../Chat"
import { Confirm } from "../Confirm"
import { langName } from "../format"
import { ScreenBar } from "../Screen"

/** CMP-02 R6: a guest is «زائر» / «زائرة» and a short number; a sister's request reaches sisters only (CMP-01 R3). */
export function requesterName(t: ReturnType<typeof useT>["t"], row: Pick<InboxRow, "is_guest" | "handle" | "kind">, myGender: string | null) {
  if (!row.is_guest) return row.handle
  return t(row.kind !== "urgent" && myGender === "f" ? "cmp.inbox.guestF" : "cmp.inbox.guest", { n: row.handle })
}

export default function InboxThread() {
  const { id } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const thread = useInboxThread(id)
  const [confirmUrgent, setConfirmUrgent] = React.useState(false)
  const [referring, setReferring] = React.useState<string | null>(null)
  const myGender = useAuth((s) => s.me?.gender ?? null)
  const r = thread.data

  const refresh = () => qc.invalidateQueries({ queryKey: ["cmp"] })
  const close = async () => {
    try {
      await inboxApi.close(id!)
      await refresh()
      navigate("/inbox")
    } catch {
      toast.error(t("common.error"))
    }
  }
  const urgent = async () => {
    try {
      await inboxApi.urgent(id!)
      await refresh()
    } catch {
      toast.error(t("common.error"))
    }
  }

  const refer = async (messageId: string) => {
    try {
      await inboxApi.refer(id!, messageId)
      toast.success(t("cmp.referral.sent"))
      await refresh()
    } catch {
      toast.error(t("common.error"))
    }
  }

  const name = r ? requesterName(t, r, myGender) : ""
  const items: ChatItem[] = (r?.messages ?? []).map((m) => ({
    id: m.id,
    mine: m.mine,
    name: m.author === "learner" ? name : m.author === "scholar" ? t("cmp.referral.scholars") : m.name,
    body: m.author === "system" && m.body === REFERRAL_NOTICE ? t("cmp.referral.noticeMentor") : m.body,
    at: m.created_at,
    // R5: a learner's personal Sharia question goes to scholars, once.
    actions:
      m.author === "learner" && r?.can_reply && !r.referred.includes(m.id)
        ? [{ label: t("cmp.referral.action"), onSelect: () => setReferring(m.id) }]
        : undefined,
  }))

  return (
    <>
      <ScreenBar
        title={<bdi>{name || t("cmp.inbox.title")}</bdi>}
        back="/inbox"
        end={
          r?.can_reply && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("cmp.thread.more")}>
                  <IconDots stroke={1.75} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {r.kind !== "urgent" && (
                  <DropdownMenuItem variant="destructive" className="min-h-11 text-label" onSelect={() => setConfirmUrgent(true)}>
                    {t("cmp.inbox.urgent")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="min-h-11 text-label" onSelect={() => void close()}>
                  {t("cmp.inbox.close")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />
      <div className="flex min-h-[calc(100dvh-9rem)] flex-col gap-4 px-4 pt-4">
        {thread.isLoading ? (
          <Skeleton className="h-40 rounded-card" />
        ) : thread.isError || !r ? (
          <p className="text-body text-muted-foreground">{t("common.error")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {r.kind === "urgent" && <Badge variant="destructive">{t("cmp.urgent.badge")}</Badge>}
              <Badge variant="secondary" lang={r.lang}>
                {langName(r.lang)}
              </Badge>
              {r.topic && <Badge variant="outline">{t(`cmp.topic.${r.topic}`)}</Badge>}
              {r.source && <span className="text-caption text-muted-foreground">{t(`cmp.from.${r.source}`)}</span>}
            </div>
            {!r.can_reply && (
              <Alert variant="destructive">
                <AlertDescription>{t("cmp.inbox.alertBody")}</AlertDescription>
              </Alert>
            )}
            <ChatList items={items} className="flex-1" />
            {r.can_reply ? (
              <Composer
                placeholder={t("human.reply")}
                onSend={async (text) => {
                  await inboxApi.reply(id!, text)
                  await refresh()
                }}
              />
            ) : (
              <p className="text-center text-label text-muted-foreground">{t("cmp.inbox.cantReply")}</p>
            )}
          </>
        )}
      </div>
      <Confirm
        open={referring !== null}
        onOpenChange={(o) => !o && setReferring(null)}
        title={t("cmp.referral.action")}
        description={t("cmp.referral.confirm")}
        confirmLabel={t("cmp.referral.confirmYes")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => referring && void refer(referring)}
      />
      <Confirm
        open={confirmUrgent}
        onOpenChange={setConfirmUrgent}
        title={t("cmp.inbox.urgent")}
        description={t("cmp.inbox.urgentHint")}
        confirmLabel={t("cmp.inbox.urgent")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => void urgent()}
      />
    </>
  )
}
