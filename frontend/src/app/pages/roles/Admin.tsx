/**
 * Admin: invite codes for mentors, the Sharia reviewer and team members
 * (plan §5: codes stand in for organisation approval), role changes, and
 * a mentor's or team member's gender (CMP security: only an admin changes it).
 */
import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TopBar } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import { api, ApiError } from "@/app/lib/api"
import { AdminOrgs } from "@/app/org/AdminOrgs" // ORG-01: organisations made by the team

// MOT-08: the team role is granted only in the database, so it is never offered
// here; a person who already holds it keeps a box to revoke it.
const INVITE_ROLES = ["mentor", "sharia_reviewer", "admin"] as const
const ALL_ROLES = ["learner", ...INVITE_ROLES] as const
export const rolesOffered = (held: string[]): string[] => (held.includes("team") ? [...ALL_ROLES, "team"] : [...ALL_ROLES])
const roleKey = (r: string): Key => (r === "team" ? "role.teamRole" : r === "admin" ? "role.adminRole" : (`role.${r}` as Key))

type InviteStatus = "available" | "used" | "expired" | "revoked"
type Invite = { code: string; role: string; gender?: "m" | "f" | null; used: boolean; status?: InviteStatus; expires_at?: string | null; created_at: string }
const statusOf = (i: Invite): InviteStatus => i.status ?? (i.used ? "used" : "available")

/** PLT-17 R11: what a role change adds and removes, shown before it is saved. */
export function roleDiff(before: string[], after: string[]): { added: string[]; removed: string[] } {
  return { added: after.filter((r) => !before.includes(r)), removed: before.filter((r) => !after.includes(r)) }
}

/** PLT-17 R11: the server's refusal, in words. */
export const roleErrorKey = (e: unknown): Key =>
  e instanceof ApiError && e.code === "cannot_remove_own_admin"
    ? "admin.err.ownAdmin"
    : e instanceof ApiError && e.code === "last_admin"
      ? "admin.err.lastAdmin"
      : "common.error"
type U = { id: string; username: string; display_name: string; roles: string[]; gender?: string | null }

export default function Admin() {
  const { t } = useT()
  return (
    <>
      <TopBar className="sticky top-0" title={<span className="font-heading text-h3">{t("role.admin")}</span>} />
      <div className="flex flex-col gap-10 px-4 pt-4 pb-12">
        <Invites />
        <AdminOrgs />
        <Roles />
      </div>
    </>
  )
}

function Invites() {
  const { t } = useT()
  const qc = useQueryClient()
  const [role, setRole] = React.useState<(typeof INVITE_ROLES)[number]>("mentor")
  // Security review B-H1: a mentor's code carries the gender the admin approved.
  const [gender, setGender] = React.useState("")
  const needsGender = role === "mentor"
  const list = useQuery({ queryKey: ["invites"], queryFn: () => api<Invite[]>("/api/admin/invites") })
  const create = useMutation({
    mutationFn: () =>
      api<{ codes: string[] }>("/api/admin/invites", { method: "POST", body: needsGender ? { role, count: 1, gender } : { role, count: 1 } }),
    onSuccess: (r) => {
      void navigator.clipboard?.writeText(r.codes[0]).then(() => toast.success(t("common.copied")))
      void qc.invalidateQueries({ queryKey: ["invites"] })
    },
    onError: () => toast.error(t("admin.createFailed")), // PLT-17 R13
  })
  const revoke = useMutation({
    mutationFn: (code: string) => api(`/api/admin/invites/${encodeURIComponent(code)}/revoke`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t("admin.revoked"))
      void qc.invalidateQueries({ queryKey: ["invites"] })
    },
    onError: () => toast.error(t("common.error")),
  })
  return (
    <section className="flex flex-col gap-4" aria-labelledby="inv">
      <h2 id="inv" className="font-heading text-h3 font-bold">
        {t("admin.invites")}
      </h2>
      <p className="text-label text-muted-foreground">
        {t("admin.invitesHint")} {t("admin.expiryHint")}
      </p>
      <ToggleGroup type="single" variant="outline" value={role} onValueChange={(v) => v && setRole(v as typeof role)} className="flex-wrap justify-start">
        {INVITE_ROLES.map((r) => (
          <ToggleGroupItem key={r} value={r}>
            {t(roleKey(r))}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {needsGender && (
        <div className="flex flex-col gap-2" data-slot="invite-gender">
          <span className="text-label font-bold">{t("sec.invite.gender")}</span>
          <ToggleGroup type="single" variant="outline" value={gender} onValueChange={(v) => setGender(v)} aria-label={t("sec.invite.gender")} className="justify-start">
            <ToggleGroupItem value="m">{t("acct.male")}</ToggleGroupItem>
            <ToggleGroupItem value="f">{t("acct.female")}</ToggleGroupItem>
          </ToggleGroup>
          <p className="text-caption text-muted-foreground">{t("sec.invite.genderHint")}</p>
        </div>
      )}
      <Button className="w-fit" onClick={() => create.mutate()} disabled={create.isPending || (needsGender && !gender)}>
        {t("admin.create")}
      </Button>
      <ul className="flex flex-col gap-2">
        {list.data?.map((i) => {
          const status = statusOf(i)
          const open = status === "available"
          return (
            <li key={i.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-card px-3 py-2">
              {/* its own row on a phone, so a 26-character code is not squeezed beside the labels */}
              <code dir="ltr" className="min-w-0 basis-full font-mono text-body break-all sm:flex-1 sm:basis-0">
                {i.code}
              </code>
              <span className="text-caption text-muted-foreground">
                {t(roleKey(i.role))}
                {i.gender && ` · ${t(i.gender === "f" ? "acct.female" : "acct.male")}`}
              </span>
              <span data-status={status} className={open ? "text-caption font-bold text-success" : "text-caption text-muted-foreground"}>
                {t(`admin.status.${status}` as Key)}
              </span>
              {open && i.expires_at && (
                <span className="text-caption text-muted-foreground">
                  {t("admin.expiresOn", { date: new Date(i.expires_at).toLocaleDateString("en-GB") })}
                </span>
              )}
              {open && (
                <span className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" aria-label={t("common.copy")} onClick={() => navigator.clipboard?.writeText(i.code).then(() => toast.success(t("common.copied")))}>
                    <IconCopy />
                  </Button>
                  <Button variant="ghost" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(i.code)}>
                    {t("admin.revoke")}
                  </Button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Roles() {
  const { t } = useT()
  const [q, setQ] = React.useState("")
  const users = useQuery({ queryKey: ["admin-users", q], queryFn: () => api<U[]>(`/api/admin/users?username=${encodeURIComponent(q)}`), enabled: q.length >= 2 })
  return (
    <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="rl">
      <h2 id="rl" className="font-heading text-h3 font-bold">
        {t("admin.users")}
      </h2>
      <Input dir="ltr" placeholder={t("admin.search")} aria-label={t("admin.search")} value={q} onChange={(e) => setQ(e.target.value.trim())} className="@min-[52.5rem]/shell:max-w-md" />
      {users.data && users.data.length === 0 && <p className="text-label text-muted-foreground">{t("admin.noUsers")}</p>}
      <ul className="flex flex-col gap-3 @min-[52.5rem]/shell:grid @min-[52.5rem]/shell:grid-cols-2 @min-[52.5rem]/shell:items-start">
        {users.data?.map((u) => (
          <UserRoles key={u.id} user={u} />
        ))}
      </ul>
    </section>
  )
}

function UserRoles({ user }: { user: U }) {
  const { t, locale } = useT()
  const [roles, setRoles] = React.useState(user.roles)
  const [saved, setSaved] = React.useState(user.roles)
  const [confirming, setConfirming] = React.useState(false)
  const save = useMutation({
    mutationFn: () => api<{ roles: string[] }>(`/api/admin/users/${user.id}/roles`, { method: "PUT", body: { roles } }),
    onSuccess: (r) => {
      setSaved(r.roles)
      toast.success(t("admin.saved"))
    },
    onError: (e) => {
      setRoles(saved) // PLT-17 R11: a refused change leaves the roles as they were
      toast.error(t(roleErrorKey(e)))
    },
  })
  const diff = roleDiff(saved, roles)
  const names = (rs: string[]) => rs.map((r) => t(roleKey(r))).join(locale === "ar" ? "، " : ", ")
  return (
    <li className="flex flex-col gap-3 rounded-card border-2 bg-card p-4">
      <p>
        <bdi className="font-bold">{user.display_name}</bdi> <span dir="ltr" className="text-label text-muted-foreground">@{user.username}</span>
      </p>
      <div className="flex flex-wrap gap-4">
        {rolesOffered(user.roles).map((r) => (
          <Label key={r} className="flex items-center gap-2 text-label">
            <Checkbox checked={roles.includes(r)} onCheckedChange={(v) => setRoles((x) => (v ? [...x, r] : x.filter((y) => y !== r)))} />
            {t(roleKey(r))}
          </Label>
        ))}
      </div>
      <Button variant="secondary" className="w-fit" disabled={save.isPending || (!diff.added.length && !diff.removed.length)} onClick={() => setConfirming(true)}>
        {t("admin.saveRoles")}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.confirm.title", { name: user.display_name })}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-1">
                {diff.added.length > 0 && <p>{t("admin.confirm.add", { roles: names(diff.added) })}</p>}
                {diff.removed.length > 0 && <p>{t("admin.confirm.remove", { roles: names(diff.removed) })}</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => save.mutate()}>{t("admin.confirm.ok")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <UserGender user={user} />
    </li>
  )
}

/** CMP gaps (security): a mentor's or team member's gender, once set, changes only here. */
function UserGender({ user }: { user: U }) {
  const { t } = useT()
  const [gender, setGender] = React.useState(user.gender ?? "")
  const save = useMutation({
    mutationFn: () => api(`/api/admin/users/${user.id}/gender`, { method: "PUT", body: { gender } }),
    onSuccess: () => toast.success(t("admin.saved")),
    onError: () => toast.error(t("common.error")),
  })
  return (
    <div className="flex flex-wrap items-center gap-3 border-t pt-3">
      <span className="text-label font-bold">{t("cmp.gaps.admin.gender")}</span>
      <ToggleGroup type="single" variant="outline" value={gender} onValueChange={(v) => setGender(v)} aria-label={t("cmp.gaps.admin.gender")}>
        <ToggleGroupItem value="m">{t("acct.male")}</ToggleGroupItem>
        <ToggleGroupItem value="f">{t("acct.female")}</ToggleGroupItem>
      </ToggleGroup>
      <Button variant="secondary" disabled={!gender || gender === (user.gender ?? "") || save.isPending} onClick={() => save.mutate()}>
        {t("cmp.gaps.admin.saveGender")}
      </Button>
    </div>
  )
}
