/**
 * PLT-01 first run: language → a three-line introduction → optional
 * placement test (LRN-05 R1). R1: the first screen asks only for the
 * language, each written in its own script, the device's language marked
 * as suggested. R2: a link may carry the language (`/welcome?lang=tl`) and
 * then starts in it; nothing else in the link is read or kept. R3: three
 * promises and one button. R4: nothing personal is asked (PLT-02 R1). The
 * privacy policy is one tap away before anything is entered (PLT-05 R1).
 *
 * ORG-01 R1/R2: an organisation's link also carries its code
 * (`/welcome?lang=tl&org=K7M2QX9P`), never anything about the person. The
 * code stays in memory only; after the introduction the app asks once
 * whether to count the journey in that organisation's numbers. Only «نعم»
 * sends it to the server; «لا» keeps nothing. (PLT-01 R2 conflict resolved as
 * research/10 §3 proposes; docs/engineering/decisions-for-review.md.)
 *
 * PLT-10 R4: anyone with an account (learner, mentor, team, reviewer) can
 * sign in from here; a team invite opens account creation with its field,
 * checked only on registration; an organisation's code typed by hand asks
 * the same once-only question as its link. The two codes never mix.
 * PLT-10 R5: whoever signed in or already started on this device never
 * repeats the start; with an organisation's link they are asked once, then home.
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
import { codeInfo, linkOrg, normalizeCode, type CodeInfo } from "@/app/org/api"
import { useOrgLink } from "@/app/org/store"
import { useAuth } from "@/app/stores/auth"
import { ApiError } from "@/app/lib/api"
import { Create, SignIn } from "@/app/pages/Account"
import { Input } from "@/components/ui/input"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { OrgQuestion } from "@/app/org/OrgQuestion"

type Step = "lang" | "intro" | "org" | "placement" | "signin" | "create"

/** R2: only a known language code is taken from a link. */
export function linkLocale(search: URLSearchParams): Locale | null {
  const l = search.get("lang")
  return LOCALES.some((x) => x.code === l) ? (l as Locale) : null
}

/** ORG-01 R1: an organisation's code, if the link has a well-formed one. */
export function linkOrgCode(search: URLSearchParams): string | null {
  const c = search.get("org")
  return c && /^[A-Za-z0-9]{4,16}$/.test(c) ? c.toUpperCase() : null
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
  // PLT-10 R5: decided once, when the screen opens.
  const [returning] = React.useState(() => useDevice.getState().onboarded || !!useAuth.getState().me)
  // ORG-01: held in memory for the one question, never stored. Already linked
  // and returning: nothing to ask.
  const [linkCode] = React.useState(() => (returning && useOrgLink.getState().link ? null : linkOrgCode(search)))
  const [orgCode, setOrgCode] = React.useState(linkCode)
  const [org, setOrg] = React.useState<CodeInfo | null>(null)
  const [busy, setBusy] = React.useState(false)
  const suggested = React.useMemo(() => guessLocale(), [])
  const navigate = useNavigate()
  const me = useAuth((s) => s.me)
  const [langChosen, setLangChosen] = React.useState(!!fromLink)
  const [back, setBack] = React.useState<Step>("lang")
  const [inviteOpen, setInviteOpen] = React.useState(false)

  const home = React.useCallback(() => {
    set({ onboarded: true, placementOffered: true })
    navigate("/", { replace: true })
  }, [set, navigate])

  // PLT-10 R5: started before, or signed in: home, unless a link's organisation is asked about first.
  React.useEffect(() => {
    if (returning && !linkCode) home()
  }, [returning, linkCode, home])
  React.useEffect(() => {
    if (me && !returning && (step === "lang" || step === "intro")) {
      if (!langChosen) set({ locale: me.locale })
      home()
    }
  }, [me, returning, step, langChosen, set, home])

  const open = (next: Step, invite = false) => {
    setBack(step)
    setInviteOpen(invite)
    setStep(next)
  }
  const signedInHere = () => {
    const m = useAuth.getState().me
    if (!langChosen && m) set({ locale: m.locale })
    home()
  }

  React.useEffect(() => {
    if (!fromLink && !search.get("org")) return
    if (returning && !linkCode) return // PLT-10 R5: going home with replace drops the query anyway
    if (fromLink) set({ locale: fromLink })
    navigate("/welcome", { replace: true }) // the link's query is not kept anywhere
  }, [fromLink, search, set, navigate, returning, linkCode])

  React.useEffect(() => {
    if (!linkCode) return
    let alive = true
    codeInfo(linkCode).then(
      (info) => {
        if (!alive) return
        setOrg(info)
        if (returning) setStep("org")
      },
      () => alive && returning && home(), // a retired or wrong code: no question, nothing said about any organisation
    )
    return () => {
      alive = false
    }
  }, [linkCode, returning, home])

  const afterIntro = () => setStep(org ? "org" : "placement")
  const answer = async (yes: boolean) => {
    if (yes && orgCode) {
      setBusy(true)
      await linkOrg(orgCode).catch(() => undefined)
      setBusy(false)
    }
    setOrg(null)
    if (returning) home()
    else setStep("placement")
  }
  // PLT-10 R4: a typed organisation code leads to the same one question.
  const typedOrg = async (code: string) => {
    const info = await codeInfo(code)
    setOrgCode(normalizeCode(code))
    setOrg(info)
    setStep("org")
  }

  if (returning && step !== "org") return null

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
                        setLangChosen(true)
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
              <div className="mt-auto flex flex-col items-center gap-1">
                <AccountEntry onClick={() => open("signin")} />
                <PrivacyLink label="privacy.policyLink" className="self-center text-white/70" />
              </div>
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
                <Button size="lg" variant="celebrate" className="w-full" onClick={afterIntro}>
                  {t("onb.intro.cta")}
                </Button>
                <div className="mt-4 flex flex-col items-center gap-1" data-slot="welcome-entries">
                  <AccountEntry onClick={() => open("signin")} />
                  <Button variant="link" className="text-white/70" onClick={() => open("create", true)}>
                    {t("acct.haveInvite")}
                  </Button>
                  <OrgCodeEntry onCheck={typedOrg} />
                </div>
              </div>
            </section>
          )}

          {step === "org" && org && (
            <div className="mt-6 flex flex-1 flex-col justify-end">
              <OrgQuestion night name={org.name} busy={busy} onYes={() => void answer(true)} onNo={() => void answer(false)} />
            </div>
          )}

          {(step === "signin" || step === "create") && (
            <section className="mt-2 flex flex-1 flex-col gap-5" aria-labelledby="acct-title">
              <div className="flex items-center justify-between gap-3">
                <h1 id="acct-title" className="font-heading text-h2 font-bold text-white">
                  {t(step === "signin" ? "welcome.signin.title" : "acct.create")}
                </h1>
                <Button variant="ghost" size="sm" className="text-white/80" onClick={() => setStep(back)}>
                  {t("common.back")}
                </Button>
              </div>
              {step === "signin" ? (
                <SignIn onCreate={() => setStep("create")} onDone={signedInHere} />
              ) : (
                <Create inviteOpen={inviteOpen} onSignin={() => setStep("signin")} onCreated={() => undefined} onDone={signedInHere} />
              )}
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

/** PLT-10 R4: the quiet way in for anyone who already has an account. */
function AccountEntry({ onClick }: { onClick: () => void }) {
  const { t } = useT()
  return (
    <Button variant="link" className="text-white/80" onClick={onClick}>
      {t("welcome.signin.entry")}
    </Button>
  )
}

/** PLT-10 R4 / ORG-01: an organisation's code typed by hand. A wrong or
 * retired code says so and names no organisation; the start goes on without it. */
function OrgCodeEntry({ onCheck }: { onCheck: (code: string) => Promise<void> }) {
  const { t } = useT()
  const [value, setValue] = React.useState<string | null>(null)
  const [error, setError] = React.useState<"welcome.code.invalid" | "acct.rateLimited" | null>(null)
  const [busy, setBusy] = React.useState(false)
  if (value === null)
    return (
      <Button variant="link" className="text-white/70" onClick={() => setValue("")}>
        {t("welcome.code.org")}
      </Button>
    )
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!normalizeCode(value)) return
    setBusy(true)
    setError(null)
    try {
      await onCheck(value)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? "acct.rateLimited" : "welcome.code.invalid")
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2" noValidate>
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor="welcome-org-code" className="text-white/85">
          {t("org.me.codeLabel")}
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            id="welcome-org-code"
            dir="ltr"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            aria-invalid={!!error || undefined}
            onChange={(e) => (setValue(e.target.value), setError(null))}
          />
          <Button type="submit" variant="secondary" disabled={busy || !normalizeCode(value)}>
            {t("org.me.check")}
          </Button>
        </div>
        {error && <FieldError>{t(error)}</FieldError>}
      </Field>
    </form>
  )
}
