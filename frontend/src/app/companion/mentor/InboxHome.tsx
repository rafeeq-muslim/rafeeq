/**
 * CMP-02 mentor inbox — /inbox?tab=requests|mentees|groups|reports.
 * Requests in your languages, urgent first then the longest wait (R1, R2);
 * a request shows a display name or guest number, language, topic and
 * where it came from only (R5). Mentees with status only when they share
 * it (R6). Your groups (CMP-05) and, for the team, the report queue (CMP-04).
 */
import { useNavigate, useSearchParams } from "react-router"
import { IconLifebuoy, IconSettings, IconUserQuestion } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SpotIllustration } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { type InboxRow, useInbox } from "../api"
import { ago, initial, langName } from "../format"
import { ScreenBar } from "../Screen"
import { requesterName } from "./InboxThread"
import { MenteesTab } from "./MenteesTab"
import { MentorGroupsTab } from "./MentorGroupsTab"
import { ReportsQueue } from "./ReportsQueue"

type Tab = "requests" | "mentees" | "groups" | "reports"

export function RequestRowItem({ row, onOpen }: { row: InboxRow; onOpen: () => void }) {
  const { t, locale } = useT()
  const urgent = row.kind === "urgent"
  const myGender = useAuth((s) => s.me?.gender ?? null)
  const name = requesterName(t, row, myGender)
  if (!row.can_reply)
    return (
      <Alert variant="destructive">
        <IconLifebuoy stroke={1.75} />
        <AlertTitle>{t("cmp.inbox.alert")}</AlertTitle>
        <AlertDescription>
          {t("cmp.inbox.alertBody")} · {langName(row.lang)} · <span className="tabular-nums">{ago(row.created_at, locale)}</span>
        </AlertDescription>
      </Alert>
    )
  return (
    <Item asChild variant="outline" className={cn("bg-card text-start", urgent && "border-destructive/40")}>
      <button type="button" onClick={onOpen} className="min-h-16">
        <ItemMedia>
          <Avatar size="lg">
            <AvatarFallback className={cn(urgent && "bg-danger-surface text-destructive")}>
              {row.is_guest ? <IconUserQuestion className="size-5" stroke={1.75} aria-hidden="true" /> : initial(row.handle)}
            </AvatarFallback>
          </Avatar>
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="flex-wrap text-body">
            <bdi className="truncate">{name}</bdi>
            {urgent ? (
              <Badge variant="destructive">{t("cmp.urgent.badge")}</Badge>
            ) : row.status === "open" ? (
              <Badge variant="warning">{t("cmp.inbox.status.open")}</Badge>
            ) : (
              <Badge variant="success">{t("cmp.inbox.status.answered")}</Badge>
            )}
          </ItemTitle>
          {row.preview && (
            <ItemDescription dir="auto" className="line-clamp-2 text-label">
              {row.preview}
            </ItemDescription>
          )}
          <p className="flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
            <span lang={row.lang}>{langName(row.lang)}</span>
            {row.topic && <span>· {t(`cmp.topic.${row.topic}`)}</span>}
            {row.source && <span>· {t(`cmp.from.${row.source}`)}</span>}
            <span className="tabular-nums">· {ago(row.last_activity_at, locale)}</span>
          </p>
        </ItemContent>
        {row.unread > 0 && (
          <ItemActions>
            <span className="grid size-6 place-items-center rounded-full bg-primary text-caption font-bold text-primary-foreground tabular-nums">
              {row.unread}
            </span>
          </ItemActions>
        )}
      </button>
    </Item>
  )
}

function RequestsTab() {
  const { t } = useT()
  const navigate = useNavigate()
  const inbox = useInbox()
  if (inbox.isLoading) return <Skeleton className="h-40 rounded-card" />
  const rows = inbox.data ?? []
  if (rows.length === 0)
    return (
      <section className="flex flex-col items-center gap-3 py-10 text-center">
        <SpotIllustration kind="saved" size={96} />
        <p className="max-w-sm text-body text-muted-foreground">{t("cmp.inbox.empty")}</p>
      </section>
    )
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id}>
          <RequestRowItem row={r} onOpen={() => navigate(`/inbox/r/${r.id}`)} />
        </li>
      ))}
    </ul>
  )
}

export default function InboxHome() {
  const { t } = useT()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const isMentor = useAuth((s) => !!s.me?.roles.includes("mentor"))
  const isTeam = useAuth((s) => !!s.me?.roles.some((r) => r === "team" || r === "admin"))
  const ready = useAuth((s) => s.ready)
  const tabs: Tab[] = [
    "requests",
    ...(isMentor ? (["mentees", "groups"] as Tab[]) : []),
    ...(isTeam ? (["reports"] as Tab[]) : []),
  ]
  const requested = params.get("tab") as Tab | null
  const tab: Tab = requested && tabs.includes(requested) ? requested : "requests"

  if (ready && !isMentor && !isTeam) {
    // CMP-02 R6 ex3: learners see nothing of the inbox.
    return (
      <>
        <ScreenBar title={t("cmp.inbox.title")} />
        <section className="flex flex-col items-center gap-4 px-6 pt-10 text-center">
          <SpotIllustration kind="companion" size={96} />
          <p className="max-w-sm text-body text-muted-foreground">{t("cmp.hub.humanBody")}</p>
          <Button onClick={() => navigate("/mentor")}>{t("mentor.title")}</Button>
        </section>
      </>
    )
  }

  return (
    <>
      <ScreenBar
        title={t(isMentor ? "cmp.inbox.title" : "cmp.inbox.teamTitle")}
        end={
          isMentor && (
            <Button variant="ghost" size="icon" aria-label={t("cmp.inbox.profile")} onClick={() => navigate("/inbox/profile")}>
              <IconSettings stroke={1.75} />
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="gap-5 px-4 pt-4">
        {tabs.length > 1 && (
          <TabsList className="w-full overflow-x-auto">
            {tabs.map((k) => (
              <TabsTrigger key={k} value={k} className="flex-1 text-label">
                {t(`cmp.inbox.tab.${k}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        <TabsContent value="requests">
          <RequestsTab />
        </TabsContent>
        {isMentor && (
          <TabsContent value="mentees">
            <MenteesTab />
          </TabsContent>
        )}
        {isMentor && (
          <TabsContent value="groups">
            <MentorGroupsTab />
          </TabsContent>
        )}
        {isTeam && (
          <TabsContent value="reports">
            <ReportsQueue />
          </TabsContent>
        )}
      </Tabs>
    </>
  )
}
