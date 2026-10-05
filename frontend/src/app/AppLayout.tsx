/** App frame: direction and language on <html>, the adaptive shell, and the
 * guards (first run goes to onboarding). */
import * as React from "react"
import { Navigate, Outlet, useLocation, useNavigate } from "react-router"
import { IconDoorExit } from "@tabler/icons-react"

import { DirectionProvider } from "@/components/ui/direction"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AppShell, type NavKey } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"
import { flushEvents } from "@/app/lib/api"

const ROUTES: Record<NavKey, string> = { home: "/", learn: "/learn", ask: "/ask", mentor: "/mentor", account: "/me" }

function activeKey(path: string): NavKey {
  if (path.startsWith("/learn")) return "learn"
  if (path.startsWith("/ask")) return "ask"
  if (path.startsWith("/mentor")) return "mentor"
  if (path.startsWith("/me") || path.startsWith("/practice") || path.startsWith("/discover")) return "account"
  return "home"
}

/** Screens that take the whole viewport (no navigation). */
const FULLSCREEN = [/^\/learn\/lesson\//, /^\/learn\/review/, /^\/learn\/placement/, /^\/celebrate/]

export function useDocumentLocale() {
  const { locale, dir } = useT()
  const discreet = useDevice((s) => s.discreet)
  React.useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = dir
    document.title = discreet ? "Notes" : locale === "ar" ? "رفيق" : "Rafeeq"
  }, [locale, dir, discreet])
  React.useEffect(() => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => document.documentElement.classList.toggle("dark", dark.matches)
    apply()
    dark.addEventListener("change", apply)
    const online = () => void flushEvents()
    window.addEventListener("online", online)
    return () => {
      dark.removeEventListener("change", apply)
      window.removeEventListener("online", online)
    }
  }, [])
}

export function QuickExit() {
  const { t } = useT()
  const on = useDevice((s) => s.quickExit)
  if (!on) return null
  return (
    <button
      type="button"
      onClick={() => window.location.replace("https://www.bbc.com/weather")}
      className="fixed top-[calc(env(safe-area-inset-top,0px)+0.5rem)] end-3 z-50 flex items-center gap-1.5 rounded-full bg-card/95 px-3 py-2 text-caption font-bold text-foreground shadow-raised backdrop-blur"
    >
      <IconDoorExit className="size-4" stroke={2} aria-hidden="true" />
      {t("exit.weather")}
    </button>
  )
}

export default function AppLayout() {
  useDocumentLocale()
  const { t, dir } = useT()
  const onboarded = useDevice((s) => s.onboarded)
  const location = useLocation()
  const navigate = useNavigate()

  if (!onboarded) {
    // First visit at the bare address: the public landing page, whose call to
    // action opens /welcome. Any deeper link (QR codes use /welcome) goes on.
    if (location.pathname === "/" && !location.search) {
      window.location.replace("/landing/")
      return null
    }
    return <Navigate to="/welcome" replace />
  }

  const fullscreen = FULLSCREEN.some((r) => r.test(location.pathname))
  return (
    <DirectionProvider dir={dir}>
      <TooltipProvider>
        <QuickExit />
        <div className="h-dvh">
          <AppShell
            active={activeKey(location.pathname)}
            onNavigate={(k) => navigate(ROUTES[k])}
            bottomNav={!fullscreen}
            navLabel={t("nav.main")}
            labels={{ home: t("nav.home"), learn: t("nav.learn"), ask: t("nav.ask"), mentor: t("nav.mentor"), account: t("nav.me") }}
            contentClassName={fullscreen ? "max-w-none pb-0" : undefined}
          >
            <React.Suspense fallback={<div className="p-8 text-center text-muted-foreground">{t("common.loading")}</div>}>
              <Outlet />
            </React.Suspense>
          </AppShell>
        </div>
        <Toaster position="top-center" />
      </TooltipProvider>
    </DirectionProvider>
  )
}
