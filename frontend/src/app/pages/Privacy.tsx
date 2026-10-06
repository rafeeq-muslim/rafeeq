/**
 * PLT-05 R1: the privacy policy (PDPL art. 12), short and in the person's
 * language, readable without an account and before any data is entered: the
 * route sits outside the first-run guard, and it is linked from the language
 * screen, «حسابي», account creation and «أريد إنسانًا».
 *
 * The text is research/09 §7, checked line by line against the code on
 * 2026-10-06 (corrections are listed in docs/engineering/implementation/
 * PLT-05.md). Final: approved by the product owner on 2026-10-06 (the
 * updated line says so). No legal review is claimed, and the data controller's
 * name and contact are still missing: rights are exercised in the app.
 */
import { Link, useNavigate } from "react-router"
import { IconArrowRight, IconShieldLock } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { DirectionProvider } from "@/components/ui/direction"
import { TopBar } from "@/components/rafeeq"
import { cn } from "@/lib/utils"
import { useT, type Key } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useDocumentLocale } from "@/app/AppLayout"

/** Last update, which is also the day the product owner approved the text (2026-10-06). */
export const POLICY_UPDATED = "2026-10-06"

// "org": ORG-01 the organisation link (what the link carries, what «نعم» keeps, unlinking).
export const POLICY_SECTIONS = ["device", "account", "contact", "notifications", "ai", "stats", "org", "never", "rights", "retention"] as const

export default function Privacy() {
  useDocumentLocale()
  const { t, dir } = useT()
  const navigate = useNavigate()
  const onboarded = useDevice((s) => s.onboarded)
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(onboarded ? "/me" : "/welcome", { replace: true }))

  return (
    <DirectionProvider dir={dir}>
      <div className="min-h-dvh bg-background text-foreground">
        <TopBar
          className="sticky top-0"
          start={
            <Button variant="ghost" size="icon" aria-label={t("common.back")} onClick={back}>
              <IconArrowRight className="ltr:rotate-180" stroke={1.75} />
            </Button>
          }
          title={<span className="font-heading text-h3">{t("privacy.policyLink")}</span>}
        />
        <main className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+3rem)]">
          <header className="flex flex-col gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-secondary bg-grad-secondary text-secondary-foreground">
              <IconShieldLock className="size-6" stroke={1.75} aria-hidden="true" />
            </span>
            <h1 className="font-heading text-h1 font-bold text-balance">{t("policy.title")}</h1>
            <p className="text-reading text-muted-foreground">{t("policy.intro")}</p>
            <p className="text-label text-muted-foreground">
              {/* LRI…PDI isolates the date so RTL keeps it as 2026-10-06. */}
              {t("policy.updated", { date: `⁦${POLICY_UPDATED}⁩` })}
            </p>
          </header>

          {POLICY_SECTIONS.map((s) => (
            <section key={s} aria-labelledby={`policy-${s}`} className="flex flex-col gap-2">
              <h2 id={`policy-${s}`} className="font-heading text-h3 font-bold">
                {t(`policy.${s}.title` as Key)}
              </h2>
              <p className="text-body">{t(`policy.${s}.body` as Key)}</p>
            </section>
          ))}

          {onboarded && (
            <Button asChild size="lg" variant="secondary" className="w-full">
              <Link to="/me#privacy">{t("policy.rightsCta")}</Link>
            </Button>
          )}
        </main>
      </div>
    </DirectionProvider>
  )
}

/** One quiet line that opens the policy (PLT-05 R1 ex2: before anything is written). */
export function PrivacyLink({ label = "privacy.beforeYouWrite", className }: { label?: Key; className?: string }) {
  const { t } = useT()
  return (
    <Link to="/privacy" className={cn("text-label text-muted-foreground underline underline-offset-4", className)}>
      {t(label)}
    </Link>
  )
}
