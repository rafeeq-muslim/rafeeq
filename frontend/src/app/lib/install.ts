/**
 * PLT-16 installing Rafeeq on the device: pure rules, decided on the device.
 *
 * - R1: installed = opened standalone, or the browser said so (`appinstalled`).
 * - R2: the way to install fits the device and browser; the browser's own
 *   install window opens only from `promptInstall()`, which is called from a
 *   tap and nowhere else.
 * - R3, R4: when the quiet Home card may show. The two numbers the product
 *   owner proposed live here and only here.
 * - R6: nothing in this file talks to the network.
 */
import { isIOS } from "@/app/lib/push"

/** R4: days the card stays away after a day it was shown and left untouched. */
export const INSTALL_GAP_DAYS = 14
/** R4: the card shows on at most this many days, ever. */
export const INSTALL_MAX_SHOWINGS = 3
/** R3: without a completed lesson, the card waits for this many distinct visit days. */
export const INSTALL_VISIT_DAYS = 3

// --- R2: the way to install, by device and browser ---------------------------------

export type OpenIn = "safari" | "chrome" | "chromeEdge"
export type InstallWay =
  | { mode: "prompt" } // Chromium: the browser's install window, from a tap
  | { mode: "ios-share" } // Safari on iPhone/iPad: Share, then Add to Home Screen
  | { mode: "mac-dock" } // Safari 17+ on a Mac: File, then Add to Dock
  /** inApp: inside another app; unsupported: this browser installs no web apps; iosOther: on iOS, installing is Safari's. */
  | { mode: "other-browser"; reason: "inApp" | "unsupported" | "iosOther"; open: OpenIn }
export type InstallMode = InstallWay["mode"]

export type InstallEnv = { userAgent: string; platform: string; maxTouchPoints: number }

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|Snapchat|musical_ly|TikTok|Twitter|LinkedInApp|GSA\/|; wv\)/
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Brave/
const CHROMIUM = /(Chrome|Chromium|Edg|SamsungBrowser)\//
export const MAC_SAFARI_WITH_DOCK = 17

export function currentInstallEnv(): InstallEnv {
  const nav = typeof navigator !== "undefined" ? navigator : undefined
  return { userAgent: nav?.userAgent ?? "", platform: nav?.platform ?? "", maxTouchPoints: nav?.maxTouchPoints ?? 0 }
}

export function installWay(env: InstallEnv = currentInstallEnv()): InstallWay {
  const ua = env.userAgent
  const ios = isIOS(env)
  const android = /Android/.test(ua)
  const elsewhere: OpenIn = ios ? "safari" : android ? "chrome" : "chromeEdge"
  if (IN_APP.test(ua)) return { mode: "other-browser", reason: "inApp", open: elsewhere }
  if (ios) {
    if (IOS_OTHER_BROWSER.test(ua)) return { mode: "other-browser", reason: "iosOther", open: "safari" }
    // Safari itself names its version; a page opened inside another app does not.
    return /Version\/[\d.]+.*Safari\//.test(ua) ? { mode: "ios-share" } : { mode: "other-browser", reason: "inApp", open: "safari" }
  }
  if (CHROMIUM.test(ua) && !/Firefox\//.test(ua)) return { mode: "prompt" }
  const safari = /Macintosh/.test(ua) && /Safari\//.test(ua) ? /Version\/(\d+)/.exec(ua) : null
  if (safari && Number(safari[1]) >= MAC_SAFARI_WITH_DOCK) return { mode: "mac-dock" }
  return { mode: "other-browser", reason: "unsupported", open: elsewhere }
}

/** R3 «المتصفح يستطيع التثبيت»: for Chromium only once the browser offered it. */
export function canInstallHere(way: InstallWay, promptReady: boolean): boolean {
  return way.mode === "ios-share" || way.mode === "mac-dock" || (way.mode === "prompt" && promptReady)
}

// --- R1: installed ------------------------------------------------------------------

type StandaloneWindow = { matchMedia?: (q: string) => { matches: boolean }; navigator?: object }

/** Opened from its own icon (standalone display mode; iOS reports it on navigator). */
export function isStandalone(win: StandaloneWindow | undefined = typeof window !== "undefined" ? (window as StandaloneWindow) : undefined): boolean {
  if (!win) return false
  return win.matchMedia?.("(display-mode: standalone)").matches === true || (win.navigator as { standalone?: boolean } | undefined)?.standalone === true
}

// --- R2: the browser's install window, kept for a tap ------------------------------------

type PromptEvent = Event & { prompt: () => Promise<unknown>; userChoice?: Promise<{ outcome?: string }> }

let saved: PromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export const promptReady = () => saved != null
export function subscribePrompt(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

type Watched = Pick<Window, "addEventListener" | "removeEventListener">

/**
 * Registered once at app start. `beforeinstallprompt` is kept (and the
 * browser's own mini-bar prevented), never shown from here (R2 ex4).
 * `available` means the browser offers installing, so Rafeeq is not
 * installed in it; `installed` means it just was.
 */
export function watchInstall(target: Watched, on: { available?: () => void; installed?: () => void } = {}): () => void {
  const onPrompt = (e: Event) => {
    e.preventDefault()
    saved = e as PromptEvent
    notify()
    on.available?.()
  }
  const onInstalled = () => {
    saved = null
    notify()
    on.installed?.()
  }
  target.addEventListener("beforeinstallprompt", onPrompt)
  target.addEventListener("appinstalled", onInstalled)
  return () => {
    target.removeEventListener("beforeinstallprompt", onPrompt)
    target.removeEventListener("appinstalled", onInstalled)
    saved = null
    notify()
  }
}

export type PromptOutcome = "accepted" | "dismissed" | "unavailable"

/** R2: call ONLY from the learner's tap. The kept event works once. */
export async function promptInstall(): Promise<PromptOutcome> {
  const e = saved
  if (!e) return "unavailable"
  saved = null
  notify()
  try {
    await e.prompt()
    return (await e.userChoice)?.outcome === "accepted" ? "accepted" : "dismissed"
  } catch {
    return "unavailable"
  }
}

// --- R3, R4: when the Home card may show ---------------------------------------------

/** Whole days from one device day (YYYY-MM-DD) to another. */
export function daysBetween(from: string, to: string): number {
  const utc = (d: string) => {
    const [y, m, day] = d.split("-").map(Number)
    return Date.UTC(y, m - 1, day)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

/**
 * R4: a showing is one device day the card was on Home. On that day it stays
 * (PLT-09 R5); afterwards it is away for 14 days, and after three showings
 * for good.
 */
export function cadenceAllows(shownDays: string[], today: string): boolean {
  const last = shownDays[shownDays.length - 1]
  if (!last) return true
  if (last === today) return true
  return shownDays.length < INSTALL_MAX_SHOWINGS && daysBetween(last, today) >= INSTALL_GAP_DAYS
}

export type CardContext = {
  /** Installed now or at any time before from this browser (R4: it never returns). */
  installed: boolean
  way: InstallWay
  promptReady: boolean
  firstLessonDone: boolean
  /** Distinct device days Rafeeq was opened on. */
  visitDays: number
  /** Hidden with one tap (PLT-09 R6). */
  dismissed: boolean
  shownDays: string[]
  today: string
}

/** R3: all four together. */
export function installCardEligible(c: CardContext): boolean {
  if (c.installed || c.dismissed) return false
  if (!canInstallHere(c.way, c.promptReady)) return false
  if (!c.firstLessonDone && c.visitDays < INSTALL_VISIT_DAYS) return false
  return cadenceAllows(c.shownDays, c.today)
}
