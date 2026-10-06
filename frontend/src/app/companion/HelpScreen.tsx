/**
 * CMP-01 «أريد إنسانًا» — /mentor/help?from=lesson|review|ask|home|mentor
 * [&kind=urgent|escalation][&ask=<ask_id>].
 *
 * Only what the person writes is sent, with where they came from; the
 * question asked of the assistant is attached only if they choose (R1). No
 * account needed (R2). Someone of their own gender replies: an account uses
 * its gender, a guest is asked «أخ أم أخت؟» once and the device remembers
 * (R3). Topics include non-religious needs (R4). Contact details are refused
 * with the reason (R5).
 *
 * `kind=urgent` (a danger case from the assistant, KNW-01 R5; companion
 * README) creates the urgent request at once, with no question text, shows
 * the verified helplines, and opens it.
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
import { useAsk } from "@/app/ask/store"
import type { Turn } from "@/app/ask/types"
import { Checkbox } from "@/components/ui/checkbox"
import { TOPICS, type Gender, type Source, type ThreadSummary, type Topic, createRequest, useMyRequests } from "./api"
import { useSendError } from "./Chat"
import { ago } from "./format"
import { Helplines } from "./Helplines"
import { ScreenBar, SectionTitle } from "./Screen"
import { PrivacyLink } from "@/app/pages/Privacy"
import { useCompanion } from "./store"

/** R1 ex2: the assistant question of this ask id, if it is still on this device (never fetched). */
export function questionOf(turns: Turn[], askId: string | null): string | null {
  if (!askId) return null
  for (const turn of turns) {
    if (turn.role === "assistant" && turn.state === "done" && turn.response.ask_id === askId) return turn.snapshot.question
  }
  return null
}

/** R1 ex2: the question travels only when the person chose to attach it, inside their own message. */
export function composeHelpBody(body: string, attached: string | null, label: string): string {
  const own = body.trim()
  if (!attached) return own
  const quoted = `${label}\n${attached.trim()}`
  return own ? `${quoted}\n\n${own}` : quoted
}

const SOURCES: Source[] = ["lesson", "review", "ask", "home", "mentor"]

/** Shown first on every urgent conversation: what to do if in danger now,
 * with the verified helplines bundled in the app (companion README fixed
 * rule, research/08). Never a number we have not verified. */
export function UrgentNotice() {
  const { t } = useT()
  return (
    <div className="flex flex-col gap-4" data-slot="urgent-notice">
      <Alert variant="destructive" role="alert">
        <IconLifebuoy stroke={1.75} />
        <AlertTitle>{t("human.danger.title")}</AlertTitle>
        <AlertDescription>{t("human.danger.body")}</AlertDescription>
      </Alert>
      <Helplines />
    </div>
  )
}

/** R3 ex3: nobody of this gender is free in this language now; the request waits for one. */
export function awaitingText(t: ReturnType<typeof useT>["t"], gender: Gender | null) {
  return t(gender === "f" ? "cmp.help.awaitingSister" : "cmp.help.awaitingBrother")
}

function statusBadge(t: ReturnType<typeof useT>["t"], s: ThreadSummary) {
  if (s.unread > 0) return <Badge variant="info">{t("cmp.help.newReply")}</Badge>
  if (s.awaiting_same_gender) return <Badge variant="warning">{t(s.gender === "f" ? "cmp.help.waitingSister" : "cmp.help.waitingBrother")}</Badge>
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
    <div className="flex flex-col gap-5 px-4 pt-4 pb-4">
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
  const accountGender = useAuth((s) => (s.me?.gender === "m" || s.me?.gender === "f" ? s.me.gender : null))
  const deviceGender = useCompanion((s) => s.helpGender)
  const knownGender: Gender | null = accountGender ?? deviceGender
  const askId = params.get("ask")
  const askQuestion = useAsk((s) => (source === "ask" ? questionOf(s.turns, askId) : null))

  const [topic, setTopic] = React.useState<Topic | "">("")
  const [gender, setGender] = React.useState<Gender | "">("")
  const [attach, setAttach] = React.useState(false) // R1 ex2: off until the person chooses
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
    const attached = attach ? askQuestion : null
    if (!body.trim() && !attached) return setError(t("cmp.err.empty"))
    const who = knownGender ?? (gender || null)
    if (!who) return setError(t("cmp.err.gender"))
    setPending(true)
    setError(null)
    try {
      const req = await createRequest({
        kind,
        source,
        topic: topic || null,
        gender: who,
        lang: locale,
        body: composeHelpBody(body, attached, t("cmp.help.attachedLabel")),
        ask_id: source === "ask" ? askId : null,
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
        <PrivacyLink />{/* PLT-05 R1 ex2: before anything is written */}

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

          {knownGender ? (
            <p className="text-label text-muted-foreground" data-slot="reply-by">
              {t(knownGender === "f" ? "cmp.help.replyBySister" : "cmp.help.replyByBrother")}
            </p>
          ) : (
            <FieldSet data-slot="ask-gender">
              <FieldLegend variant="label" className="text-label">
                {t("cmp.help.who")}
              </FieldLegend>
              <FieldDescription className="text-label">{t("cmp.help.whoWhy")}</FieldDescription>
              <ToggleGroup
                type="single"
                variant="outline"
                value={gender}
                onValueChange={(v) => setGender(v as Gender | "")}
                aria-label={t("cmp.help.who")}
                className="flex-wrap"
              >
                <ToggleGroupItem value="m">{t("cmp.help.brother")}</ToggleGroupItem>
                <ToggleGroupItem value="f">{t("cmp.help.sister")}</ToggleGroupItem>
              </ToggleGroup>
            </FieldSet>
          )}

          {askQuestion && (
            <Field orientation="horizontal" data-slot="attach-question">
              <Checkbox id="attach-question" checked={attach} onCheckedChange={(v) => setAttach(v === true)} />
              <div className="flex min-w-0 flex-col gap-1">
                <FieldLabel htmlFor="attach-question" className="text-body font-normal">
                  {t("cmp.help.attach")}
                </FieldLabel>
                {attach && (
                  <p dir="auto" className="line-clamp-3 rounded-md bg-muted px-3 py-2 text-label">
                    {askQuestion}
                  </p>
                )}
              </div>
            </Field>
          )}

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
