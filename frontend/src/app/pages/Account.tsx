/**
 * PLT-02 optional account. Three fields only (R2), each can be generated
 * (R3), with a plain promise about the data (R4). Created credentials are
 * shown once to copy. Sign-in asks for an emailed code only when the person
 * turned two-step sign-in on (R6). Signed in, this page manages the account.
 * Progress merges both ways after sign-in or sign-up.
 */
import * as React from "react"
import { useNavigate } from "react-router"
import { IconCheck, IconCopy, IconDice5, IconEye, IconEyeOff, IconLock } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TopBar } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import { ApiError, api } from "@/app/lib/api"
import { onSignedIn } from "@/app/lib/sync"
import { useAuth, type Me } from "@/app/stores/auth"
import { PrivacyLink } from "@/app/pages/Privacy"

type Tokens = { access_token: string; user: Me }

function errorKey(e: unknown): Key {
  const code = e instanceof ApiError ? e.code : ""
  if (e instanceof ApiError && e.status === 429) return "acct.rateLimited"
  if (code === "invalid_credentials") return "acct.wrong"
  if (code === "code_invalid" || code === "code_expired") return "acct.codeWrong"
  if (code === "invite_invalid") return "acct.inviteBad"
  if (code === "gender_required_for_mentor") return "acct.genderNeeded"
  if (code === "email_unavailable") return "acct.2faUnavailable"
  return "common.error"
}

export default function Account() {
  const me = useAuth((s) => s.me)
  const [mode, setMode] = React.useState<"create" | "signin">("create")
  // PLT-02 R3: the new account's credentials stay on screen (once) even though
  // the person is now signed in; without this the settings replaced them at once.
  const [showingCredentials, setShowingCredentials] = React.useState(false)
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <>
      <TopBar
        className="sticky top-0"
        start={
          <Button variant="ghost" size="sm" onClick={() => navigate("/me")}>
            {t("common.back")}
          </Button>
        }
        title={me && !showingCredentials ? t("acct.settings") : mode === "create" ? t("acct.create") : t("acct.signinTitle")}
      />
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-5 pb-12">
        {me && !showingCredentials ? (
          <Settings me={me} />
        ) : mode === "create" ? (
          <Create onSignin={() => setMode("signin")} onCreated={() => setShowingCredentials(true)} />
        ) : (
          <SignIn onCreate={() => setMode("create")} />
        )}
      </div>
    </>
  )
}

function DataPromise() {
  const { t } = useT()
  return (
    <p className="flex gap-3 rounded-md bg-secondary px-4 py-3 text-label text-secondary-foreground">
      <IconLock className="mt-0.5 size-5 shrink-0" stroke={1.75} aria-hidden="true" />
      {t("acct.promise")}
    </p>
  )
}

function Create({ onSignin, onCreated }: { onSignin: () => void; onCreated: () => void }) {
  const { t, locale } = useT()
  const setAuth = useAuth((s) => s.set)
  const [form, setForm] = React.useState({ display_name: "", username: "", password: "" })
  const [showPw, setShowPw] = React.useState(false)
  const [invite, setInvite] = React.useState<string | null>(null)
  const [gender, setGender] = React.useState<"m" | "f" | "">("")
  const [taken, setTaken] = React.useState<string[]>([])
  const [error, setError] = React.useState<Key | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [created, setCreated] = React.useState<{ username: string; password: string } | null>(null)
  const navigate = useNavigate()

  const suggest = async (field?: keyof typeof form) => {
    const s = await api<typeof form>(`/api/auth/suggest?locale=${locale}`)
    setForm((f) => (field ? { ...f, [field]: s[field] } : s))
    if (!field || field === "password") setShowPw(true)
    setTaken([])
  }

  const usernameOk = /^[a-z0-9][a-z0-9._-]{2,38}[a-z0-9]$/.test(form.username.trim().toLowerCase())
  const valid = form.display_name.trim() && usernameOk && form.password.length >= 8

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      const out = await api<Tokens>("/api/auth/register", {
        method: "POST",
        body: { ...form, locale, invite_code: invite || undefined, gender: gender || undefined },
      })
      onCreated()
      setCreated({ username: out.user.username, password: form.password })
      setAuth({ token: out.access_token, me: out.user, ready: true })
      await onSignedIn()
    } catch (err) {
      if (err instanceof ApiError && err.code === "username_taken") {
        setTaken((err.detail as { suggestions: string[] }).suggestions)
      } else setError(errorKey(err))
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <section className="flex flex-col gap-5" aria-labelledby="cred-title">
        <h1 id="cred-title" className="font-heading text-h2 font-bold">
          {t("acct.credentials")}
        </h1>
        <p className="text-body text-muted-foreground">{t("acct.saveThem")}</p>
        <dl className="flex flex-col gap-3">
          {(["username", "password"] as const).map((k) => (
            <div key={k} className="flex items-center gap-3 rounded-card border-2 bg-card p-4">
              <div className="min-w-0 flex-1">
                <dt className="text-label text-muted-foreground">{t(k === "username" ? "acct.username" : "acct.password")}</dt>
                <dd dir="ltr" className="truncate text-start font-mono text-h3 font-bold tabular-nums">
                  {created[k]}
                </dd>
              </div>
              <Button
                variant="secondary"
                size="icon"
                aria-label={t("common.copy")}
                onClick={() => navigator.clipboard?.writeText(created[k]).then(() => toast.success(t("common.copied")))}
              >
                <IconCopy />
              </Button>
            </div>
          ))}
        </dl>
        <p className="text-label text-warning">{t("acct.noRecovery")}</p>
        <Button size="lg" onClick={() => navigate("/me", { replace: true })}>
          <IconCheck data-icon="inline-start" />
          {t("acct.savedThem")}
        </Button>
      </section>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <p className="text-body text-muted-foreground">{t("me.saveBody")}</p>
      <PrivacyLink className="-mt-3" />
      <Button type="button" variant="secondary" className="w-fit" onClick={() => suggest()}>
        <IconDice5 data-icon="inline-start" stroke={1.75} />
        {t("acct.suggest")}
      </Button>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="dn">{t("acct.displayName")}</FieldLabel>
          <div className="flex gap-2">
            <Input id="dn" dir="auto" maxLength={40} autoComplete="nickname" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            <Button type="button" variant="outline" size="icon" aria-label={t("acct.suggest")} onClick={() => suggest("display_name")}>
              <IconDice5 />
            </Button>
          </div>
          <FieldDescription>{t("acct.displayHint")}</FieldDescription>
        </Field>
        <Field data-invalid={(form.username && !usernameOk) || taken.length > 0 || undefined}>
          <FieldLabel htmlFor="un">{t("acct.username")}</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="un"
              dir="ltr"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              value={form.username}
              aria-invalid={(form.username && !usernameOk) || taken.length > 0 || undefined}
              onChange={(e) => {
                setForm({ ...form, username: e.target.value.toLowerCase() })
                setTaken([])
              }}
            />
            <Button type="button" variant="outline" size="icon" aria-label={t("acct.suggest")} onClick={() => suggest("username")}>
              <IconDice5 />
            </Button>
          </div>
          {taken.length > 0 ? (
            <div className="flex flex-col gap-2">
              <FieldError>{t("acct.taken")}</FieldError>
              <div className="flex flex-wrap gap-2">
                {taken.map((u) => (
                  <Button key={u} type="button" size="sm" variant="secondary" dir="ltr" onClick={() => (setForm({ ...form, username: u }), setTaken([]))}>
                    {u}
                  </Button>
                ))}
              </div>
            </div>
          ) : form.username && !usernameOk ? (
            <FieldError>{t("acct.usernameBad")}</FieldError>
          ) : (
            <FieldDescription>{t("acct.usernameHint")}</FieldDescription>
          )}
        </Field>
        <Field data-invalid={(form.password && form.password.length < 8) || undefined}>
          <FieldLabel htmlFor="pw">{t("acct.password")}</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="pw"
              dir="ltr"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <Button type="button" variant="outline" size="icon" aria-label={t("acct.show")} aria-pressed={showPw} onClick={() => setShowPw(!showPw)}>
              {showPw ? <IconEyeOff /> : <IconEye />}
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label={t("acct.suggest")} onClick={() => suggest("password")}>
              <IconDice5 />
            </Button>
          </div>
          {form.password && form.password.length < 8 && <FieldError>{t("acct.passwordShort")}</FieldError>}
        </Field>

        {invite === null ? (
          <Button type="button" variant="link" className="w-fit px-0" onClick={() => setInvite("")}>
            {t("acct.haveInvite")}
          </Button>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="inv">{t("acct.invite")}</FieldLabel>
              <Input id="inv" dir="ltr" autoCapitalize="none" value={invite} onChange={(e) => setInvite(e.target.value.trim())} />
            </Field>
            <Field>
              <FieldLabel>{t("acct.gender")}</FieldLabel>
              <ToggleGroup type="single" variant="outline" value={gender} onValueChange={(v) => setGender(v as "m" | "f" | "")}>
                <ToggleGroupItem value="m">{t("acct.male")}</ToggleGroupItem>
                <ToggleGroupItem value="f">{t("acct.female")}</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          </>
        )}
      </FieldGroup>

      <DataPromise />
      {/* PLT-02 R4: known before the account exists, not only after. */}
      <p className="text-label text-warning" data-slot="no-recovery">
        {t("acct.noRecoveryBefore")}
      </p>
      {error && <p role="alert" className="text-label text-destructive">{t(error)}</p>}
      <Button type="submit" size="lg" disabled={!valid || busy}>
        {busy && <Spinner data-icon="inline-start" />}
        {t("acct.createCta")}
      </Button>
      <Button type="button" variant="ghost" onClick={onSignin}>
        {t("me.signin")}
      </Button>
    </form>
  )
}

function SignIn({ onCreate }: { onCreate: () => void }) {
  const { t } = useT()
  const navigate = useNavigate()
  const setAuth = useAuth((s) => s.set)
  const [form, setForm] = React.useState({ username: "", password: "" })
  const [challenge, setChallenge] = React.useState<{ id: string; hint: string } | null>(null)
  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState<Key | null>(null)
  const [busy, setBusy] = React.useState(false)

  const finish = async (out: Tokens) => {
    setAuth({ token: out.access_token, me: out.user, ready: true })
    await onSignedIn()
    navigate("/me", { replace: true })
  }

  const login = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const out = await api<{ two_factor_required: boolean; challenge_id: string; email_hint: string } & Partial<Tokens>>("/api/auth/login", {
        method: "POST",
        body: form,
      })
      if (out.two_factor_required) {
        setChallenge({ id: out.challenge_id, hint: out.email_hint })
        setCode("")
      } else await finish(out as Tokens)
    } catch (err) {
      setError(errorKey(err))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (value = code) => {
    if (!challenge || value.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      await finish(await api<Tokens>("/api/auth/login/2fa", { method: "POST", body: { challenge_id: challenge.id, code: value } }))
    } catch (err) {
      setError(errorKey(err))
    } finally {
      setBusy(false)
    }
  }

  if (challenge) {
    return (
      <section className="flex flex-col gap-5">
        <Field>
          <FieldLabel htmlFor="otp">{t("acct.code", { email: challenge.hint })}</FieldLabel>
          <div dir="ltr" className="flex justify-center">
            <InputOTP id="otp" maxLength={6} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={setCode} onComplete={verify}>
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        </Field>
        {error && <p role="alert" className="text-label text-destructive">{t(error)}</p>}
        <Button size="lg" disabled={code.length !== 6 || busy} onClick={() => verify()}>
          {busy && <Spinner data-icon="inline-start" />}
          {t("acct.verify")}
        </Button>
        <Button variant="ghost" onClick={() => login()} disabled={busy}>
          {t("acct.newCode")}
        </Button>
      </section>
    )
  }

  return (
    <form onSubmit={login} className="flex flex-col gap-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="si-un">{t("acct.username")}</FieldLabel>
          <Input id="si-un" dir="ltr" autoCapitalize="none" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="si-pw">{t("acct.password")}</FieldLabel>
          <Input id="si-pw" dir="ltr" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
      </FieldGroup>
      {error && <p role="alert" className="text-label text-destructive">{t(error)}</p>}
      <Button type="submit" size="lg" disabled={!form.username || !form.password || busy}>
        {busy && <Spinner data-icon="inline-start" />}
        {t("acct.signin")}
      </Button>
      <Button type="button" variant="ghost" onClick={onCreate}>
        {t("acct.noAccount")}
      </Button>
    </form>
  )
}

function Settings({ me }: { me: Me }) {
  const { t } = useT()
  const setAuth = useAuth((s) => s.set)
  const [name, setName] = React.useState(me.display_name)
  const [pw, setPw] = React.useState({ current_password: "", new_password: "" })
  const [email, setEmail] = React.useState("")
  const [challenge, setChallenge] = React.useState<string | null>(null)
  const [code, setCode] = React.useState("")
  const [available, setAvailable] = React.useState<boolean | null>(null)
  const [error, setError] = React.useState<Key | null>(null)

  React.useEffect(() => {
    api<{ available: boolean }>("/api/me/2fa/available").then((r) => setAvailable(r.available), () => setAvailable(false))
  }, [])

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorKey(e))
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="s-dn">{t("acct.displayName")}</FieldLabel>
          <Input id="s-dn" dir="auto" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <FieldDescription>{t("acct.displayHint")}</FieldDescription>
        </Field>
        <Button
          variant="secondary"
          className="w-fit"
          disabled={!name.trim() || name === me.display_name}
          onClick={() => run(async () => setAuth({ me: await api<Me>("/api/me", { method: "PATCH", body: { display_name: name } }) }))}
        >
          {t("acct.saveDisplay")}
        </Button>
        <p className="text-label text-muted-foreground">
          {t("acct.username")}: <bdi dir="ltr">{me.username}</bdi>
        </p>
      </section>

      <section className="flex flex-col gap-3 border-t pt-6" aria-labelledby="pw-title">
        <h2 id="pw-title" className="font-heading text-h3 font-bold">
          {t("acct.changePassword")}
        </h2>
        <Field>
          <FieldLabel htmlFor="cur">{t("acct.currentPassword")}</FieldLabel>
          <Input id="cur" dir="ltr" type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="new">{t("acct.newPassword")}</FieldLabel>
          <Input id="new" dir="ltr" type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
        </Field>
        <Button
          variant="secondary"
          className="w-fit"
          disabled={!pw.current_password || pw.new_password.length < 8}
          onClick={() =>
            run(async () => {
              await api("/api/me/password", { method: "POST", body: pw })
              setPw({ current_password: "", new_password: "" })
              toast.success(t("acct.passwordChanged"))
            })
          }
        >
          {t("acct.changePassword")}
        </Button>
      </section>

      <section className="flex flex-col gap-3 border-t pt-6" aria-labelledby="tfa-title">
        <h2 id="tfa-title" className="font-heading text-h3 font-bold">
          {t("acct.2fa")}
        </h2>
        <p className="text-label text-muted-foreground">{t("acct.2faHint")}</p>
        {me.two_factor_enabled ? (
          <>
            <p className="text-body">{t("acct.2faOn", { email: me.email_hint ?? "" })}</p>
            <Button variant="outline" className="w-fit" onClick={() => run(async () => setAuth({ me: await api<Me>("/api/me/2fa", { method: "DELETE" }) }))}>
              {t("acct.disable2fa")}
            </Button>
          </>
        ) : available === false ? (
          <p className="text-label text-muted-foreground">{t("acct.2faUnavailable")}</p>
        ) : challenge ? (
          <>
            <div dir="ltr" className="flex justify-center">
              <InputOTP maxLength={6} inputMode="numeric" value={code} onChange={setCode} aria-label={t("acct.code", { email })}>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button
              disabled={code.length !== 6}
              onClick={() =>
                run(async () => {
                  setAuth({ me: await api<Me>("/api/me/2fa/confirm", { method: "POST", body: { challenge_id: challenge, code } }) })
                  setChallenge(null)
                })
              }
            >
              {t("acct.enable2fa")}
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor="em">{t("acct.email")}</FieldLabel>
              <Input id="em" dir="ltr" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button
              variant="secondary"
              className="w-fit"
              disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)}
              onClick={() =>
                run(async () => {
                  const r = await api<{ challenge_id: string }>("/api/me/2fa/start", { method: "POST", body: { email } })
                  setChallenge(r.challenge_id)
                  setCode("")
                })
              }
            >
              {t("acct.sendCode")}
            </Button>
          </div>
        )}
      </section>
      {error && <p role="alert" className="text-label text-destructive">{t(error)}</p>}
    </div>
  )
}
