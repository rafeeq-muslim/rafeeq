/** Signed-in account (PLT-02). The access token lives in memory only; the
 * refresh token is an httpOnly cookie the page cannot read. */
import { create } from "zustand"

export type Me = {
  id: string
  display_name: string
  username: string
  roles: string[]
  locale: "ar" | "en" | "tl"
  two_factor_enabled: boolean
  email_hint: string | null
  gender: string | null
  languages: string[]
}

type AuthState = {
  token: string | null
  me: Me | null
  ready: boolean
  set: (p: Partial<Omit<AuthState, "set" | "has">>) => void
  has: (role: string) => boolean
}

export const useAuth = create<AuthState>()((set, get) => ({
  token: null,
  me: null,
  ready: false,
  set: (p) => set(p),
  has: (role) => !!get().me?.roles.some((r) => r === role || r === "admin"),
}))
