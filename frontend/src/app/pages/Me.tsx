/**
 * Me: who I am here (guest or account, display name only), my badges, my
 * language, the gentle reminder (MOT-05), privacy (PLT-05, MOT-07 R4 opt
 * out), daily tools, team areas by role, and leaving (sign out, delete the
 * account, or erase this device).
 */
import * as React from "react"
import { useNavigate } from "react-router"
import {
  IconArrowLeft,
  IconBook,
  IconChecklist,
  IconCompass,
  IconFlame,
  IconFlower,
  IconInbox,
  IconSettings,
  IconShieldCheck,
  IconUsersGroup,
  type TablerIcon,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { LanguageSwitcher, MilestoneBadge, TopBar, YearFlower } from "@/components/rafeeq"
import { num, useT, type Key, type Locale } from "@/app/i18n"
import { api, sendEvent } from "@/app/lib/api"
import { pushSupported, setReminder } from "@/app/lib/push"
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useMotivation } from "@/app/stores/motivation"
import { useContent } from "@/app/learning/useContent"
import { ShareProgressToggle } from "@/app/companion/ShareProgressToggle"

export default function Me() {
  const { t } = useT()
  const navigate = useNavigate()
  const me = useAuth((s) => s.me)
  const setAuth = useAuth((s) => s.set)
  const has = useAuth((s) => s.has)

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined)
    setAuth({ token: null, me: null })
    toast(t("acct.signedOut"))
  }

  const roleLinks: { to: string; key: Key; icon: TablerIcon; show: boolean }[] = [
    { to: "/inbox", key: "role.mentorInbox", icon: IconInbox, show: has("mentor") },
    { to: "/review-desk", key: "role.review", icon: IconShieldCheck, show: has("sharia_reviewer") || has("team") },
    { to: "/team", key: "role.team", icon: IconUsersGroup, show: has("team") },
    { to: "/admin", key: "role.admin", icon: IconSettings, show: has("admin") },
  ]

  return (
    <>
      <TopBar className="sticky top-0" title={<span className="font-heading text-h3">{t("me.title")}</span>} />
      <div className="flex flex-col gap-8 px-4 pt-5 pb-12">
        <Identity />

        <Badges />

        <Section title={t("me.language")}>
          <LanguagePicker />
        </Section>

        <Section title={t("me.tools")}>
          <LinkRow icon={IconCompass} title={t("practice.prayer")} hint={t("me.practiceHint")} onClick={() => navigate("/practice")} />
          <LinkRow icon={IconBook} title={t("discover.title")} hint={t("me.discoverHint")} onClick={() => navigate("/discover")} />
        </Section>

        <Section title={t("me.reminder")}>
          <ReminderSettings />
        </Section>

        <Section title={t("me.privacy")}>
          <PrivacySettings />
          {me && <ShareProgressToggle />}
        </Section>

        {roleLinks.some((r) => r.show) && (
          <Section title={t("me.team")}>
            {roleLinks
              .filter((r) => r.show)
              .map((r) => (
                <LinkRow key={r.to} icon={r.icon} title={t(r.key)} onClick={() => navigate(r.to)} />
              ))}
          </Section>
        )}

        {me && (
          <Section title={t("acct.settings")}>
            <LinkRow icon={IconChecklist} title={t("me.account")} onClick={() => navigate("/me/account")} />
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" onClick={signOut}>
                {t("me.signout")}
              </Button>
              <DeleteAccount />
            </div>
          </Section>
        )}
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = React.useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-label font-bold text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

function LinkRow({ icon: Icon, title, hint, onClick }: { icon: TablerIcon; title: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tactile flex min-h-16 items-center gap-3 rounded-card border-2 bg-card px-4 py-3 text-start [--lip:var(--outline-lip)]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-5" stroke={1.75} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-bold">{title}</span>
        {hint && <span className="block text-label text-muted-foreground">{hint}</span>}
      </span>
      <IconArrowLeft className="size-5 text-muted-foreground ltr:rotate-180" aria-hidden="true" />
    </button>
  )
}

function Identity() {
  const { t } = useT()
  const navigate = useNavigate()
  const me = useAuth((s) => s.me)
  const { content } = useContent()
  const badges = useMotivation((s) => s.badges)
  const units = Object.keys(badges).filter((b) => b.startsWith("unit-")).length
  return (
    <section className="dark relative isolate flex items-center gap-4 overflow-hidden rounded-panel bg-[linear-gradient(160deg,var(--rf-ink)_0%,var(--rf-deep)_100%)] p-5 text-white">
      <YearFlower month={units} size={84} tone="night" bloom={false} label={t("path.progress", { done: num(units), total: num(content?.units.length ?? 12) })} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-h2 font-bold">
          <bdi>{me?.display_name ?? t("me.guest")}</bdi>
        </p>
        {me ? (
          <p dir="ltr" className="truncate text-start text-label text-white/70">
            @{me.username}
          </p>
        ) : (
          <p className="text-label text-white/70">{t("me.guestHint")}</p>
        )}
        {!me && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="celebrate" onClick={() => navigate("/me/account")}>
              {t("home.saveCta")}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

function Badges() {
  const { t } = useT()
  const badges = useMotivation((s) => s.badges)
  const { content } = useContent()
  const list = Object.values(badges).sort((a, b) => a.earnedAt.localeCompare(b.earnedAt))
  return (
    <section className="flex flex-col gap-3" aria-labelledby="badges-title">
      <h2 id="badges-title" className="text-label font-bold text-muted-foreground">
        {t("me.badges")}
      </h2>
      {list.length === 0 ? (
        <p className="text-body text-muted-foreground">{t("me.badgesNone")}</p>
      ) : (
        <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto overscroll-x-contain px-4 pb-2">
          {list.map((b) => {
            const days = b.id.startsWith("days-") ? Number(b.id.slice(5)) : null
            const unit = content?.units.find((u) => `unit-${u.id}` === b.id)
            return (
              <li key={b.id} className="snap-start">
                <MilestoneBadge
                  icon={days ? IconFlame : IconFlower}
                  earned
                  size={76}
                  label={days ? t("lesson.streakBadge", { n: num(days) }) : (unit?.title ?? b.id)}
                  className="w-24 text-center"
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function LanguagePicker() {
  const locale = useDevice((s) => s.locale)
  const set = useDevice((s) => s.set)
  const me = useAuth((s) => s.me)
  const setAuth = useAuth((s) => s.set)
  return (
    <LanguageSwitcher
      value={locale}
      onValueChange={(code) => {
        set({ locale: code as Locale })
        if (me) void api("/api/me", { method: "PATCH", body: { locale: code } }).then((m) => setAuth({ me: m as typeof me }), () => undefined)
      }}
    />
  )
}

function ReminderSettings() {
  const { t } = useT()
  const on = useDevice((s) => s.reminderOn)
  const time = useDevice((s) => s.reminderTime)
  const set = useDevice((s) => s.set)
  const [busy, setBusy] = React.useState(false)
  const supported = pushSupported()
  const denied = supported && typeof Notification !== "undefined" && Notification.permission === "denied"

  const apply = async (enabled: boolean, at = time) => {
    setBusy(true)
    try {
      const r = await setReminder(enabled, at)
      if (r === null) {
        set({ reminderOn: false })
        toast(t(enabled ? "reminder.denied" : "reminder.off"))
        return
      }
      set({ reminderOn: r.enabled, reminderTime: r.time ?? at })
      toast(r.enabled ? t("reminder.saved", { time: at }) : t("reminder.off"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
    }
  }

  if (!supported) return <p className="text-label text-muted-foreground">{t("reminder.unsupported")}</p>
  return (
    <div className="flex flex-col gap-3 rounded-card border-2 bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="rem" className="text-body font-bold">
          {t("reminder.toggle")}
        </Label>
        <Switch id="rem" checked={on} disabled={busy} onCheckedChange={(v) => apply(v)} />
      </div>
      {on && (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="rem-time" className="text-label text-muted-foreground">
            {t("reminder.time")}
          </Label>
          <Input
            id="rem-time"
            type="time"
            dir="ltr"
            className="w-32"
            value={time}
            onChange={(e) => set({ reminderTime: e.target.value })}
            onBlur={(e) => e.target.value && apply(true, e.target.value)}
          />
        </div>
      )}
      <p className="text-label text-muted-foreground">{denied ? t("reminder.denied") : t("reminder.hint")}</p>
    </div>
  )
}

function PrivacySettings() {
  const { t } = useT()
  const d = useDevice()
  const rows: { id: string; key: Key; hint: Key; value: boolean; change: (v: boolean) => void }[] = [
    {
      id: "events",
      key: "privacy.events",
      hint: "privacy.eventsHint",
      value: d.shareEvents,
      change: (v) => {
        if (!v) sendEvent({ type: "opt_out" }) // MOT-07 R4: one bare event, then nothing
        d.set({ shareEvents: v })
      },
    },
    { id: "exit", key: "privacy.quickExit", hint: "privacy.quickExitHint", value: d.quickExit, change: (v) => d.set({ quickExit: v }) },
    { id: "discreet", key: "privacy.discreet", hint: "privacy.discreetHint", value: d.discreet, change: (v) => d.set({ discreet: v }) },
  ]
  return (
    <div className="flex flex-col divide-y rounded-card border-2 bg-card">
      {rows.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <Label htmlFor={`p-${r.id}`} className="text-body font-bold">
              {t(r.key)}
            </Label>
            <p className="text-label text-muted-foreground">{t(r.hint)}</p>
          </div>
          <Switch id={`p-${r.id}`} checked={r.value} onCheckedChange={r.change} className="mt-1" />
        </div>
      ))}
      <div className="p-4">
        <WipeDevice />
      </div>
    </div>
  )
}

function WipeDevice() {
  const { t } = useT()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="px-0 text-destructive">
          {t("privacy.wipe")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("privacy.wipe")}</AlertDialogTitle>
          <AlertDialogDescription>{t("me.wipeConfirm")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("acct.deleteNo")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" }).catch(() => undefined)
              for (const k of Object.keys(localStorage)) if (k.startsWith("rafeeq.")) localStorage.removeItem(k)
              const regs = await navigator.serviceWorker?.getRegistrations?.()
              for (const r of regs ?? []) (await r.pushManager?.getSubscription())?.unsubscribe()
              if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k)
              window.location.replace("/welcome")
            }}
          >
            {t("me.wipeYes")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteAccount() {
  const { t } = useT()
  const setAuth = useAuth((s) => s.set)
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-destructive">
          {t("me.delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("me.delete")}</AlertDialogTitle>
          <AlertDialogDescription>{t("acct.deleteConfirm")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("acct.deleteNo")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white"
            onClick={async () => {
              try {
                await api("/api/me", { method: "DELETE" })
                setAuth({ token: null, me: null })
                toast(t("me.deleted"))
              } catch {
                toast.error(t("common.error"))
              }
            }}
          >
            {t("acct.deleteYes")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
