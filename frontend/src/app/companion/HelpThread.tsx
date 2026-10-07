/**
 * A learner's conversation with a human (CMP-01, CMP-03 R6). Polls every
 * 10 s while open. An urgent conversation always starts with what to do if
 * in danger now and the verified helplines (companion README). While nobody
 * of the learner's gender is free, it says a brother or sister will reply
 * when available (CMP-01 R3 ex3). With one's mentor, his availability shows
 * before writing (CMP-02 R4 ex1). A question referred to scholars says so,
 * and their answer is signed «أهل العلم» (CMP-02 R5). Replies can be
 * reported (CMP-04 R1), and the person replying can be blocked (CMP-04 R6).
 * A former mentor's thread stays readable; what is written in it goes to the
 * current mentor's thread or to the pool, and the screen follows it (CMP-03 R4).
 */
import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { IconClock, IconDots } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/app/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { REFERRAL_NOTICE, type ThreadMessage, earlierOfThread, safetyApi, useMine, usePostToThread, useThread } from "./api"
import { type ChatItem, ChatList, Composer } from "./Chat"
import { Confirm } from "./Confirm"
import { useEarlier } from "./earlier"
import { UrgentNotice, awaitingText } from "./HelpScreen"
import { ReportSheet, type ReportTarget } from "./ReportSheet"
import { ScreenBar } from "./Screen"

/** One message of the learner's thread as the chat shows it. */
export function learnerChatItem(m: ThreadMessage, t: ReturnType<typeof useT>["t"], onReport: () => void): ChatItem {
  const reply = m.author === "mentor" || m.author === "scholar"
  return {
    id: m.id,
    mine: m.author === "me",
    name: m.author === "scholar" ? t("cmp.referral.scholars") : m.author === "mentor" ? m.name : null,
    body: m.author === "system" && m.body === REFERRAL_NOTICE ? t("cmp.referral.notice") : m.body,
    at: m.created_at,
    hidden: m.hidden, // CMP-04 R5: their own message, hidden for review, stays visible to them, marked
    actions: reply ? [{ label: t("cmp.thread.report"), onSelect: onReport }] : undefined,
  }
}

export default function HelpThread() {
  const { id } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const thread = useThread(id)
  const post = usePostToThread(id ?? "")
  const [report, setReport] = React.useState<ReportTarget | null>(null)
  const [blocking, setBlocking] = React.useState(false)
  const mine = useMine()
  const unread = thread.data?.messages.length
  // A-M4: the last 200 messages come first; earlier ones on demand.
  const fetchEarlier = React.useCallback((before: string) => earlierOfThread(id ?? "", before), [id])
  const history = useEarlier(id, thread.data?.messages, thread.data?.has_earlier, fetchEarlier)

  React.useEffect(() => {
    // Reading clears the unread mark on lists.
    if (unread !== undefined) void qc.invalidateQueries({ queryKey: ["cmp", "requests"] })
  }, [unread, qc])

  if (thread.isError) {
    return (
      <>
        <ScreenBar title={t("cmp.help.yourConversation")} back="/mentor/help" />
        <p className="px-4 pt-6 text-body text-muted-foreground">{t("common.error")}</p>
      </>
    )
  }
  const data = thread.data
  const title = data?.responder_name ?? (data?.kind === "mentor" ? t("cmp.hub.mentorTitle") : t("cmp.help.team"))

  const items: ChatItem[] = history.messages.map((m) => learnerChatItem(m, t, () => setReport({ type: "help_message", id: m.id })))

  const block = async () => {
    try {
      await safetyApi.blockResponder(id!)
      toast.success(t("cmp.thread.blockDone"))
      await qc.invalidateQueries({ queryKey: ["cmp"] })
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <>
      <ScreenBar
        title={<bdi>{title}</bdi>}
        back={data?.kind === "mentor" ? "/mentor" : "/mentor/help"}
        end={
          data?.can_block && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("cmp.thread.more")}>
                  <IconDots stroke={1.75} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" className="min-h-11 text-label" onSelect={() => setBlocking(true)}>
                  {t("cmp.thread.block")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />
      <div className="flex min-h-[calc(100dvh-9rem)] @min-[52.5rem]/shell:min-h-[calc(100dvh-6.25rem)] flex-col gap-4 px-4 pt-4">
        {data?.kind === "urgent" && <UrgentNotice />}
        {data?.kind === "urgent" && data.messages.length === 0 && <p className="text-body text-muted-foreground">{t("cmp.urgent.sent")}</p>}
        {data?.awaiting_same_gender ? (
          <Alert data-slot="awaiting-same-gender">
            <AlertDescription>{awaitingText(t, data.gender)}</AlertDescription>
          </Alert>
        ) : (
          data &&
          data.kind !== "urgent" &&
          data.status === "open" && (
            <Badge variant="warning" className="w-fit">
              {t("cmp.help.waiting")}
            </Badge>
          )
        )}
        {data?.kind === "mentor" && !data.link_ended && mine.data?.mentor?.availability && (
          <p className="flex items-center gap-1 text-label text-muted-foreground">
            <IconClock className="size-4 shrink-0" stroke={1.75} aria-hidden="true" />
            <span dir="auto">{t("cmp.hub.availability", { time: mine.data.mentor.availability })}</span>
          </p>
        )}
        {history.hasEarlier && (
          <Button variant="ghost" size="sm" className="self-center" disabled={history.loading} onClick={() => void history.loadEarlier()}>
            {t("cmp.thread.earlier")}
          </Button>
        )}
        {thread.isLoading ? <Skeleton className="h-40 rounded-card" /> : <ChatList items={items} className="flex-1" />}
        {data?.link_ended ? (
          <p className="text-center text-label text-muted-foreground">{t("cmp.thread.endedNote")}</p>
        ) : (
          data?.status === "closed" && <p className="text-center text-label text-muted-foreground">{t("cmp.thread.closedNote")}</p>
        )}
        <Composer
          placeholder={t("human.reply")}
          onSend={async (text) => {
            const went = await post.mutateAsync(text)
            if (went.id !== id) navigate(`/mentor/help/${went.id}`, { replace: true }) // CMP-03 R4: it went elsewhere
          }}
        />
      </div>
      <ReportSheet
        target={report}
        onClose={() => {
          setReport(null)
          history.reset() // CMP-04 R2: a reported message is never shown from the pages loaded earlier
        }}
      />
      <Confirm
        open={blocking}
        onOpenChange={setBlocking}
        title={t("cmp.thread.block")}
        description={t("cmp.thread.blockConfirm")}
        confirmLabel={t("cmp.thread.blockYes")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          void block().then(() => navigate("/mentor/help"))
        }}
      />
    </>
  )
}
