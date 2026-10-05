/**
 * CMP-01 «أريد إنسانًا» — /mentor/help?from=lesson|review|ask|home|mentor
 * [&kind=urgent|escalation][&ask=<ask_id>].
 *
 * No account needed (R2). Topics include non-religious needs (R4). Contact
 * details are refused with the reason (R3). `kind=urgent` (a danger case
 * from the assistant, KNW-01 R5) creates the urgent request at once, with no
 * question text, and opens it (R6).
 */
import * as React from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { IconHeadset, IconLifebuoy, IconUserHeart } from "@tabler/icons-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SpotIllustration } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { TOPICS, type Source, type ThreadSummary, type Topic, createRequest, useMyRequests } from "./api"
import { useSendError } from "./Chat"
import { ago } from "./format"
import { ScreenBar, SectionTitle } from "./Screen"

const SOURCES: Source[] = ["lesson", "review", "ask", "home", "mentor"]

/** Shown first on every urgent conversation: what to do if in danger now.
 * Never a phone number we have not verified (CMP-01 open question). */
export function UrgentNotice() {
  const { t } = useT()
  return (
    <Alert variant="destructive" role="alert" data-slot="urgent-notice">
      <IconLifebuoy stroke={1.75} />
      <AlertTitle>{t("human.danger.title")}</AlertTitle>
      <AlertDescription>{t("human.danger.body")}</AlertDescription>
    </Alert>
  )
}

function statusBadge(t: ReturnType<typeof useT>["t"], s: ThreadSummary) {
  if (s.unread > 0) return <Badge variant="info">{t("cmp.help.newReply")}</Badge>
  if (s.status === "closed") return <Badge variant="secondary">{t("cmp.help.closed")}</Badge>
  if (s.status === "answered") return <Badge variant="success">{t("cmp.help.answered")}</Badge>
  return <Badge variant="warning">{t("cmp.help.waiting")}</Badge>
}

export function ThreadList({ threads, onOpen }: { threads: ThreadSummary[]; onOpen: (id: string) => void }) {
  const { t, locale } = useT()
  return (
    <ul className="flex flex-col gap-2">
      {threads.map((s) => {
        const Icon = s.kind === "urgent" ? IconLifebuoy : s.kind === "mentor" ? IconUserHeart : IconHeadset
        return (
          <li key={s.id}>
            <Item asChild variant="outline" className="bg-card text-start">
              <button type="button" onClick={() => onOpen(s.id)} className="min-h-16">
                <ItemMedia>
                  <span className="grid size-10 place-items-center rounded-full bg-secondary text-secondary-foreground">
                    <Icon className="size-5" stroke={1.75} aria-hidden="true" />
                  </span>
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="text-body">
                    <bdi className="truncate">
                      {s.responder_name ?? (s.topic ? t(`cmp.topic.${s.topic}`) : t("cmp.help.yourConversation"))}
                    </bdi>
                  </ItemTitle>
                  {s.preview && (
                    <ItemDescription dir="auto" className="line-clamp-1 text-label">
                      {s.preview}
                    </ItemDescription>
                  )}
                </ItemContent>
                <ItemActions className="flex-col items-end gap-1">
                  {statusBadge(t, s)}
                  <span className="text-caption text-muted-foreground tabular-nums">{ago(s.last_activity_at, locale)}</span>
                </ItemActions>
              </button>
            </Item>
          </li>
        )
      })}
    </ul>
  )
}

/** Creates the urgent request on arrival and opens it: a human first, no waiting. */
function UrgentStart({ source, askId }: { source: Source; askId: string | null }) {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const started = React.useRef(false)
  const [failed, setFailed] = React.useState(false)

  const start = React.useCallback(async () => {
    setFailed(false)
    try {
      const req = await createRequest({ kind: "urgent", source, lang: locale, ask_id: askId })
      navigate(`/mentor/help/${req.id}`, { replace: true })
    } catch {
      setFailed(true)
    }
  }, [askId, locale, navigate, source])

  React.useEffect(() => {
    if (started.current) return
    started.current = true
    void start()
  }, [start])

  return (
    <div className="flex flex-col gap-5 px-4 pt-4">
      <UrgentNotice />
      {failed ? (
        <Button size="lg" onClick={() => void start()}>
          {t("human.danger.cta")}
        </Button>
      ) : (
        <p className="flex items-center gap-2 text-body text-muted-foreground">
          <Spinner /> {t("common.loading")}
        </p>
      )}
    </div>
  )
}

export default function HelpScreen() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const signedIn = useAuth((s) => !!s.token)
  const from = params.get("from")
  const source: Source | null = SOURCES.includes(from as Source) ? (from as Source) : null
  const kind = params.get("kind") === "escalation" ? "escalation" : params.get("kind") === "urgent" ? "urgent" : "human"
  const threads = useMyRequests()
  const toMessage = useSendError()

  const [topic, setTopic] = React.useState<Topic | "">("")
  const [who, setWho] = React.useState<"any" | "m" | "f">("any")
  const [body, setBody] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  if (kind === "urgent") {
    return (
      <>
        <ScreenBar title={t("human.title")} back={-1} />
        <UrgentStart source={source ?? "ask"} askId={params.get("ask")} />
      </>
    )
  }

  const send = async () => {
    if (!body.trim()) return setError(t("cmp.err.empty"))
    setPending(true)
    setError(null)
    try {
      const req = await createRequest({
        kind,
        source,
        topic: topic || null,
        prefer_gender: who === "any" ? null : who,
        lang: locale,
        body: body.trim(),
      })
      await qc.invalidateQueries({ queryKey: ["cmp", "requests"] })
      navigate(`/mentor/help/${req.id}`)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setPending(false)
    }
  }

  const list = threads.data ?? []
  return (
    <>
      <ScreenBar title={t("human.title")} back={-1} />
      <div className="flex flex-col gap-6 px-4 pt-5">
        <section className="flex items-center gap-4">
          <SpotIllustration kind="companion" size={72} />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-body">{t("human.body")}</p>
            <p className="text-label text-muted-foreground">{t("cmp.help.noSmallQuestion")}</p>
          </div>
        </section>

        <FieldGroup>
          <FieldSet>
            <FieldLegend variant="label" className="text-label">
              {t("cmp.help.topic")}
            </FieldLegend>
            <ToggleGroup type="single" variant="outline" value={topic} onValueChange={(v) => setTopic(v as Topic | "")} className="w-full flex-wrap">
              {TOPICS.map((tp) => (
                <ToggleGroupItem key={tp} value={tp} className="whitespace-normal">
                  {t(`cmp.topic.${tp}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label" className="text-label">
              {t("cmp.help.who")}
            </FieldLegend>
            <ToggleGroup type="single" variant="outline" value={who} onValueChange={(v) => v && setWho(v as "any" | "m" | "f")} className="flex-wrap">
              <ToggleGroupItem value="any">{t("cmp.help.any")}</ToggleGroupItem>
              <ToggleGroupItem value="m">{t("cmp.help.brother")}</ToggleGroupItem>
              <ToggleGroupItem value="f">{t("cmp.help.sister")}</ToggleGroupItem>
            </ToggleGroup>
          </FieldSet>

          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="help-body" className="text-label">
              {t("cmp.help.message")}
            </FieldLabel>
            <Textarea
              id="help-body"
              dir="auto"
              rows={5}
              maxLength={2000}
              value={body}
              aria-invalid={!!error || undefined}
              placeholder={t("cmp.help.placeholder")}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-32 text-body"
            />
            {error && <FieldError>{error}</FieldError>}
            {!signedIn && <FieldDescription className="text-label">{t("cmp.help.guestNote")}</FieldDescription>}
          </Field>
        </FieldGroup>

        <Button size="lg" className="w-full" disabled={pending} onClick={() => void send()}>
          {pending ? <Spinner data-icon="inline-start" /> : <IconHeadset data-icon="inline-start" stroke={1.75} />}
          {t("human.send")}
        </Button>

        {(threads.isLoading && (signedIn || threads.fetchStatus !== "idle")) ? (
          <Skeleton className="h-20 rounded-card" />
        ) : (
          list.length > 0 && (
            <section className="flex flex-col gap-3 border-t pt-5" aria-labelledby="threads-title">
              <SectionTitle id="threads-title">{t("human.threads")}</SectionTitle>
              <ThreadList threads={list} onOpen={(id) => navigate(`/mentor/help/${id}`)} />
            </section>
          )
        )}
      </div>
    </>
  )
}
