/**
 * The Ask thread for this visit. Kept in memory only: remembering
 * conversations across sessions is out of scope (KNW-01), and no question
 * text is written to the device or the server.
 */
import { create } from "zustand"
import { ApiError, api } from "@/app/lib/api"
import { useDevice } from "@/app/stores/device"
import type { AskResponse, Turn } from "./types"

type AskState = {
  turns: Turn[]
  busy: boolean
  ask: (question: string, lang: string) => Promise<AskResponse | null>
  put: (id: string, turn: Turn) => void
}

const newId = () => Math.random().toString(36).slice(2, 10)

export const useAsk = create<AskState>()((set, get) => ({
  turns: [],
  busy: false,
  put: (id, turn) => set({ turns: get().turns.map((t) => (t.id === id ? turn : t)) }),
  ask: async (question, lang) => {
    const q = question.trim()
    if (q.length < 2 || get().busy) return null
    const pendingId = newId()
    set({
      busy: true,
      turns: [...get().turns, { id: newId(), role: "user", text: q }, { id: pendingId, role: "assistant", state: "pending", startedAt: Date.now() }],
    })
    try {
      const r = await api<AskResponse>("/api/ask", {
        method: "POST",
        body: { question: q, lang, consent_objectives: useDevice.getState().askConsent },
      })
      get().put(pendingId, { id: pendingId, role: "assistant", state: "done", response: r })
      return r
    } catch (e) {
      const code = e instanceof ApiError && e.status === 429 ? "rate_limited" : "network"
      get().put(pendingId, { id: pendingId, role: "assistant", state: "error", question: q, code })
      return null
    } finally {
      set({ busy: false })
    }
  },
}))
