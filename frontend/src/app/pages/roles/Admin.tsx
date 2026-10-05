/**
 * Admin: invite codes for mentors, the Sharia reviewer and team members
 * (plan §5: codes stand in for organisation approval), and role changes.
 */
import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TopBar } from "@/components/rafeeq"
import { useT, type Key } from "@/app/i18n"
import { api } from "@/app/lib/api"

const INVITE_ROLES = ["mentor", "sharia_reviewer", "team", "admin"] as const
const ALL_ROLES = ["learner", ...INVITE_ROLES] as const
const roleKey = (r: string): Key => (r === "team" ? "role.teamRole" : r === "admin" ? "role.adminRole" : (`role.${r}` as Key))

type Invite = { code: string; role: string; used: boolean; created_at: string }
type U = { id: string; username: string; display_name: string; roles: string[] }

export default function Admin() {
  const { t } = useT()
  return (
    <>
      <TopBar className="sticky top-0" title={<span className="font-heading text-h3">{t("role.admin")}</span>} />
      <div className="flex flex-col gap-10 px-4 pt-4 pb-12">
        <Invites />
        <Roles />
      </div>
    </>
  )
}

function Invites() {
  const { t } = useT()
  const qc = useQueryClient()
  const [role, setRole] = React.useState<(typeof INVITE_ROLES)[number]>("mentor")
  const list = useQuery({ queryKey: ["invites"], queryFn: () => api<Invite[]>("/api/admin/invites") })
  const create = useMutation({
    mutationFn: () => api<{ codes: string[] }>("/api/admin/invites", { method: "POST", body: { role, count: 1 } }),
    onSuccess: (r) => {
      void navigator.clipboard?.writeText(r.codes[0]).then(() => toast.success(t("common.copied")))
      void qc.invalidateQueries({ queryKey: ["invites"] })
    },
  })
  return (
    <section className="flex flex-col gap-4" aria-labelledby="inv">
      <h2 id="inv" className="font-heading text-h3 font-bold">
        {t("admin.invites")}
      </h2>
      <p className="text-label text-muted-foreground">{t("admin.invitesHint")}</p>
      <ToggleGroup type="single" variant="outline" value={role} onValueChange={(v) => v && setRole(v as typeof role)} className="flex-wrap justify-start">
        {INVITE_ROLES.map((r) => (
          <ToggleGroupItem key={r} value={r}>
            {t(roleKey(r))}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Button className="w-fit" onClick={() => create.mutate()} disabled={create.isPending}>
        {t("admin.create")}
      </Button>
      <ul className="flex flex-col gap-2">
        {list.data?.map((i) => (
          <li key={i.code} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
            <code dir="ltr" className="flex-1 font-mono text-body">
              {i.code}
            </code>
            <span className="text-caption text-muted-foreground">{t(roleKey(i.role))}</span>
            <span className={i.used ? "text-caption text-muted-foreground" : "text-caption font-bold text-success"}>{t(i.used ? "admin.used" : "admin.unused")}</span>
            {!i.used && (
              <Button variant="ghost" size="icon" aria-label={t("common.copy")} onClick={() => navigator.clipboard?.writeText(i.code).then(() => toast.success(t("common.copied")))}>
                <IconCopy />
              </Button>
            )}
          </li>
        ))}
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
      <Input dir="ltr" placeholder={t("admin.search")} aria-label={t("admin.search")} value={q} onChange={(e) => setQ(e.target.value.trim())} />
      <ul className="flex flex-col gap-3">
        {users.data?.map((u) => (
          <UserRoles key={u.id} user={u} />
        ))}
      </ul>
    </section>
  )
}

function UserRoles({ user }: { user: U }) {
  const { t } = useT()
  const [roles, setRoles] = React.useState(user.roles)
  const save = useMutation({
    mutationFn: () => api(`/api/admin/users/${user.id}/roles`, { method: "PUT", body: { roles } }),
    onSuccess: () => toast.success(t("admin.saved")),
    onError: () => toast.error(t("common.error")),
  })
  return (
    <li className="flex flex-col gap-3 rounded-card border-2 bg-card p-4">
      <p>
        <bdi className="font-bold">{user.display_name}</bdi> <span dir="ltr" className="text-label text-muted-foreground">@{user.username}</span>
      </p>
      <div className="flex flex-wrap gap-4">
        {ALL_ROLES.map((r) => (
          <Label key={r} className="flex items-center gap-2 text-label">
            <Checkbox checked={roles.includes(r)} onCheckedChange={(v) => setRoles((x) => (v ? [...x, r] : x.filter((y) => y !== r)))} />
            {t(roleKey(r))}
          </Label>
        ))}
      </div>
      <Button variant="secondary" className="w-fit" disabled={save.isPending} onClick={() => save.mutate()}>
        {t("admin.saveRoles")}
      </Button>
    </li>
  )
}
