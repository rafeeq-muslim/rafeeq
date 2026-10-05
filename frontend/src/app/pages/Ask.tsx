/**
 * KNW-01 Ask: a chat that answers only from approved sources.
 * - The AI is always disclosed (rules.md §1.2) and «أريد إنسانًا» is always
 *   reachable (top bar).
 * - Answers end with source strips; Quran and hadith words come from the
 *   database; no source → ReferralCard; danger → DangerHelpPanel only.
 * - KNW-10 R3: "What should I learn now?" is answered by the learning guide
 *   from the on-device summary, never from Sharia sources.
 * - KNW-10 R5: the learner's consent switch (off by default) lets an
 *   answered question nudge their learning; only the objective id is used.
 * - Offline: asking is disabled with a clear note; nothing is queued.
 */
import * as React from "react"
import { useNavigate } from "react-router"
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
import { ErrorTurn, GuideTurn, HELP_ESCALATION, PendingTurn, QuestionTurn, ResponseTurn } from "@/app/ask/parts"
import { useAsk } from "@/app/ask/store"
import type { AskResponse } from "@/app/ask/types"

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
  const { turns, busy, ask, put } = useAsk()
  const consent = useDevice((s) => s.askConsent)
  const setDevice = useDevice((s) => s.set)
  const markSeen = useLearning((s) => s.markSeen)
  const { lessons } = useContent()
  const [draft, setDraft] = React.useState("")
  const endRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [turns.length, turns[turns.length - 1]])

  const answerGuide = React.useCallback(
    async (turnId: string) => {
      const summary = buildSummary(locale, lessons, useLearning.getState())
      const ai = await requestGuide(summary)
      const text = ai ?? fixedMessage(summary, lessons, t, locale === "ar" ? "، " : ", ")
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

  const send = async (text = draft) => {
    if (!online || busy || text.trim().length < 2) return
    setDraft("")
    onAnswer(await ask(text, locale))
  }

  const suggestions = [t("ask.whatNext"), t("ask.suggest.1"), t("ask.suggest.2"), t("ask.suggest.3")]

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <TopBar
        className="sticky top-0"
        title={<span className="font-heading text-h3">{t("ask.title")}</span>}
        end={<HumanHelpButton label={t("ask.human")} onClick={() => navigate(HELP_ESCALATION)} />}
      />

      <div className="flex flex-1 flex-col gap-5 px-4 pt-4 pb-4">
        <AiDisclosure>{t("ask.disclosure")}</AiDisclosure>

        {turns.length === 0 ? (
          <section className="flex flex-1 flex-col items-center gap-4 py-6 text-center">
            <SpotIllustration kind="companion" size={104} />
            <p className="max-w-sm text-body text-muted-foreground">{t("ask.empty")}</p>
            <div className="flex w-full flex-col items-stretch gap-2">
              <p className="text-start text-label font-medium text-muted-foreground">{t("ask.suggest.title")}</p>
              {suggestions.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  className="h-auto min-h-11 justify-start rounded-md py-2.5 text-start whitespace-normal"
                  disabled={!online || busy}
                  onClick={() => void send(s)}
                >
                  {s}
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
            {turns.map((turn) => {
              if (turn.role === "user") return <QuestionTurn key={turn.id} text={turn.text} />
              if (turn.state === "pending") return <PendingTurn key={turn.id} startedAt={turn.startedAt} />
              if (turn.state === "error")
                return <ErrorTurn key={turn.id} code={turn.code} onRetry={() => void send(turn.question)} />
              if (turn.state === "guide") return <GuideTurn key={turn.id} text={turn.text} nextHref={turn.nextHref} ai={turn.ai} />
              if (turn.response.outcome === "learning_guide") return <PendingTurn key={turn.id} startedAt={Date.now()} />
              return <ResponseTurn key={turn.id} response={turn.response} />
            })}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 z-10 flex flex-col gap-2 bg-background/90 px-3 pt-2 pb-3 backdrop-blur">
        {!online && (
          <p role="status" className="flex items-center gap-2 px-2 text-label text-muted-foreground">
            <IconWifiOff className="size-4 shrink-0" stroke={1.75} aria-hidden="true" />
            {t("ask.offline")}
          </p>
        )}
        <AskComposer
          placeholder={t("ask.placeholder")}
          value={draft}
          onChange={setDraft}
          onSend={() => void send()}
          disabled={!online || busy || draft.trim().length < 2}
          labels={{ input: t("ask.input"), send: t("ask.send") }}
        />
      </div>
    </div>
  )
}
