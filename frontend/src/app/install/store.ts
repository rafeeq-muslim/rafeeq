/**
 * PLT-16 R4, R6: what this device remembers about installing Rafeeq. Kept
 * here only (key `rafeeq.install`, so «امسح بيانات هذا الجهاز» clears it);
 * never sent, and never part of what the home-ordering model reads.
 * Hiding the Home card is PLT-09's own memory (home/store.ts `hidden`).
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

import { INSTALL_MAX_SHOWINGS, INSTALL_VISIT_DAYS, isStandalone, watchInstall } from "@/app/lib/install"
import { localDay } from "@/app/guide/suggest"

export type InstallMemory = {
  /** R1: the browser said Rafeeq was installed, or it was opened installed from this browser. */
  installed: boolean
  /** R4: installed at least once from here; the Home card never returns, even after an uninstall. */
  installedOnce: boolean
  /** R4: the device days the Home card was shown on (at most three). */
  shownDays: string[]
  /** R3: the first distinct device days Rafeeq was opened on (only three are needed). */
  visitDays: string[]
}

type InstallState = InstallMemory & {
  markInstalled: () => void
  /** The browser offers installing again: Rafeeq is not installed in it (anymore). */
  markAvailable: () => void
  recordShown: (day: string) => void
  recordVisit: (day: string) => void
}

export const useInstall = create<InstallState>()(
  persist(
    (set) => ({
      installed: false,
      installedOnce: false,
      shownDays: [],
      visitDays: [],
      markInstalled: () => set((s) => (s.installed && s.installedOnce ? s : { installed: true, installedOnce: true })),
      markAvailable: () => set((s) => (s.installed ? { installed: false } : s)),
      recordShown: (day) => set((s) => (s.shownDays.includes(day) || s.shownDays.length >= INSTALL_MAX_SHOWINGS ? s : { shownDays: [...s.shownDays, day] })),
      recordVisit: (day) => set((s) => (s.visitDays.includes(day) || s.visitDays.length >= INSTALL_VISIT_DAYS ? s : { visitDays: [...s.visitDays, day] })),
    }),
    { name: "rafeeq.install", version: 1 },
  ),
)

/**
 * Called once from main.tsx, before the first render, so the browser's
 * install offer is never missed (R2). It only listens and remembers; the
 * browser's window opens from a tap alone.
 */
export function startInstall(win: Window = window): () => void {
  const s = useInstall.getState()
  if (isStandalone(win)) s.markInstalled()
  s.recordVisit(localDay(new Date()))
  return watchInstall(win, { available: () => useInstall.getState().markAvailable(), installed: () => useInstall.getState().markInstalled() })
}
