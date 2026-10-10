/**
 * A mentor's group — /inbox/g/:id. Share the join code (CMP-05 R1), set
 * the week's goal (MOT-06), moderate the chat: hide a message at once with
 * a record for the team (CMP-04 R4) or remove a member silently (CMP-05 R5),
 * and change the group's cap within 15 and his 25 places (CMP-05 R1).
 */
import * as React from "react"
import { useParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { IconTarget, IconUsers } from "@tabler/icons-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Skeleton } from "@/components/ui/skeleton"
import { num, useT } from "@/app/i18n"
import { type Member, challengeApi, groupApi, useChallenge, useGroup, useGroupMessages } from "../api"
import { ChallengeCard } from "../ChallengeCard"
import { type ChatItem, ChatList, Composer } from "../Chat"
import { Confirm } from "../Confirm"
import { initial, langName, weekdayDate } from "../format"
import { ScreenBar, SectionTitle } from "../Screen"
import { CreateChallenge } from "./CreateChallenge"
import { CopyCode, GroupCapacity } from "./MentorGroupsTab"
import { GroupStateNotice } from "../staff/StaffGroups"

export default function MentorGroup() {
  const { id } = useParams()
  const { t, locale } = useT()
  const qc = useQueryClient()
  const group = useGroup(id)
  const challenge = useChallenge(id)
  const messages = useGroupMessages(id)
  const [membersOpen, setMembersOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [removing, setRemoving] = React.useState<Member | null>(null)
  const g = group.data
  const c = challenge.data

  const refresh = () => qc.invalidateQueries({ queryKey: ["cmp"] })
  const hide = async (messageId: string) => {
    try {
      await groupApi.hide(id!, messageId)
      toast.success(t("cmp.groups.hidden"))
      await refresh()
    } catch {
      toast.error(t("common.error"))
    }
  }
  const remove = async (m: Member) => {
    try {
      await groupApi.remove(id!, m.id)
      await refresh()
    } catch {
      toast.error(t("common.error"))
    }
  }

  const items: ChatItem[] = (messages.data ?? []).map((m) => ({
    id: m.id,
    mine: m.mine,
    name: m.author_name,
    body: m.body,
    at: m.created_at,
    actions: m.mine ? undefined : [{ label: t("cmp.groups.hide"), destructive: true, onSelect: () => void hide(m.id) }],
  }))
  const running = c && ((c.status === "active" && !c.ended) || c.status === "pending_review")

  return (
    <>
      <ScreenBar
        title={g ? <bdi>{g.name}</bdi> : t("cmp.inbox.tab.groups")}
        back="/inbox?tab=groups"
        end={
          <Button variant="ghost" size="icon" aria-label={t("cmp.group.members")} onClick={() => setMembersOpen(true)}>
            <IconUsers stroke={1.75} />
          </Button>
        }
      />
      <div className="flex min-h-[calc(100dvh-9rem)] @min-[52.5rem]/shell:min-h-[calc(100dvh-6.25rem)] flex-col gap-5 px-4 pt-4">
        {!g ? (
          <Skeleton className="h-48 rounded-card" />
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-label text-muted-foreground">
                <span lang={g.lang}>{langName(g.lang)}</span> · {t("cmp.group.membersCount", { n: num(g.members_count) })}
              </p>
              {g.join_code && <CopyCode code={g.join_code} />}
            </div>

            {challenge.isLoading ? (
              <Skeleton className="h-40 rounded-card" />
            ) : (
              <div className="flex flex-col gap-3">
                {c && <ChallengeCard challenge={c} members={g.members} />}
                {c?.status === "pending_review" && (
                  <Button
                    variant="ghost"
                    className="self-start"
                    onClick={() => void challengeApi.withdraw(g.id).then(() => qc.invalidateQueries({ queryKey: ["cmp", "challenge", g.id] }))}
                  >
                    {t("cmp.ch.withdraw")}
                  </Button>
                )}
                {running && c?.ends_at && <p className="text-caption text-muted-foreground">{t("cmp.ch.running", { date: weekdayDate(c.ends_at, locale) })}</p>}
                {!running && (
                  <Button size="lg" onClick={() => setCreating(true)}>
                    <IconTarget data-icon="inline-start" stroke={1.75} />
                    {t("cmp.ch.create")}
                  </Button>
                )}
              </div>
            )}

            <section className="flex flex-1 flex-col gap-3" aria-labelledby="mchat-title">
              <SectionTitle id="mchat-title">{t("cmp.group.chat")}</SectionTitle>
              <ChatList items={items} empty={<p className="text-center text-body text-muted-foreground">{t("cmp.group.chatEmpty")}</p>} />
            </section>
            {!g.state || g.state === "active" ? (
              <Composer
                placeholder={t("cmp.group.placeholder")}
                onSend={async (text) => {
                  await groupApi.post(g.id, text)
                  await qc.invalidateQueries({ queryKey: ["cmp", "group-messages", g.id] })
                }}
              />
            ) : (
              <div className="sticky bottom-0 pb-4">
                <GroupStateNotice state={g.state} mentor />
              </div>
            )}

            <CreateChallenge group={g} open={creating} onOpenChange={setCreating} />
            <Drawer open={membersOpen} onOpenChange={setMembersOpen}>
              <DrawerContent className="mx-auto max-w-xl rounded-t-panel">
                <DrawerHeader className="text-start">
                  <DrawerTitle className="font-heading text-h3">{t("cmp.group.members")}</DrawerTitle>
                </DrawerHeader>
                <div className="px-4 pb-2">
                  <GroupCapacity key={g.capacity} group={g} />
                </div>
                <ul className="flex flex-col divide-y overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
                  {g.members.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 py-2">
                      <Avatar>
                        <AvatarFallback>{initial(m.display_name)}</AvatarFallback>
                      </Avatar>
                      <bdi className="min-w-0 flex-1 truncate text-body">{m.display_name}</bdi>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRemoving(m)}>
                        {t("cmp.groups.remove")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </DrawerContent>
            </Drawer>
            <Confirm
              open={!!removing}
              onOpenChange={(o) => !o && setRemoving(null)}
              title={t("cmp.groups.remove")}
              description={removing ? t("cmp.groups.removeConfirm", { name: removing.display_name }) : undefined}
              confirmLabel={t("cmp.groups.remove")}
              cancelLabel={t("common.cancel")}
              destructive
              onConfirm={() => removing && void remove(removing)}
            />
          </>
        )}
      </div>
    </>
  )
}
