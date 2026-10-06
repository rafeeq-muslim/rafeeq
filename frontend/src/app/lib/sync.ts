/** PLT-02: an account keeps a copy of progress. The device stays the
 * source of truth while offline; each sync merges both sides on the server
 * (union of lessons, latest answer per objective, larger set of learning
 * days) and the device takes the merged result. Guests never call this. */
import { ApiError, api } from "@/app/lib/api"
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

const offline = () => typeof navigator !== "undefined" && !navigator.onLine

/** PLT-05 R7: how saving to the account went. Waiting helps only for
 * "offline" and "unreachable"; "rejected" is the server refusing the data. */
export type SaveResult = "ok" | "offline" | "unreachable" | "rejected"

export function saveFailure(e: unknown): SaveResult {
  const s = e instanceof ApiError ? e.status : 0
  return s >= 400 && s < 500 && s !== 408 && s !== 429 ? "rejected" : "unreachable"
}

/** One merge with the account copy. */
async function pushAndMerge(): Promise<SaveResult> {
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
      // LRN-04 R2: seenExercises is in the account copy too (a union of both
      // sides), so "prefer an unseen exercise" holds on every device.
      mastery: Object.fromEntries(Object.entries(l.mastery).map(([k, v]) => [k, noNulls(v) as ObjectiveState])),
    })
    M.replaceAll({ days: m.days, badges: m.badges })
    return "ok"
  } catch (e) {
    return saveFailure(e) /* next change or sign-in retries */
  }
}

export async function syncNow(): Promise<void> {
  if (!useAuth.getState().token || offline()) return
  running ??= pushAndMerge().then(() => {
    running = null
  })
  return running
}

/** PLT-05 R7: progress kept on this device that the account would hold
 * (lessons, mastery, learning days, badges). There is no "dirty" mark: any of
 * it counts as possibly unsaved until a merge succeeds. */
export function hasLocalProgress(): boolean {
  const L = useLearning.getState()
  const M = useMotivation.getState()
  return (
    Object.keys(L.completed).length > 0 ||
    L.unlockedUnits.length > 0 ||
    Object.keys(L.mastery).length > 0 ||
    M.days.length > 0 ||
    Object.keys(M.badges).length > 0
  )
}

/** PLT-05 R7: save this device's progress to the account before signing out. */
export async function flushProgress(): Promise<SaveResult> {
  if (!useAuth.getState().token) return "rejected"
  if (offline()) return "offline"
  if (running) await running
  return pushAndMerge()
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
