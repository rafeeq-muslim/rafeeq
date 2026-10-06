/**
 * PLT-15 offline UI, all quiet and in the learner's language:
 * - OfflineIndicator (R1): one small pill while the device is offline;
 * - NeedsConnection (R1 error): a screen that never reached the device says
 *   it needs a connection the first time, inside the app, never blank;
 * - OfflineNote (R2, R4, R5): one line where a single part needs the network.
 */
import { useNavigate } from "react-router"
import { IconWifiOff } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { SpotIllustration } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import { useOnline } from "./online"

export function OfflineIndicator() {
  const { t } = useT()
  const online = useOnline()
  if (online) return null
  return (
    <p
      role="status"
      data-slot="offline-indicator"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-40 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-card px-3 py-1 text-caption text-muted-foreground shadow-raised"
    >
      <IconWifiOff className="size-3.5 shrink-0" stroke={1.75} aria-hidden="true" />
      {t("offline.indicator")}
    </p>
  )
}

export function OfflineNote({ text, className }: { text: Key; className?: string }) {
  const { t } = useT()
  return (
    <p role="status" data-slot="offline-note" className={cn("flex items-start gap-2 text-label text-muted-foreground", className)}>
      <IconWifiOff className="mt-0.5 size-4 shrink-0" stroke={1.75} aria-hidden="true" />
      {t(text)}
    </p>
  )
}

/** The note only while offline (R5: what needs the network says so). */
export function OfflineOnly(props: { text: Key; className?: string }) {
  return useOnline() ? null : <OfflineNote {...props} />
}

/** Shown in place of a screen whose code never reached the device. Retrying
 * reloads the page (works at / and under /app/). */
export function NeedsConnection({ onRetry = () => location.reload() }: { onRetry?: () => void }) {
  const { t } = useT()
  const navigate = useNavigate()
  const online = useOnline()
  return (
    <section data-slot="needs-connection" className="flex flex-1 flex-col items-center gap-4 px-6 py-12 text-center">
      <SpotIllustration kind="offline" size={104} />
      <h1 className="font-heading text-h3 font-bold">{t(online ? "offline.loadFailed.title" : "offline.firstTime.title")}</h1>
      <p className="max-w-sm text-body text-muted-foreground">{t(online ? "offline.loadFailed.body" : "offline.firstTime.body")}</p>
      <div className="flex flex-col items-center gap-2">
        <Button onClick={onRetry}>{t("common.retry")}</Button>
        <Button variant="ghost" onClick={() => navigate("/")}>
          {t("offline.home")}
        </Button>
      </div>
    </section>
  )
}
