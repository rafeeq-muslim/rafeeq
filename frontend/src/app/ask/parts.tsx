/**
 * Pieces of the Ask thread (KNW-01). Rules they carry:
 * - Quran and hadith words come only from `sources` (stored records by id);
 *   the model's text is labelled as Rafeeq's wording (rules.md §1.3).
 * - Every answer ends with source strips; no source → ReferralCard.
 * - Danger → DangerHelpPanel only, no AI text; the verified helplines are
 *   bundled (CMP, research/08), never an invented number.
 * - KNW-01 reliability R4/R6: "not enough in the sources", "could not
 *   verify" and "could not complete now" are different messages; only a
 *   retryable failure offers a retry; an unknown outcome is a safe failure;
 *   the waiting text does not pretend to report real stages.
 * - R8: one source card per reference (all passage ids stay for markers).
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconBookmark, IconBookmarkFilled, IconExternalLink, IconRefresh, IconSparkles } from "@tabler/icons-react"

import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Message, MessageContent } from "@/components/ui/message"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { AssistantMessage, DangerHelpPanel, HumanHelpButton, ReferralCard, UserMessage } from "@/components/rafeeq"
import { num, useT } from "@/app/i18n"
import { suraName } from "@/app/lesson/suras"
import { groupSources, isHadith, isQuran, liveSummary, segments, sourceLabel } from "./answer"
import { useSaveAnswer } from "./saved"
import { Helplines } from "@/app/companion/Helplines"
import type { AskResponse, ErrorCode, LiveSearchEntry, SourceCard } from "./types"

/**
 * CMP hand-off (Companion's /mentor/help). Only the random ask id travels,
 * never the question text. CMP-01 R1: when the assistant was opened from a
 * lesson or a review, the request says it came from there («درس» / «مراجعة»),
 * with no lesson name and none of the answers.
 */
export type HelpOrigin = "ask" | "lesson" | "review"
export const HelpOriginContext = React.createContext<HelpOrigin>("ask")
export const humanUrl = (from: HelpOrigin) => `/mentor/help?from=${from}`
const helpUrl = (kind: "urgent" | "escalation", askId: string, from: HelpOrigin) =>
  `/mentor/help?kind=${kind}&from=${from}&ask=${encodeURIComponent(askId)}`

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
      {source.quote_text ? (
        <p dir="auto" className="mt-2 font-reading text-body whitespace-pre-line text-foreground/90">
          {source.quote_text}
        </p>
      ) : (
        source.live && <p className="mt-2 text-caption text-muted-foreground">{t("ask.live.savedNote")}</p>
      )}
      {source.live && <LiveSourceMeta source={source} />}
    </details>
  )
}

const DATE_TAG: Record<string, string> = { ar: "ar-u-nu-latn", en: "en-US", tl: "fil-PH" }

/** PRD live v3 §8: a live record says when it was read and links to its page; never "updated now". */
function LiveSourceMeta({ source }: { source: SourceCard }) {
  const { t, locale } = useT()
  const at = source.retrieved_at ? new Date(source.retrieved_at) : null
  const when =
    at && !Number.isNaN(at.getTime())
      ? new Intl.DateTimeFormat(DATE_TAG[locale] ?? "en-US", { dateStyle: "medium", timeStyle: "short" }).format(at)
      : null
  return (
    <div className="mt-2 flex flex-col items-start gap-1">
      {when && <p className="text-caption text-muted-foreground">{t("ask.live.fetchedAt", { d: when })}</p>}
      <Button asChild variant="ghost" size="xs" className="-ms-2">
        <a href={source.origin_url} target="_blank" rel="noopener noreferrer">
          <IconExternalLink data-icon="inline-start" stroke={1.75} />
          {t("ask.live.openSource")}
        </a>
      </Button>
    </div>
  )
}

/** PRD live v3 §10: one line from the attempt's real events only (no timer, no guess). */
export function LiveSearchNote({ entries }: { entries: LiveSearchEntry[] | undefined }) {
  const { t, locale } = useT()
  const { searched, unreachable } = liveSummary(entries)
  if (!searched.length && !unreachable.length) return null
  const names = (ids: string[]) => ids.map((id) => sourceLabel({ source_id: id, source_name: id }, locale)).join(locale === "ar" ? "، " : ", ")
  return (
    <div className="flex flex-col gap-0.5 ps-2 text-caption text-muted-foreground" data-testid="live-search-note">
      {searched.length > 0 && <p>{t("ask.live.searched", { names: names(searched) })}</p>}
      {unreachable.length > 0 && <p>{t("ask.live.unreachable", { names: names(unreachable) })}</p>}
    </div>
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

/**
 * Rafeeq's wording with the stored scripture in place of every marker, then
 * the source strips. Also shows a saved answer (KNW-09 R2), whose `sources`
 * are fetched again by id, never kept with the answer.
 */
export function AnswerMessage({
  answer,
  sources,
  footer,
  children,
}: {
  answer: string
  sources: SourceCard[]
  footer?: React.ReactNode
  children?: React.ReactNode
}) {
  const { t, locale } = useT()
  const refLabel = useRefLabel()
  const segs = segments(answer, sources)
  const groups = groupSources(sources)
  const strips = groups.map((g) => `${sourceLabel(g.first, locale)} — ${refLabel(g.first)}`)
  return (
    <AssistantMessage sources={strips} sourceLinks={groups.map((g) => g.first.origin_url)} sourceLabel={t("ask.source")} footer={footer}>
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
      {children}
    </AssistantMessage>
  )
}

export function AnswerTurn({ response }: { response: AskResponse }) {
  const { t } = useT()
  const navigate = useNavigate()
  const from = React.useContext(HelpOriginContext)
  return (
    <div className="flex flex-col gap-3">
      <AnswerMessage answer={response.answer} sources={response.sources} footer={<SaveAnswer response={response} />}>
        {response.notes.map((n, i) => (
          <p key={`n${i}`} dir="auto" className="text-body font-medium text-secondary-foreground">
            {n}
          </p>
        ))}
      </AnswerMessage>
      <LiveSearchNote entries={response.live_search} />
      {response.route === "personal" && (
        <ReferralCard
          title={t("ask.personal.title")}
          description={t("ask.personal.body")}
          question={t("ask.needHuman")}
          actionLabel={t("ask.human")}
          onRefer={() => navigate(helpUrl("escalation", response.ask_id, from))}
        />
      )}
      {response.route === "sensitive" && (
        <div className="flex flex-col items-start gap-2 ps-2">
          <p className="text-label text-muted-foreground">{t("ask.sensitive.body")}</p>
          <HumanHelpButton label={t("ask.human")} onClick={() => navigate(helpUrl("escalation", response.ask_id, from))} />
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
  live,
}: {
  kind: "noSource" | "verificationFailed" | "unavailable"
  askId: string
  onRetry?: () => void
  onEdit?: () => void
  live?: LiveSearchEntry[]
}) {
  const { t } = useT()
  const navigate = useNavigate()
  const from = React.useContext(HelpOriginContext)
  if (kind !== "noSource") {
    // KNW-01 answer rate: a failed check or a technical failure is not a
    // reason to hand the question to a person. Retry (or edit) comes first;
    // the person stays one quiet tap away (and in the top bar). Only danger
    // leads with a person.
    return (
      <Message align="start">
        <MessageContent>
          <Bubble variant="outline" align="start" className="max-w-[92%]">
            <BubbleContent className="flex flex-col gap-2">
              <p dir="auto" className="text-label font-medium">
                {t(`ask.${kind}.title`)}
              </p>
              <p dir="auto" className="text-body text-muted-foreground">
                {t(`ask.fail.${kind}.body`)}
              </p>
              <LiveSearchNote entries={live} />
              <div className="flex flex-wrap items-center gap-2">
                {onRetry && (
                  <Button size="sm" onClick={onRetry}>
                    <IconRefresh data-icon="inline-start" stroke={1.75} />
                    {t("common.retry")}
                  </Button>
                )}
                {onEdit && (
                  <Button variant={onRetry ? "ghost" : "outline"} size="sm" onClick={onEdit}>
                    {t("ask.editQuestion")}
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate(helpUrl("escalation", askId, from))}>
                  {t("ask.human")}
                </Button>
              </div>
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }
  // CMP-01 R1: no sourced answer → the assistant asks «تحتاج إنسانًا؟» and one tap opens the request.
  return (
    <div className="flex flex-col gap-2">
      <ReferralCard
        title={t(`ask.${kind}.title`)}
        description={t(`ask.${kind}.body`)}
        question={t("ask.needHuman")}
        actionLabel={t("ask.human")}
        onRefer={() => navigate(helpUrl("escalation", askId, from))}
      />
      <LiveSearchNote entries={live} />
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
  const from = React.useContext(HelpOriginContext)
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
          onPrimary={() => navigate(helpUrl("urgent", response.ask_id, from))}
        >
          <Helplines />
        </DangerHelpPanel>
      )
    case "no_source":
      return <FailureCard kind="noSource" askId={response.ask_id} onEdit={onEdit} live={response.live_search} />
    case "verification_failed":
      // No automatic retry loop (R4): the user may retry (a new composition), rephrase or ask a person.
      return (
        <FailureCard kind="verificationFailed" askId={response.ask_id} onRetry={response.retryable ? onRetry : undefined} onEdit={onEdit} />
      )
    case "unavailable":
      return (
        <FailureCard
          kind="unavailable"
          askId={response.ask_id}
          onRetry={response.retryable ? onRetry : undefined}
          live={response.live_search}
        />
      )
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
