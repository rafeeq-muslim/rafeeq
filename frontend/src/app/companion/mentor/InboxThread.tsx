/**
 * CMP-02 a request from the mentor's side — /inbox/r/:id. The first reply
 * claims it (R3). The mentor gives no fatwa: he refers a learner's personal
 * Sharia question to the Sharia reviewer, or hands danger to everyone as
 * urgent (R5). Shows only display name or guest number, language, topic and
 * source (R6). The learner's messages can be reported too (CMP-04 R1).
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
import { type InboxMessage, type InboxRow, REFERRAL_NOTICE, earlierOfInboxThread, inboxApi, useInboxThread } from "../api"
import { type ChatAction, type ChatItem, ChatList, Composer } from "../Chat"
import { useEarlier } from "../earlier"
import { Confirm } from "../Confirm"
import { langName } from "../format"
import { ReportSheet, type ReportTarget } from "../ReportSheet"
import { ScreenBar } from "../Screen"

/** CMP-02 R6: a guest is «زائر» / «زائرة» and a short number; a sister's request reaches sisters only (CMP-01 R3). */
export function requesterName(t: ReturnType<typeof useT>["t"], row: Pick<InboxRow, "is_guest" | "handle" | "kind">, myGender: string | null) {
  if (!row.is_guest) return row.handle
  return t(row.kind !== "urgent" && myGender === "f" ? "cmp.inbox.guestF" : "cmp.inbox.guest", { n: row.handle })
}

/**
 * One message as the responder sees it. A learner's message can be referred
 * to scholars once (CMP-02 R5) and reported with the same reasons and queue
 * as any other (CMP-04 R1); the responder's own hidden message stays, marked
 * for review (CMP-04 R5).
 */
export function inboxChatItem(
  m: InboxMessage,
  t: ReturnType<typeof useT>["t"],
  o: { name: string; canRefer: boolean; onRefer: () => void; onReport: () => void },
): ChatItem {
  const actions: ChatAction[] = []
  if (m.author === "learner") {
    if (o.canRefer) actions.push({ label: t("cmp.referral.action"), onSelect: o.onRefer })
    actions.push({ label: t("cmp.thread.report"), onSelect: o.onReport, destructive: true })
  }
  return {
    id: m.id,
    mine: m.mine,
    name: m.author === "learner" ? o.name : m.author === "scholar" ? t("cmp.referral.scholars") : m.name,
    body: m.author === "system" && m.body === REFERRAL_NOTICE ? t("cmp.referral.noticeMentor") : m.body,
    at: m.created_at,
    hidden: m.hidden,
    actions: actions.length > 0 ? actions : undefined,
  }
}

export default function InboxThread() {
  const { id } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const thread = useInboxThread(id)
  const [confirmUrgent, setConfirmUrgent] = React.useState(false)
  const [confirmClose, setConfirmClose] = React.useState(false) // PLT-17 R4
  const [referring, setReferring] = React.useState<string | null>(null)
  const [report, setReport] = React.useState<ReportTarget | null>(null)
  const myGender = useAuth((s) => s.me?.gender ?? null)
  const r = thread.data
  // A-M4: the last 200 messages come first; earlier ones on demand.
  const fetchEarlier = React.useCallback((before: string) => earlierOfInboxThread(id ?? "", before), [id])
  const history = useEarlier(id, r?.messages, r?.has_earlier, fetchEarlier)

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
  const items: ChatItem[] = history.messages.map((m) =>
    inboxChatItem(m, t, {
      name,
      // R5: a learner's personal Sharia question goes to scholars, once.
      canRefer: !!r?.can_reply && !r.referred.includes(m.id),
      onRefer: () => setReferring(m.id),
      onReport: () => setReport({ type: "help_message", id: m.id }),
    }),
  )

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
                {r.can_close !== false && (
                  <DropdownMenuItem className="min-h-11 text-label" onSelect={() => setConfirmClose(true)}>
                    {t("cmp.inbox.close")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />
      <div className="flex min-h-[calc(100dvh-9rem)] @min-[52.5rem]/shell:min-h-[calc(100dvh-6.25rem)] flex-col gap-4 px-4 pt-4">
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
            {history.hasEarlier && (
              <Button variant="ghost" size="sm" className="self-center" disabled={history.loading} onClick={() => void history.loadEarlier()}>
                {t("cmp.thread.earlier")}
              </Button>
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
      <ReportSheet
        target={report}
        onClose={() => {
          setReport(null)
          history.reset() // CMP-04 R2: a reported message is never shown from the pages loaded earlier
        }}
      />
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
        description={t("sec.inbox.urgentHint")}
        confirmLabel={t("cmp.inbox.urgent")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => void urgent()}
      />
      <Confirm
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={t("cmp.inbox.closeConfirmTitle")}
        description={t("cmp.inbox.closeConfirmBody")}
        confirmLabel={t("cmp.inbox.close")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void close()}
      />
    </>
  )
}
