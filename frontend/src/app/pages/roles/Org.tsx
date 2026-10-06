/**
 * The organisation's coordinator — /org.
 * ORG-03: counts and shares about linked learners only; any figure under 10
 * shows «أقل من 10» with no share; language is the only split; a new
 * organisation sees «لا أرقام بعد» and its codes (R1-R6).
 * ORG-02: each mentor's load and state, the missing gender/language pairs,
 * one-time invites, suspend / reinstate / withdraw approval (R1-R5).
 * ORG-01: the organisation's codes, one per language, as link and QR (R1).
 */
import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IconCopy, IconDownload, IconUserPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { renderSVG } from "uqr"

import { cn } from "@/lib/utils"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SpotIllustration, TopBar } from "@/components/rafeeq"
import { num, useT, type Key } from "@/app/i18n"
import { langName } from "@/app/companion/format"
import { Confirm } from "@/app/companion/Confirm"
import { ApplicationsList } from "@/app/companion/MentorApplications" // CMP-08 R8
import { orgApi, type Checkpoint, type CodeRow, type Dashboard, type Fig, type OrgMentor } from "@/app/org/api"

const STATUSES = ["new", "active", "at_risk", "lapsed", "returning", "none"] as const
const statusKey = (s: (typeof STATUSES)[number]): Key => (s === "none" ? "org.status.none" : (`team.status.${s}` as Key))

/** R2: a hidden figure is «أقل من 10», never a number. */
export function useFig() {
  const { t } = useT()
  return {
    n: (f: Fig) => (f.n === null ? t("org.less10") : num(f.n)),
    pct: (f: Fig | Checkpoint) => (f.pct === null || f.pct === undefined ? null : `${Math.round(f.pct * 100)}%`),
  }
}

export default function Org() {
  const { t } = useT()
  const orgs = useQuery({ queryKey: ["org", "mine"], queryFn: orgApi.mine })
  const org = orgs.data?.[0]
  return (
    <>
      <TopBar className="sticky top-0" title={<span className="font-heading text-h3"><bdi>{org?.name ?? t("org.title")}</bdi></span>} />
      <div className="px-4 pt-4 pb-12">
        {orgs.isLoading && <Skeleton className="h-64 rounded-card" />}
        {org && (
          <Tabs defaultValue="dashboard" className="gap-6">
            <TabsList className="w-full">
              {(["dashboard", "mentors", "applications", "codes"] as const).map((k) => (
                <TabsTrigger key={k} value={k} className="flex-1">
                  {t(`org.tab.${k}` as Key)}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="dashboard">
              <OrgDashboard orgId={org.id} />
            </TabsContent>
            <TabsContent value="mentors">
              <OrgMentors orgId={org.id} />
            </TabsContent>
            <TabsContent value="applications">
              <ApplicationsList base={`/api/org/${org.id}/mentor-applications`} coordinator />
            </TabsContent>
            <TabsContent value="codes">
              <OrgCodes orgId={org.id} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  )
}

// --- ORG-03 ---------------------------------------------------------------

function monthLabel(month: string, locale: string) {
  const [y, m] = month.split("-").map(Number)
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)))
}

export function OrgDashboard({ orgId }: { orgId: string }) {
  const { t, locale } = useT()
  const f = useFig()
  const [lang, setLang] = React.useState<string>("all")
  const q = useQuery({ queryKey: ["org", "dashboard", orgId, lang], queryFn: () => orgApi.dashboard(orgId, lang === "all" ? null : lang) })
  const all = useQuery({ queryKey: ["org", "dashboard", orgId, "all"], queryFn: () => orgApi.dashboard(orgId, null), enabled: lang !== "all" })
  const d: Dashboard | undefined = q.data
  const languages = (lang === "all" ? d : all.data)?.languages ?? []

  if (q.isLoading) return <Skeleton className="h-96 rounded-card" />
  if (!d) return null
  if (d.empty && lang === "all")
    return (
      <section className="flex flex-col gap-5" aria-labelledby="org-empty" data-slot="org-empty">
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <SpotIllustration kind="saved" size={96} />
          <h2 id="org-empty" className="font-heading text-h3 font-bold">
            {t("org.empty.title")}
          </h2>
          <p className="max-w-sm text-body text-muted-foreground">{t("org.empty.body")}</p>
        </div>
        <CodeList codes={d.codes ?? []} />
      </section>
    )

  return (
    <div className="flex flex-col gap-8">
      <p className="text-label text-muted-foreground">{t("org.dash.privacy")}</p>

      {languages.length > 1 && (
        <ToggleGroup type="single" variant="outline" value={lang} onValueChange={(v) => v && setLang(v)} aria-label={t("org.dash.lang")} className="flex-wrap justify-start">
          <ToggleGroupItem value="all">{t("org.dash.allLangs")}</ToggleGroupItem>
          {languages.map((l) => (
            <ToggleGroupItem key={l.lang} value={l.lang}>
              {l.lang === "other" ? t("org.lang.other") : langName(l.lang)} · {f.n(l)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="org-linked">
        <h2 id="org-linked" className="flex items-baseline justify-between gap-2">
          <span className="font-heading text-h3 font-bold">{t("org.dash.linked")}</span>
          <span className="font-heading text-h2 font-bold tabular-nums" data-slot="linked">
            {f.n(d.linked)}
          </span>
        </h2>
        <h3 className="text-label font-bold text-muted-foreground">{t("org.dash.statuses")}</h3>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STATUSES.map((s) => (
            <li key={s} className="flex flex-col rounded-md bg-card px-3 py-2" data-status={s}>
              <span className="text-caption text-muted-foreground">{t(statusKey(s))}</span>
              <span className="font-bold tabular-nums">{f.n(d.statuses[s])}</span>
              {f.pct(d.statuses[s]) && <span className="text-caption text-muted-foreground tabular-nums">{f.pct(d.statuses[s])}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex items-center justify-between gap-3 rounded-card bg-card p-4" aria-labelledby="org-returned" data-slot="returned">
        <div className="min-w-0">
          <h2 id="org-returned" className="text-body font-bold">
            {t("org.dash.returned")}
          </h2>
          <p className="text-label text-muted-foreground">{t("org.dash.returnedHint")}</p>
        </div>
        <div className="text-end">
          <p className="font-heading text-h3 font-bold tabular-nums">{f.n(d.returned)}</p>
          {f.pct(d.returned) && <p className="text-label text-muted-foreground tabular-nums">{f.pct(d.returned)}</p>}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="org-cohorts">
        <h2 id="org-cohorts" className="font-heading text-h3 font-bold">
          {t("org.dash.cohorts")}
        </h2>
        <p className="text-label text-muted-foreground">{t("org.dash.cohortsHint")}</p>
        <div className="overflow-x-auto overscroll-x-contain rounded-card border">
          <table className="w-full text-start text-label">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium"></th>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t("org.dash.size")}</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t("org.dash.d30")}</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t("org.dash.d90")}</th>
              </tr>
            </thead>
            <tbody>
              {d.cohorts.map((c) => (
                <tr key={c.month} className="border-t" data-month={c.month}>
                  <th scope="row" className="px-3 py-2 text-start font-bold">
                    {monthLabel(c.month, locale)}
                  </th>
                  <td className="px-3 py-2 tabular-nums">{f.n(c.size)}</td>
                  <CheckpointCell c={c.d30} />
                  <CheckpointCell c={c.d90} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function CheckpointCell({ c }: { c: Checkpoint }) {
  const { t } = useT()
  const f = useFig()
  if (!c.due) return <td className="px-3 py-2 text-muted-foreground">{t("org.notYet")}</td>
  return (
    <td className="px-3 py-2 tabular-nums">
      <span className="font-bold">{f.pct(c) ?? f.n(c)}</span>
      {f.pct(c) && <span className="ms-1 text-muted-foreground">({f.n(c)})</span>}
    </td>
  )
}

// --- ORG-02 ---------------------------------------------------------------

export function OrgMentors({ orgId }: { orgId: string }) {
  const { t } = useT()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ["org", "mentors", orgId], queryFn: () => orgApi.mentors(orgId) })
  const invites = useQuery({ queryKey: ["org", "invites", orgId], queryFn: () => orgApi.invites(orgId) })
  const [confirm, setConfirm] = React.useState<{ m: OrgMentor; action: "suspend" | "revoke" } | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ["org"] })
  const invite = useMutation({
    mutationFn: () => orgApi.invite(orgId),
    onSuccess: (r) => {
      void navigator.clipboard?.writeText(r.code).then(() => toast.success(t("common.copied")), () => undefined)
      void refresh()
    },
    onError: () => toast.error(t("common.error")),
  })
  const act = async (m: OrgMentor, action: "suspend" | "reinstate" | "revoke") => {
    try {
      await orgApi[action](orgId, m.id)
      await refresh()
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-label text-muted-foreground">{t("org.mentors.privacy")}</p>
      {q.data?.missing.map((p) => (
        <Alert key={`${p.lang}-${p.gender}`} variant="warning" data-slot="missing">
          <AlertTitle>{t("org.mentors.missing", { pair: t(`org.missing.${p.gender}.${p.lang}` as Key) })}</AlertTitle>
        </Alert>
      ))}

      <section className="flex flex-col gap-3" aria-labelledby="org-mentors">
        <h2 id="org-mentors" className="font-heading text-h3 font-bold">
          {t("org.mentors.title")}
        </h2>
        {q.isLoading && <Skeleton className="h-40 rounded-card" />}
        {q.data && q.data.mentors.length === 0 && <p className="text-body text-muted-foreground">{t("org.mentors.none")}</p>}
        <ul className="flex flex-col gap-2">
          {q.data?.mentors.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 rounded-card border-2 bg-card p-4" data-mentor={m.id}>
              <div className="flex flex-wrap items-center gap-2">
                <bdi className="text-body font-bold">{m.display_name}</bdi>
                <Badge variant={m.state === "receiving" ? "success" : m.state === "suspended" ? "destructive" : "secondary"}>
                  {t(`org.mentors.state.${m.state}` as Key)}
                </Badge>
              </div>
              <p className="text-caption text-muted-foreground">
                {m.languages.map(langName).join(" · ")}
                {m.gender && ` · ${t(m.gender === "f" ? "cmp.choose.sister" : "cmp.choose.brother")}`}
              </p>
              <p className="flex flex-wrap gap-x-4 text-label tabular-nums">
                <span>{t("org.mentors.mentees", { n: num(m.mentees), cap: num(m.capacity) })}</span>
                <span>{t("org.mentors.groups", { n: num(m.group_members), cap: num(m.group_limit) })}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {m.state === "suspended" ? (
                  <Button size="sm" variant="secondary" onClick={() => void act(m, "reinstate")}>
                    {t("org.mentors.reinstate")}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setConfirm({ m, action: "suspend" })}>
                    {t("org.mentors.suspend")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ m, action: "revoke" })}>
                  {t("org.mentors.revoke")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 border-t pt-6" aria-labelledby="org-invite">
        <h2 id="org-invite" className="font-heading text-h3 font-bold">
          {t("org.mentors.invite")}
        </h2>
        <p className="text-label text-muted-foreground">{t("org.mentors.inviteHint")}</p>
        <Button className="w-fit" disabled={invite.isPending} onClick={() => invite.mutate()}>
          <IconUserPlus data-icon="inline-start" stroke={1.75} />
          {t("org.mentors.invite")}
        </Button>
        <ul className="flex flex-col gap-2">
          {invites.data?.map((i) => (
            <li key={i.code} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
              <code dir="ltr" className="flex-1 font-mono text-body">
                {i.code}
              </code>
              <span className={cn("text-caption", i.used ? "text-muted-foreground" : "font-bold text-success")}>
                {i.used ? t("admin.used") : i.expires_at ? t("org.mentors.expires", { date: i.expires_at.slice(0, 10) }) : t("admin.unused")}
              </span>
              {!i.used && (
                <Button variant="ghost" size="icon" aria-label={t("common.copy")} onClick={() => void navigator.clipboard?.writeText(i.code).then(() => toast.success(t("common.copied")))}>
                  <IconCopy />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Confirm
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? t(confirm.action === "revoke" ? "org.mentors.revoke" : "org.mentors.suspend") : ""}
        description={t("org.mentors.confirm")}
        confirmLabel={confirm ? t(confirm.action === "revoke" ? "org.mentors.revoke" : "org.mentors.suspend") : ""}
        cancelLabel={t("org.mentors.cancel")}
        destructive
        onConfirm={() => confirm && void act(confirm.m, confirm.action)}
      />
    </div>
  )
}

// --- ORG-01 codes -------------------------------------------------------------

export function OrgCodes({ orgId }: { orgId: string }) {
  const { t } = useT()
  const q = useQuery({ queryKey: ["org", "codes", orgId], queryFn: () => orgApi.codes(orgId) })
  return (
    <section className="flex flex-col gap-4" aria-labelledby="org-codes">
      <h2 id="org-codes" className="font-heading text-h3 font-bold">
        {t("org.codes.title")}
      </h2>
      <p className="text-label text-muted-foreground">{t("org.codes.hint")}</p>
      {q.isLoading && <Skeleton className="h-64 rounded-card" />}
      <CodeList codes={q.data ?? []} />
    </section>
  )
}

/** The full link for a code: this site + `/welcome?lang=xx&org=CODE`, nothing else. */
export const fullLink = (c: CodeRow, origin = typeof window !== "undefined" ? window.location.origin : "") => origin + c.path

function CodeList({ codes }: { codes: CodeRow[] }) {
  const { t } = useT()
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {codes.map((c) => {
        const link = fullLink(c)
        // White modules on a light card in both themes: scanners need the contrast.
        const svg = renderSVG(link, { border: 2, whiteColor: "white", blackColor: "black" })
        const src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
        return (
          <li key={c.code} className="flex flex-col items-center gap-3 rounded-card border-2 bg-card p-4" data-code={c.code}>
            <p className="text-body font-bold" lang={c.lang}>
              {langName(c.lang)}
            </p>
            <img src={src} alt={t("org.codes.qrAlt", { lang: langName(c.lang) })} className="size-44 rounded-md bg-white" />
            <code dir="ltr" className="font-mono text-h3 font-bold">
              {c.code}
            </code>
            <p dir="ltr" className="max-w-full truncate text-caption text-muted-foreground">
              {link}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast.success(t("common.copied")))}>
                <IconCopy data-icon="inline-start" stroke={1.75} />
                {t("org.codes.copyLink")}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={src} download={`rafeeq-${c.lang}-${c.code}.svg`}>
                  <IconDownload data-icon="inline-start" stroke={1.75} />
                  {t("org.codes.download")}
                </a>
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
