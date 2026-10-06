/**
 * CMP-02 R5 «الإحالة إلى أهل العلم» — /referrals, the Sharia reviewer's side.
 * Mentors give no fatwa; they refer a learner's personal Sharia question
 * here. The reviewer sees the question and its language only, never who
 * asked, and answers once; the learner reads it in the same conversation,
 * signed «أهل العلم».
 */
import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { SpotIllustration } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { type Referral, referralApi, useReferrals } from "../api"
import { useSendError } from "../Chat"
import { ago, langName } from "../format"
import { ScreenBar } from "../Screen"

function ReferralCard({ item }: { item: Referral }) {
  const { t, locale } = useT()
  const qc = useQueryClient()
  const toMessage = useSendError()
  const [answer, setAnswer] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const send = async () => {
    if (!answer.trim()) return setError(t("cmp.err.empty"))
    setPending(true)
    setError(null)
    try {
      await referralApi.answer(item.id, answer.trim())
      toast.success(t("cmp.referral.answered"))
      await qc.invalidateQueries({ queryKey: ["cmp", "referrals"] })
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" lang={item.lang}>
          {langName(item.lang)}
        </Badge>
        {item.status === "answered" && <Badge variant="success">{t("cmp.referral.statusAnswered")}</Badge>}
        <span className="ms-auto text-caption text-muted-foreground tabular-nums">{ago(item.created_at, locale)}</span>
      </div>
      <blockquote dir="auto" lang={item.lang} className="border-s-4 border-border ps-3 text-body">
        {item.question}
      </blockquote>
      {item.status === "answered" ? (
        item.answer && (
          <p dir="auto" className="rounded-md bg-muted px-3 py-2 text-body">
            {item.answer}
          </p>
        )
      ) : (
        <>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor={`answer-${item.id}`}>{t("cmp.referral.answerLabel")}</FieldLabel>
            <Textarea
              id={`answer-${item.id}`}
              dir="auto"
              rows={4}
              maxLength={2000}
              value={answer}
              aria-invalid={!!error || undefined}
              onChange={(e) => setAnswer(e.target.value)}
              className="text-body"
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Button className="self-start" disabled={pending} onClick={() => void send()}>
            {t("cmp.referral.send")}
          </Button>
        </>
      )}
    </article>
  )
}

export default function Referrals() {
  const { t } = useT()
  const referrals = useReferrals(true)
  const items = referrals.data ?? []
  return (
    <>
      <ScreenBar title={t("cmp.referral.title")} back="/me" />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
        <p className="text-body text-muted-foreground">{t("cmp.referral.intro")}</p>
        {referrals.isLoading ? (
          <Skeleton className="h-40 rounded-card" />
        ) : referrals.isError ? (
          <p role="alert" className="py-10 text-center text-body text-muted-foreground">
            {t("cmp.referral.loadFailed")}
          </p>
        ) : items.length === 0 ? (
          <section className="flex flex-col items-center gap-3 py-10 text-center">
            <SpotIllustration kind="saved" size={96} />
            <p className="text-body text-muted-foreground">{t("cmp.referral.empty")}</p>
          </section>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((i) => (
              <li key={i.id}>
                <ReferralCard item={i} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
