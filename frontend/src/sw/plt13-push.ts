/// <reference lib="webworker" />
/**
 * PLT-13 R2 (with PLT-06 R3/R6): the worker's push handler. Every push that
 * reaches the device shows a notification with a non-empty title, because
 * Apple drops the subscription of a web app that receives pushes it does not
 * show. A missing or broken payload gets the neutral reminder text («لحظة لك»)
 * in the device's language; the server's texts are already neutral. In
 * discreet mode the icon is the plain note (lib/discreetPref.ts).
 */
import { PREF_CACHE, notificationLook, readDiscreet } from "../app/lib/discreetPref"

/** MOT-05 R3 neutral reminder text: the same words the server sends. */
export const FALLBACK_TEXT = {
  ar: { title: "لحظة لك", body: "لديك درس قصير جاهز متى شئت" },
  en: { title: "A moment for you", body: "A short lesson is ready whenever you are" },
  tl: { title: "Sandali para sa iyo", body: "May maikling aralin na handa kapag gusto mo" },
} as const
export type PushLocale = keyof typeof FALLBACK_TEXT

/** The page mirrors its language here (like the discreet switch) so the worker can read it while Rafeeq is closed. */
export const LOCALE_PREF = "/__rafeeq-prefs/locale"

type Caches = Pick<CacheStorage, "open">
const storage = (): Caches | undefined => (typeof caches === "undefined" ? undefined : caches)

const asLocale = (v: string | null | undefined): PushLocale | null => {
  const l = (v ?? "").slice(0, 2).toLowerCase()
  if (l === "fi") return "tl" // fil-PH
  return l in FALLBACK_TEXT ? (l as PushLocale) : null
}

/** Page side. Never throws. */
export async function saveLocale(locale: string, store: Caches | undefined = storage()): Promise<void> {
  if (!store) return
  try {
    await (await store.open(PREF_CACHE)).put(LOCALE_PREF, new Response(locale))
  } catch {
    /* storage blocked: the worker falls back to the device language */
  }
}

/** Worker side: the app's language, else the device's, else Arabic. */
export async function readLocale(store: Caches | undefined = storage(), deviceLang = typeof navigator !== "undefined" ? navigator.language : ""): Promise<PushLocale> {
  try {
    const saved = store && (await (await store.open(PREF_CACHE)).match(LOCALE_PREF))
    const l = saved && asLocale(await saved.text())
    if (l) return l
  } catch {
    /* fall through */
  }
  return asLocale(deviceLang) ?? "ar"
}

type Payload = { title?: unknown; body?: unknown; url?: unknown; tag?: unknown }

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : "")
/** Only an in-app path of this origin may be opened (never another site). */
const inAppPath = (v: unknown) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : undefined)

/** What to show for a push: never an empty notification. */
export function notificationFor(raw: Payload | null, locale: PushLocale): { title: string; body: string; url?: string; tag: string } {
  const fallback = FALLBACK_TEXT[locale]
  const title = text(raw?.title)
  const body = text(raw?.body)
  return {
    // PLT-06 R3: a reply shows its title only («لديك رد جديد»); a payload with
    // no text at all gets the whole neutral reminder text.
    title: title || fallback.title,
    body: title ? body : body || fallback.body,
    url: inAppPath(raw?.url), // undefined: the click handler's default (sw.ts)
    tag: text(raw?.tag) || "rafeeq",
  }
}

function parse(data: PushMessageData | null | undefined): Payload | null {
  try {
    const v = data?.json()
    return v && typeof v === "object" ? (v as Payload) : null
  } catch {
    return null // broken payload: neutral text, never the raw bytes
  }
}

export function registerPushHandler(sw: ServiceWorkerGlobalScope) {
  sw.addEventListener("push", (event) => {
    const raw = parse(event.data)
    event.waitUntil(
      Promise.all([readDiscreet(), readLocale()]).then(([discreet, locale]) => {
        const n = notificationFor(raw, locale)
        // PLT-05 R3 / PLT-06 R6: in discreet mode a plain note icon, not the flower.
        return sw.registration.showNotification(n.title, { body: n.body, ...notificationLook(discreet), tag: n.tag, data: { url: n.url } })
      }),
    )
  })
}
