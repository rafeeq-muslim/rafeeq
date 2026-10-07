/**
 * CMP-08: who applied to be a mentor — /mentor-applications for the team
 * and admins (R3, R4), and the «الطلبات» tab of /org for a coordinator, who
 * sees only the applications that named the organisation and never the
 * team's note (R8). The API enforces both.
 *
 * Pending first. Accept shows a one-time invite code to send by hand
 * (Rafeeq sends no email or message), or says the applicant's own account
 * became a mentor (R5). Reject deletes the contact and the text at once.
 */
import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { TopBar } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import { api, ApiError } from "@/app/lib/api"
import { Confirm } from "./Confirm"
import { dayMonth, langName } from "./format"

export type Application = {
  id: string
  display_name: string
  gender: "m" | "f"
  languages: string[]
  locale: string
  place: string | null
  about: string | null
  contact: string | null
  has_account: boolean
  organization: string | null
  status: "pending" | "approved" | "rejected"
  applied_at: string
  decided_at: string | null
  note: string | null
  invite_code: string | null
  invite_used: boolean
  invite_expires_at: string | null
}

export const TEAM_APPLICATIONS = "/api/admin/mentor-applications"
const STATUS_BADGE = { pending: "info", approved: "success", rejected: "secondary" } as const

export default function MentorApplicationsPage() {
  const { t } = useT()
  return (
    <>
      <TopBar className="sticky top-0" title={<span className="font-heading text-h3">{t("cmp.apps.title")}</span>} />
      <div className="px-4 pt-4 pb-12">
        <ApplicationsList base={TEAM_APPLICATIONS} />
      </div>
    </>
  )
}

/** `coordinator`: no note on a rejection and no delete (the team's own tools). */
export function ApplicationsList({ base, coordinator = false }: { base: string; coordinator?: boolean }) {
  const { t } = useT()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ["cmp", "applications", base], queryFn: () => api<Application[]>(base) })
  const [rejecting, setRejecting] = React.useState<string | null>(null)
  const [note, setNote] = React.useState("")
  const [deleting, setDeleting] = React.useState<Application | null>(null)
  const [busy, setBusy] = React.useState(false)

  const run = async (call: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await call()
      await qc.invalidateQueries({ queryKey: ["cmp", "applications"] })
    } catch (e) {
      // Security review B-H1: the account's gender no longer matches the application.
      toast.error(t(e instanceof ApiError && e.code === "gender_mismatch" ? "sec.apps.genderMismatch" : "common.error"))
    } finally {
      setBusy(false)
    }
  }
  const approve = (a: Application) => run(() => api(`${base}/${a.id}/approve`, { method: "POST" }))
  const reject = (a: Application) =>
    run(async () => {
      await api(`${base}/${a.id}/reject`, { method: "POST", body: coordinator ? undefined : { note: note.trim() || null } })
      setRejecting(null)
      setNote("")
    })
  const remove = (a: Application) => run(() => api(`${base}/${a.id}`, { method: "DELETE" }))

  return (
    <section className="flex flex-col gap-4" aria-labelledby="apps-title">
      <h2 id="apps-title" className="sr-only">
        {t("cmp.apps.title")}
      </h2>
      <p className="text-label text-muted-foreground">{t(coordinator ? "cmp.apps.orgHint" : "cmp.apps.hint")}</p>
      {q.isLoading && <Skeleton className="h-40 rounded-card" />}
      {q.isError && <p className="text-body text-destructive">{t("common.error")}</p>}
      {q.data?.length === 0 && (
        <p className="text-body text-muted-foreground" data-slot="apps-empty">
          {t("cmp.apps.empty")}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {q.data?.map((a) => (
          <li key={a.id} className="flex flex-col gap-3 rounded-card border-2 bg-card p-4" data-application={a.id} data-status={a.status}>
            <div className="flex flex-wrap items-center gap-2">
              <bdi className="text-body font-bold">{a.display_name}</bdi>
              <Badge variant={STATUS_BADGE[a.status]}>{t(`cmp.apps.status.${a.status}` as Key)}</Badge>
              <AppliedOn iso={a.applied_at} />
            </div>
            <p className="text-caption text-muted-foreground">
              {t(a.gender === "f" ? "acct.female" : "acct.male")} · {a.languages.map(langName).join(" · ")}
              {a.place && (
                <>
                  {" · "}
                  <bdi>{a.place}</bdi>
                </>
              )}
            </p>
            {a.organization && (
              <p className="text-label">
                <bdi>{t("cmp.apps.org", { name: a.organization })}</bdi>
              </p>
            )}
            {a.about && (
              <p dir="auto" className="text-body whitespace-pre-line">
                {a.about}
              </p>
            )}
            {a.contact && (
              <p className="flex items-center gap-2 text-label" data-slot="contact">
                <span className="shrink-0 font-bold">{t("cmp.apps.contact")}</span>
                <span dir="ltr" className="min-w-0 break-all">
                  {a.contact}
                </span>
                <CopyButton value={a.contact} />
              </p>
            )}
            {a.has_account && a.status === "pending" && <p className="text-label text-muted-foreground">{t("cmp.apps.hasAccount")}</p>}
            {a.status === "approved" && a.has_account && !a.invite_code && <p className="text-label text-success">{t("cmp.apps.granted")}</p>}
            {a.invite_code && (
              <div className="flex flex-col gap-1 rounded-md bg-muted p-3" data-slot="invite">
                <p className="flex flex-wrap items-center gap-2 text-label">
                  <span className="font-bold">{t("cmp.apps.code")}</span>
                  <code dir="ltr" className="font-mono text-body">
                    {a.invite_code}
                  </code>
                  {a.invite_used ? <Badge variant="secondary">{t("admin.used")}</Badge> : <CopyButton value={a.invite_code} />}
                </p>
                {!a.invite_used && (
                  <p className="text-caption text-muted-foreground">
                    {t("cmp.apps.codeHint")}
                    {a.invite_expires_at && <ExpiresOn iso={a.invite_expires_at} />}
                  </p>
                )}
              </div>
            )}
            {a.note && (
              <p dir="auto" className="text-label text-muted-foreground" data-slot="note">
                {t("cmp.apps.noteShown", { note: a.note })}
              </p>
            )}

            {a.status === "pending" && rejecting !== a.id && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => void approve(a)}>
                  {t("cmp.apps.approve")}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => (setRejecting(a.id), setNote(""))}>
                  {t("cmp.apps.reject")}
                </Button>
              </div>
            )}
            {a.status === "pending" && rejecting === a.id && (
              <div className="flex flex-col gap-3 border-t pt-3" data-slot="reject">
                <p className="text-label font-bold">
                  <bdi>{t("cmp.apps.rejectTitle", { name: a.display_name })}</bdi>
                </p>
                <p className="text-label text-muted-foreground">{t("cmp.apps.rejectBody")}</p>
                {!coordinator && (
                  <Field>
                    <FieldLabel htmlFor={`note-${a.id}`}>{t("cmp.apps.note")}</FieldLabel>
                    <Textarea id={`note-${a.id}`} dir="auto" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => void reject(a)}>
                    {t("cmp.apps.reject")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            )}
            {!coordinator && rejecting !== a.id && (
              <Button size="sm" variant="ghost" className="w-fit text-destructive" disabled={busy} onClick={() => setDeleting(a)}>
                {t("cmp.apps.delete")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Confirm
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("cmp.apps.deleteTitle", { name: deleting?.display_name ?? "" })}
        description={t("cmp.apps.deleteBody")}
        confirmLabel={t("cmp.apps.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => deleting && void remove(deleting)}
      />
    </section>
  )
}

function AppliedOn({ iso }: { iso: string }) {
  const { locale } = useT()
  return <span className="text-caption text-muted-foreground tabular-nums">{dayMonth(iso, locale)}</span>
}

function ExpiresOn({ iso }: { iso: string }) {
  const { t, locale } = useT()
  return <span> {t("cmp.apps.codeExpires", { date: dayMonth(iso, locale) })}</span>
}

function CopyButton({ value }: { value: string }) {
  const { t } = useT()
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("common.copy")}
      onClick={() => void navigator.clipboard?.writeText(value).then(() => toast.success(t("common.copied")), () => undefined)}
    >
      <IconCopy />
    </Button>
  )
}
