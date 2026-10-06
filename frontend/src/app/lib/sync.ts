/** PLT-02: an account keeps a copy of progress. The device stays the
 * source of truth while offline; each sync merges both sides on the server
 * (union of lessons, latest answer per objective, larger set of learning
 * days) and the device takes the merged result. Guests never call this. */
import { api } from "@/app/lib/api"
import { claimGuestRequests } from "@/app/companion/api"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useLearning } from "@/app/stores/learning"
import { useMotivation } from "@/app/stores/motivation"
import type { ObjectiveState } from "@/app/learning/bkt"

type LearningCopy = {
  completed: Record<string, { first: string; last: string; times: number }>
  unlockedUnits: string[]
  mastery: Record<string, Record<string, unknown>>
}
type MotivationCopy = { days: string[]; badges: Record<string, { id: string; earnedAt: string }> }

const noNulls = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null))

let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> | null = null

export async function syncNow(): Promise<void> {
  if (!useAuth.getState().token || (typeof navigator !== "undefined" && !navigator.onLine)) return
  running ??= (async () => {
    try {
      const L = useLearning.getState()
      const M = useMotivation.getState()
      const [l, m] = await Promise.all([
        api<LearningCopy>("/api/me/learning", { method: "PUT", body: { completed: L.completed, unlockedUnits: L.unlockedUnits, mastery: L.mastery } }),
        api<MotivationCopy>("/api/me/motivation", { method: "PUT", body: { days: M.days, badges: M.badges } }),
      ])
      L.replaceAll({
        completed: l.completed,
        unlockedUnits: l.unlockedUnits,
        // seenExercises lives on the device only: keep it across the merge
        mastery: Object.fromEntries(
          Object.entries(l.mastery).map(([k, v]) => [k, { ...(noNulls(v) as ObjectiveState), seenExercises: L.mastery[k]?.seenExercises }]),
        ),
      })
      M.replaceAll({ days: m.days, badges: m.badges })
    } catch {
      /* next change or sign-in retries */
    } finally {
      running = null
    }
  })()
  return running
}

/** Debounced: lessons finish in bursts of answers. */
export function scheduleSync(ms = 1500) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), ms)
}

/** After sign-in or sign-up: link this device's engagement status (MOT-07 R4),
 * move this device's guest help conversations to the account (CMP-01 R2 ex3)
 * and merge progress both ways. */
export async function onSignedIn() {
  const install_id = useDevice.getState().installId
  await api("/api/me/install", { method: "POST", body: { install_id } }).catch(() => undefined)
  await claimGuestRequests()
  await syncNow()
}
