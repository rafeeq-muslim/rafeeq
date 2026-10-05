/**
 * MOT-06 learning log: the device tells the server, for a signed-in group
 * member only, which learning interactions happened (lesson completions,
 * repeats included; unit badges; learning days, review days included), so
 * the group challenge can count them. Worship never reaches these stores.
 *
 * It listens to the learning and motivation stores (the on-device
 * "LessonCompleted" of complete.ts) instead of changing Learning's code.
 * Entries are queued offline and deduplicated by the server, so a sync that
 * replays another device's completion is harmless.
 */
import { api } from "@/app/lib/api"
import { useAuth } from "@/app/stores/auth"
import { useLearning } from "@/app/stores/learning"
import { useMotivation } from "@/app/stores/motivation"
import { localDay } from "@/app/motivation/streak"
import { useCompanion } from "./store"

export type LogEntry = { kind: "lesson" | "unit" | "day"; item_id: string; at?: string; day?: string; is_repeat?: boolean }

type Completed = Record<string, { first: string; last: string; times: number }>
type Badges = Record<string, { id: string; earnedAt: string }>

const QUEUE_KEY = "rafeeq.learningLog"

/** New entries between two snapshots of the device stores (pure, tested). */
export function diffEntries(
  prev: { completed: Completed; badges: Badges; days: string[] },
  next: { completed: Completed; badges: Badges; days: string[] },
): LogEntry[] {
  const out: LogEntry[] = []
  for (const [id, c] of Object.entries(next.completed)) {
    const before = prev.completed[id]
    if (!before || c.times > before.times)
      out.push({ kind: "lesson", item_id: id, at: c.last, day: localDay(new Date(c.last)), is_repeat: c.times > 1 })
  }
  for (const [id, b] of Object.entries(next.badges)) {
    if (id.startsWith("unit-") && !prev.badges[id]) out.push({ kind: "unit", item_id: id.slice(5), at: b.earnedAt })
  }
  const had = new Set(prev.days)
  for (const d of next.days) if (!had.has(d)) out.push({ kind: "day", item_id: d })
  return out
}

function readQueue(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]")
  } catch {
    return []
  }
}

function writeQueue(q: LogEntry[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-500)))
  } catch {
    /* storage blocked */
  }
}

let flushing = false
export async function flushLearningLog() {
  if (flushing || !useAuth.getState().token || !useCompanion.getState().inGroup) return
  if (typeof navigator !== "undefined" && !navigator.onLine) return
  const q = readQueue()
  if (q.length === 0) return
  flushing = true
  try {
    await api("/api/me/learning-log", { method: "POST", body: { entries: q.slice(0, 500) } })
    writeQueue(readQueue().slice(q.length))
  } catch {
    /* kept for the next change or when back online */
  } finally {
    flushing = false
  }
}

function enqueue(entries: LogEntry[]) {
  if (entries.length === 0 || !useAuth.getState().token || !useCompanion.getState().inGroup) return
  writeQueue([...readQueue(), ...entries])
  void flushLearningLog()
}

let started = false
export function startLearningLog() {
  if (started || typeof window === "undefined") return
  started = true
  const snap = () => ({
    completed: useLearning.getState().completed as Completed,
    badges: useMotivation.getState().badges as Badges,
    days: useMotivation.getState().days,
  })
  let last = snap()
  const onChange = () => {
    const next = snap()
    // Rehydration from storage is not new learning.
    if (useLearning.persist?.hasHydrated?.() && useMotivation.persist?.hasHydrated?.()) enqueue(diffEntries(last, next))
    last = next
  }
  useLearning.subscribe(onChange)
  useMotivation.subscribe(onChange)
  window.addEventListener("online", () => void flushLearningLog())
}

startLearningLog()
