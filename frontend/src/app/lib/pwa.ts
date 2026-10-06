/**
 * Registers the service worker (production builds only) and keeps open pages
 * on the current version (issue #9 item 11: after a deploy an open page or a
 * home-screen app kept running old code until a manual reload).
 *
 * The worker activates new versions at once (skipWaiting in sw.ts). Here:
 * - check for a new version when the app becomes visible again, and hourly;
 * - when the new version takes over, reload quietly unless the learner is in
 *   a lesson, review or placement (LRN-03 R5: never interrupt one); there an
 *   update bar offers it, and the reload happens as soon as they leave;
 * - the same wait applies while a screen holds something a reload would cut
 *   (`holdUpdateWhile`: the Ask conversation, KNW-01 R7).
 */
import * as React from "react"

import { stripBase } from "@/app/lib/base"

const LEARNING_FLOW = [/^\/learn\/lesson\//, /^\/learn\/review/, /^\/learn\/placement/]
const HOUR = 60 * 60 * 1000
export const SW_URL = "/sw.js"
export const SW_SCOPE = "/"

export const inLearningFlow = (path = stripBase(location.pathname)) => LEARNING_FLOW.some((r) => r.test(path))

/** Reasons, other than a learning flow, to keep the page as it is for now. */
const holds = new Set<(path: string) => boolean>()
export function holdUpdateWhile(hold: (path: string) => boolean) {
  holds.add(hold)
  return () => void holds.delete(hold)
}
/** True while an automatic reload would interrupt the learner at `path`. */
export function updateMustWait(path = stripBase(location.pathname)): boolean {
  if (inLearningFlow(path)) return true
  for (const hold of holds) if (hold(path)) return true
  return false
}

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
  if (!updateReady) return
  if (updateMustWait(path)) notify() // the update bar offers it meanwhile
  else reloadWhenOnline()
}

// PLT-15 R6: an update never reloads the app by itself while offline; it
// waits for the connection (the learner may still tap «حدّث الآن»).
let waitingForOnline = false
function reloadWhenOnline() {
  if (typeof navigator === "undefined" || navigator.onLine) return applyUpdate()
  notify() // the update bar offers it meanwhile
  if (waitingForOnline) return
  waitingForOnline = true
  window.addEventListener(
    "online",
    () => {
      waitingForOnline = false
      maybeApplyUpdate(stripBase(location.pathname))
    },
    { once: true },
  )
}

/** A newer version took over this page. */
export function onNewVersion(path = stripBase(location.pathname)) {
  if (updateReady) return
  updateReady = true
  if (updateMustWait(path)) notify()
  else reloadWhenOnline()
}

export function registerServiceWorker() {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return
  const hadController = !!navigator.serviceWorker.controller // first install: nothing to replace

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) onNewVersion()
  })

  window.addEventListener("load", () => {
    // PLT-13 R6: one worker, /sw.js with scope "/", wherever the app's pages live, so push subscriptions survive moves.
    void navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).then((reg) => {
      // PLT-13 R4: Safari never reports a changed subscription; check on every opening and return.
      const renewPush = () => void import("./push").then((m) => m.syncPushSwitches()).catch(() => undefined)
      const check = () => void reg.update().catch(() => undefined)
      renewPush()
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return
        check()
        renewPush()
      })
      setInterval(check, HOUR)
    })
  })
}
