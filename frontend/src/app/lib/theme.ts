/**
 * PLT-04 appearance. Light is the default; dark when the learner picks it in
 * «حسابي», or the device's own setting when they pick «حسب الجهاز» ("system").
 * Night moments (welcome, celebrations, the Home sky) stay night in all
 * three, through their own `dark` class. public/theme.js applies a saved
 * choice before the first paint.
 */
import type { Theme } from "@/app/stores/device"

/** The two looks a choice resolves to. */
export type Mode = "light" | "dark"

/** Browser bar colour of each mode: its background (mist / ink). */
export const BAR_COLOR: Record<Mode, string> = { light: "#f7f6fb", dark: "#1d1645" }

const DEVICE_DARK = "(prefers-color-scheme: dark)"

/** The look a choice gives now ("system" asks the device). */
export function resolveTheme(theme: Theme): Mode {
  if (theme === "system") return typeof window.matchMedia === "function" && window.matchMedia(DEVICE_DARK).matches ? "dark" : "light"
  return theme === "dark" ? "dark" : "light"
}

export function setBarColor(color: string) {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = color
}

/** Set the look on <html> now: the `dark` class, color-scheme and bar colour. */
export function applyTheme(theme: Theme) {
  const mode = resolveTheme(theme)
  const root = document.documentElement
  setBarColor(BAR_COLOR[mode])
  const scheme = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  if (scheme) scheme.content = mode
  if (root.classList.contains("dark") === (mode === "dark")) return
  // Switch in one frame: colour transitions would pass through unreadable
  // mixes (light text on a still-white card) on the way.
  const pause = document.createElement("style")
  pause.textContent = "*,*::before,*::after{transition:none!important}"
  document.head.append(pause)
  root.classList.toggle("dark", mode === "dark")
  void getComputedStyle(root).color // apply the new colours before transitions return
  requestAnimationFrame(() => pause.remove())
}

/** Apply a choice and, for "system", keep following the device while it
 * changes. Returns the cleanup for a React effect. */
export function followTheme(theme: Theme): () => void {
  applyTheme(theme)
  if (theme !== "system" || typeof window.matchMedia !== "function") return () => {}
  const media = window.matchMedia(DEVICE_DARK)
  const onChange = () => applyTheme("system")
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}
