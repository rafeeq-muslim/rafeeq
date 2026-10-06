/**
 * CMP-06 «دفتر الأسئلة الخاصة» (`private_notebook`).
 *
 * R1: kept in this browser's storage only. No account is needed, nothing is
 * uploaded, and it does not move between devices.
 * R2: a question leaves only when its owner sends it, one at a time, to
 * their mentor (a normal message in the mentor thread) or to the assistant
 * (a normal question). Offline, it stays here, marked as not sent.
 * R3: no code reads the notebook except the notebook screen: no AI, no
 * suggestion, no event, no inference about its owner (rules.md §1.2, §4).
 * R4: the owner deletes one question or all of them; clearing the site data
 * deletes it for good.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

import { api } from "@/app/lib/api"
import { mentorApi } from "./api"
import { helpHeaders } from "./store"

export const NOTEBOOK_KEY = "rafeeq.notebook"
/** The assistant's own limit (KNW-01 QUESTION_MAX), so a question can go either way. */
export const NOTE_MAX = 600

export type SentTo = "mentor" | "assistant"
export type Note = { id: string; text: string; createdAt: string; sentTo: SentTo | null; sentAt: string | null }

type NotebookState = {
  notes: Note[]
  /** R1 ex3: the owner has read, on first use, that the notebook stays on this device. */
  introSeen: boolean
  add: (text: string) => Note | null
  remove: (id: string) => void
  clear: () => void
  markSent: (id: string, to: SentTo) => void
  seeIntro: () => void
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const useNotebook = create<NotebookState>()(
  persist(
    (set) => ({
      notes: [],
      introSeen: false,
      add: (text) => {
        const clean = text.trim().slice(0, NOTE_MAX)
        if (!clean) return null
        const note: Note = { id: newId(), text: clean, createdAt: new Date().toISOString(), sentTo: null, sentAt: null }
        set((s) => ({ notes: [note, ...s.notes] }))
        return note
      },
      remove: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      clear: () => set({ notes: [] }),
      markSent: (id, to) =>
        set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, sentTo: to, sentAt: new Date().toISOString() } : n)) })),
      seeIntro: () => set({ introSeen: true }),
    }),
    { name: NOTEBOOK_KEY, version: 1 },
  ),
)

export class OfflineError extends Error {
  constructor() {
    super("offline")
  }
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine)

/** R2: this one question, and nothing else, becomes a message to the learner's mentor. */
export async function sendToMentor(note: Note): Promise<void> {
  if (!online()) throw new OfflineError() // R2 ex3: it stays in the notebook as it is
  const { id } = await mentorApi.thread()
  await api(`/api/help/requests/${id}/messages`, { method: "POST", body: { body: note.text }, headers: helpHeaders() })
  useNotebook.getState().markSent(note.id, "mentor")
}

/** R2 ex2: the question goes to the assistant as an ordinary question (Ask reads it from the route state once). */
export function assistantHandOff(note: Note): { to: string; state: { notebookQuestion: string } } {
  if (!online()) throw new OfflineError()
  useNotebook.getState().markSent(note.id, "assistant")
  return { to: "/ask", state: { notebookQuestion: note.text } }
}
