/**
 * LRN-07 R1: after each lesson, unit and review session, one guide message
 * of at most three short sentences (about 25 words) about that lesson or
 * session only: what was mastered, what needs review, and the next step with
 * its reason. R4: the fixed message from the same summary is
 * shown at once (offline or outage included); the checked AI wording
 * replaces it when it arrives. R2: it suggests, never forces. R5: no missed
 * days, no worship, no comparison. MOT-09 R5: "followed" means the learner
 * opened the suggested step within 24 hours.
 */
import * as React from "react"
import { IconSparkles } from "@tabler/icons-react"

import { useT } from "@/app/i18n"
import { isolateArabic } from "@/app/i18n/bidi"
import { sendEvent } from "@/app/lib/api"
import { useLearning } from "@/app/stores/learning"
import { buildSummary, fixedMessage, nextHref, requestGuide } from "@/app/ask/guide"
import type { Lesson } from "./types"

const KEY = "rafeeq.guideSuggestion"
const DAY = 86_400_000

export function GuideNote({ lessons, objectives, returning = false }: { lessons: Lesson[]; objectives: string[]; returning?: boolean }) {
  const { t, locale } = useT()
  const progress = useLearning()
  const [summary] = React.useState(() => buildSummary(locale, lessons, progress, new Date(), objectives))
  const fixed = fixedMessage(summary, lessons, t)
  const [text, setText] = React.useState<string | null>(null)

  React.useEffect(() => {
    let live = true
    void requestGuide({ ...summary, returning }).then((r) => live && r && setText(r))
    sendEvent({ type: "guide_shown" })
    const href = nextHref(summary)
    try {
      if (href) localStorage.setItem(KEY, JSON.stringify({ href, at: Date.now() }))
    } catch {
      /* storage blocked */
    }
    return () => {
      live = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!summary.mastered.length && !summary.reviewing.length && !summary.next) return null
  return (
    <p className="mt-5 flex max-w-sm items-start gap-2 rounded-card bg-white/8 px-4 py-3 text-start text-label text-white/85" aria-live="polite">
      <IconSparkles className="mt-0.5 size-4 shrink-0 text-apricot" stroke={1.75} aria-hidden="true" />
      <span>{text && locale !== "ar" ? isolateArabic(text) : (text ?? fixed)}</span>
    </p>
  )
}

/** Call on a lesson or review page: counts the guide as followed (MOT-09 R5). */
export function noteGuideFollowed(path: string) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as { href: string; at: number } | null
    if (s && s.href === path && Date.now() - s.at < DAY) {
      sendEvent({ type: "guide_followed" })
      localStorage.removeItem(KEY)
    }
  } catch {
    /* storage blocked */
  }
}
