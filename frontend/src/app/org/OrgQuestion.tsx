/**
 * ORG-01 R2/R3: the one question, in the document's words: «هل تريد أن يعرف
 * [اسم الجهة] أنك بدأت رفيق؟ لن يرى اسمك ولا شيئًا عنك، بل أرقامًا مجمّعة
 * فقط.» «نعم» links; «لا» calls nothing and keeps nothing.
 */
import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useT } from "@/app/i18n"

export function OrgQuestion({
  name,
  onYes,
  onNo,
  busy = false,
  night = false,
}: {
  name: string
  onYes: () => void
  onNo: () => void
  busy?: boolean
  night?: boolean
}) {
  const { t } = useT()
  const id = React.useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4" data-slot="org-question">
      <h2 id={id} className={cn("font-heading text-h2 font-bold text-balance", night && "text-white")}>
        {t("org.ask.title", { name: "⁨" + name + "⁩" })}
      </h2>
      <p className={cn("text-body", night ? "text-white/80" : "text-muted-foreground")}>{t("org.ask.body")}</p>
      <div className="flex flex-col gap-3">
        <Button size="lg" variant={night ? "celebrate" : "default"} className="w-full" disabled={busy} onClick={onYes}>
          {t("org.ask.yes")}
        </Button>
        <Button size="lg" variant="outline" className="w-full" disabled={busy} onClick={onNo}>
          {t("org.ask.no")}
        </Button>
      </div>
      <p className={cn("text-label", night ? "text-white/70" : "text-muted-foreground")}>{t("org.ask.hint")}</p>
    </section>
  )
}
