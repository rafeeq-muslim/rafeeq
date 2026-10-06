/**
 * ORG-02 R2: a mentor reads and accepts the mentor rules before the inbox
 * opens (once; the rules are the same for every mentor, CMP domain card).
 * ORG-02 R5: a suspended mentor sees that the inbox is closed, nothing else.
 * Team members have no gate. The server enforces both (403 on /api/inbox).
 */
import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { IconShieldCheck } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SpotIllustration } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import { api } from "@/app/lib/api"
import { useAuth } from "@/app/stores/auth"
import { ScreenBar } from "../Screen"

type Rules = { required: boolean; accepted_at: string | null; suspended: boolean }
const RULES: Key[] = ["cmp.rules.r1", "cmp.rules.r2", "cmp.rules.r3", "cmp.rules.r4"]

export function MentorRulesGate({ children }: { children: React.ReactNode }) {
  const { t } = useT()
  const qc = useQueryClient()
  const isMentor = useAuth((s) => !!s.me?.roles.includes("mentor"))
  const isTeam = useAuth((s) => !!s.me?.roles.some((r) => r === "team" || r === "admin"))
  const gated = isMentor && !isTeam
  const q = useQuery({ queryKey: ["cmp", "rules"], queryFn: () => api<Rules>("/api/inbox/rules"), enabled: gated })
  const [busy, setBusy] = React.useState(false)

  if (!gated) return children
  if (q.isLoading) return <Skeleton className="m-4 h-64 rounded-card" />
  if (q.data?.suspended)
    return (
      <>
        <ScreenBar title={t("cmp.inbox.title")} />
        <section className="flex flex-col items-center gap-3 px-6 pt-10 text-center" data-slot="mentor-suspended">
          <SpotIllustration kind="companion" size={96} />
          <h1 className="font-heading text-h3 font-bold">{t("cmp.rules.suspendedTitle")}</h1>
          <p className="max-w-sm text-body text-muted-foreground">{t("cmp.rules.suspendedBody")}</p>
        </section>
      </>
    )
  if (!q.data?.required) return children

  const accept = async () => {
    setBusy(true)
    try {
      await api("/api/inbox/rules", { method: "POST" })
      await qc.invalidateQueries({ queryKey: ["cmp"] })
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ScreenBar title={t("cmp.rules.title")} />
      <section className="flex flex-col gap-5 px-4 pt-5 pb-12" aria-labelledby="rules-title" data-slot="mentor-rules">
        <span className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground">
          <IconShieldCheck className="size-6" stroke={1.75} aria-hidden="true" />
        </span>
        <h1 id="rules-title" className="font-heading text-h2 font-bold">
          {t("cmp.rules.title")}
        </h1>
        <p className="text-body text-muted-foreground">{t("cmp.rules.intro")}</p>
        <ol className="flex list-decimal flex-col gap-2 ps-6 text-body">
          {RULES.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ol>
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void accept()}>
          {t("cmp.rules.accept")}
        </Button>
      </section>
    </>
  )
}
