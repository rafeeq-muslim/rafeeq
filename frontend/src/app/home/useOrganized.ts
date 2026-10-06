/**
 * PLT-09: binds the pure rules (./layout) to the device.
 *
 * - useDayOrder (R4, R5): the order is set on the first opening of the day
 *   (device date). Offline → the fixed order at once, without waiting
 *   (R4 ex3). Online → POST /api/home/order with the learning summary
 *   (LRN-07, built on the device), the time-of-day bucket and the language
 *   only; a refused, failed or slow answer → the fixed order. Then it stays
 *   until the next day.
 * - useEligibility (R3): every condition from local state; the location and
 *   anything opened or dismissed stay on the device.
 */
import * as React from "react"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/app/lib/api"
import { buildSummary } from "@/app/ask/guide"
import { useMine } from "@/app/companion/api"
import { lastSura } from "@/app/discover/player"
import { loadReciterChoice } from "@/app/discover/reciters"
import { useLibrary } from "@/app/discover/queries"
import type { LibraryItemData, RecitationResponse } from "@/app/discover/types"
import { useGuide } from "@/app/guide/store"
import { useGuideContext } from "@/app/guide/useGuide"
import type { Lesson } from "@/app/learning/types"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { checkOrder, daySlots, eligible, FIXED_ORDER, LESSON_LAST_DAY_ONE, timeBucket, visibleOptional, type Eligibility, type OptionalId, type Order } from "./layout"
import { useHome } from "./store"

export const ORDER_URL = "/api/home/order"
/** R4 ex3 spirit: a slow model never holds Home back for long. */
export const ORDER_TIMEOUT_MS = 4_000

/** The request body: the guide's learning summary + the bucket + the language. Nothing else (R4). */
export function orderBody(locale: string, lessons: Lesson[], now: Date) {
  const s = buildSummary(locale, lessons, useLearning.getState(), now)
  return { lang: s.lang, bucket: timeBucket(now), mastered: s.mastered, reviewing: s.reviewing, next: s.next }
}

/** R4, R5: the day's order, or null while the first request of the day is pending. */
export function useDayOrder(lessons: Lesson[] | null, today: string): Order | null {
  const locale = useDevice((s) => s.locale)
  const day = useHome((s) => s.day)
  const order = useHome((s) => s.order)
  const setDay = useHome((s) => s.setDay)
  const fresh = day === today && order != null
  const ready = lessons != null
  const lessonsRef = React.useRef(lessons)
  React.useEffect(() => {
    lessonsRef.current = lessons // runs before the effect below
  })

  React.useEffect(() => {
    if (fresh) return
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setDay(today, FIXED_ORDER)
      return
    }
    const list = lessonsRef.current
    if (!ready || !list) return // content still loading
    let live = true
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ORDER_TIMEOUT_MS)
    api<{ order: unknown }>(ORDER_URL, { method: "POST", body: orderBody(locale, list, new Date()), signal: ctrl.signal })
      .then((r) => checkOrder(r.order) ?? FIXED_ORDER)
      .catch(() => FIXED_ORDER)
      .then((o) => {
        if (live) setDay(today, o)
      })
      .finally(() => clearTimeout(timer))
    return () => {
      live = false
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [fresh, today, ready, locale, setDay])

  return fresh ? order : null
}

/** KNW-08 R4: the learner chose a reciter (stored on this device by discover/reciters.ts). */
const reciterChosen = () => loadReciterChoice() != null

/**
 * KNW-06: «كتاب أو مقطع معتمد يناسب وحدته». The library has no unit tags
 * yet, so the pick is the first approved item of the new-Muslim basics
 * topic in the learner's language (a decision for the PLT owner).
 */
export function libraryPick(topics: { id: string; items: LibraryItemData[] }[] | undefined): LibraryItemData | null {
  return topics?.find((t) => t.id === "basics")?.items[0] ?? null
}

export function useEligibility(): { ctx: Eligibility; library: LibraryItemData | null } {
  const completed = useLearning((s) => s.completed)
  const me = useAuth((s) => s.me)
  const saveDismissed = useDevice((s) => s.dismissedSaveSheet)
  const locale = useDevice((s) => s.locale)
  const { ramadan } = useGuideContext()
  const mine = useMine()
  const openedListening = lastSura() != null
  const recitations = useQuery({
    queryKey: ["discover-recitation", locale],
    queryFn: () => api<RecitationResponse>(`/api/discover/recitations?lang=${locale}`),
    enabled: openedListening,
    staleTime: 60 * 60_000,
  })
  const library = useLibrary(locale, Boolean(completed[LESSON_LAST_DAY_ONE]))
  const pick = libraryPick(library.data?.topics)
  // PLT-08 R3: the guide records Ramadan and «لست وحدك» openings; Home records the others.
  const used = useGuide((s) => s.used)
  const homeOpened = useHome((s) => s.opened)
  const ramadanKey = ramadan ? `ramadan-${ramadan.start.slice(0, 4)}` : null
  const opened: Eligibility["opened"] = {
    ...homeOpened,
    ...(ramadanKey && used[ramadanKey] ? { ramadan: true as const } : {}),
    ...(used.human ? { human: true as const } : {}),
  }
  return {
    ctx: {
      completed,
      signedIn: !!me,
      hasMentor: !!mine.data?.mentor,
      saveDismissed,
      ramadan: ramadan == null ? null : ramadan.kind === "ramadan" ? { kind: "ramadan" } : { kind: "upcoming", daysLeft: ramadan.daysLeft },
      openedListening,
      reciterChosen: reciterChosen(),
      recitersAvailable: Array.isArray(recitations.data?.reciters) ? recitations.data.reciters.length : 0,
      libraryPick: pick != null,
      opened,
    },
    library: pick,
  }
}

/** R1, R5, R6 and PLT-08 R3: the optional components to show now, in their places. */
export function useOptional(order: Order | null, ctx: Eligibility): OptionalId[] {
  const slots = useHome((s) => s.slots)
  const hidden = useHome((s) => s.hidden)
  const shown = useHome((s) => s.shown)
  const day = useHome((s) => s.day)
  const setSlots = useHome((s) => s.setSlots)
  const isEligible = React.useCallback((id: OptionalId) => eligible(id, ctx), [ctx])
  const next = order ? daySlots(slots, order.optional, isEligible, hidden, shown, day ?? "") : slots
  const key = next.join(",")
  React.useEffect(() => {
    if (order) setSlots(key ? (key.split(",") as OptionalId[]) : [])
  }, [order, key, setSlots])
  return order ? visibleOptional(next, isEligible, hidden) : []
}
