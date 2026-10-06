/**
 * CMP-05 the learner's group — /mentor/group.
 * R2 join by code (account; same gender and language; one group at a time).
 * R3 display names only. R4 text chat, members and mentor only, every
 *    message reportable, contact details refused. R5 leave silently.
 * R6 the week's challenge as a count (MOT-06).
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { IconDots, IconUsers } from "@tabler/icons-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { SpotIllustration } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { OfflineOnly } from "@/app/offline/NeedsConnection"
import { useAuth } from "@/app/stores/auth"
import { type Group, errorCode, groupApi, safetyApi, useChallenge, useGroup, useGroupMessages, useMine, useMyGroups } from "./api"
import { ChallengeCard } from "./ChallengeCard"
import { type ChatItem, ChatList, Composer } from "./Chat"
import { MatchForm } from "./ChooseMentor"
import { Confirm } from "./Confirm"
import { initial } from "./format"
import { ReportSheet, type ReportTarget } from "./ReportSheet"
import { ScreenBar, SectionTitle } from "./Screen"

const JOIN_ERRORS: Record<string, string> = {
  code_unknown: "cmp.group.err.unknown",
  group_not_suitable: "cmp.group.err.notSuitable",
  group_full: "cmp.group.err.full",
  already_in_group: "cmp.group.err.already",
  group_unavailable: "cmp.group.err.unavailable", // R5: removed by the mentor or the team
}

/** Join by the code a mentor gave you. */
export function JoinGroup({ onJoined }: { onJoined?: (g: Group) => void }) {
  const { t } = useT()
  const qc = useQueryClient()
  const mine = useMine()
  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [needsMatch, setNeedsMatch] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  const join = async () => {
    if (code.trim().length < 4) return
    setPending(true)
    setError(null)
    try {
      const g = await groupApi.join(code.trim())
      await qc.invalidateQueries({ queryKey: ["cmp"] })
      onJoined?.(g)
    } catch (e) {
      const c = errorCode(e)
      if (c === "match_profile_required") setNeedsMatch(true)
      else setError(t((JOIN_ERRORS[c] ?? "common.error") as Parameters<typeof t>[0]))
    } finally {
      setPending(false)
    }
  }

  if (needsMatch)
    return (
      <MatchForm
        initialGender={mine.data?.gender ?? null}
        initialLanguages={mine.data?.languages ?? []}
        submitLabel={t("cmp.group.join")}
        onDone={() => {
          setNeedsMatch(false)
          void join()
        }}
      />
    )

  return (
    <div className="flex flex-col gap-3">
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor="group-code" className="text-label">
          {t("cmp.group.code")}
        </FieldLabel>
        <Input
          id="group-code"
          dir="ltr"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={12}
          value={code}
          aria-invalid={!!error || undefined}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && void join()}
          className="text-center font-mono text-h3 tracking-[0.2em]"
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <Button size="lg" disabled={pending || code.trim().length < 4} onClick={() => void join()}>
        {t("cmp.group.join")}
      </Button>
    </div>
  )
}

function Members({ group, open, onOpenChange }: { group: Group; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useT()
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-xl rounded-t-panel">
        <DrawerHeader className="text-start">
          <DrawerTitle className="font-heading text-h3">{t("cmp.group.members")}</DrawerTitle>
        </DrawerHeader>
        <ul className="flex flex-col gap-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
          <li className="flex items-center gap-3 py-2">
            <Avatar>
              <AvatarFallback className="bg-primary text-primary-foreground">{initial(group.mentor_name)}</AvatarFallback>
            </Avatar>
            <bdi className="text-body font-bold">{group.mentor_name}</bdi>
            <span className="text-label text-primary">{t("cmp.group.mentorTag")}</span>
          </li>
          {group.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <Avatar>
                <AvatarFallback>{initial(m.display_name)}</AvatarFallback>
              </Avatar>
              <bdi className="text-body">{m.display_name}</bdi>
              {m.is_me && <span className="text-label text-muted-foreground">({t("cmp.group.you")})</span>}
            </li>
          ))}
        </ul>
      </DrawerContent>
    </Drawer>
  )
}

/** The group's page body: challenge, then chat. Shared shape with the mentor view. */
function GroupBody({ group }: { group: Group }) {
  const { t } = useT()
  const qc = useQueryClient()
  const challenge = useChallenge(group.id)
  const messages = useGroupMessages(group.id)
  const [report, setReport] = React.useState<ReportTarget | null>(null)

  const items: ChatItem[] = (messages.data ?? []).map((m) => ({
    id: m.id,
    mine: m.mine,
    name: m.author_name,
    tag: m.from_mentor ? t("cmp.group.mentorTag") : null,
    body: m.body,
    at: m.created_at,
    hidden: m.hidden,
    actions: m.mine
      ? undefined
      : [
          { label: t("cmp.thread.report"), onSelect: () => setReport({ type: "group_message", id: m.id, authorId: m.author_id }) },
          ...(m.author_id && !m.from_mentor
            ? [
                {
                  label: t("cmp.group.block"),
                  destructive: true,
                  onSelect: () =>
                    void safetyApi.block(m.author_id!).then(() => {
                      toast.success(t("cmp.group.blocked"))
                      void qc.invalidateQueries({ queryKey: ["cmp", "group-messages"] })
                    }),
                },
              ]
            : []),
        ],
  }))

  return (
    <>
      {challenge.isLoading ? (
        <Skeleton className="h-40 rounded-card" />
      ) : challenge.data ? (
        <ChallengeCard challenge={challenge.data} members={group.members} />
      ) : (
        <p className="rounded-card bg-muted px-5 py-4 text-label text-muted-foreground">{t("cmp.ch.none")}</p>
      )}

      <section className="flex flex-1 flex-col gap-3" aria-labelledby="chat-title">
        <SectionTitle id="chat-title">{t("cmp.group.chat")}</SectionTitle>
        <p className="text-caption text-muted-foreground">{t("cmp.group.safety")}</p>
        {messages.isLoading ? (
          <Skeleton className="h-32 rounded-card" />
        ) : (
          <ChatList items={items} empty={<p className="text-center text-body text-muted-foreground">{t("cmp.group.chatEmpty")}</p>} />
        )}
      </section>
      <Composer
        placeholder={t("cmp.group.placeholder")}
        onSend={async (text) => {
          await groupApi.post(group.id, text)
          await qc.invalidateQueries({ queryKey: ["cmp", "group-messages", group.id] })
        }}
      />
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </>
  )
}

export default function GroupPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const signedIn = useAuth((s) => !!s.token)
  const groups = useMyGroups()
  const memberOf = groups.data?.find((g) => g.role === "member")
  const group = useGroup(memberOf?.id)
  const [membersOpen, setMembersOpen] = React.useState(false)
  const [leaving, setLeaving] = React.useState(false)

  if (!signedIn) {
    return (
      <>
        <ScreenBar title={t("mentor.groups")} back="/mentor" />
        <section className="flex flex-col items-center gap-4 px-6 pt-10 text-center">
          <SpotIllustration kind="companion" size={96} />
          <p className="max-w-sm text-body">{t("mentor.needsAccount")}</p>
          <Button size="lg" onClick={() => navigate("/me/account")}>
            {t("cmp.hub.createAccount")}
          </Button>
        </section>
      </>
    )
  }

  const leave = async () => {
    if (!memberOf) return
    try {
      await groupApi.leave(memberOf.id)
      await qc.invalidateQueries({ queryKey: ["cmp"] })
      navigate("/mentor")
    } catch {
      toast.error(t("common.error"))
    }
  }

  const g = group.data
  return (
    <>
      <ScreenBar
        title={g ? <bdi>{g.name}</bdi> : t("mentor.groups")}
        back="/mentor"
        end={
          g && (
            <div className="flex items-center">
              <Button variant="ghost" size="icon" aria-label={t("cmp.group.members")} onClick={() => setMembersOpen(true)}>
                <IconUsers stroke={1.75} />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={t("cmp.thread.more")}>
                    <IconDots stroke={1.75} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" className="min-h-11 text-label" onSelect={() => setLeaving(true)}>
                    {t("cmp.group.leave")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        }
      />
      <div className="flex min-h-[calc(100dvh-9rem)] flex-col gap-5 px-4 pt-4">
        <OfflineOnly text="offline.mentor" />{/* PLT-15 R5 */}
        {groups.isLoading || (memberOf && group.isLoading) ? (
          <Skeleton className="h-48 rounded-card" />
        ) : g ? (
          <>
            <p className="text-label text-muted-foreground">
              <bdi>{t("cmp.group.ledBy", { name: g.mentor_name })}</bdi> · {t("cmp.group.membersCount", { n: num(g.members_count) })}
            </p>
            <GroupBody group={g} />
            <Members group={g} open={membersOpen} onOpenChange={setMembersOpen} />
            <Confirm
              open={leaving}
              onOpenChange={setLeaving}
              title={t("cmp.group.leave")}
              description={t("cmp.group.leaveConfirm", { name: g.name })}
              confirmLabel={t("cmp.group.leave")}
              cancelLabel={t("cmp.group.stay")}
              destructive
              onConfirm={() => void leave()}
            />
          </>
        ) : (
          <section className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <SpotIllustration kind="companion" size={72} />
              <div className="flex flex-col gap-1">
                <SectionTitle>{t("cmp.group.joinTitle")}</SectionTitle>
                <p className="text-body text-muted-foreground">{t("cmp.hub.noGroup")}</p>
              </div>
            </div>
            <JoinGroup />
          </section>
        )}
      </div>
    </>
  )
}
