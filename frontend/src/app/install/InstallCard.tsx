/**
 * PLT-16 R3–R5: the quiet «ثبّت رفيق» card, one of PLT-09's optional
 * components (same frame as home/OptionalCard: no pop-up, hidden with one
 * tap and never back). Being on Home today is one of its three showings
 * (R4), remembered on this device only (R6). In discreet mode the card
 * itself says what will show on the device (R5). The browser's install
 * window opens from the button alone (R2 ex4).
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconDeviceMobileDown, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { IconTile } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useHome } from "@/app/home/store"
import { localDay } from "@/app/guide/suggest"
import { useInstall } from "./store"
import { useInstallTap, useInstallWay } from "./useInstall"

export function InstallCard() {
  const { t } = useT()
  const navigate = useNavigate()
  const hide = useHome((s) => s.hide)
  const discreet = useDevice((s) => s.discreet)
  const recordShown = useInstall((s) => s.recordShown)
  const way = useInstallWay()
  const install = useInstallTap()
  const titleId = React.useId()
  const today = localDay(new Date())
  React.useEffect(() => recordShown(today), [today, recordShown])

  return (
    <section aria-labelledby={titleId} data-optional="install" className="flex items-start gap-3 rounded-card bg-card p-4 shadow-card">
      <IconTile icon={IconDeviceMobileDown} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id={titleId} className="text-body font-bold">
          {t("install.card.title")}
        </h2>
        <p className="text-label text-muted-foreground">{t("install.card.body")}</p>
        {discreet && (
          <p data-slot="install-honest" className="text-label text-muted-foreground">
            {t("install.honest")}
          </p>
        )}
        {way.mode === "prompt" ? (
          <Button variant="secondary" size="sm" className="mt-2 self-start" onClick={() => void install()}>
            {t("install.now")}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" className="mt-2 self-start" onClick={() => navigate("/me#install")}>
            {t("install.card.how")}
          </Button>
        )}
      </div>
      <Button variant="ghost" size="icon" className="-me-2 -mt-2 shrink-0 text-muted-foreground" aria-label={t("home.org.hide")} onClick={() => hide("install")}>
        <IconX stroke={1.75} />
      </Button>
    </section>
  )
}
