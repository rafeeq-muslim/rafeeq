/**
 * CMP-05 R8/R9 (owner decision 2026-10-10): the team and admins moderate
 * groups — /staff-groups and /staff-groups/:id, plus a section on the Admin
 * and Team pages. Every group with its mentor and state, the ones that need
 * a mentor first; assign or change the mentor (same gender, the group's
 * language, in good standing, with places: the server offers only those),
 * pause, resume, close for good, and moderate the chat. Only staff of the
 * group's gender read the chat (same-gender rule); member names and the join
 * code are not shown in the list.
 */
import * as React from "react"
import { Link, Route, Routes, useNavigate, useParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { IconAlertTriangle, IconChevronLeft, IconUsersGroup } from "@tabler/icons-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { num, useT, type Key } from "@/app/i18n"
import {
  type GroupState,
  type MentorCandidate,
  type StaffGroup,
  errorCode,
  staffGroupApi,
  useMentorCandidates,
  useStaffGroup,
  useStaffGroupMessages,
  useStaffGroups,
} from "../api"
import { type ChatItem, ChatList } from "../Chat"
import { Confirm } from "../Confirm"
import { langName } from "../format"
import { ScreenBar, SectionTitle } from "../Screen"

const BADGE: Record<GroupState, "destructive" | "warning" | "success" | "secondary"> = {
  needs_mentor: "destructive",
  paused: "warning",
  active: "success",
  closed: "secondary",
}

export function GroupStateBadge({ state }: { state: GroupState }) {
  const { t } = useT()
  return (
    <Badge variant={BADGE[state]} data-state={state}>
      {t(`cmp.mod.state.${state}` as Key)}
    </Badge>
  )
}

/** R9 and R8 for the people in the group: why nobody can post now. */
export function GroupStateNotice({ state, mentor = false }: { state?: GroupState; mentor?: boolean }) {
  const { t } = useT()
  if (!state || state === "active") return null
  const key = (mentor ? `cmp.mod.mentorNotice.${state}` : `cmp.mod.memberNotice.${state}`) as Key
  return (
    <Alert variant={state === "closed" ? "default" : "warning"} data-slot="group-state-notice">
      <AlertDescription className="text-body">{t(key)}</AlertDescription>
    </Alert>
  )
}

function GroupRow({ g }: { g: StaffGroup }) {
  const { t } = useT()
  return (
    <Item asChild variant="outline" className="bg-card text-start">
      <Link to={`/staff-groups/${g.id}`} className="min-h-16" data-group-state={g.state}>
        <ItemContent className="min-w-0">
          <ItemTitle className="flex-wrap text-body">
            <bdi className="truncate font-bold">{g.name}</bdi>
            <GroupStateBadge state={g.state} />
          </ItemTitle>
          <ItemDescription className="text-label">
            <bdi>{t("cmp.mod.mentor", { name: g.mentor_name })}</bdi>
          </ItemDescription>
          <p className="flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
            <span lang={g.lang}>{langName(g.lang)}</span>
            <span>· {t(g.gender === "f" ? "cmp.mod.gender.f" : "cmp.mod.gender.m")}</span>
            <span className="tabular-nums">· {t("cmp.mod.members", { n: num(g.members_count), cap: num(g.capacity) })}</span>
          </p>
        </ItemContent>
        <ItemActions>
          <IconChevronLeft className="size-5 text-muted-foreground ltr:rotate-180" aria-hidden="true" />
        </ItemActions>
      </Link>
    </Item>
  )
}

/** The list, flagged groups first (the server orders it). For the Admin and Team pages and /staff-groups. */
export function StaffGroupsList() {
  const { t } = useT()
  const list = useStaffGroups()
  const waiting = (list.data ?? []).filter((g) => g.state === "needs_mentor").length
  if (list.isLoading) return <Skeleton className="h-32 rounded-card" />
  if (list.isError) return <p className="text-label text-destructive">{t("common.error")}</p>
  return (
    <div className="flex flex-col gap-3">
      {waiting > 0 && (
        <Alert variant="destructive" role="status">
          <IconAlertTriangle stroke={1.75} />
          <AlertTitle>{t("cmp.mod.needsTitle", { n: num(waiting) })}</AlertTitle>
          <AlertDescription>{t("cmp.mod.needsBody")}</AlertDescription>
        </Alert>
      )}
      {list.data?.length === 0 ? (
        <p className="text-label text-muted-foreground">{t("cmp.mod.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2 @min-[52.5rem]/shell:grid @min-[52.5rem]/shell:grid-cols-2">
          {list.data?.map((g) => (
            <li key={g.id}>
              <GroupRow g={g} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** CMP-ADMIN-GROUPS: one section for the Admin and Team pages. */
export function StaffGroupsSection() {
  const { t } = useT()
  return (
    <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="staff-groups-title" data-slot="staff-groups">
      <h2 id="staff-groups-title" className="flex items-center gap-2 font-heading text-h3 font-bold">
        <IconUsersGroup className="size-6 text-primary" stroke={1.75} aria-hidden="true" />
        {t("cmp.mod.title")}
      </h2>
      <p className="text-label text-muted-foreground">{t("cmp.mod.hint")}</p>
      <StaffGroupsList />
    </section>
  )
}

const ASSIGN_ERRORS: Record<string, Key> = {
  gender_mismatch: "cmp.mod.err.gender",
  language_not_spoken: "cmp.mod.err.language",
  mentor_member_limit: "cmp.mod.err.places",
  mentor_not_eligible: "cmp.mod.err.notEligible",
  mentor_is_member: "cmp.mod.err.notEligible",
  group_closed: "cmp.mod.err.closed",
}

function AssignMentor({ group, open, onOpenChange }: { group: StaffGroup; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useT()
  const qc = useQueryClient()
  const candidates = useMentorCandidates(group.id, open)
  const [chosen, setChosen] = React.useState<MentorCandidate | null>(null)
  const assign = async (c: MentorCandidate) => {
    try {
      await staffGroupApi.assign(group.id, c.id)
      toast.success(t("cmp.mod.assigned", { name: c.display_name }))
      onOpenChange(false)
      await qc.invalidateQueries({ queryKey: ["cmp"] })
    } catch (e) {
      toast.error(t(ASSIGN_ERRORS[errorCode(e)] ?? "common.error"))
    }
  }
  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="mx-auto max-w-xl rounded-t-panel">
          <DrawerHeader className="text-start">
            <DrawerTitle className="font-heading text-h3">{t("cmp.mod.candidatesTitle")}</DrawerTitle>
            <DrawerDescription className="text-label">{t("cmp.mod.candidatesHint")}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
            {candidates.isLoading ? (
              <Skeleton className="h-24 rounded-card" />
            ) : candidates.data?.length === 0 ? (
              <p className="py-4 text-body text-muted-foreground">{t("cmp.mod.noCandidates")}</p>
            ) : (
              <ul className="flex flex-col gap-2" data-slot="mentor-candidates">
                {candidates.data?.map((c) => (
                  <li key={c.id}>
                    <Item asChild variant="outline" className="bg-card text-start">
                      <button type="button" className="min-h-14 w-full" onClick={() => setChosen(c)}>
                        <ItemContent className="min-w-0">
                          <ItemTitle className="text-body">
                            <bdi className="truncate">{c.display_name}</bdi>
                          </ItemTitle>
                          <ItemDescription className="text-caption tabular-nums">
                            {t("cmp.mod.places", { used: num(c.places_used), left: num(c.places_left) })}
                          </ItemDescription>
                        </ItemContent>
                      </button>
                    </Item>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DrawerContent>
      </Drawer>
      <Confirm
        open={!!chosen}
        onOpenChange={(o) => !o && setChosen(null)}
        title={t("cmp.mod.assignTitle")}
        description={chosen ? t("cmp.mod.assignConfirm", { name: chosen.display_name, group: group.name }) : undefined}
        confirmLabel={t("cmp.mod.assignOk")}
        cancelLabel={t("cmp.mod.cancel")}
        onConfirm={() => chosen && void assign(chosen)}
      />
    </>
  )
}

function StaffChat({ group }: { group: StaffGroup }) {
  const { t } = useT()
  const qc = useQueryClient()
  const messages = useStaffGroupMessages(group.id, group.can_read)
  const [removing, setRemoving] = React.useState<{ id: string; name: string } | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ["cmp"] })
  const hide = async (messageId: string) => {
    try {
      await staffGroupApi.hide(group.id, messageId)
      toast.success(t("cmp.groups.hidden"))
      await refresh()
    } catch {
      toast.error(t("common.error"))
    }
  }
  const remove = async (userId: string) => {
    try {
      await staffGroupApi.remove(group.id, userId)
      toast.success(t("cmp.mod.removed"))
      await refresh()
    } catch {
      toast.error(t("common.error"))
    }
  }
  if (!group.can_read) return <p className="rounded-card bg-muted px-5 py-4 text-label text-muted-foreground">{t("cmp.mod.cannotRead")}</p>
  const items: ChatItem[] = (messages.data ?? []).map((m) => ({
    id: m.id,
    mine: m.mine,
    name: m.author_name,
    tag: m.from_mentor ? t("cmp.group.mentorTag") : null,
    body: m.body,
    at: m.created_at,
    hidden: m.hidden,
    actions:
      m.mine || m.hidden
        ? undefined
        : [
            { label: t("cmp.groups.hide"), destructive: true, onSelect: () => void hide(m.id) },
            ...(m.author_id && !m.from_mentor
              ? [{ label: t("cmp.mod.removeAuthor"), destructive: true, onSelect: () => setRemoving({ id: m.author_id!, name: m.author_name }) }]
              : []),
          ],
  }))
  return (
    <>
      <p className="text-caption text-muted-foreground">{t("cmp.mod.readNote")}</p>
      {messages.isLoading ? (
        <Skeleton className="h-32 rounded-card" />
      ) : (
        <ChatList items={items} empty={<p className="text-center text-body text-muted-foreground">{t("cmp.group.chatEmpty")}</p>} />
      )}
      <Confirm
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("cmp.groups.remove")}
        description={removing ? t("cmp.groups.removeConfirm", { name: removing.name }) : undefined}
        confirmLabel={t("cmp.groups.remove")}
        cancelLabel={t("cmp.mod.cancel")}
        destructive
        onConfirm={() => removing && void remove(removing.id)}
      />
    </>
  )
}

function StaffGroupDetail() {
  const { id } = useParams()
  const { t } = useT()
  const qc = useQueryClient()
  const group = useStaffGroup(id)
  const [assigning, setAssigning] = React.useState(false)
  const [closing, setClosing] = React.useState(false)
  const g = group.data

  const setStatus = async (status: "active" | "paused" | "closed") => {
    try {
      await staffGroupApi.setStatus(id!, status)
      toast.success(t("cmp.mod.saved"))
      await qc.invalidateQueries({ queryKey: ["cmp"] })
    } catch (e) {
      toast.error(t(ASSIGN_ERRORS[errorCode(e)] ?? "common.error"))
    }
  }

  return (
    <>
      <ScreenBar title={g ? <bdi>{g.name}</bdi> : t("cmp.mod.title")} back="/staff-groups" />
      <div className="flex flex-col gap-5 px-4 pt-4 pb-12">
        {group.isLoading ? (
          <Skeleton className="h-48 rounded-card" />
        ) : !g ? (
          <p className="text-body text-muted-foreground">{t("common.error")}</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <GroupStateBadge state={g.state} />
                <span className="text-label text-muted-foreground">
                  <span lang={g.lang}>{langName(g.lang)}</span> · {t(g.gender === "f" ? "cmp.mod.gender.f" : "cmp.mod.gender.m")} ·{" "}
                  <span className="tabular-nums">{t("cmp.mod.members", { n: num(g.members_count), cap: num(g.capacity) })}</span>
                </span>
              </div>
              <p className="text-body">
                <bdi>{t("cmp.mod.mentor", { name: g.mentor_name })}</bdi>
              </p>
            </div>
            {g.state === "needs_mentor" && (
              <Alert variant="destructive">
                <IconAlertTriangle stroke={1.75} />
                <AlertTitle>{t("cmp.mod.state.needs_mentor")}</AlertTitle>
                <AlertDescription>{t("cmp.mod.needsDetail")}</AlertDescription>
              </Alert>
            )}
            {g.state !== "closed" && (
              <div className="flex flex-wrap gap-2">
                <Button size="lg" variant={g.state === "needs_mentor" ? "default" : "secondary"} onClick={() => setAssigning(true)}>
                  {t(g.state === "needs_mentor" ? "cmp.mod.assign" : "cmp.mod.reassign")}
                </Button>
                {g.state === "paused" ? (
                  <Button size="lg" variant="outline" onClick={() => void setStatus("active")}>
                    {t("cmp.mod.resume")}
                  </Button>
                ) : (
                  <Button size="lg" variant="outline" onClick={() => void setStatus("paused")}>
                    {t("cmp.mod.pause")}
                  </Button>
                )}
                <Button size="lg" variant="ghost" className="text-destructive" onClick={() => setClosing(true)}>
                  {t("cmp.mod.close")}
                </Button>
              </div>
            )}
            <section className="flex flex-col gap-3" aria-labelledby="staff-chat-title">
              <SectionTitle id="staff-chat-title">{t("cmp.group.chat")}</SectionTitle>
              <StaffChat group={g} />
            </section>
            <AssignMentor group={g} open={assigning} onOpenChange={setAssigning} />
            <Confirm
              open={closing}
              onOpenChange={setClosing}
              title={t("cmp.mod.closeTitle", { name: g.name })}
              description={t("cmp.mod.closeConfirm")}
              confirmLabel={t("cmp.mod.close")}
              cancelLabel={t("cmp.mod.cancel")}
              destructive
              onConfirm={() => void setStatus("closed")}
            />
          </>
        )}
      </div>
    </>
  )
}

function StaffGroupsHome() {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <>
      <ScreenBar title={t("cmp.mod.title")} back={-1} />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-12">
        <p className="text-label text-muted-foreground">{t("cmp.mod.hint")}</p>
        <StaffGroupsList />
        <Button variant="ghost" className="w-fit" onClick={() => navigate("/inbox?tab=reports")}>
          {t("plt17.team.reportsOpen")}
        </Button>
      </div>
    </>
  )
}

export default function StaffGroups() {
  return (
    <Routes>
      <Route index element={<StaffGroupsHome />} />
      <Route path=":id" element={<StaffGroupDetail />} />
    </Routes>
  )
}
