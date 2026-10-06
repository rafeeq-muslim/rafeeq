/** PLT-15: the device's connection as the browser reports it (navigator.onLine
 * with the online/offline events). One store for every screen. */
import * as React from "react"

export const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine)

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

export function useOnline(): boolean {
  return React.useSyncExternalStore(subscribe, isOnline, () => true)
}

/** Runs `fn` now if online, otherwise once the connection is back. */
export function whenOnline(fn: () => void): void {
  if (isOnline()) return fn()
  window.addEventListener("online", () => fn(), { once: true })
}

/** A query with nothing to show because the network is not there: failed, or
 * paused by React Query's offline mode (which otherwise renders nothing). */
export const unreachable = (q: { data?: unknown; isError: boolean; fetchStatus: string }) =>
  q.data === undefined && (q.isError || q.fetchStatus === "paused")
