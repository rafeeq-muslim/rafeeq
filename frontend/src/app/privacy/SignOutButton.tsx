/** PLT-05 R7: signing out saves to the account what the account keeps, then
 * erases this device. Before erasing, one dialog names what would be lost:
 * progress or saved items the account did not get, and what never leaves the
 * device (the private notebook, CMP-06; habits, PRC-02). Nothing to lose, no
 * dialog. */
import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useT, type Key } from "@/app/i18n"
import { signOutAndErase } from "@/app/lib/privacy"
import { flushProgress, hasLocalProgress, saveFailure, type SaveResult } from "@/app/lib/sync"
import { pushSavedOrThrow, useSaved } from "@/app/discover/savedStore"
import { useNotebook } from "@/app/companion/notebook"
import { usePractice } from "@/app/practice/store"

export type Lost = "progress" | "saved" | "notebook" | "habits"
/** Why the account did not get something; null when only device-only data is at stake. */
export type Reason = "offline" | "unreachable" | "rejected" | null
export type SignOutCheck = { lost: Lost[]; reason: Reason }

async function flushSaved(): Promise<SaveResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline"
  try {
    await pushSavedOrThrow()
    return "ok"
  } catch (e) {
    return saveFailure(e)
  }
}

/** Save what the account keeps, then list what erasing this device would lose. */
export async function prepareSignOut(): Promise<SignOutCheck> {
  const progress = await flushProgress()
  const saved = await flushSaved()
  const lost: Lost[] = []
  const failed: SaveResult[] = []
  if (progress !== "ok" && hasLocalProgress()) {
    lost.push("progress")
    failed.push(progress)
  }
  if (saved !== "ok" && useSaved.getState().items.length > 0) {
    lost.push("saved")
    failed.push(saved)
  }
  if (useNotebook.getState().notes.length > 0) lost.push("notebook")
  if (usePractice.getState().habits.length > 0) lost.push("habits")
  // Waiting is offered when it would help with at least one of them.
  const reason: Reason = failed.includes("offline") ? "offline" : failed.includes("unreachable") ? "unreachable" : failed.length ? "rejected" : null
  return { lost, reason }
}

const LOST_KEY: Record<Lost, Key> = {
  progress: "acct.signOut.lost.progress",
  saved: "acct.signOut.lost.saved",
  notebook: "acct.signOut.lost.notebook",
  habits: "acct.signOut.lost.habits",
}

export function SignOutButton({ leave = () => signOutAndErase() }: { leave?: () => Promise<void> }) {
  const { t } = useT()
  const [busy, setBusy] = React.useState(false)
  const [check, setCheck] = React.useState<SignOutCheck | null>(null)

  const start = async () => {
    setBusy(true)
    const c = await prepareSignOut()
    if (c.lost.length === 0) return leave()
    setBusy(false)
    setCheck(c)
  }

  const waiting = check?.reason === "offline" || check?.reason === "unreachable"
  return (
    <>
      <Button variant="outline" disabled={busy} onClick={() => void start()}>
        {busy ? t("acct.signOut.saving") : t("me.signout")}
      </Button>
      <AlertDialog open={check !== null} onOpenChange={(open) => !open && setCheck(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">{t("acct.signOut.lostTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-start text-body">
              {check?.reason === "rejected" ? t("acct.signOut.rejected") : waiting ? t("acct.signOut.offline") : t("acct.signOut.deviceOnly")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex list-disc flex-col gap-1 ps-5 text-start text-body">
            {check?.lost.map((l) => (
              <li key={l}>{t(LOST_KEY[l])}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{waiting ? t("acct.signOut.wait") : t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void leave()}>
              {t("acct.signOut.anyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
