/**
 * CMP-08 «التقديم كمرشد» — /mentor-apply, open without an account and
 * before the first run (it sits outside the app shell, like the policy).
 *
 * R1: the privacy policy is one tap away before any field; the form asks
 * for the least that lets the team decide and answer (display name, gender
 * for the same-gender rule, languages, optional place, a short text, ONE
 * contact detail) and for agreement to the mentor rules (the ORG-02 R2
 * text). Signed in: no contact is asked; the result shows here.
 * R2: the confirmation is the same for everyone and says what happens next
 * and how long the contact is kept. The hidden «website» field is the
 * honeypot: people never see it, scripts fill it.
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { IconArrowRight, IconHeartHandshake } from "@tabler/icons-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DirectionProvider } from "@/components/ui/direction"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TopBar } from "@/components/rafeeq"
import { LOCALES, num, useT, type Key, type Locale } from "@/app/i18n"
import { api, ApiError } from "@/app/lib/api"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useDocumentLocale } from "@/app/AppLayout"
import { PrivacyLink } from "@/app/pages/Privacy"

export const ABOUT_MAX = 600
const RULES: Key[] = ["cmp.rules.r1", "cmp.rules.r2", "cmp.rules.r3", "cmp.rules.r4"]
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const PHONE = /^\+?[0-9]{7,15}$/

/** An email, or a phone number in digits (spaces, dashes and brackets allowed). */
export const validContact = (v: string) => EMAIL.test(v.trim()) || PHONE.test(v.replace(/[\s().-]/g, ""))

type Mine = { status: "pending" | "approved" | "rejected"; applied_at: string } | null
type Sent = { received: boolean; keep_days: number }
type ErrorKey = "acct.rateLimited" | "welcome.code.invalid" | "cmp.apply.contactBad" | "cmp.apply.alreadyMentor" | "cmp.apply.closed" | "common.error"

export default function MentorApply() {
  useDocumentLocale()
  const { t, dir, locale } = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const onboarded = useDevice((s) => s.onboarded)
  const me = useAuth((s) => s.me)
  const isMentor = !!me?.roles.includes("mentor")
  const mine = useQuery({ queryKey: ["cmp", "application"], queryFn: () => api<Mine>("/api/mentor-applications/mine"), enabled: !!me })

  const [name, setName] = React.useState(me?.display_name ?? "")
  const [gender, setGender] = React.useState(me?.gender ?? "")
  const [languages, setLanguages] = React.useState<string[]>([locale])
  const [place, setPlace] = React.useState("")
  const [about, setAbout] = React.useState("")
  const [contact, setContact] = React.useState("")
  const [orgCode, setOrgCode] = React.useState("")
  const [agreed, setAgreed] = React.useState(false)
  const [website, setWebsite] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<ErrorKey | null>(null)
  const [sent, setSent] = React.useState<Sent | null>(null)
  const [again, setAgain] = React.useState(false)

  const contactOk = me ? true : validContact(contact)
  const complete = !!name.trim() && !!gender && languages.length > 0 && !!about.trim() && contactOk && agreed
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(onboarded ? "/me" : "/welcome", { replace: true }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!complete || busy) return
    setBusy(true)
    setError(null)
    try {
      const body = {
        display_name: name.trim(),
        gender,
        languages,
        locale,
        place: place.trim() || null,
        about: about.trim(),
        contact: me ? null : contact.trim(),
        rules_accepted: true,
        org_code: orgCode.trim() || null,
        website,
      }
      setSent(await api<Sent>("/api/mentor-applications", { method: "POST", body }))
      void qc.invalidateQueries({ queryKey: ["cmp", "application"] })
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ""
      const status = err instanceof ApiError ? err.status : 0
      setError(
        status === 429 ? "acct.rateLimited" : code === "code_invalid" ? "welcome.code.invalid" : code === "already_mentor" ? "cmp.apply.alreadyMentor" : code === "applications_closed" ? "cmp.apply.closed" : status === 422 ? "cmp.apply.contactBad" : "common.error",
      )
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async () => {
    await api("/api/mentor-applications/mine", { method: "DELETE" }).catch(() => undefined)
    setSent(null)
    setAgain(false)
    void qc.invalidateQueries({ queryKey: ["cmp", "application"] })
  }

  const state = mine.data?.status
  const showForm = !sent && !isMentor && (!state || again)

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
          title={<span className="font-heading text-h3">{t("cmp.apply.entry")}</span>}
        />
        <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+3rem)]">
          <header className="flex flex-col gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-secondary bg-grad-secondary text-secondary-foreground">
              <IconHeartHandshake className="size-6" stroke={1.75} aria-hidden="true" />
            </span>
            <h1 className="font-heading text-h2 font-bold text-balance">{t("cmp.apply.entry")}</h1>
            <p className="text-body text-muted-foreground">{t("cmp.apply.intro")}</p>
          </header>

          {sent && (
            <section className="flex flex-col gap-4" aria-labelledby="apply-done" data-slot="apply-done">
              <Alert variant="success">
                <AlertTitle id="apply-done">{t("cmp.apply.done.title")}</AlertTitle>
                <AlertDescription>{t(me ? "cmp.apply.done.bodyAccount" : "cmp.apply.done.body")}</AlertDescription>
              </Alert>
              <p className="text-label text-muted-foreground">{t("cmp.apply.done.keep", { days: num(sent.keep_days) })}</p>
              <Button size="lg" className="w-full" onClick={() => navigate("/")}>
                {t("cmp.apply.done.cta")}
              </Button>
            </section>
          )}

          {!sent && isMentor && (
            <Alert variant="info" data-slot="apply-mentor">
              <AlertTitle>{t("cmp.apply.alreadyMentor")}</AlertTitle>
              <AlertDescription>
                <Button variant="link" className="h-auto px-0" onClick={() => navigate("/inbox")}>
                  {t("role.mentorInbox")}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!sent && !isMentor && state && !again && (
            <section className="flex flex-col gap-3" data-slot="apply-status" data-status={state}>
              <Alert variant={state === "approved" ? "success" : "info"}>
                <AlertTitle>{t(`cmp.apply.status.${state}` as Key)}</AlertTitle>
              </Alert>
              {state === "rejected" && (
                <Button size="lg" className="w-full" onClick={() => setAgain(true)}>
                  {t("cmp.apply.entry")}
                </Button>
              )}
              {state === "pending" && (
                <Button variant="outline" className="w-full" onClick={() => void withdraw()}>
                  {t("cmp.apply.withdraw")}
                </Button>
              )}
            </section>
          )}

          {showForm && (
            <form onSubmit={submit} className="flex flex-col gap-6" noValidate aria-label={t("cmp.apply.entry")}>
              {/* R1: the policy before anything is written. */}
              <PrivacyLink />
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="ma-name">{t("acct.displayName")}</FieldLabel>
                  <Input id="ma-name" dir="auto" maxLength={40} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
                  <FieldDescription>{t("cmp.apply.nameHint")}</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel id="ma-gender">{t("cmp.apply.gender")}</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    aria-labelledby="ma-gender"
                    value={gender}
                    disabled={!!me?.gender}
                    onValueChange={(v) => v && setGender(v)}
                    className="justify-start"
                  >
                    <ToggleGroupItem value="m">{t("acct.male")}</ToggleGroupItem>
                    <ToggleGroupItem value="f">{t("acct.female")}</ToggleGroupItem>
                  </ToggleGroup>
                  <FieldDescription>{t("cmp.apply.genderHint")}</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel id="ma-langs">{t("cmp.apply.languages")}</FieldLabel>
                  <ToggleGroup type="multiple" variant="outline" aria-labelledby="ma-langs" value={languages} onValueChange={setLanguages} className="flex-wrap justify-start">
                    {LOCALES.map((l) => (
                      <ToggleGroupItem key={l.code} value={l.code} lang={l.code as Locale}>
                        {l.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <FieldDescription>{t("cmp.apply.languagesHint")}</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="ma-place">{t("cmp.apply.place")}</FieldLabel>
                  <Input id="ma-place" dir="auto" maxLength={80} autoComplete="off" value={place} onChange={(e) => setPlace(e.target.value)} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="ma-about">{t("cmp.apply.about")}</FieldLabel>
                  <Textarea id="ma-about" dir="auto" rows={5} maxLength={ABOUT_MAX} value={about} onChange={(e) => setAbout(e.target.value)} />
                  <FieldDescription className="tabular-nums">{t("cmp.apply.aboutCount", { n: num(about.length), max: num(ABOUT_MAX) })}</FieldDescription>
                </Field>

                {me ? (
                  <p className="text-label text-muted-foreground" data-slot="no-contact">
                    {t("cmp.apply.contactNotNeeded")}
                  </p>
                ) : (
                  <Field data-invalid={(!!contact && !contactOk) || undefined}>
                    <FieldLabel htmlFor="ma-contact">{t("cmp.apply.contact")}</FieldLabel>
                    <Input
                      id="ma-contact"
                      dir="ltr"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={254}
                      value={contact}
                      aria-invalid={(!!contact && !contactOk) || undefined}
                      onChange={(e) => setContact(e.target.value)}
                    />
                    <FieldDescription>{t("cmp.apply.contactHint")}</FieldDescription>
                    {!!contact && !contactOk && <FieldError>{t("cmp.apply.contactBad")}</FieldError>}
                  </Field>
                )}

                <Field data-invalid={error === "welcome.code.invalid" || undefined}>
                  <FieldLabel htmlFor="ma-org">{t("cmp.apply.org")}</FieldLabel>
                  <Input
                    id="ma-org"
                    dir="ltr"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={32}
                    value={orgCode}
                    aria-invalid={error === "welcome.code.invalid" || undefined}
                    onChange={(e) => (setOrgCode(e.target.value), setError(null))}
                  />
                  <FieldDescription>{t("cmp.apply.orgHint")}</FieldDescription>
                </Field>
              </FieldGroup>

              {/* Never shown to people; a script that fills every field fills this too. */}
              <div className="hidden" aria-hidden="true">
                <label htmlFor="ma-website">Website</label>
                <input id="ma-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>

              <section className="flex flex-col gap-3 rounded-card bg-card p-5" aria-labelledby="ma-rules">
                <h2 id="ma-rules" className="font-heading text-h3 font-bold">
                  {t("cmp.rules.title")}
                </h2>
                <ol className="flex list-decimal flex-col gap-2 ps-6 text-body">
                  {RULES.map((k) => (
                    <li key={k}>{t(k)}</li>
                  ))}
                </ol>
                <label className="flex min-h-11 items-center gap-3 text-body font-bold">
                  <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
                  {t("cmp.apply.rulesAgree")}
                </label>
              </section>

              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertTitle>{t(error)}</AlertTitle>
                </Alert>
              )}
              <div className="flex flex-col gap-2">
                <Button type="submit" size="lg" className="w-full" disabled={!complete || busy}>
                  {t("cmp.apply.submit")}
                </Button>
                {!complete && <p className="text-label text-muted-foreground">{t("cmp.apply.incomplete")}</p>}
                {!me && (
                  <Button type="button" variant="link" className="h-auto min-h-11 self-center text-center whitespace-normal" onClick={() => navigate("/me/account")}>
                    {t("cmp.apply.haveCode")}
                  </Button>
                )}
              </div>
            </form>
          )}
        </main>
      </div>
    </DirectionProvider>
  )
}
