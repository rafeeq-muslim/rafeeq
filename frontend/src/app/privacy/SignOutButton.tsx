/** PLT-05 R7: signing out saves progress to the account, then erases this
 * device. If progress cannot be saved now (offline, server unreachable), the
 * person learns it would be lost and chooses. */
import * as React from "react"
import { Button } from "@/components/ui/button"
import { useT } from "@/app/i18n"
import { Confirm } from "@/app/companion/Confirm"
import { signOutAndErase } from "@/app/lib/privacy"
import { flushProgress, hasLocalProgress } from "@/app/lib/sync"

/** "ready" once nothing would be lost by erasing this device. */
export async function prepareSignOut(): Promise<"ready" | "unsaved"> {
  if (await flushProgress()) return "ready"
  return hasLocalProgress() ? "unsaved" : "ready"
}

export function SignOutButton({ leave = () => signOutAndErase() }: { leave?: () => Promise<void> }) {
  const { t } = useT()
  const [busy, setBusy] = React.useState(false)
  const [warn, setWarn] = React.useState(false)

  const start = async () => {
    setBusy(true)
    if ((await prepareSignOut()) === "ready") return leave()
    setBusy(false)
    setWarn(true)
  }

  return (
    <>
      <Button variant="outline" disabled={busy} onClick={() => void start()}>
        {busy ? t("acct.signOut.saving") : t("me.signout")}
      </Button>
      <Confirm
        open={warn}
        onOpenChange={setWarn}
        title={t("acct.signOut.unsavedTitle")}
        description={t("acct.signOut.unsavedBody")}
        confirmLabel={t("acct.signOut.anyway")}
        cancelLabel={t("acct.signOut.wait")}
        onConfirm={() => void leave()}
        destructive
      />
    </>
  )
}
