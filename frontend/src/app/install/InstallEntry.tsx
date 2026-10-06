/**
 * PLT-16 R1, R2, R5: the «ثبّت رفيق» entry in «حسابي». Always there while
 * Rafeeq is not installed (the Home card may be hidden or used up); once
 * installed it says so and invites nothing. Opening it shows how to install
 * on this device and browser, and always the honest line about what will
 * show on the device afterwards. The iPhone steps say the same as the
 * notifications note (PLT-06 R4, `notif.iosBody`).
 */
import * as React from "react"
import { useLocation } from "react-router"
import { IconChevronDown, IconCircleCheck, IconDeviceMobileDown } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { IconTile } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import type { InstallWay, OpenIn } from "@/app/lib/install"
import { useInstallTap, useInstallWay, useInstalled, usePromptReady } from "./useInstall"

const BROWSER: Record<OpenIn, Key> = { safari: "install.browser.safari", chrome: "install.browser.chrome", chromeEdge: "install.browser.chromeEdge" }
const OTHER: Record<Extract<InstallWay, { mode: "other-browser" }>["reason"], Key> = {
  inApp: "install.other.inApp",
  unsupported: "install.other.unsupported",
  iosOther: "install.other.ios",
}
const STEPS: Partial<Record<InstallWay["mode"], Key[]>> = {
  "ios-share": ["install.ios.1", "install.ios.2"],
  "mac-dock": ["install.mac.1", "install.mac.2"],
}

export function InstallSteps({ way, promptReady }: { way: InstallWay; promptReady: boolean }) {
  const { t } = useT()
  const install = useInstallTap()
  const steps = STEPS[way.mode]
  return (
    <div data-install-mode={way.mode} className="flex flex-col gap-3 rounded-card bg-muted p-4">
      {way.mode === "prompt" &&
        (promptReady ? (
          <Button className="self-start" onClick={() => void install()}>
            {t("install.now")}
          </Button>
        ) : (
          <p className="text-body">{t("install.menu")}</p>
        ))}
      {steps && (
        <ol className="flex list-decimal flex-col gap-1 ps-5 text-body">
          {steps.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ol>
      )}
      {way.mode === "ios-share" && <p className="text-label text-muted-foreground">{t("install.ios.then")}</p>}
      {way.mode === "other-browser" && <p className="text-body">{t(OTHER[way.reason], { browser: t(BROWSER[way.open]) })}</p>}
      <p data-slot="install-honest" className="text-label text-muted-foreground">
        {t("install.honest")}
      </p>
    </div>
  )
}

export function InstallEntry() {
  const { t } = useT()
  const { hash } = useLocation()
  const installed = useInstalled()
  const way = useInstallWay()
  const ready = usePromptReady()
  const fromCard = hash === "#install" // the Home card's «اعرف الطريقة»
  const [open, setOpen] = React.useState(fromCard)
  const titleId = React.useId()
  const panelId = React.useId()
  React.useEffect(() => {
    if (!fromCard) return
    setOpen(true)
    document.getElementById("install")?.scrollIntoView?.()
  }, [fromCard])

  return (
    <section id="install" aria-labelledby={titleId} className="flex scroll-mt-16 flex-col gap-3">
      <h2 id={titleId} className="text-label font-bold text-muted-foreground">
        {t("install.section")}
      </h2>
      {installed ? (
        <p data-slot="install-done" className="flex min-h-16 items-center gap-3 rounded-card bg-card px-4 py-3 text-body font-bold">
          <IconTile icon={IconCircleCheck} size="sm" />
          {t("install.installed")}
        </p>
      ) : (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            className="tactile flex min-h-16 items-center gap-3 rounded-card border-2 bg-card px-4 py-3 text-start [--lip:var(--outline-lip)]"
          >
            <IconTile icon={IconDeviceMobileDown} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-body font-bold">{t("install.title")}</span>
              <span className="block text-label text-muted-foreground">{t("install.hint")}</span>
            </span>
            <IconChevronDown className={cn("size-5 text-muted-foreground", open && "rotate-180")} aria-hidden="true" />
          </button>
          <div id={panelId} hidden={!open}>
            {open && <InstallSteps way={way} promptReady={ready} />}
          </div>
        </>
      )}
    </section>
  )
}
