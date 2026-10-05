import * as React from "react"
import {
  IconDoorExit,
  IconHome,
  IconMessageCircle,
  IconSchool,
  IconShieldLock,
  IconUser,
  IconUserHeart,
  type TablerIcon,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { RafeeqSymbol } from "./brand"

/* Platform (PLT): shell, language, privacy. */

type NavKey = "home" | "learn" | "ask" | "mentor" | "account"

const NAV: { key: NavKey; label: string; icon: TablerIcon }[] = [
  { key: "home", label: "الرئيسية", icon: IconHome },
  { key: "learn", label: "تعلّم", icon: IconSchool },
  { key: "ask", label: "اسأل", icon: IconMessageCircle },
  { key: "mentor", label: "مرشدي", icon: IconUserHeart },
  { key: "account", label: "حسابي", icon: IconUser },
]

/**
 * Five-tab bottom navigation. Inactive icons are ink; the active tab is
 * violet with the amber dot (brand guide, p. 28). The mentor tab is always
 * present: a human is never more than one tap away.
 */
function BottomNav({
  active,
  onNavigate,
  labels,
  className,
}: {
  active: NavKey
  onNavigate?: (key: NavKey) => void
  /** Localised labels; Arabic by default. */
  labels?: Partial<Record<NavKey, string>>
  className?: string
}) {
  return (
    <nav
      data-slot="bottom-nav"
      aria-label="التنقل الرئيسي"
      className={cn(
        "border-t bg-card/95 px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur",
        className
      )}
    >
      <ul className="grid grid-cols-5">
        {NAV.map(({ key, label, icon: Icon }) => {
          const on = key === active
          return (
            <li key={key}>
              <button
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => onNavigate?.(key)}
                className={cn(
                  "relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-md text-caption font-medium transition-colors",
                  on ? "text-primary" : "text-foreground hover:bg-muted"
                )}
              >
                <span className="relative">
                  <Icon className="size-6" stroke={on ? 2 : 1.75} aria-hidden="true" />
                  {on && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-0.5 -end-1 size-2 rounded-full bg-celebrate"
                    />
                  )}
                </span>
                {labels?.[key] ?? label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Greeting header on Home: «السلام عليكم، يوسف». */
function AppHeader({
  name,
  greeting = "السلام عليكم",
  actions,
  className,
}: {
  /** The display name the user chose, never their legal name. */
  name?: string
  greeting?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header data-slot="app-header" className={cn("flex items-center gap-3", className)}>
      <RafeeqSymbol size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-h3 font-bold">
          {name ? `${greeting}، ${name}` : greeting}
        </p>
      </div>
      {actions}
      {name && (
        <Avatar size="lg">
          <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
        </Avatar>
      )}
    </header>
  )
}

type LocaleCode = "ar" | "en" | "tl"

const LOCALES: { code: LocaleCode; label: string; dir: "rtl" | "ltr" }[] = [
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "en", label: "English", dir: "ltr" },
  { code: "tl", label: "Tagalog", dir: "ltr" },
]

/**
 * Language choice (PLT-01, PLT-03). Each option is written in its own
 * language and marked with `lang` so screen readers pronounce it right.
 */
function LanguageSwitcher({
  value,
  onValueChange,
  className,
}: {
  value: LocaleCode
  onValueChange?: (code: LocaleCode, dir: "rtl" | "ltr") => void
  className?: string
}) {
  return (
    <ToggleGroup
      data-slot="language-switcher"
      type="single"
      variant="outline"
      value={value}
      onValueChange={(v) => {
        const l = LOCALES.find((x) => x.code === v)
        if (l) onValueChange?.(l.code, l.dir)
      }}
      aria-label="اللغة"
      className={className}
    >
      {LOCALES.map((l) => (
        <ToggleGroupItem key={l.code} value={l.code} lang={l.code} dir={l.dir} className="px-4">
          {l.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * «خروج سريع» (PLT-05): one tap replaces the screen with a neutral page and
 * clears the back history. For users hiding their faith from family.
 */
function QuickExitButton({
  label = "خروج سريع",
  href,
  className,
}: {
  label?: string
  /** Neutral destination (e.g. a weather page). Decided per market. */
  href: string
  className?: string
}) {
  return (
    <Button
      data-slot="quick-exit-button"
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => window.location.replace(href)}
    >
      <IconDoorExit data-icon="inline-start" stroke={1.75} />
      {label}
    </Button>
  )
}

/** The account promise (PLT-02), shown next to the sign-up form. */
function PrivacyNote({
  title = "بياناتك لك وحدك",
  children = "لا نشارك بياناتك مع أحد، ونستخدمها للدخول فقط. لا يظهر للآخرين إلا اسمك المعروض، في لوحة الترتيب والمجموعات إن فعّلتها.",
  className,
}: {
  title?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <Alert data-slot="privacy-note" variant="info" className={className}>
      <IconShieldLock stroke={1.75} />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

export { BottomNav, AppHeader, LanguageSwitcher, QuickExitButton, PrivacyNote, LOCALES, NAV }
export type { NavKey, LocaleCode }
