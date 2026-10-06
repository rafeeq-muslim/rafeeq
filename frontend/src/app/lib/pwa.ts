/**
 * Registers the service worker (production builds only) and keeps open pages
 * on the current version (issue #9 item 11: after a deploy an open page or a
 * home-screen app kept running old code until a manual reload).
 *
 * The worker activates new versions at once (skipWaiting in sw.ts). Here:
 * - check for a new version when the app becomes visible again, and hourly;
 * - when the new version takes over, reload quietly unless the learner is in
 *   a lesson, review or placement (LRN-03 R5: never interrupt one); there an
 *   update bar offers it, and the reload happens as soon as they leave.
 */
import * as React from "react"

const LEARNING_FLOW = [/^\/learn\/lesson\//, /^\/learn\/review/, /^\/learn\/placement/]
const HOUR = 60 * 60 * 1000

export const inLearningFlow = (path = location.pathname) => LEARNING_FLOW.some((r) => r.test(path))

let updateReady = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** True when a newer version is active and waiting for a safe moment to reload. */
export function useUpdateReady(): boolean {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => updateReady,
    () => false,
  )
}

export function applyUpdate() {
  location.reload()
}

/** Called on every route change: a pending update applies once the learner leaves a lesson. */
export function maybeApplyUpdate(path: string) {
  if (updateReady && !inLearningFlow(path)) applyUpdate()
}

export function registerServiceWorker() {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return
  const hadController = !!navigator.serviceWorker.controller // first install: nothing to replace

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || updateReady) return
    updateReady = true
    if (inLearningFlow()) notify()
    else applyUpdate()
  })

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
      const check = () => void reg.update().catch(() => undefined)
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check())
      setInterval(check, HOUR)
    })
  })
}
