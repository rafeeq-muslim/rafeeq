/**
 * CMP-03 choose a mentor — /mentor/choose.
 * R1 needs an account (guests are invited, never forced; human help stays).
 * R2 gender and languages are asked here only, with the reason; then up to
 *    three mentors of the same gender who speak one of your languages.
 * R3 cards show display name, languages, about and availability only.
 * R4 choosing replaces the current mentor; the share permission starts off.
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { IconClock } from "@tabler/icons-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SpotIllustration } from "@/components/rafeeq"
import { LOCALES, useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { type MentorCardData, errorCode, mentorApi, useMine, useSuggestions } from "./api"
import { initial, langName } from "./format"
import { ScreenBar, SectionTitle } from "./Screen"

/** «أنا أخ / أخت» + my languages — asked only where matching needs it. */
export function MatchForm({
  initialGender,
  initialLanguages,
  submitLabel,
  onDone,
}: {
  initialGender: "m" | "f" | null
  initialLanguages: string[]
  submitLabel: string
  onDone: () => void
}) {
  const { t, locale } = useT()
  const qc = useQueryClient()
  const [gender, setGender] = React.useState<"m" | "f" | "">(initialGender ?? "")
  const [langs, setLangs] = React.useState<string[]>(initialLanguages.length ? initialLanguages : [locale])
  const [pending, setPending] = React.useState(false)

  const save = async () => {
    if (!gender || langs.length === 0) return
    setPending(true)
    try {
      await mentorApi.match(gender, langs)
      await qc.invalidateQueries({ queryKey: ["cmp"] })
      onDone()
    } catch {
      toast.error(t("common.error"))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <SectionTitle>{t("cmp.choose.aboutYou")}</SectionTitle>
        <p className="text-body text-muted-foreground">{t("cmp.choose.why")}</p>
      </div>
      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label" className="text-label">
            {t("cmp.choose.iAm")}
          </FieldLegend>
          <ToggleGroup type="single" variant="outline" value={gender} onValueChange={(v) => setGender(v as "m" | "f" | "")}>
            <ToggleGroupItem value="m" className="min-w-28">
              {t("cmp.choose.brother")}
            </ToggleGroupItem>
            <ToggleGroupItem value="f" className="min-w-28">
              {t("cmp.choose.sister")}
            </ToggleGroupItem>
          </ToggleGroup>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label" className="text-label">
            {t("cmp.choose.languages")}
          </FieldLegend>
          <ToggleGroup type="multiple" variant="outline" value={langs} onValueChange={setLangs} className="flex-wrap">
            {LOCALES.map((l) => (
              <ToggleGroupItem key={l.code} value={l.code} lang={l.code}>
                {l.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldSet>
      </FieldGroup>
      <Button size="lg" className="w-full" disabled={!gender || langs.length === 0 || pending} onClick={() => void save()}>
        {submitLabel}
      </Button>
    </section>
  )
}

function MentorCard({ mentor, onChoose, pending }: { mentor: MentorCardData; onChoose: () => void; pending: boolean }) {
  const { t } = useT()
  return (
    <article className="flex flex-col gap-4 rounded-card bg-card p-5 shadow-card">
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          <AvatarFallback className="bg-secondary font-heading text-h3 text-secondary-foreground">{initial(mentor.display_name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="truncate text-body font-bold">
            <bdi>{mentor.display_name}</bdi>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {mentor.languages.map((l) => (
              <Badge key={l} variant="secondary" lang={l}>
                {langName(l)}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      {mentor.about && (
        <p dir="auto" className="text-body text-muted-foreground">
          {mentor.about}
        </p>
      )}
      {mentor.availability && (
        <p className="flex items-center gap-1.5 text-label text-muted-foreground">
          <IconClock className="size-4" stroke={1.75} aria-hidden="true" />
          <span dir="auto">{t("cmp.hub.availability", { time: mentor.availability })}</span>
        </p>
      )}
      <Button disabled={pending} onClick={onChoose}>
        {t("cmp.choose.pick", { name: mentor.display_name })}
      </Button>
    </article>
  )
}

export default function ChooseMentor() {
  const { t } = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const signedIn = useAuth((s) => !!s.token)
  const mine = useMine()
  const [editing, setEditing] = React.useState(false)
  const needsMatch = !!mine.data && (!mine.data.gender || editing)
  const suggestions = useSuggestions(signedIn && !!mine.data?.gender && !editing)
  const [pending, setPending] = React.useState(false)

  if (!signedIn) {
    return (
      <>
        <ScreenBar title={t("mentor.choose")} back="/mentor" />
        <section className="flex flex-col items-center gap-4 px-6 pt-10 text-center">
          <SpotIllustration kind="companion" size={96} />
          <p className="max-w-sm text-body">{t("mentor.needsAccount")}</p>
          <Button size="lg" onClick={() => navigate("/me/account")}>
            {t("cmp.hub.createAccount")}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/mentor/help?from=mentor")}>
            {t("ask.human")}
          </Button>
        </section>
      </>
    )
  }

  const choose = async (m: MentorCardData) => {
    setPending(true)
    try {
      await mentorApi.choose(m.id)
      await qc.invalidateQueries({ queryKey: ["cmp"] })
      toast.success(t("cmp.choose.done", { name: m.display_name }))
      navigate("/mentor")
    } catch (e) {
      toast.error(errorCode(e) === "mentor_unavailable" ? t("cmp.choose.none") : t("common.error"))
      void suggestions.refetch()
    } finally {
      setPending(false)
    }
  }

  const list = suggestions.data ?? []
  return (
    <>
      <ScreenBar title={t("mentor.choose")} back="/mentor" />
      <div className="flex flex-col gap-5 px-4 pt-5">
        {mine.isLoading ? (
          <Skeleton className="h-64 rounded-card" />
        ) : needsMatch ? (
          <MatchForm
            initialGender={mine.data?.gender ?? null}
            initialLanguages={mine.data?.languages ?? []}
            submitLabel={t("cmp.choose.find")}
            onDone={() => setEditing(false)}
          />
        ) : suggestions.isLoading ? (
          <Skeleton className="h-64 rounded-card" />
        ) : list.length === 0 ? (
          <section className="flex flex-col items-center gap-3 py-8 text-center">
            <SpotIllustration kind="offline" size={96} />
            <h2 className="font-heading text-h3 font-bold">{t(mine.data?.gender === "f" ? "cmp.choose.noneF" : "cmp.choose.none")}</h2>
            <p className="max-w-sm text-body text-muted-foreground">{t("cmp.choose.noneBody")}</p>
            <Button onClick={() => navigate("/mentor/help?from=mentor")}>{t("ask.human")}</Button>
          </section>
        ) : (
          <>
            <p className="text-body text-muted-foreground">{t("cmp.choose.intro")}</p>
            <ul className="flex flex-col gap-4">
              {list.map((m) => (
                <li key={m.id}>
                  <MentorCard mentor={m} pending={pending} onChoose={() => void choose(m)} />
                </li>
              ))}
            </ul>
          </>
        )}
        {!needsMatch && mine.data?.gender && (
          <Button variant="ghost" className="self-center" onClick={() => setEditing(true)}>
            {t("cmp.choose.editAbout")}
          </Button>
        )}
      </div>
    </>
  )
}
