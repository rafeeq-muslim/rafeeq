/**
 * PLT-05 R3 / PLT-06 R6: the service worker shows push notifications while
 * Rafeeq is closed, so it cannot read the device store. The page mirrors the
 * discreet-mode switch into Cache Storage (same origin, on this device only;
 * nothing is sent to the server), and the worker reads it on each push to
 * pick a neutral icon instead of the Rafeeq flower.
 *
 * Dependency-free: imported by both the app and src/sw.ts.
 */

export const PREF_CACHE = "rafeeq-prefs"
export const DISCREET_PREF = "/__rafeeq-prefs/discreet"

/** The icon and status-bar badge a notification uses. */
export const RAFEEQ_LOOK = { icon: "/brand/rafeeq-app-icon-180.png", badge: "/brand/favicon-48.png" } as const
/** A plain note sheet: no word, no religious symbol, no flower. */
export const NEUTRAL_LOOK = { icon: "/brand/neutral-note-192.png", badge: "/brand/neutral-note-badge-96.png" } as const

export function notificationLook(discreet: boolean): { icon: string; badge: string } {
  return discreet ? NEUTRAL_LOOK : RAFEEQ_LOOK
}

type Caches = Pick<CacheStorage, "open">

const storage = (): Caches | undefined => (typeof caches === "undefined" ? undefined : caches)

/** Page side: keep the worker's copy in step with the switch. Never throws. */
export async function saveDiscreet(on: boolean, store: Caches | undefined = storage()): Promise<void> {
  if (!store) return
  try {
    const cache = await store.open(PREF_CACHE)
    if (on) await cache.put(DISCREET_PREF, new Response("1"))
    else await cache.delete(DISCREET_PREF)
  } catch {
    /* storage blocked: the worker keeps its last known look */
  }
}

/** Worker side: is discreet mode on? Unknown means off (the Rafeeq look). */
export async function readDiscreet(store: Caches | undefined = storage()): Promise<boolean> {
  if (!store) return false
  try {
    const cache = await store.open(PREF_CACHE)
    return Boolean(await cache.match(DISCREET_PREF))
  } catch {
    return false
  }
}
