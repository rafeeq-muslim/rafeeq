/**
 * Pieces of the Ask thread (KNW-01). Rules they carry:
 * - Quran and hadith words come only from `sources` (stored records by id);
 *   the model's text is labelled as Rafeeq's wording (rules.md §1.3).
 * - Every answer ends with source strips; no source → ReferralCard.
 * - Danger → DangerHelpPanel only, no AI text, no invented numbers.
 * - KNW-01 reliability R4/R6: "not enough in the sources", "could not
 *   verify" and "could not complete now" are different messages; only a
 *   retryable failure offers a retry; an unknown outcome is a safe failure;
 *   the waiting text does not pretend to report real stages.
 * - R8: one source card per reference (all passage ids stay for markers).
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconBookmark, IconBookmarkFilled, IconRefresh, IconSparkles } from "@tabler/icons-react"

import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Message, MessageContent } from "@/components/ui/message"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { AssistantMessage, DangerHelpPanel, HumanHelpButton, ReferralCard, UserMessage } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { suraName } from "@/app/lesson/suras"
import { groupSources, isHadith, isQuran, segments, sourceLabel } from "./answer"
import { useSaveAnswer } from "./saved"
import type { AskResponse, ErrorCode, SourceCard } from "./types"

/** CMP hand-off (Companion's /mentor/help). Only the random ask id travels, never the question text. */
export const HELP_HUMAN = "/mentor/help?from=ask"
const helpUrl = (kind: "urgent" | "escalation", askId: string) => `/mentor/help?kind=${kind}&from=ask&ask=${encodeURIComponent(askId)}`

/** Names of the stored translations and tafsir (source titles, not UI copy). */
const TRANSLATION_NAME: Record<string, string> = {
  english_saheeh: "Saheeh International",
  english_rwwad: "Rowwad Translation Center",
  tagalog_rwwad: "Rowwad Translation Center",
  arabic_moyassar: "التفسير الميسر",
  arabic_mokhtasar: "المختصر في التفسير",
}

function useRefLabel() {
  const { t, locale } = useT()
  return (s: SourceCard): string => {
    if (isQuran(s) && s.ref.sura && s.ref.aya) {
      const ayah = t("ask.ref.ayah", { s: suraName(s.ref.sura, locale), a: num(s.ref.aya) })
      return s.translation ? `${ayah} · ${TRANSLATION_NAME[s.translation] ?? s.translation}` : ayah
    }
    if (isHadith(s) && s.ref.hadith_id) {
      return [t("ask.ref.hadith", { n: String(s.ref.hadith_id) }), s.grade].filter(Boolean).join(" · ")
    }
    return s.title ? `${s.title} (${s.ref_key})` : s.ref_key
  }
}

/** Quran or hadith text from the database, framed apart from the explanation. */
export function ScriptureQuote({ source }: { source: SourceCard }) {
  const { t, locale } = useT()
  const refLabel = useRefLabel()(source)
  const [open, setOpen] = React.useState(false)
  const long = source.quote_text.length > 420
  if (isQuran(source)) {
    const arabic = source.kind === "quran_arabic" ? source.quote_text : source.arabic_text
    const meaning = source.kind === "quran_arabic" ? null : source.quote_text
    return (
      <figure className="rounded-card bg-secondary/60 px-4 py-4 text-secondary-foreground">
        {arabic && (
          <blockquote lang="ar" dir="rtl" className="text-center font-quran text-[1.5rem] leading-[2.4] text-foreground">
            {arabic} {source.ref.aya && <span className="whitespace-nowrap text-primary">﴿{num(source.ref.aya)}﴾</span>}
          </blockquote>
        )}
        {meaning && (
          <div className={arabic ? "mt-3 border-t border-primary/15 pt-3" : undefined}>
            <p className="mb-1 text-caption font-medium text-muted-foreground">
              {t(source.kind === "quran_tafsir" ? "ask.quote.tafsir" : "ask.quote.translation")}
            </p>
            <p dir="auto" className="font-reading text-reading text-foreground/90">
              {meaning}
            </p>
          </div>
        )}
        <figcaption className="mt-3 text-caption font-medium text-secondary-foreground">
          {t("ask.quote.quran")} · {refLabel}
        </figcaption>
      </figure>
    )
  }
  if (isHadith(source)) {
    return (
      <figure className="rounded-card bg-secondary/60 px-4 py-4 text-secondary-foreground">
        <blockquote
          dir="auto"
          lang={source.lang}
          className={cn("font-reading text-reading text-foreground", long && !open && "line-clamp-6")}
        >
          {source.quote_text}
        </blockquote>
        {long && (
          <Button variant="ghost" size="xs" className="-ms-2 mt-1" aria-expanded={open} onClick={() => setOpen(!open)}>
            {t(open ? "ask.less" : "ask.more")}
          </Button>
        )}
        {source.arabic_text && locale !== "ar" && (!long || open) && (
          <p lang="ar" dir="rtl" className="mt-3 border-t border-primary/15 pt-3 font-reading text-body text-foreground/80">
            {source.arabic_text}
          </p>
        )}
        <figcaption className="mt-3 flex flex-wrap gap-x-2 text-caption text-secondary-foreground">
          <span className="font-medium">
            {t("ask.quote.hadith")} · {refLabel}
          </span>
          {source.attribution && <bdi>{source.attribution}</bdi>}
        </figcaption>
      </figure>
    )
  }
  // Fatwa or book section: the source's own text, folded to keep the thread readable.
  return (
    <details className="rounded-card bg-secondary/60 px-4 py-3 text-secondary-foreground">
      <summary className="cursor-pointer text-label font-medium">{refLabel}</summary>
      <p dir="auto" className="mt-2 font-reading text-body whitespace-pre-line text-foreground/90">
        {source.quote_text}
      </p>
    </details>
  )
}

function SaveAnswer({ response }: { response: AskResponse }) {
  const { t } = useT()
  const { saved, toggle } = useSaveAnswer(response)
  return (
    <Button variant="ghost" size="xs" aria-pressed={saved} onClick={toggle}>
      {saved ? <IconBookmarkFilled data-icon="inline-start" /> : <IconBookmark data-icon="inline-start" stroke={1.75} />}
      {saved ? t("ask.saved") : t("ask.save")}
    </Button>
  )
}

export function AnswerTurn({ response }: { response: AskResponse }) {
  const { t, locale } = useT()
  const navigate = useNavigate()
  const refLabel = useRefLabel()
  const segs = segments(response.answer, response.sources)
  const groups = groupSources(response.sources)
  const strips = groups.map((g) => `${sourceLabel(g.first, locale)} — ${refLabel(g.first)}`)
  return (
    <div className="flex flex-col gap-3">
      <AssistantMessage
        sources={strips}
        sourceLinks={groups.map((g) => g.first.origin_url)}
        sourceLabel={t("ask.source")}
        footer={<SaveAnswer response={response} />}
      >
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <IconSparkles className="size-4 shrink-0" stroke={1.75} aria-hidden="true" />
          {t("ask.wording")}
        </p>
        {segs.map((s, i) =>
          s.type === "text" ? (
            <p key={i} dir="auto" className="text-body whitespace-pre-line">
              {s.text}
            </p>
          ) : (
            <ScriptureQuote key={i} source={s.source} />
          ),
        )}
        {response.notes.map((n, i) => (
          <p key={`n${i}`} dir="auto" className="text-body font-medium text-secondary-foreground">
            {n}
          </p>
        ))}
      </AssistantMessage>
      {response.route === "personal" && (
        <ReferralCard
          title={t("ask.personal.title")}
          description={t("ask.personal.body")}
          actionLabel={t("ask.human")}
          onRefer={() => navigate(helpUrl("escalation", response.ask_id))}
        />
      )}
      {response.route === "sensitive" && (
        <div className="flex flex-col items-start gap-2 ps-2">
          <p className="text-label text-muted-foreground">{t("ask.sensitive.body")}</p>
          <HumanHelpButton label={t("ask.human")} onClick={() => navigate(helpUrl("escalation", response.ask_id))} />
        </div>
      )}
    </div>
  )
}

/** Fixed replies that carry no Sharia statement (refusal, out of scope). */
export function PlainTurn({ text }: { text: string }) {
  return (
    <Message align="start">
      <MessageContent>
        <Bubble variant="outline" align="start" className="max-w-[92%]">
          <BubbleContent dir="auto" className="text-body">
            {text}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

function FailureCard({
  kind,
  askId,
  onRetry,
  onEdit,
}: {
  kind: "noSource" | "verificationFailed" | "unavailable"
  askId: string
  onRetry?: () => void
  onEdit?: () => void
}) {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-2">
      <ReferralCard
        title={t(`ask.${kind}.title`)}
        description={t(`ask.${kind}.body`)}
        actionLabel={t("ask.human")}
        onRefer={() => navigate(helpUrl("escalation", askId))}
      />
      {(onRetry || onEdit) && (
        <div className="flex flex-wrap gap-2 ps-2">
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <IconRefresh data-icon="inline-start" stroke={1.75} />
              {t("common.retry")}
            </Button>
          )}
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              {t("ask.editQuestion")}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function ResponseTurn({ response, onRetry, onEdit }: { response: AskResponse; onRetry?: () => void; onEdit?: () => void }) {
  const { t } = useT()
  const navigate = useNavigate()
  switch (response.outcome) {
    case "answered":
    case "cached":
      return <AnswerTurn response={response} />
    case "danger":
      return (
        <DangerHelpPanel
          title={t("ask.danger.title")}
          description={t("ask.danger.body")}
          primaryLabel={t("ask.danger.primary")}
          secondaryLabel={t("ask.danger.secondary")}
          onPrimary={() => navigate(helpUrl("urgent", response.ask_id))}
          onSecondary={() => navigate(helpUrl("urgent", response.ask_id))}
        />
      )
    case "no_source":
      return <FailureCard kind="noSource" askId={response.ask_id} onEdit={onEdit} />
    case "verification_failed":
      // No automatic retry loop (R4): rephrase or ask a person.
      return <FailureCard kind="verificationFailed" askId={response.ask_id} onEdit={onEdit} />
    case "unavailable":
      return <FailureCard kind="unavailable" askId={response.ask_id} onRetry={response.retryable ? onRetry : undefined} />
    case "refused":
    case "out_of_scope":
      return <PlainTurn text={response.answer} />
    default:
      // An outcome this build does not know: a safe failure, never its text.
      return <FailureCard kind="unavailable" askId={response.ask_id} />
  }
}

/** One honest waiting message: the server does not report stages (R6). */
export function PendingTurn() {
  const { t } = useT()
  return (
    <Message align="start">
      <MessageContent>
        <Bubble variant="outline" align="start">
          <BubbleContent className="flex items-center gap-2 text-label text-muted-foreground" role="status" aria-live="polite">
            <Spinner className="size-4" />
            {t("ask.waiting")}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

const ERROR_TEXT = {
  network: "ask.error.network",
  timeout: "ask.error.timeout",
  cancelled: "ask.error.cancelled",
  rate_limited: "ask.tooMany",
  invalid: "ask.error.invalid",
  server: "ask.error.server",
  invalid_response: "ask.error.invalidResponse",
} as const

export function ErrorTurn({
  code,
  retryAfter,
  onRetry,
  onEdit,
}: {
  code: ErrorCode
  retryAfter?: number | null
  onRetry: () => void
  onEdit?: () => void
}) {
  const { t } = useT()
  const text = code === "rate_limited" && retryAfter ? t("ask.tooManyWait", { s: String(retryAfter) }) : t(ERROR_TEXT[code] ?? "common.error")
  return (
    <Message align="start">
      <MessageContent>
        <Bubble variant="muted" align="start" className="max-w-[92%]">
          <BubbleContent className="flex flex-col items-start gap-2 text-body" role="status">
            {text}
            {code === "invalid" ? (
              onEdit && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  {t("ask.editQuestion")}
                </Button>
              )
            ) : (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <IconRefresh data-icon="inline-start" stroke={1.75} />
                {t("common.retry")}
              </Button>
            )}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

export function GuideTurn({ text, nextHref, ai }: { text: string; nextHref: string | null; ai: boolean }) {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <Message align="start">
      <MessageContent>
        <Bubble variant="tinted" align="start" className="max-w-[92%]">
          <BubbleContent className="flex flex-col items-start gap-2">
            <span className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
              {ai && <IconSparkles className="size-4" stroke={1.75} aria-hidden="true" />}
              {t("ask.guide.title")}
            </span>
            <p dir="auto" className="text-body">
              {text}
            </p>
            {nextHref && (
              <Button size="sm" onClick={() => navigate(nextHref)}>
                {t("ask.guide.go")}
              </Button>
            )}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

export function QuestionTurn({ text }: { text: string }) {
  return <UserMessage>{text}</UserMessage>
}
