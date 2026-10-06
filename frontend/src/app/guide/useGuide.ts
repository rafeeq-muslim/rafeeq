/**
 * PLT-08: binds the pure suggestion rules to the learner's local progress.
 */
import * as React from "react"

import { useNow, useRamadan } from "@/app/practice/api"
import { ymdKey } from "@/app/practice/times"
import { useLearning } from "@/app/stores/learning"
import { useMotivation } from "@/app/stores/motivation"
import { useGuide } from "./store"
import { localDay, suggestion, usedKeys, type GuideContext } from "./suggest"

export function useGuideContext(): GuideContext {
  const completed = useLearning((s) => s.completed)
  const days = useMotivation((s) => s.days)
  const now = useNow(60_000)
  const { state } = useRamadan(now)
  const today = localDay(now)
  return React.useMemo(
    () => ({
      completed,
      learningDays: days.length,
      ramadan:
        state.kind === "ramadan"
          ? { kind: "ramadan", start: ymdKey(state.start) }
          : { kind: "upcoming", start: ymdKey(state.start), daysLeft: state.daysLeft },
      today,
    }),
    [completed, days.length, state, today],
  )
}

/** The Home suggestion, remembered as shown for today (R3). */
export function useSuggestion() {
  const ctx = useGuideContext()
  const dismissed = useGuide((s) => s.dismissed)
  const used = useGuide((s) => s.used)
  const lastShown = useGuide((s) => s.lastShown)
  const markShown = useGuide((s) => s.markShown)
  const dismiss = useGuide((s) => s.dismiss)
  const current = suggestion(ctx, { dismissed, used, lastShown })

  const key = current?.key
  React.useEffect(() => {
    if (key) markShown(key, ctx.today)
  }, [key, ctx.today, markShown])

  return { current, dismiss: () => current && dismiss(current.key, ctx.today) }
}

/** Opening a feature anywhere ends its suggestion (R3). */
export function useGuideTracker(pathname: string) {
  const ctx = useGuideContext()
  const markUsed = useGuide((s) => s.markUsed)
  React.useEffect(() => {
    const keys = usedKeys(pathname, ctx)
    if (keys.length) markUsed(keys)
  }, [pathname, ctx, markUsed])
}
