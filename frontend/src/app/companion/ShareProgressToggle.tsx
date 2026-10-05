/**
 * «شارك تقدّمي مع مرشدي» (glossary `share_progress_with_mentor`; MOT-07 R6,
 * CMP-03 R6). Off by default and off again with every new mentor; only the
 * learner turns it on. Exported for the Me screen as well as «مرشدي».
 */
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/app/i18n"
import { useAuth } from "@/app/stores/auth"
import { mentorApi, useMine } from "./api"

export function ShareProgressToggle({ className }: { className?: string }) {
  const { t } = useT()
  const signedIn = useAuth((s) => !!s.token)
  const mine = useMine()
  const qc = useQueryClient()
  if (!signedIn) return null

  const hasMentor = !!mine.data?.mentor
  const on = !!mine.data?.share_progress
  const change = async (share: boolean) => {
    try {
      const next = await mentorApi.share(share)
      qc.setQueryData(["cmp", "mine"], next)
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <div data-slot="share-progress-toggle" className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor="share-progress" className="text-body font-bold">
          {t("mentor.share")}
        </Label>
        <p id="share-progress-hint" className="text-label text-muted-foreground">
          {hasMentor ? t("cmp.share.hint") : t("cmp.share.noMentor")}
        </p>
      </div>
      <Switch
        id="share-progress"
        aria-describedby="share-progress-hint"
        checked={on}
        disabled={!hasMentor || mine.isLoading}
        onCheckedChange={(v) => void change(v)}
        className="mt-1"
      />
    </div>
  )
}
