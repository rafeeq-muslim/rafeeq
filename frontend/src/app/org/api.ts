/**
 * ORG-01..03 client. The learner side sends only the organisation's code and
 * this device's random install ID (in the body, never the URL); the
 * coordinator side receives counts and shares only.
 */
import { api } from "@/app/lib/api"
import { useDevice } from "@/app/stores/device"
import { useOrgLink } from "./store"

export type CodeInfo = { name: string; lang: string }
export type LinkState = { linked: boolean; name: string | null; lang: string | null; linked_at: string | null }

/** Codes are typed by hand: spaces and dashes are ignored, letters are upper case. */
export const normalizeCode = (code: string) => code.replace(/[\s-]/g, "").toUpperCase()

/** R1/R3: name and language of a code. Keeps nothing on the server. */
export const codeInfo = (code: string) => api<CodeInfo>(`/api/org/codes/${encodeURIComponent(normalizeCode(code))}`)

/** R2/R3: only after «نعم». */
export async function linkOrg(code: string): Promise<LinkState> {
  const install_id = useDevice.getState().installId
  const r = await api<LinkState>("/api/org/link", { method: "POST", body: { code: normalizeCode(code), install_id } })
  useOrgLink.getState().set({ link: { name: r.name ?? "", lang: r.lang ?? "", linkedAt: r.linked_at ?? new Date().toISOString() } })
  return r
}

/** R4: unlink from «حسابي», on erasing the device and on deleting the account. */
export async function unlinkOrg(): Promise<void> {
  const install_id = useDevice.getState().installId
  await api("/api/org/link/remove", { method: "POST", body: { install_id } })
  useOrgLink.getState().set({ link: null })
}

export const linkState = () => api<LinkState>("/api/org/link/status", { method: "POST", body: { install_id: useDevice.getState().installId } })

// --- coordinator ----------------------------------------------------------------

export type Org = { id: string; name: string; languages: string[] }
export type CodeRow = { code: string; lang: string; path: string }
/** `n: null` = «أقل من 10»; `pct: null` = no share shown. */
export type Fig = { n: number | null; pct?: number | null }
export type Checkpoint = { due: boolean; n: number | null; pct: number | null }
export type Dashboard = {
  as_of: string
  lang: string | null
  empty: boolean
  linked: Fig
  statuses: Record<"new" | "active" | "at_risk" | "lapsed" | "returning" | "none", Fig>
  returned: Fig
  cohorts: { month: string; size: Fig; d30: Checkpoint; d90: Checkpoint }[]
  languages: ({ lang: string } & Fig)[]
  codes?: CodeRow[]
}
export type MentorState = "receiving" | "paused" | "suspended" | "awaiting_rules"
export type OrgMentor = {
  id: string
  display_name: string
  languages: string[]
  gender: "m" | "f" | null
  state: MentorState
  mentees: number
  capacity: number
  group_members: number
  group_limit: number
}
export type Mentors = { mentors: OrgMentor[]; missing: { lang: string; gender: "m" | "f" }[] }
export type OrgInvite = { code: string; expires_at: string | null; used: boolean; gender?: "m" | "f" | null }

export const orgApi = {
  mine: () => api<Org[]>("/api/org/mine"),
  codes: (id: string) => api<CodeRow[]>(`/api/org/${id}/codes`),
  dashboard: (id: string, lang: string | null) => api<Dashboard>(`/api/org/${id}/dashboard${lang ? `?lang=${lang}` : ""}`),
  mentors: (id: string) => api<Mentors>(`/api/org/${id}/mentors`),
  invites: (id: string) => api<OrgInvite[]>(`/api/org/${id}/invites`),
  // Security review B-H1: the coordinator states the volunteer's gender; the code carries it.
  invite: (id: string, gender: "m" | "f") => api<OrgInvite>(`/api/org/${id}/invites`, { method: "POST", body: { gender } }),
  suspend: (id: string, mentor: string) => api(`/api/org/${id}/mentors/${mentor}/suspend`, { method: "POST" }),
  reinstate: (id: string, mentor: string) => api(`/api/org/${id}/mentors/${mentor}/reinstate`, { method: "POST" }),
  revoke: (id: string, mentor: string) => api(`/api/org/${id}/mentors/${mentor}`, { method: "DELETE" }),
}

/** `links`, `links_last_day`: security review B-M4, counts per code for the admin only. */
export type AdminOrg = Org & { active: boolean; codes: (CodeRow & { links?: number; links_last_day?: number })[]; coordinators: number }
export const adminOrgApi = {
  list: () => api<AdminOrg[]>("/api/admin/orgs"),
  create: (name: string, languages: string[]) => api<AdminOrg>("/api/admin/orgs", { method: "POST", body: { name, languages } }),
  invite: (id: string) => api<OrgInvite>(`/api/admin/orgs/${id}/invites`, { method: "POST" }),
}
