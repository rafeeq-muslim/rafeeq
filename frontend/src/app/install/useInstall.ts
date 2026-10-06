/** PLT-16: binds the pure rules (lib/install) to this device. */
import * as React from "react"

import { currentInstallEnv, installCardEligible, installWay, isStandalone, promptInstall, promptReady, subscribePrompt, type InstallWay } from "@/app/lib/install"
import { useHome } from "@/app/home/store"
import { useLearning } from "@/app/stores/learning"
import { useInstall } from "./store"

/** R2: true once the browser handed over its install window (Chromium). */
export const usePromptReady = (): boolean => React.useSyncExternalStore(subscribePrompt, promptReady, () => false)

export function useInstallWay(): InstallWay {
  return React.useMemo(() => installWay(currentInstallEnv()), [])
}

/** R1: opened installed, or this browser knows it was installed from here. */
export function useInstalled(): boolean {
  const flag = useInstall((s) => s.installed)
  return flag || isStandalone()
}

/** R2 ex1: the tap that opens the browser's install window. Only a button's onClick calls it. */
export function useInstallTap(): () => Promise<void> {
  const markInstalled = useInstall((s) => s.markInstalled)
  return React.useCallback(async () => {
    if ((await promptInstall()) === "accepted") markInstalled()
  }, [markInstalled])
}

/** R3, R4: may the quiet card be one of today's optional components? */
export function useInstallCardEligible(today: string): boolean {
  const installed = useInstalled()
  const installedOnce = useInstall((s) => s.installedOnce)
  const shownDays = useInstall((s) => s.shownDays)
  const visitDays = useInstall((s) => s.visitDays)
  const recordVisit = useInstall((s) => s.recordVisit)
  const dismissed = useHome((s) => !!s.hidden.install)
  const firstLessonDone = useLearning((s) => Object.keys(s.completed).length > 0)
  const ready = usePromptReady()
  const way = useInstallWay()
  React.useEffect(() => recordVisit(today), [today, recordVisit]) // a tab left open over midnight is a new visit day
  return installCardEligible({ installed: installed || installedOnce, way, promptReady: ready, firstLessonDone, visitDays: visitDays.length, dismissed, shownDays, today })
}
