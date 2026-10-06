/**
 * PLT-08 R4: «كل ما في رفيق». Every learner-facing feature on one calm page,
 * in five groups by the new Muslim's needs, one line each, one tap to open.
 * One card per group with quiet rows, not a stack of boxes.
 */
import { useNavigate } from "react-router"
import { IconArrowLeft } from "@tabler/icons-react"

import { PetalPattern } from "@/components/rafeeq"
import { useT } from "@/app/i18n"
import { BackBar } from "@/app/practice/ui"
import { useAuth } from "@/app/stores/auth"
import { GROUPS } from "./catalogue"

export default function GuideScreen() {
  const { t } = useT()
  const navigate = useNavigate()
  const me = useAuth((s) => s.me)

  return (
    <>
      <BackBar title={t("guide.title")} to="/" />
      <div className="relative isolate flex flex-col gap-8 px-4 pt-5 pb-10">
        <PetalPattern className="-z-10 h-56 text-primary/[0.05] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <p className="max-w-prose text-body text-muted-foreground">{t("guide.lede")}</p>

        {GROUPS.map((g) => (
          <section key={g.id} aria-labelledby={`guide-${g.id}`} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 id={`guide-${g.id}`} className="font-heading text-h3 font-bold">
                {t(g.title)}
              </h2>
              <p className="text-label text-muted-foreground">{t(g.lede)}</p>
            </div>
            <ul className="flex flex-col overflow-hidden rounded-card bg-card shadow-card">
              {g.items.map(({ id, icon: Icon, route, title, body, needsAccount }) => (
                <li key={id} className="border-b border-border/70 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => navigate(route)}
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start transition-colors duration-150 ease-rafeeq hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                      <Icon className="size-5" stroke={1.75} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-bold">{t(title)}</span>
                      <span className="block text-label text-muted-foreground">{t(body)}</span>
                      {needsAccount && !me && <span className="mt-0.5 block text-caption text-muted-foreground">{t("guide.needsAccount")}</span>}
                    </span>
                    <IconArrowLeft className="size-5 shrink-0 text-muted-foreground ltr:rotate-180" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}
