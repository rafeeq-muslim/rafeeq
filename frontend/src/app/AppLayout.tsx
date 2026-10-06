/** App frame: direction and language on <html>, the adaptive shell, and the
 * guards (first run goes to onboarding). */
import * as React from "react"
import { Navigate, Outlet, matchPath, useLocation, useNavigate } from "react-router"
import { IconDoorExit } from "@tabler/icons-react"

import { DirectionProvider } from "@/components/ui/direction"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AppShell, type NavKey } from "@/components/rafeeq"
import { LOCALES, useT } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { useGuideTracker } from "@/app/guide/useGuide"
import { flushEvents } from "@/app/lib/api"
import { applyUpdate, maybeApplyUpdate, useUpdateReady } from "@/app/lib/pwa"
import { exitNow, shiftTimesThree } from "@/app/lib/privacy"
import { saveDiscreet } from "@/app/lib/discreetPref"
import { followTheme } from "@/app/lib/theme"
// PLT-15: offline indicator, needs-connection screen, background warm-up
import { OfflineIndicator } from "@/app/offline/NeedsConnection"
import { RouteErrorBoundary } from "@/app/offline/lazyRoute"
import { useOfflineWarmUp } from "@/app/offline/warmup"

const ROUTES: Record<NavKey, string> = { home: "/", learn: "/learn", ask: "/ask", mentor: "/mentor", account: "/me" }

/** The tab each screen belongs to. The team screens (mentor inbox, review
 * desk, referrals, team, admin, organisation) open from «حسابي», so that tab
 * stays lit there instead of falling back to Home. Paths are the router's
 * (basename-relative), so this holds when the app lives under /app. */
const TAB_OF: [string, NavKey][] = [
  ["/learn", "learn"],
  ["/ask", "ask"],
  ["/mentor", "mentor"],
  ["/me", "account"],
  ["/practice", "account"],
  ["/discover", "account"],
  ["/inbox", "account"],
  ["/review-desk", "account"],
  ["/referrals", "account"],
  ["/team", "account"],
  ["/admin", "account"],
  ["/org", "account"],
]

export function activeKey(path: string): NavKey {
  return TAB_OF.find(([p]) => matchPath({ path: p, end: false }, path))?.[1] ?? "home"
}

/** Screens that take the whole viewport (no navigation). */
const FULLSCREEN = [/^\/learn\/lesson\//, /^\/learn\/review/, /^\/learn\/placement/, /^\/celebrate/]

export function useDocumentLocale() {
  const { locale, dir } = useT()
  const discreet = useDevice((s) => s.discreet)
  const theme = useDevice((s) => s.theme)
  React.useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = dir
    document.title = discreet ? "Notes" : locale === "ar" ? "رفيق" : "Rafeeq"
  }, [locale, dir, discreet])
  // PLT-05 R3 / PLT-06 R6: the service worker picks a neutral notification icon.
  React.useEffect(() => void saveDiscreet(discreet), [discreet])
  // PLT-04: the learner's choice (light by default); "system" follows the device.
  React.useEffect(() => followTheme(theme), [theme])
  React.useEffect(() => {
    const online = () => void flushEvents()
    window.addEventListener("online", online)
    return () => window.removeEventListener("online", online)
  }, [])
}

/** PLT-05 R2: for those who turn it on, a button at the top of every screen
 * and Shift pressed three times both leave at once (GOV.UK «Exit this page»). */
const leave = () => exitNow()

export function QuickExit({ exit = leave }: { exit?: () => void }) {
  const { t } = useT()
  const on = useDevice((s) => s.quickExit)
  React.useEffect(() => {
    if (!on) return
    const onKey = shiftTimesThree(exit)
    window.addEventListener("keyup", onKey)
    return () => window.removeEventListener("keyup", onKey)
  }, [on, exit])
  if (!on) return null
  return (
    <button
      type="button"
      onClick={exit}
      className="fixed top-[calc(env(safe-area-inset-top,0px)+0.5rem)] end-3 z-50 flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-caption font-bold text-foreground shadow-raised"
    >
      <IconDoorExit className="size-4" stroke={2} aria-hidden="true" />
      {t("exit.weather")}
    </button>
  )
}

/** PLT-05 R2: the screens outside AppLayout (/welcome, /privacy) keep the
 * quick exit button and Shift ×3 too, so it works on every screen. */
export function PublicFrame() {
  return (
    <>
      <QuickExit />
      <Outlet />
    </>
  )
}

/** Issue #9 item 11: a newer version during a lesson waits for the learner. */
function UpdateBar() {
  const { t } = useT()
  const ready = useUpdateReady()
  const location = useLocation()
  React.useEffect(() => maybeApplyUpdate(location.pathname), [location.pathname])
  if (!ready) return null
  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+6rem)] z-40 mx-auto flex w-fit items-center gap-3 rounded-full bg-card px-4 py-2 text-label shadow-raised">
      <span>{t("app.updateReady")}</span>
      <button type="button" onClick={applyUpdate} className="font-bold text-primary">
        {t("app.updateNow")}
      </button>
    </div>
  )
}

export default function AppLayout() {
  useDocumentLocale()
  const { t, dir } = useT()
  const onboarded = useDevice((s) => s.onboarded)
  const theme = useDevice((s) => s.theme)
  const location = useLocation()
  const navigate = useNavigate()
  useGuideTracker(location.pathname) // PLT-08 R3
  useOfflineWarmUp() // PLT-15 R2-R4

  if (!onboarded) {
    // PLT-01 R2: a link may carry the language, and nothing else goes on,
    // except an organisation's code (ORG-01 R1/R2), which is asked about once.
    const q = new URLSearchParams(location.search)
    const lang = q.get("lang")
    const known = LOCALES.some((l) => l.code === lang)
    const org = q.get("org")
    const keep = new URLSearchParams()
    if (known && lang) keep.set("lang", lang)
    if (org && /^[A-Za-z0-9]{4,16}$/.test(org)) keep.set("org", org)
    const qs = keep.toString()
    return <Navigate to={qs ? `/welcome?${qs}` : "/welcome"} replace />
  }

  const fullscreen = FULLSCREEN.some((r) => r.test(location.pathname))
  return (
    <DirectionProvider dir={dir}>
      <TooltipProvider>
        <QuickExit />
        <UpdateBar />
        <OfflineIndicator />
        <div className="h-dvh">
          <AppShell
            active={activeKey(location.pathname)}
            onNavigate={(k) => navigate(ROUTES[k])}
            bottomNav={!fullscreen}
            navLabel={t("nav.main")}
            labels={{ home: t("nav.home"), learn: t("nav.learn"), ask: t("nav.ask"), mentor: t("nav.mentor"), account: t("nav.me") }}
            // Full-screen flows own the whole area: no column padding and no side gutters (PLT-04).
            contentClassName={fullscreen ? "max-w-none pb-0 @min-[52.5rem]/shell:-mx-6 @min-[52.5rem]/shell:w-[calc(100%+3rem)] @min-[52.5rem]/shell:py-0" : undefined}
          >
            <React.Suspense fallback={<div className="p-8 text-center text-muted-foreground">{t("common.loading")}</div>}>
              <RouteErrorBoundary resetKey={location.pathname}>
                <Outlet />
              </RouteErrorBoundary>
            </React.Suspense>
          </AppShell>
        </div>
        <Toaster position="top-center" theme={theme} />
      </TooltipProvider>
    </DirectionProvider>
  )
}
