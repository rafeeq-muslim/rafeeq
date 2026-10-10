/**
 * Companion (CMP-01..05) and group challenge (MOT-06) API. CMP-06 (the
 * private notebook) has no API: it never leaves the device (notebook.ts).
 *
 * Real-time is polling with TanStack Query: 10 s while a conversation is
 * open, 15–30 s for lists, paused in background tabs. Help is asynchronous
 * (minutes to hours), the backend is one instance behind nginx without a
 * WebSocket route, and polling survives weak mobile networks without
 * reconnect logic. Push (neutral text) covers the "not looking" case.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError, api } from "@/app/lib/api"
import { currentSubscription } from "@/app/lib/push"
import { useAuth } from "@/app/stores/auth"
import { helpHeaders, useCompanion } from "./store"

export const POLL = { thread: 10_000, inbox: 15_000, list: 30_000 } as const

export type Topic = "religion" | "family" | "work_housing" | "money" | "feeling_low" | "other"
export const TOPICS: Topic[] = ["religion", "family", "work_housing", "money", "feeling_low", "other"]
export type Source = "lesson" | "review" | "ask" | "home" | "mentor"
export type Gender = "m" | "f"
/** CMP-04: the first three hide the message for everyone (R2); «خطر على أحد» tops the team's queue (R3). */
export type ReportReason = "marriage" | "money" | "recruitment" | "danger" | "abuse" | "other"
export const REASONS: ReportReason[] = ["marriage", "money", "recruitment", "danger", "abuse", "other"]
/** The system line the server adds when a mentor refers a question to scholars (CMP-02 R5). */
export const REFERRAL_NOTICE = "scholar_referral"
export type EngagementStatus = "new" | "active" | "at_risk" | "lapsed" | "returning"

export type ThreadSummary = {
  id: string
  kind: "human" | "escalation" | "urgent" | "mentor"
  topic: Topic | null
  source: Source | null
  status: "open" | "answered" | "closed"
  created_at: string
  last_activity_at: string
  unread: number
  preview: string | null
  responder_name: string | null
  /** The requester's own gender, to word «أخ» / «أخت» (CMP-01 R3). */
  gender: Gender | null
  /** CMP-01 R3 ex3: nobody of this gender is free in this language now; it waits, never routed to the other gender. */
  awaiting_same_gender: boolean
}
/** `hidden`: only ever true on the learner's own message, hidden for review (CMP-04 R5). */
export type ThreadMessage = { id: string; author: "me" | "mentor" | "scholar" | "system"; name: string | null; body: string; created_at: string; hidden?: boolean }
/** `link_ended`: a former mentor's thread (CMP-03 R4): readable; what is written in it goes to the current mentor or the pool. */
export type Thread = ThreadSummary & { messages: ThreadMessage[]; can_block: boolean; link_ended?: boolean; has_earlier?: boolean }

export type InboxRow = {
  id: string
  handle: string
  is_guest: boolean
  lang: string
  kind: ThreadSummary["kind"]
  topic: Topic | null
  source: Source | null
  status: ThreadSummary["status"]
  preview: string | null
  unread: number
  created_at: string
  last_activity_at: string
  assigned_to_me: boolean
  can_reply: boolean
  /** Security review B-M3: only the assignee or the team ends a conversation (absent on an older server: shown). */
  can_close?: boolean
  /** CMP-02 R8: a private mentor thread its mentor turned urgent; the team reads all of it. */
  escalated?: boolean
}
/** `hidden`: only ever true on the responder's own message, hidden for review (CMP-04 R5). */
export type InboxMessage = {
  id: string
  author: "learner" | "mentor" | "scholar" | "system"
  name: string | null
  mine: boolean
  body: string
  created_at: string
  hidden?: boolean
}
export type InboxThread = InboxRow & { messages: InboxMessage[]; referred: string[]; has_earlier?: boolean }
export type Referral = {
  id: string
  lang: string
  question: string
  status: "open" | "answered"
  created_at: string
  answer: string | null
  answered_at: string | null
}

export type MentorCardData = { id: string; display_name: string; languages: string[]; about: string; availability: string }
export type Mine = {
  mentor: MentorCardData | null
  share_progress: boolean
  chosen_at: string | null
  thread_id: string | null
  gender: Gender | null
  languages: string[]
  /** ORG-02 R5: the previous mentor is no longer available (no reason is ever given). */
  mentor_ended?: boolean
}
export type Mentee = {
  id: string
  display_name: string
  chosen_at: string
  needs_welcome: boolean
  shares_progress: boolean
  status: EngagementStatus | null
  status_changed_at: string | null
  thread_id: string | null
}
export type MentorProfile = { about: string; availability: string; accepting: boolean; capacity: number; mentees: number; languages: string[]; gender: string | null }

export type Member = { id: string; display_name: string; is_me: boolean }
export type Group = {
  id: string
  name: string
  lang: string
  gender: string
  capacity: number
  members_count: number
  mentor_name: string
  role: "mentor" | "member"
  join_code: string | null
  members: Member[]
  /** CMP-05 R8/R9: posting only while active (absent on an older server: active). */
  state?: GroupState
}
export type GroupState = "active" | "needs_mentor" | "paused" | "closed"
export type GroupMessage = {
  id: string
  author_id: string | null
  author_name: string
  from_mentor: boolean
  mine: boolean
  hidden: boolean
  body: string
  created_at: string
}

export type ChallengeType = "lesson" | "unit" | "lessons_each" | "days_each" | "group_total" | "free_text"
export const CHALLENGE_TYPES: ChallengeType[] = ["lessons_each", "days_each", "lesson", "unit", "group_total", "free_text"]
export type Challenge = {
  id: string
  type: ChallengeType
  target_id: string | null
  target_count: number | null
  text: string | null
  text_lang: string | null
  status: "active" | "pending_review" | "rejected"
  starts_at: string | null
  ends_at: string | null
  ended: boolean
  done: number
  of: number
  counts: "members" | "lessons"
  mine: boolean | null
  my_lessons: number | null
  shared_done: string[] | null
  /** Mentor only: the Sharia reviewer's reason for returning a free text (MOT-06 R3). */
  review_note?: string | null
}
export type Template = { id: string; text: string; lang: string }
export type QueueItem = {
  id: string
  target_type: "group_message" | "help_message"
  target_id: string
  reason: ReportReason | "mentor_hidden"
  priority: "danger" | "high" | "normal"
  note: string | null
  status: string
  created_at: string
  body: string | null
  author_name: string | null
  author_id: string | null
  hidden: boolean
  place: string | null
  group_id: string | null
}

/** The server's reason code for an error, for mapping to friendly copy. */
export const errorCode = (e: unknown) => (e instanceof ApiError ? e.code : "error")

const signedIn = () => !!useAuth.getState().token
const useSignedIn = () => useAuth((s) => !!s.token)

// --- CMP-01: the learner's help requests ------------------------------------

export type NewRequest = {
  kind: "human" | "escalation" | "urgent"
  source?: Source | null
  topic?: Topic | null
  /** CMP-01 R3: the requester's own gender; a guest answers once and the device remembers. */
  gender?: Gender | null
  lang: string
  body?: string
  ask_id?: string | null
}

export async function createRequest(body: NewRequest) {
  const endpoint = (await currentSubscription().catch(() => null))?.endpoint ?? null // R5: a guest's own device, if it allows push
  const out = await api<{ request: ThreadSummary; guest_token: string | null }>("/api/help/requests", {
    method: "POST",
    body: { ...body, push_endpoint: endpoint ?? undefined },
    headers: helpHeaders(),
  })
  if (out.guest_token) useCompanion.getState().set({ helpToken: out.guest_token })
  if (out.request.gender) useCompanion.getState().set({ helpGender: out.request.gender })
  return out.request
}

export function useMyRequests() {
  const token = useCompanion((s) => s.helpToken)
  const auth = useSignedIn()
  return useQuery({
    queryKey: ["cmp", "requests", auth, token],
    queryFn: () => api<ThreadSummary[]>("/api/help/requests", { headers: helpHeaders() }),
    enabled: auth || !!token,
    refetchInterval: POLL.list,
  })
}

export function useThread(id: string | undefined) {
  return useQuery({
    queryKey: ["cmp", "thread", id],
    queryFn: () => api<Thread>(`/api/help/requests/${id}`, { headers: helpHeaders() }),
    enabled: !!id,
    refetchInterval: POLL.thread,
  })
}

/** A-M4: the page of messages before `before` (the first message on screen). */
export const earlierOfThread = (id: string, before: string) =>
  api<Thread>(`/api/help/requests/${id}?before=${encodeURIComponent(before)}`, { headers: helpHeaders() })
export const earlierOfInboxThread = (id: string, before: string) =>
  api<InboxThread>(`/api/inbox/requests/${id}?before=${encodeURIComponent(before)}`)

export function usePostToThread(id: string) {
  const qc = useQueryClient()
  return useMutation({
    // CMP-03 R4: the summary says where the message went (another thread when this one's mentor link ended).
    mutationFn: (body: string) =>
      api<ThreadSummary>(`/api/help/requests/${id}/messages`, { method: "POST", body: { body }, headers: helpHeaders() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cmp"] }),
  })
}

/** CMP-01 R2 ex3: after sign-in on this device, guest conversations move to the account. */
export async function claimGuestRequests() {
  if (!signedIn() || !useCompanion.getState().helpToken) return
  try {
    await api("/api/help/claim", { method: "POST", headers: helpHeaders() })
    useCompanion.getState().set({ helpToken: null })
  } catch {
    /* next sign-in retries */
  }
}

// --- CMP-03: my mentor --------------------------------------------------------

export function useMine() {
  const auth = useSignedIn()
  return useQuery({ queryKey: ["cmp", "mine"], queryFn: () => api<Mine>("/api/mentors/mine"), enabled: auth })
}

export function useSuggestions(enabled: boolean) {
  return useQuery({
    queryKey: ["cmp", "suggestions"],
    queryFn: () => api<MentorCardData[]>("/api/mentors/suggestions"),
    enabled,
    staleTime: 0,
  })
}

export function useMineMutation<T>(fn: (v: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ["cmp"] }) })
}

export const mentorApi = {
  match: (gender: "m" | "f", languages: string[]) => api<Mine>("/api/mentors/me/match", { method: "PUT", body: { gender, languages } }),
  choose: (mentor_id: string) => api<Mine>("/api/mentors/choose", { method: "POST", body: { mentor_id } }),
  end: () => api("/api/mentors/mine", { method: "DELETE" }),
  share: (share: boolean) => api<Mine>("/api/mentors/mine/share", { method: "PUT", body: { share } }),
  thread: () => api<{ id: string }>("/api/mentors/mine/thread", { method: "POST" }),
  block: () => api("/api/mentors/mine/block", { method: "POST" }),
  dismissNotice: () => api("/api/mentors/mine/notice", { method: "DELETE" }), // ORG-02 R5
}

// --- CMP-05: groups ----------------------------------------------------------

export function useMyGroups() {
  const auth = useSignedIn()
  return useQuery({
    queryKey: ["cmp", "groups"],
    queryFn: async () => {
      const groups = await api<Group[]>("/api/groups/mine")
      useCompanion.getState().set({ inGroup: groups.some((g) => g.role === "member") })
      return groups
    },
    enabled: auth,
  })
}

export function useGroup(id: string | undefined) {
  return useQuery({ queryKey: ["cmp", "group", id], queryFn: () => api<Group>(`/api/groups/${id}`), enabled: !!id, refetchInterval: POLL.list })
}

export function useGroupMessages(id: string | undefined) {
  return useQuery({
    queryKey: ["cmp", "group-messages", id],
    queryFn: () => api<GroupMessage[]>(`/api/groups/${id}/messages`),
    enabled: !!id,
    refetchInterval: POLL.thread,
  })
}

export const groupApi = {
  join: (code: string) => api<Group>("/api/groups/join", { method: "POST", body: { code } }),
  create: (name: string, lang: string, capacity: number) => api<Group>("/api/groups", { method: "POST", body: { name, lang, capacity } }),
  setCapacity: (id: string, capacity: number) => api<Group>(`/api/groups/${id}/capacity`, { method: "PUT", body: { capacity } }),
  leave: (id: string) => api(`/api/groups/${id}/leave`, { method: "POST" }),
  remove: (id: string, userId: string) => api(`/api/groups/${id}/members/${userId}`, { method: "DELETE" }),
  post: (id: string, body: string) => api<GroupMessage>(`/api/groups/${id}/messages`, { method: "POST", body: { body } }),
  hide: (id: string, messageId: string) => api(`/api/groups/${id}/messages/${messageId}/hide`, { method: "POST" }),
}

// --- CMP-04: reports and blocks ------------------------------------------------

export const safetyApi = {
  report: (target_type: "group_message" | "help_message", target_id: string, reason: ReportReason, note?: string) =>
    api<{ ok: boolean; hidden_for_all: boolean }>("/api/reports", {
      method: "POST",
      body: { target_type, target_id, reason, note: note || undefined },
      headers: helpHeaders(),
    }),
  block: (user_id: string) => api("/api/blocks", { method: "POST", body: { user_id } }),
  blockResponder: (requestId: string) => api(`/api/help/requests/${requestId}/block`, { method: "POST", headers: helpHeaders() }),
}

// --- MOT-06: the group challenge --------------------------------------------

export function useChallenge(groupId: string | undefined) {
  return useQuery({
    queryKey: ["cmp", "challenge", groupId],
    queryFn: () => api<Challenge | null>(`/api/groups/${groupId}/challenge`),
    enabled: !!groupId,
    refetchInterval: POLL.list,
  })
}

export const challengeApi = {
  create: (groupId: string, body: Record<string, unknown>) => api<Challenge>(`/api/groups/${groupId}/challenge`, { method: "POST", body }),
  withdraw: (groupId: string) => api(`/api/groups/${groupId}/challenge`, { method: "DELETE" }),
  check: (id: string, done: boolean) => api(`/api/challenges/${id}/check`, { method: done ? "POST" : "DELETE" }),
  templates: (lang: string) => api<Template[]>(`/api/challenges/templates?lang=${lang}`),
}

// --- CMP-02: the mentor inbox -------------------------------------------------

export function useInbox() {
  return useQuery({ queryKey: ["cmp", "inbox"], queryFn: () => api<InboxRow[]>("/api/inbox/requests"), refetchInterval: POLL.inbox })
}

export function useInboxThread(id: string | undefined) {
  return useQuery({
    queryKey: ["cmp", "inbox-thread", id],
    queryFn: () => api<InboxThread>(`/api/inbox/requests/${id}`),
    enabled: !!id,
    refetchInterval: POLL.thread,
  })
}

export function useMentees(enabled = true) {
  return useQuery({ queryKey: ["cmp", "mentees"], queryFn: () => api<Mentee[]>("/api/inbox/mentees"), enabled, refetchInterval: POLL.list })
}

export function useMentorProfile(enabled = true) {
  return useQuery({ queryKey: ["cmp", "profile"], queryFn: () => api<MentorProfile>("/api/inbox/profile"), enabled })
}

/** CMP-04 R4: open reports by default; `history` adds reviewed ones and mentors' hides (R4 ex3), so the team can undo them. */
export function useReportQueue(enabled: boolean, history = false) {
  return useQuery({
    queryKey: ["cmp", "reports", history],
    queryFn: () => api<QueueItem[]>(history ? "/api/team/reports?include_closed=true" : "/api/team/reports"),
    enabled,
    refetchInterval: POLL.list,
  })
}

/** CMP-01 open question «أخت بكل لغة»: who can answer each language × gender, counts only (team). */
export type CoverageCell = { lang: string; gender: Gender; responders: number; available: number; covered: boolean }
export type Coverage = { cells: CoverageCell[]; uncovered: number; without_gender: number }

export function useCoverage(enabled: boolean) {
  return useQuery({ queryKey: ["cmp", "coverage"], queryFn: () => api<Coverage>("/api/team/coverage"), enabled, refetchInterval: POLL.list })
}

export const inboxApi = {
  reply: (id: string, body: string) => api(`/api/inbox/requests/${id}/messages`, { method: "POST", body: { body } }),
  close: (id: string) => api(`/api/inbox/requests/${id}/close`, { method: "POST" }),
  urgent: (id: string) => api(`/api/inbox/requests/${id}/urgent`, { method: "POST" }),
  /** CMP-02 R5: a personal Sharia question goes to the Sharia reviewer; the mentor gives no fatwa. */
  refer: (id: string, messageId: string) => api(`/api/inbox/requests/${id}/refer`, { method: "POST", body: { message_id: messageId } }),
  menteeThread: (learnerId: string) => api<InboxRow>(`/api/inbox/mentees/${learnerId}/thread`, { method: "POST" }),
  saveProfile: (p: Pick<MentorProfile, "about" | "availability" | "accepting" | "capacity">) =>
    api<MentorProfile>("/api/inbox/profile", { method: "PUT", body: p }),
  act: (reportId: string, action: "keep_hidden" | "restore" | "remove_member") =>
    api<QueueItem>(`/api/team/reports/${reportId}`, { method: "POST", body: { action } }),
}

// --- CMP-02 R5: the Sharia reviewer's referrals -------------------------------

export function useReferrals(enabled: boolean) {
  return useQuery({ queryKey: ["cmp", "referrals"], queryFn: () => api<Referral[]>("/api/referrals"), enabled, refetchInterval: POLL.list })
}

export const referralApi = {
  answer: (id: string, body: string) => api<Referral>(`/api/referrals/${id}/answer`, { method: "POST", body: { body } }),
}

// --- CMP-05 R8/R9 (cmp-admin-groups): the team moderates groups -------------

export type StaffGroup = {
  id: string
  name: string
  lang: string
  gender: Gender
  capacity: number
  members_count: number
  mentor_id: string
  mentor_name: string
  state: GroupState
  created_at: string
  /** Staff of the group's gender read its chat; the others manage it without reading. */
  can_read: boolean
}
export type MentorCandidate = { id: string; display_name: string; places_used: number; places_left: number }

export function useStaffGroups() {
  return useQuery({ queryKey: ["cmp", "staff-groups"], queryFn: () => api<StaffGroup[]>("/api/staff/groups"), refetchInterval: POLL.list })
}

export function useStaffGroup(id: string | undefined) {
  return useQuery({ queryKey: ["cmp", "staff-group", id], queryFn: () => api<StaffGroup>(`/api/staff/groups/${id}`), enabled: !!id })
}

export function useStaffGroupMessages(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["cmp", "staff-group-messages", id],
    queryFn: () => api<GroupMessage[]>(`/api/staff/groups/${id}/messages`),
    enabled: !!id && enabled,
    refetchInterval: POLL.thread,
  })
}

export function useMentorCandidates(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["cmp", "staff-group-candidates", id],
    queryFn: () => api<MentorCandidate[]>(`/api/staff/groups/${id}/candidates`),
    enabled: !!id && enabled,
  })
}

export const staffGroupApi = {
  assign: (id: string, mentorId: string) => api<StaffGroup>(`/api/staff/groups/${id}/mentor`, { method: "PUT", body: { mentor_id: mentorId } }),
  setStatus: (id: string, status: "active" | "paused" | "closed") =>
    api<StaffGroup>(`/api/staff/groups/${id}/status`, { method: "PUT", body: { status } }),
  hide: (id: string, messageId: string) => api(`/api/staff/groups/${id}/messages/${messageId}/hide`, { method: "POST" }),
  remove: (id: string, userId: string) => api(`/api/staff/groups/${id}/members/${userId}`, { method: "DELETE" }),
}
