/**
 * PLT-04 appearance. Light is the default; dark only when the learner picks
 * it in «حسابي». The device's own light/dark setting is not followed. Night
 * moments (welcome, celebrations, the Home sky) stay night in both, through
 * their own `dark` class. public/theme.js applies a saved choice before the
 * first paint.
 */
import type { Theme } from "@/app/stores/device"

/** Browser bar colour of each theme: its background (mist / ink). */
export const BAR_COLOR: Record<Theme, string> = { light: "#f7f6fb", dark: "#1d1645" }

export function setBarColor(color: string) {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = color
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  setBarColor(BAR_COLOR[theme])
  if (root.classList.contains("dark") === (theme === "dark")) return
  // Switch in one frame: colour transitions would pass through unreadable
  // mixes (light text on a still-white card) on the way.
  const pause = document.createElement("style")
  pause.textContent = "*,*::before,*::after{transition:none!important}"
  document.head.append(pause)
  root.classList.toggle("dark", theme === "dark")
  void getComputedStyle(root).color // apply the new colours before transitions return
  requestAnimationFrame(() => pause.remove())
}
