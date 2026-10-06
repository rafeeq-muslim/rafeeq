/**
 * Me: who I am here (guest or account, display name only), my badges, my
 * language and appearance (PLT-04), notifications (PLT-06: three types,
 * each with its own switch; MOT-05, CMP-01, PRC-05; the Rafeeq tone,
 * PLT-07), privacy (PLT-05: the policy, quick exit, discreet mode, a copy
 * of my data, erase this device; MOT-07 R4 opt out), daily tools, team
 * areas by role, and leaving (sign out, delete the account with a
 * confirmation).
 */
import * as React from "react"
import { useLocation, useNavigate } from "react-router"
import {
  IconArrowLeft,
  IconBellOff,
  IconBook,
  IconBuildingCommunity,
  IconBookmark,
  IconChecklist,
  IconCompass,
  IconDeviceMobile,
  IconDownload,
  IconFlame,
  IconFlower,
  IconHeartHandshake,
  IconHelpCircle,
  IconInbox,
  IconLayoutGrid,
  IconSettings,
  IconShieldCheck,
  IconShieldLock,
  IconUsersGroup,
  type TablerIcon,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { IconTile, LanguageSwitcher, MilestoneBadge, ThemeSwitcher, TopBar, YearFlower } from "@/components/rafeeq"
import { num, useT, type Key, type Locale } from "@/app/i18n"
import { api, sendEvent } from "@/app/lib/api"
import { pushState, setReminder, setReplies, syncPushSwitches } from "@/app/lib/push"
import { permissionRevoked, sendTestPush } from "@/app/lib/push" // PLT-13
import { downloadMyData, wipeDevice } from "@/app/lib/privacy"
import { usableTone } from "@/app/lib/tone"
import { usePrayerReminderSwitch } from "@/app/practice/PrayerNameAsk" // PLT-06 R3 / PRC-05 R2 ask once (approvals-ui)
import { useAuth } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { useMotivation } from "@/app/stores/motivation"
import { badgeView } from "@/app/motivation/badges"
import { useInAppReminder } from "@/app/motivation/reminder"
import { useContent } from "@/app/learning/useContent"
import { ShareProgressToggle } from "@/app/companion/ShareProgressToggle"
// ORG-01 R3/R4 (org-01-03-organizations-build)
import { OrgSection } from "@/app/org/OrgSection"
import { SignOutButton } from "@/app/privacy/SignOutButton" // PLT-05 R7
import { unlinkOrg } from "@/app/org/api"
import { useOrganizedHomeCached } from "@/app/home/setting" // PLT-09
import { InstallEntry } from "@/app/install/InstallEntry" // PLT-16 R1

export default function Me() {
  const { t } = useT()
  const navigate = useNavigate()
  const { hash } = useLocation()
  React.useEffect(() => {
    if (hash === "#privacy") document.getElementById("privacy")?.scrollIntoView?.()
  }, [hash])
  const me = useAuth((s) => s.me)
  const has = useAuth((s) => s.has)
  const organized = useOrganizedHomeCached() // PLT-09 R2: «أدوات يومية» leaves «حسابي» (unless PLT-09 is switched off)

  const roleLinks: { to: string; key: Key; icon: TablerIcon; show: boolean }[] = [
    { to: "/inbox", key: "role.mentorInbox", icon: IconInbox, show: has("mentor") },
    { to: "/inbox", key: "cmp.inbox.teamTitle", icon: IconInbox, show: has("team") && !has("mentor") }, // PLT-17 R2: urgent requests and reports
    { to: "/review-desk", key: "role.review", icon: IconShieldCheck, show: has("sharia_reviewer") || has("team") },
    { to: "/referrals", key: "role.referrals", icon: IconHelpCircle, show: has("sharia_reviewer") },
    { to: "/team", key: "team.title", icon: IconUsersGroup, show: has("team") },
    { to: "/admin", key: "role.admin", icon: IconSettings, show: has("admin") },
    { to: "/mentor-applications", key: "cmp.apps.title", icon: IconHeartHandshake, show: has("team") || has("admin") }, // CMP-08 R3
    { to: "/org", key: "org.role.link", icon: IconBuildingCommunity, show: !!me?.roles.includes("org_coordinator") }, // ORG-02, ORG-03
  ]

  return (
    <>
      <TopBar className="sticky top-0" title={<span className="font-heading text-h3">{t("me.title")}</span>} />
      <div className="flex flex-col gap-8 px-4 pt-5 pb-12">
        <Identity />

        {/* PLT-17 R1/R2: a staff member's own screens come first, under a title that fits every role */}
        {roleLinks.some((r) => r.show) && (
          <Section title={t("me.myWork")}>
            {roleLinks
              .filter((r) => r.show)
              .map((r) => (
                <LinkRow key={r.to} icon={r.icon} title={t(r.key)} onClick={() => navigate(r.to)} />
              ))}
          </Section>
        )}

        <Badges />

        <Section title={t("me.language")}>
          <LanguagePicker />
        </Section>

        <Section title={t("me.theme")}>
          <ThemePicker />
        </Section>

        {/* PLT-12 R1: the download center (plt-12-download-center-build); shown with and without PLT-09 */}
        <Section title={t("downloads.title")}>
          <LinkRow icon={IconDownload} title={t("downloads.title")} hint={t("downloads.meHint")} onClick={() => navigate("/downloads")} />
        </Section>

        {organized ? (
          <OrganizedSaved />
        ) : (
        <Section title={t("me.tools")}>
          <LinkRow icon={IconLayoutGrid} title={t("guide.homeLink")} hint={t("guide.homeLinkBody")} onClick={() => navigate("/guide")} />
          <LinkRow icon={IconCompass} title={t("practice.prayer")} hint={t("me.practiceHint")} onClick={() => navigate("/practice")} />
          <LinkRow icon={IconBook} title={t("discover.title")} hint={t("me.discoverHint")} onClick={() => navigate("/discover")} />
        </Section>
        )}

        {/* PLT-16 R1: «ثبّت رفيق», always here while not installed */}
        <InstallEntry />

        <Section title={t("me.notifications")}>
          <NotificationSettings />
        </Section>

        <Section title={t("me.privacy")} id="privacy">
          <LinkRow icon={IconShieldLock} title={t("privacy.policyLink")} hint={t("privacy.policyHint")} onClick={() => navigate("/privacy")} />
          <PrivacySettings />
          {me && <ShareProgressToggle />}
        </Section>

        <Section title={t("org.me.title")} id="org">
          <OrgSection />
        </Section>

        {/* CMP-08: the way in for whoever wants to mentor; mentors already are */}
        {!has("mentor") && (
          <Section title={t("cmp.apply.entry")}>
            <LinkRow icon={IconHeartHandshake} title={t("cmp.apply.entry")} hint={t("cmp.apply.entryHint")} onClick={() => navigate("/mentor-apply")} />
          </Section>
        )}

        {me && (
          <Section title={t("acct.settings")}>
            <LinkRow icon={IconChecklist} title={t("me.account")} onClick={() => navigate("/me/account")} />
            <div className="flex flex-wrap gap-2 pt-2">
              <SignOutButton />
              <DeleteAccount />
            </div>
          </Section>
        )}
      </div>
    </>
  )
}

function Section({ title, children, id: anchor }: { title: string; children: React.ReactNode; id?: string }) {
  const id = React.useId()
  return (
    <section id={anchor} aria-labelledby={id} className="flex scroll-mt-16 flex-col gap-3">
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
      <IconTile icon={Icon} size="sm" />
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
  // MOT-03 R3: only badges whose name is approved in this language show.
  const list = Object.values(badges)
    .sort((a, b) => a.earnedAt.localeCompare(b.earnedAt))
    .flatMap((b) => {
      const view = badgeView(b.id, content, (n) => t("lesson.streakBadge", { n: num(n) }))
      return view ? [{ ...b, view }] : []
    })
  return (
    <section className="flex flex-col gap-3" aria-labelledby="badges-title">
      <h2 id="badges-title" className="text-label font-bold text-muted-foreground">
        {t("me.badges")}
      </h2>
      {list.length === 0 ? (
        <p className="text-body text-muted-foreground">{t("me.badgesNone")}</p>
      ) : (
        <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto overscroll-x-contain px-4 pb-2">
          {list.map((b) => (
            <li key={b.id} className="snap-start">
              <MilestoneBadge icon={b.view.kind === "days" ? IconFlame : IconFlower} earned size={76} label={b.view.label} className="w-24 text-center" />
            </li>
          ))}
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

/** PLT-04: light by default, dark, or follow the device; the choice stays on this device. */
function ThemePicker() {
  const { t } = useT()
  const theme = useDevice((s) => s.theme)
  const set = useDevice((s) => s.set)
  return (
    <ThemeSwitcher
      value={theme}
      onValueChange={(v) => set({ theme: v })}
      label={t("me.theme")}
      labels={{ light: t("theme.light"), dark: t("theme.dark"), system: t("theme.system") }}
    />
  )
}

/** A setting row: label and hint at the start, switch at the end. */
function SwitchRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
  children,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor={id} className="text-body font-bold">
            {label}
          </Label>
          {hint && <p className="text-label text-muted-foreground">{hint}</p>}
        </div>
        <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-1" />
      </div>
      {children}
    </div>
  )
}

/**
 * PLT-06: the three notification types in one place, each with its own
 * switch, all off until turned on (R1, R2). The browser's permission is
 * asked only by turning a push type on (R1) and never again once refused
 * (R5); an iPhone outside the Home Screen is told how to add Rafeeq and no
 * push switch shows on (R4). What reaches the lock screen is neutral (R3).
 */
function NotificationSettings() {
  const { t } = useT()
  const navigate = useNavigate()
  const d = useDevice()
  const prayer = usePrayerReminderSwitch() // PLT-06 R3 / PRC-05 R2: first turn-on asks once about the prayer name
  const [busy, setBusy] = React.useState(false)
  const state = pushState()
  const pushOk = state === "ok"
  // MOT-05 R1: turning the reminder on first asks for its time; nothing is
  // saved until the person confirms one. A device without push gets its own
  // switch for the reminder shown inside Rafeeq (MOT-05 open-question default).
  const inApp = useInAppReminder()
  const [picking, setPicking] = React.useState<{ mode: "push" | "app"; time: string } | null>(null)
  const startPicking = (mode: "push" | "app") => setPicking({ mode, time: (mode === "app" && inApp.time) || d.reminderTime || "20:00" })
  const confirmReminder = () => {
    if (!picking?.time) return
    const { mode, time: at } = picking
    setPicking(null)
    d.set({ reminderTime: at })
    if (mode === "push") void learning(true, at)
    else {
      inApp.set({ on: true, time: at })
      toast(t("mot.reminder.inAppSaved", { time: at }))
    }
  }
  const pickTime = (mode: "push" | "app") =>
    picking?.mode === mode && (
      <div className="flex flex-col gap-3" data-slot="reminder-pick">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`rem-pick-${mode}`} className="text-label text-muted-foreground">
            {t("mot.reminder.pickTime")}
          </Label>
          <Input
            id={`rem-pick-${mode}`}
            type="time"
            dir="ltr"
            className="w-32"
            value={picking.time}
            onChange={(e) => setPicking({ mode, time: e.target.value })}
          />
        </div>
        <Button className="self-start" disabled={!picking.time || busy} onClick={confirmReminder}>
          {t("mot.reminder.confirm")}
        </Button>
      </div>
    )

  // PLT-13 R4: a permission taken back in the device's settings is explained, never re-asked.
  const [revoked, setRevoked] = React.useState(permissionRevoked)
  React.useEffect(() => {
    void syncPushSwitches()
      .then((r) => setRevoked(r === "revoked" || permissionRevoked()))
      .catch(() => undefined)
  }, [])
  // PLT-13 R5: «جرّب الإشعار», three times a day at most (the server counts).
  const tryPush = () =>
    run(async () => {
      const r = await sendTestPush()
      if (r === "sent") toast(t("plt13.testSent"))
      else if (r === "limit") toast(t("plt13.testLimit"))
      else toast.error(t("plt13.testFailed"))
    })

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
    }
  }

  const learning = (enabled: boolean, at = d.reminderTime) =>
    run(async () => {
      const r = await setReminder(enabled, at)
      if (r === null) {
        d.set({ reminderOn: false })
        if (enabled) toast(t(pushState() === "denied" ? "notif.deniedTitle" : "reminder.unsupported"))
        return
      }
      d.set({ reminderOn: r.enabled, reminderTime: r.time ?? at })
      toast(r.enabled ? t("reminder.saved", { time: at }) : t("reminder.off"))
    })

  const replies = (enabled: boolean) =>
    run(async () => {
      const r = await setReplies(enabled)
      if (r === null) {
        d.set({ repliesOn: false })
        if (enabled) toast(t(pushState() === "denied" ? "notif.deniedTitle" : "reminder.unsupported"))
        return
      }
      toast(t(r.enabled ? "notif.repliesOn" : "notif.repliesOff"))
    })

  return (
    <div className="flex flex-col gap-3">
      {state === "ios-home-screen" && (
        <Alert variant="info" data-slot="ios-note">
          <IconDeviceMobile stroke={1.75} />
          <AlertTitle>{t("notif.iosTitle")}</AlertTitle>
          <AlertDescription>{t("notif.iosBody")}</AlertDescription>
        </Alert>
      )}
      {state === "denied" && (
        <Alert variant="warning" data-slot="denied-note">
          <IconBellOff stroke={1.75} />
          <AlertTitle>{t("notif.deniedTitle")}</AlertTitle>
          <AlertDescription>{t("notif.deniedBody")}</AlertDescription>
        </Alert>
      )}
      {state === "unsupported" && <p className="text-label text-muted-foreground">{t("reminder.unsupported")}</p>}
      {state === "ios-update" && (
        <Alert variant="info" data-slot="ios-update-note">
          <IconDeviceMobile stroke={1.75} />
          <AlertTitle>{t("plt13.iosUpdateTitle")}</AlertTitle>
          <AlertDescription>{t("plt13.iosUpdateBody")}</AlertDescription>
        </Alert>
      )}
      {revoked && state !== "denied" && !d.reminderOn && !d.repliesOn && (
        <Alert variant="warning" data-slot="revoked-note">
          <IconBellOff stroke={1.75} />
          <AlertTitle>{t("plt13.revokedTitle")}</AlertTitle>
          <AlertDescription>{t("plt13.revokedBody")}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col divide-y rounded-card border-2 bg-card">
        <SwitchRow
          id="notif-learning"
          label={t("reminder.toggle")}
          hint={t("reminder.hint")}
          checked={pushOk && (d.reminderOn || picking?.mode === "push")}
          disabled={!pushOk || busy}
          onChange={(v) => (v ? startPicking("push") : picking?.mode === "push" ? setPicking(null) : void learning(false))}
        >
          {pickTime("push")}
          {picking?.mode !== "push" && pushOk && d.reminderOn && (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="rem-time" className="text-label text-muted-foreground">
                {t("reminder.time")}
              </Label>
              <Input
                id="rem-time"
                type="time"
                dir="ltr"
                className="w-32"
                value={d.reminderTime}
                onChange={(e) => d.set({ reminderTime: e.target.value })}
                onBlur={(e) => e.target.value && void learning(true, e.target.value)}
              />
            </div>
          )}
        </SwitchRow>
        {!pushOk && (
          <SwitchRow
            id="notif-learning-app"
            label={t("mot.reminder.inAppToggle")}
            hint={t("mot.reminder.inAppHint")}
            checked={inApp.on || picking?.mode === "app"}
            onChange={(v) => {
              if (v) return startPicking("app")
              if (picking?.mode === "app") return setPicking(null)
              inApp.set({ on: false })
              toast(t("reminder.off"))
            }}
          >
            {pickTime("app")}
            {picking?.mode !== "app" && inApp.on && (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="rem-time-app" className="text-label text-muted-foreground">
                  {t("reminder.time")}
                </Label>
                <Input
                  id="rem-time-app"
                  type="time"
                  dir="ltr"
                  className="w-32"
                  value={inApp.time ?? ""}
                  onChange={(e) => e.target.value && inApp.set({ time: e.target.value })}
                />
              </div>
            )}
          </SwitchRow>
        )}
        <SwitchRow
          id="notif-replies"
          label={t("notif.replies")}
          hint={t("notif.repliesHint")}
          checked={pushOk && d.repliesOn}
          disabled={!pushOk || busy}
          onChange={(v) => void replies(v)}
        />
        <SwitchRow
          id="notif-prayer"
          label={t("practice.reminders")}
          hint={t("notif.prayerHint")}
          checked={prayer.enabled}
          onChange={prayer.setEnabled}
        >
          {prayer.dialog}
          <Button
            variant="link"
            className="h-auto w-fit px-0"
            onClick={() => navigate(d.city ? "/practice/reminders" : "/practice/city")}
          >
            {t(d.city ? "notif.prayerSettings" : "practice.chooseCity")}
          </Button>
        </SwitchRow>
        {usableTone() && (
          <SwitchRow id="notif-tone" label={t("notif.tone")} hint={t("notif.toneHint")} checked={d.toneOn} onChange={(v) => d.set({ toneOn: v })} />
        )}
      </div>
      {pushOk && (d.reminderOn || d.repliesOn) && (
        <div className="flex flex-col gap-1" data-slot="plt13-test">
          <Button variant="outline" className="self-start" disabled={busy} onClick={() => void tryPush()}>
            {t("plt13.test")}
          </Button>
          <p className="text-label text-muted-foreground">{t("plt13.testHint")}</p>
        </div>
      )}
      <p className="text-label text-muted-foreground">{t("notif.neutral")}</p>
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
        <SwitchRow key={r.id} id={`p-${r.id}`} label={t(r.key)} hint={t(r.hint)} checked={r.value} onChange={r.change}>
          {/* PLT-05 R2 ex3: honest that the browser history may keep Rafeeq. */}
          {r.id === "exit" && <p className="text-label text-muted-foreground" data-slot="history-note">{t("privacy.historyNote")}</p>}
        </SwitchRow>
      ))}
      <div className="flex flex-col items-start gap-1 p-4">
        <DownloadMyData />
        <WipeDevice />
      </div>
    </div>
  )
}

/** PLT-05 R6: one file, free, whenever the person likes. */
function DownloadMyData() {
  const { t } = useT()
  const [busy, setBusy] = React.useState(false)
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="ghost"
        className="w-fit px-0"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await downloadMyData()
            toast(t("privacy.downloaded"))
          } catch {
            toast.error(t("common.error"))
          } finally {
            setBusy(false)
          }
        }}
      >
        <IconDownload data-icon="inline-start" stroke={1.75} />
        {t("privacy.download")}
      </Button>
      <p className="text-label text-muted-foreground">{t("privacy.downloadHint")}</p>
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
            onClick={() => void wipeDevice()}
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
                await unlinkOrg().catch(() => undefined) // ORG-01 R4: the organisation link goes with the account
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

// --- PLT-09 organized home (plt-09-organized-home-build) ------------------------------

/** PLT-09 R2: with the organized home, «محفوظاتي» moves here (the Discover hub is gone). */
function OrganizedSaved() {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <Section title={t("discover.saved")}>
      <LinkRow icon={IconBookmark} title={t("home.org.openSaved")} hint={t("discover.savedBody")} onClick={() => navigate("/discover/saved")} />
    </Section>
  )
}
