/**
 * PLT-01 first run: language → a three-line introduction → optional
 * placement test (LRN-05 R1). R1: the first screen asks only for the
 * language, each written in its own script, the device's language marked
 * as suggested. R2: a link may carry the language (`/welcome?lang=tl`) and
 * then starts in it; nothing else in the link is read or kept. R3: three
 * promises and one button. R4: nothing personal is asked (PLT-02 R1). The
 * privacy policy is one tap away before anything is entered (PLT-05 R1).
 */
import * as React from "react"
import { useNavigate, useSearchParams } from "react-router"
import { IconArrowLeft, IconBook2, IconHeadset, IconLock } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DirectionProvider } from "@/components/ui/direction"
import { Halo, PetalPattern, RafeeqSymbol, YearFlower } from "@/components/rafeeq"
import { LOCALES, dirOf, translate, useT, type Locale } from "@/app/i18n"
import { guessLocale, useDevice } from "@/app/stores/device"
import { useDocumentLocale } from "@/app/AppLayout"
import { BAR_COLOR, setBarColor } from "@/app/lib/theme"
import { PrivacyLink } from "@/app/pages/Privacy"

type Step = "lang" | "intro" | "placement"

/** R2: only a known language code is taken from a link. */
export function linkLocale(search: URLSearchParams): Locale | null {
  const l = search.get("lang")
  return LOCALES.some((x) => x.code === l) ? (l as Locale) : null
}

export default function Welcome() {
  useDocumentLocale()
  // A night moment in both themes: the browser bar matches the sky.
  React.useEffect(() => setBarColor(BAR_COLOR.dark), [])
  const { t, dir } = useT()
  const set = useDevice((s) => s.set)
  const locale = useDevice((s) => s.locale)
  const [search] = useSearchParams()
  const fromLink = React.useMemo(() => linkLocale(search), [search])
  const [step, setStep] = React.useState<Step>(fromLink ? "intro" : "lang")
  const suggested = React.useMemo(() => guessLocale(), [])
  const navigate = useNavigate()

  React.useEffect(() => {
    if (!fromLink) return
    set({ locale: fromLink })
    navigate("/welcome", { replace: true }) // the link's query is not kept anywhere
  }, [fromLink, set, navigate])

  const finish = (placement: boolean) => {
    set({ onboarded: true, placementOffered: true })
    navigate(placement ? "/learn/placement" : "/", { replace: true })
  }

  return (
    <DirectionProvider dir={dir}>
      <main className="dark relative isolate flex min-h-dvh flex-col overflow-hidden bg-[linear-gradient(180deg,var(--rf-ink)_0%,var(--rf-deep)_120%)] px-6 pt-[calc(env(safe-area-inset-top,0px)+2.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] text-foreground">
        <PetalPattern className="-z-10 text-white/[0.04]" scale={1.3} />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <div className="relative mx-auto grid place-items-center py-4">
            <Halo className="absolute -z-10 size-[22rem] text-white/12" />
            {step === "lang" ? <RafeeqSymbol size={120} /> : <YearFlower month={step === "intro" ? 1 : 3} size={130} tone="night" />}
          </div>

          {step === "lang" && (
            <section className="mt-6 flex flex-1 flex-col gap-6" aria-labelledby="lang-title">
              <div>
                <h1 id="lang-title" className="font-heading text-h1 font-bold text-white text-balance">
                  {t("onb.lang.title")}
                </h1>
                <p className="mt-2 text-body text-white/70">{t("onb.lang.hint")}</p>
              </div>
              <ul className="flex flex-col gap-3">
                {LOCALES.map((l) => (
                  <li key={l.code}>
                    <button
                      type="button"
                      lang={l.code}
                      dir={dirOf(l.code)}
                      onClick={() => {
                        set({ locale: l.code as Locale })
                        setStep("intro")
                      }}
                      className={
                        "tactile flex h-16 w-full items-center justify-between rounded-card border-2 px-5 text-start text-h3 font-bold [--lip:rgb(0_0_0/0.35)] " +
                        (locale === l.code ? "border-celebrate bg-white text-ink" : "border-white/20 bg-white/8 text-white")
                      }
                    >
                      <span className="flex items-center gap-3">
                        {l.label}
                        {suggested === l.code && (
                          <Badge variant="secondary" data-slot="suggested">
                            {translate(l.code, "onb.lang.suggested")}
                          </Badge>
                        )}
                      </span>
                      <IconArrowLeft className="size-5 ltr:rotate-180" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <PrivacyLink label="privacy.policyLink" className="mt-auto self-center text-white/70" />
            </section>
          )}

          {step === "intro" && (
            <section className="mt-6 flex flex-1 flex-col gap-6" aria-labelledby="intro-title">
              <h1 id="intro-title" className="font-heading text-h1 font-bold text-white text-balance">
                {t("onb.intro.title")}
              </h1>
              <ul className="flex flex-col gap-4 text-body text-white/85">
                {[
                  { icon: IconBook2, text: t("onb.intro.p1") },
                  { icon: IconHeadset, text: t("onb.intro.p2") },
                  { icon: IconLock, text: t("onb.intro.p3") },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-apricot">
                      <Icon className="size-5" stroke={1.75} aria-hidden="true" />
                    </span>
                    <span className="pt-1.5">{text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                <Button size="lg" variant="celebrate" className="w-full" onClick={() => setStep("placement")}>
                  {t("onb.intro.cta")}
                </Button>
              </div>
            </section>
          )}

          {step === "placement" && (
            <section className="mt-6 flex flex-1 flex-col gap-6" aria-labelledby="pl-title">
              <h1 id="pl-title" className="font-heading text-h1 font-bold text-white text-balance">
                {t("onb.placement.title")}
              </h1>
              <p className="text-body text-white/80">{t("onb.placement.body")}</p>
              <div className="mt-auto flex flex-col gap-3">
                <Button size="lg" variant="celebrate" className="w-full" onClick={() => finish(true)}>
                  {t("onb.placement.take")}
                </Button>
                <Button size="lg" variant="outline" className="w-full" onClick={() => finish(false)}>
                  {t("onb.placement.skip")}
                </Button>
              </div>
            </section>
          )}
        </div>
      </main>
    </DirectionProvider>
  )
}
