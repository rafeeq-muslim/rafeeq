/**
 * «مرشدي» — /mentor. One place for the human side of Rafeeq:
 * your mentor and the share permission (CMP-03), your group and its week
 * (CMP-05, MOT-06), and a human now (CMP-01), which never needs an account.
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { IconChevronLeft, IconClock, IconDots, IconHeadset, IconMessageCircle } from "@tabler/icons-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { SpotIllustration } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { claimGuestRequests, mentorApi, useChallenge, useMine, useMyGroups, useMyRequests } from "./api"
import { ChallengeCard } from "./ChallengeCard"
import { Confirm } from "./Confirm"
import { initial, langName } from "./format"
import { ThreadList } from "./HelpScreen"
import { JoinGroup } from "./GroupPage"
import { ScreenBar, SectionTitle } from "./Screen"
import { ShareProgressToggle } from "./ShareProgressToggle"

function MyMentor() {
  const { t } = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const mine = useMine()
  const [confirm, setConfirm] = React.useState<"end" | "block" | null>(null)

  if (mine.isLoading) return <Skeleton className="h-48 rounded-card" />
  const m = mine.data?.mentor
  if (!m)
    return (
      <section className="flex flex-col items-start gap-4" aria-labelledby="mentor-title">
        <div className="flex items-center gap-4">
          <SpotIllustration kind="companion" size={80} />
          <div className="flex flex-col gap-1">
            <SectionTitle id="mentor-title">{t("mentor.none")}</SectionTitle>
            <p className="text-body text-muted-foreground">{t("cmp.hub.noneBody")}</p>
          </div>
        </div>
        <Button size="lg" className="w-full" onClick={() => navigate("/mentor/choose")}>
          {t("mentor.choose")}
        </Button>
      </section>
    )

  const openThread = async () => {
    try {
      const { id } = await mentorApi.thread()
      navigate(`/mentor/help/${id}`)
    } catch {
      toast.error(t("common.error"))
    }
  }
  const act = async () => {
    try {
      await (confirm === "block" ? mentorApi.block() : mentorApi.end())
      await qc.invalidateQueries({ queryKey: ["cmp"] })
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="mentor-title">
      <div className="flex items-center justify-between">
        <SectionTitle id="mentor-title">{t("cmp.hub.mentorTitle")}</SectionTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("cmp.thread.more")}>
              <IconDots stroke={1.75} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="min-h-11 text-label" onSelect={() => navigate("/mentor/choose")}>
              {t("cmp.hub.change")}
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 text-label" onSelect={() => setConfirm("end")}>
              {t("cmp.hub.end")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className="min-h-11 text-label" onSelect={() => setConfirm("block")}>
              {t("cmp.hub.blockMentor")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          <AvatarFallback className="bg-primary font-heading text-h2 text-primary-foreground">{initial(m.display_name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-body font-bold">
            <bdi>{m.display_name}</bdi>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {m.languages.map((l) => (
              <Badge key={l} variant="secondary" lang={l}>
                {langName(l)}
              </Badge>
            ))}
          </div>
          {m.availability && (
            <p className="flex items-center gap-1 text-label text-muted-foreground">
              <IconClock className="size-4 shrink-0" stroke={1.75} aria-hidden="true" />
              <span dir="auto" className="truncate">
                {t("cmp.hub.availability", { time: m.availability })}
              </span>
            </p>
          )}
        </div>
      </div>
      {m.about && (
        <p dir="auto" className="text-body text-muted-foreground">
          {m.about}
        </p>
      )}
      <Button size="lg" className="w-full" onClick={() => void openThread()}>
        <IconMessageCircle data-icon="inline-start" stroke={1.75} />
        {t("cmp.hub.message")}
      </Button>
      <ShareProgressToggle className="rounded-card bg-muted p-4" />

      <Confirm
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "block" ? t("cmp.hub.blockMentor") : t("cmp.hub.end")}
        description={t(confirm === "block" ? "cmp.hub.blockConfirm" : "cmp.hub.endConfirm", { name: m.display_name })}
        confirmLabel={confirm === "block" ? t("cmp.hub.blockYes") : t("cmp.hub.end")}
        cancelLabel={t("cmp.hub.keep")}
        destructive={confirm === "block"}
        onConfirm={() => void act()}
      />
    </section>
  )
}

function MyGroup() {
  const { t } = useT()
  const navigate = useNavigate()
  const groups = useMyGroups()
  const g = groups.data?.find((x) => x.role === "member")
  const challenge = useChallenge(g?.id)

  return (
    <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="group-title">
      <SectionTitle id="group-title">{t("cmp.hub.groupTitle")}</SectionTitle>
      {groups.isLoading ? (
        <Skeleton className="h-28 rounded-card" />
      ) : g ? (
        <>
          <button
            type="button"
            onClick={() => navigate("/mentor/group")}
            className="tactile flex items-center gap-3 rounded-card border-2 bg-card p-4 text-start [--lip:var(--outline-lip)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-bold">
                <bdi>{g.name}</bdi>
              </span>
              <span className="block text-label text-muted-foreground">
                <bdi>{t("cmp.group.ledBy", { name: g.mentor_name })}</bdi> · {t("cmp.group.membersCount", { n: num(g.members_count) })}
              </span>
            </span>
            <span className="sr-only">{t("cmp.hub.openGroup")}</span>
            <IconChevronLeft className="size-5 text-primary ltr:rotate-180" aria-hidden="true" />
          </button>
          {challenge.data && <ChallengeCard challenge={challenge.data} />}
        </>
      ) : (
        <>
          <p className="text-body text-muted-foreground">{t("cmp.hub.noGroup")}</p>
          <JoinGroup onJoined={() => navigate("/mentor/group")} />
        </>
      )}
    </section>
  )
}

function HumanNow() {
  const { t } = useT()
  const navigate = useNavigate()
  const threads = useMyRequests()
  const list = (threads.data ?? []).filter((s) => s.kind !== "mentor").slice(0, 3)
  return (
    <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="human-title">
      <div className="flex flex-col gap-1">
        <SectionTitle id="human-title">{t("cmp.hub.humanTitle")}</SectionTitle>
        <p className="text-body text-muted-foreground">{t("cmp.hub.humanBody")}</p>
      </div>
      <Button variant="outline" size="lg" className="w-full" onClick={() => navigate("/mentor/help?from=mentor")}>
        <IconHeadset data-icon="inline-start" stroke={1.75} />
        {t("ask.human")}
      </Button>
      {list.length > 0 && <ThreadList threads={list} onOpen={(id) => navigate(`/mentor/help/${id}`)} />}
    </section>
  )
}

export default function MentorHub() {
  const { t } = useT()
  const navigate = useNavigate()
  const signedIn = useAuth((s) => !!s.token)

  React.useEffect(() => {
    if (signedIn) void claimGuestRequests() // CMP-01 R2 ex3
  }, [signedIn])

  return (
    <>
      <ScreenBar title={t("mentor.title")} />
      <div className="flex flex-col gap-6 px-4 pt-5 pb-4">
        {signedIn ? (
          <>
            <MyMentor />
            <MyGroup />
          </>
        ) : (
          <section className="flex flex-col items-start gap-4">
            <div className="flex items-center gap-4">
              <SpotIllustration kind="companion" size={80} />
              <div className="flex flex-col gap-1">
                <SectionTitle>{t("mentor.none")}</SectionTitle>
                <p className="text-body text-muted-foreground">{t("cmp.hub.noneBody")}</p>
              </div>
            </div>
            <p className="text-label text-muted-foreground">{t("mentor.needsAccount")}</p>
            <Button size="lg" className="w-full" onClick={() => navigate("/me/account")}>
              {t("cmp.hub.createAccount")}
            </Button>
          </section>
        )}
        <HumanNow />
      </div>
    </>
  )
}
