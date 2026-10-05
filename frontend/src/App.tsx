import * as React from "react"
import { IconMoon, IconSun, IconTextDirectionLtr, IconTextDirectionRtl } from "@tabler/icons-react"

import { DirectionProvider } from "@/components/ui/direction"
import { Toaster } from "@/components/ui/sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RafeeqSymbol } from "@/components/rafeeq"
import { Foundations } from "@/gallery/foundations"
import { Primitives } from "@/gallery/primitives"
import { RafeeqComponents } from "@/gallery/rafeeq"
import { NotesProvider } from "@/gallery/notes"
import { Screens } from "@/gallery/screens"

type Dir = "rtl" | "ltr"
type Theme = "light" | "dark"
const TABS = ["foundations", "primitives", "rafeeq", "screens"] as const
type Tab = (typeof TABS)[number]

// ?tab=screens&dir=ltr&theme=dark (or #screens) deep-links a view. Without
// a theme param the page follows the viewer's theme (claude.ai sets
// data-theme on the root; otherwise prefers-color-scheme).
function initial() {
  const q = new URLSearchParams(window.location.search)
  const tab = q.get("tab") ?? window.location.hash.slice(1)
  const host = document.documentElement.getAttribute("data-theme")
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches
  const theme = q.get("theme") ?? (host === "dark" || host === "light" ? host : systemDark ? "dark" : "light")
  return {
    tab: (TABS as readonly string[]).includes(tab) ? (tab as Tab) : "rafeeq",
    dir: (q.get("dir") === "ltr" ? "ltr" : "rtl") as Dir,
    theme: (theme === "dark" ? "dark" : "light") as Theme,
  }
}

export default function App() {
  const start = React.useMemo(initial, [])
  const [tab, setTab] = React.useState<Tab>(start.tab)
  const [dir, setDir] = React.useState<Dir>(start.dir)
  const [theme, setTheme] = React.useState<Theme>(start.theme)

  React.useEffect(() => {
    document.documentElement.dir = dir
    document.documentElement.lang = dir === "rtl" ? "ar" : "en"
  }, [dir])
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])

  return (
    <DirectionProvider dir={dir}>
      <TooltipProvider>
        <NotesProvider>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-h-svh gap-0">
          <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-8">
              <div className="flex items-center gap-3">
                <RafeeqSymbol size={40} />
                <div>
                  <p className="font-heading text-h3 font-bold leading-tight">نظام تصميم رفيق</p>
                  <p className="text-caption text-muted-foreground">shadcn/ui · Tailwind v4 · RTL · v1.0</p>
                </div>
              </div>
              <TabsList className="order-last w-full overflow-x-auto md:order-none md:w-fit">
                <TabsTrigger value="foundations">الأساسيات</TabsTrigger>
                <TabsTrigger value="primitives">المكوّنات</TabsTrigger>
                <TabsTrigger value="rafeeq">مكوّنات رفيق</TabsTrigger>
                <TabsTrigger value="screens">الشاشات</TabsTrigger>
              </TabsList>
              <div className="ms-auto flex items-center gap-2">
                <ToggleGroup
                  type="single"
                  size="sm"
                  variant="outline"
                  value={dir}
                  onValueChange={(v) => v && setDir(v as Dir)}
                  aria-label="اتجاه الكتابة"
                >
                  <ToggleGroupItem value="rtl" aria-label="من اليمين إلى اليسار">
                    <IconTextDirectionRtl />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="ltr" aria-label="من اليسار إلى اليمين">
                    <IconTextDirectionLtr />
                  </ToggleGroupItem>
                </ToggleGroup>
                <ToggleGroup
                  type="single"
                  size="sm"
                  variant="outline"
                  value={theme}
                  onValueChange={(v) => v && setTheme(v as Theme)}
                  aria-label="المظهر"
                >
                  <ToggleGroupItem value="light" aria-label="فاتح">
                    <IconSun />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="dark" aria-label="داكن">
                    <IconMoon />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl px-4 py-10 md:px-8">
            <TabsContent value="foundations"><Foundations /></TabsContent>
            <TabsContent value="primitives"><Primitives /></TabsContent>
            <TabsContent value="rafeeq"><RafeeqComponents /></TabsContent>
            <TabsContent value="screens"><Screens /></TabsContent>
          </main>
        </Tabs>
        <Toaster position="top-center" />
        </NotesProvider>
      </TooltipProvider>
    </DirectionProvider>
  )
}
