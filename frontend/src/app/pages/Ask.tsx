/**
 * KNW-01 Ask: a chat that answers only from approved sources.
 * - The AI is always disclosed (rules.md §1.2) and «أريد إنسانًا» is always
 *   reachable (top bar).
 * - CMP-01 R1: opened from a lesson's or a review's help button, it carries
 *   the lesson's topic alone (ask/lessonHelp.ts) and a human request made
 *   from here says it came from the lesson or the review.
 * - Answers end with source strips; Quran and hadith words come from the
 *   database; no source → ReferralCard; danger → DangerHelpPanel only.
 * - KNW-10 R3: "What should I learn now?" is answered by the learning guide
 *   from the on-device summary, never from Sharia sources.
 * - KNW-10 R5: the learner's consent switch (off by default) lets an
 *   answered question nudge their learning; only the objective id is used.
 * - Offline: asking is disabled with a clear note; nothing is queued. The
 *   typed question stays as a draft in the Ask store until the owner sends
 *   it online (PLT-15 R5); saved answers are one tap away.
 * - KNW-01 reliability R1/R6: typed questions and suggestions go through
 *   one `submitQuestion` (a suggestion has a stable id and sends its shown
 *   text); the draft is cleared only once the store accepted it; a retry
 *   updates the same message and never touches a new draft.
 */
import * as React from "react"
import { useLocation, useNavigate } from "react-router"
import { IconWifiOff } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { AiDisclosure, AskComposer, HumanHelpButton, SpotIllustration, TopBar } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { useContent } from "@/app/learning/useContent"
import { buildSummary, fixedMessage, nextHref, requestGuide } from "@/app/ask/guide"
import { ErrorTurn, GuideTurn, HelpOriginContext, PendingTurn, QuestionTurn, ResponseTurn, humanUrl } from "@/app/ask/parts"
import { readLessonHelp } from "@/app/ask/lessonHelp"
import { QUESTION_MAX, useAsk } from "@/app/ask/store"
import type { AskResponse, Entrypoint } from "@/app/ask/types"
import { SUGGESTIONS } from "@/app/ask/suggestions"
import { PrivacyLink } from "@/app/pages/Privacy"
import { QuickCheck } from "@/app/ask/QuickCheck"

function useOnline() {
  const [online, setOnline] = React.useState(() => (typeof navigator === "undefined" ? true : navigator.onLine))
  React.useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])
  return online
}

export default function Ask() {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const online = useOnline()
  const { turns, busy, submitQuestion, retry, put } = useAsk()
  const consent = useDevice((s) => s.askConsent)
  const setDevice = useDevice((s) => s.set)
  const markSeen = useLearning((s) => s.markSeen)
  const { lessons } = useContent()
  const draft = useAsk((s) => s.draft)
  const setDraft = useAsk((s) => s.setDraft)
  const [notice, setNotice] = React.useState<"tooLong" | null>(null)
  const endRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [turns.length, turns[turns.length - 1]])

  const answerGuide = React.useCallback(
    async (turnId: string) => {
      const summary = buildSummary(locale, lessons, useLearning.getState())
      let ai: string | null = null
      try {
        ai = await requestGuide(summary) // bounded (10 s); null on any failure
      } catch {
        ai = null
      }
      const text = ai ?? fixedMessage(summary, lessons, t)
      put(turnId, { id: turnId, role: "assistant", state: "guide", text, nextHref: nextHref(summary), ai: !!ai })
    },
    [locale, lessons, t, put],
  )

  const onAnswer = React.useCallback(
    (r: AskResponse | null) => {
      if (!r) return
      // LRN-10 R5 on the device: the asked objective becomes "seen" (consent only, set by the server).
      if (r.objective_id) markSeen([r.objective_id])
      if (r.outcome === "learning_guide") {
        const turn = useAsk.getState().turns.find((x) => x.role === "assistant" && x.state === "done" && x.response.ask_id === r.ask_id)
        if (turn) void answerGuide(turn.id)
      }
    },
    [answerGuide, markSeen],
  )

  const submit = (text: string, entrypoint: Entrypoint, suggestionId?: string) => {
    if (!online) return
    const res = submitQuestion({ text, lang: locale, entrypoint, suggestionId })
    if (!res.accepted) {
      if (res.reason === "too_long") setNotice("tooLong")
      return
    }
    setNotice(null)
    if (entrypoint === "typed") setDraft("") // only once the store took it
    void res.done.then(onAnswer)
  }

  const retryTurn = (turnId: string) => {
    if (!online) return
    const res = retry(turnId)
    if (res.accepted) void res.done.then(onAnswer)
  }

  // CMP-06 R2 ex2: a question its owner sent from the private notebook arrives
  // once, through the route state (never the URL), as an ordinary question.
  const location = useLocation()
  const lessonHelp = readLessonHelp(location.state) // CMP-01 R1: topic and origin only
  const origin = lessonHelp?.from ?? "ask"
  const handedOver = React.useRef(false)
  React.useEffect(() => {
    const q = (location.state as { notebookQuestion?: unknown } | null)?.notebookQuestion
    if (handedOver.current || typeof q !== "string") return
    handedOver.current = true
    navigate(".", { replace: true, state: null })
    if (online && !busy) submit(q, "typed")
    else setDraft(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  /** Put the question back for editing, without overwriting a new draft. */
  const editQuestion = (question: string) => setDraft((d) => (d.trim() ? d : question))

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <TopBar
        className="sticky top-0"
        title={<span className="font-heading text-h3">{t("ask.title")}</span>}
        end={<HumanHelpButton label={t("ask.human")} onClick={() => navigate(humanUrl(origin))} />}
      />

      <div className="flex flex-1 flex-col gap-5 px-4 pt-4 pb-4">
        <AiDisclosure>{t("ask.disclosure")}</AiDisclosure>
        {lessonHelp?.topic && (
          <div data-slot="lesson-topic" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-secondary px-4 py-3 text-secondary-foreground">
            <p className="min-w-0 flex-1 text-label">{t(`ask.${lessonHelp.from}.from`, { name: lessonHelp.topic })}</p>
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              {t(`ask.${lessonHelp.from}.back`)}
            </Button>
          </div>
        )}
        {turns.length === 0 && <PrivacyLink className="-mt-2" />}{/* PLT-05 R1: the question leaves the device for the AI */}

        {turns.length === 0 ? (
          <section className="flex flex-1 flex-col items-center gap-4 py-6 text-center">
            <SpotIllustration kind="companion" size={104} />
            <p className="max-w-sm text-body text-muted-foreground">{t("ask.empty")}</p>
            <div className="flex w-full flex-col items-stretch gap-2">
              <p className="text-start text-label font-medium text-muted-foreground">{t("ask.suggest.title")}</p>
              {SUGGESTIONS.map((sg) => (
                <Button
                  key={sg.id}
                  data-suggestion-id={sg.id}
                  variant="outline"
                  className="h-auto min-h-11 justify-start rounded-md py-2.5 text-start whitespace-normal"
                  disabled={!online || busy}
                  onClick={() => submit(t(sg.key), "suggestion", sg.id)}
                >
                  {t(sg.key)}
                </Button>
              ))}
            </div>
            <div className="mt-2 flex w-full items-start justify-between gap-3 rounded-md bg-secondary px-4 py-3 text-start text-secondary-foreground">
              <Label htmlFor="ask-consent" className="flex flex-col items-start gap-0.5">
                <span className="text-label">{t("ask.consent")}</span>
                <span className="text-caption font-normal text-muted-foreground">{t("ask.consentHint")}</span>
              </Label>
              <Switch id="ask-consent" checked={consent} onCheckedChange={(v) => setDevice({ askConsent: v })} />
            </div>
          </section>
        ) : (
          <div className="flex flex-col gap-5" aria-live="polite">
            <HelpOriginContext.Provider value={origin}>
            {turns.map((turn) => {
              if (turn.role === "user") return <QuestionTurn key={turn.id} text={turn.text} />
              if (turn.state === "pending") return <PendingTurn key={turn.id} />
              if (turn.state === "error")
                return (
                  <ErrorTurn
                    key={turn.id}
                    code={turn.code}
                    retryAfter={turn.retryAfter}
                    onRetry={() => retryTurn(turn.id)}
                    onEdit={() => editQuestion(turn.snapshot.question)}
                  />
                )
              if (turn.state === "guide") return <GuideTurn key={turn.id} text={turn.text} nextHref={turn.nextHref} ai={turn.ai} />
              if (turn.response.outcome === "learning_guide") return <PendingTurn key={turn.id} />
              const response = (
                <ResponseTurn
                  key={turn.id}
                  response={turn.response}
                  onRetry={() => retryTurn(turn.id)}
                  onEdit={() => editQuestion(turn.snapshot.question)}
                />
              )
              // LRN-10 R5: with consent, an answer tagged to an objective brings one quick exercise on it.
              if (!turn.response.objective_id) return response
              return (
                <React.Fragment key={turn.id}>
                  {response}
                  <QuickCheck askId={turn.response.ask_id} objectiveId={turn.response.objective_id} />
                </React.Fragment>
              )
            })}
            </HelpOriginContext.Provider>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 z-10 flex flex-col gap-2 bg-background/90 px-3 pt-2 pb-3 backdrop-blur">
        {notice === "tooLong" && (
          <p role="alert" className="px-2 text-label text-destructive">
            {t("ask.tooLong")}
          </p>
        )}
        {!online && (
          <div role="status" className="flex flex-wrap items-center gap-x-2 px-2 text-label text-muted-foreground">
            <IconWifiOff className="size-4 shrink-0" stroke={1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1">{t("ask.offline")}</span>
            {/* PLT-15 R5: saved answers stay readable offline */}
            <Button variant="link" size="sm" className="px-0" onClick={() => navigate("/discover/saved")}>
              {t("home.org.openSaved")}
            </Button>
          </div>
        )}
        <AskComposer
          placeholder={t("ask.placeholder")}
          value={draft}
          onChange={(v) => {
            setDraft(v)
            if (notice && v.trim().length <= QUESTION_MAX) setNotice(null)
          }}
          onSend={() => submit(draft, "typed")}
          disabled={!online || busy || draft.trim().length < 2}
          labels={{ input: t("ask.input"), send: t("ask.send") }}
        />
      </div>
    </div>
  )
}
