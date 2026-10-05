/**
 * A learner's conversation with a human (CMP-01, CMP-03 R6). Polls every
 * 10 s while open. An urgent conversation always starts with what to do if
 * in danger now (CMP-01 R6). Mentor messages can be reported (CMP-04 R1),
 * and the person replying can be blocked (CMP-04 R5).
 */
import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { IconDots } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/app/i18n"
import { safetyApi, usePostToThread, useThread } from "./api"
import { type ChatItem, ChatList, Composer } from "./Chat"
import { Confirm } from "./Confirm"
import { UrgentNotice } from "./HelpScreen"
import { ReportSheet, type ReportTarget } from "./ReportSheet"
import { ScreenBar } from "./Screen"

export default function HelpThread() {
  const { id } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const thread = useThread(id)
  const post = usePostToThread(id ?? "")
  const [report, setReport] = React.useState<ReportTarget | null>(null)
  const [blocking, setBlocking] = React.useState(false)
  const unread = thread.data?.messages.length

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

  const items: ChatItem[] = (data?.messages ?? []).map((m) => ({
    id: m.id,
    mine: m.author === "me",
    name: m.author === "mentor" ? m.name : null,
    body: m.body,
    at: m.created_at,
    actions: m.author === "mentor" ? [{ label: t("cmp.thread.report"), onSelect: () => setReport({ type: "help_message", id: m.id }) }] : undefined,
  }))

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
      <div className="flex min-h-[calc(100dvh-9rem)] flex-col gap-4 px-4 pt-4">
        {data?.kind === "urgent" && <UrgentNotice />}
        {data?.kind === "urgent" && data.messages.length === 0 && <p className="text-body text-muted-foreground">{t("cmp.urgent.sent")}</p>}
        {data && data.kind !== "urgent" && data.status === "open" && (
          <Badge variant="warning" className="w-fit">
            {t("cmp.help.waiting")}
          </Badge>
        )}
        {thread.isLoading ? <Skeleton className="h-40 rounded-card" /> : <ChatList items={items} className="flex-1" />}
        {data?.status === "closed" && <p className="text-center text-label text-muted-foreground">{t("cmp.thread.closedNote")}</p>}
        <Composer
          placeholder={t("human.reply")}
          onSend={async (text) => {
            await post.mutateAsync(text)
          }}
        />
      </div>
      <ReportSheet target={report} onClose={() => setReport(null)} />
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
