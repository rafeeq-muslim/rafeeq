/**
 * ORG-01: this device's own record of its organisation link, shown in
 * «حسابي» and included in «نزّل نسخة من بياناتي» (it is under the
 * `rafeeq.` prefix, so erasing the device removes it too). Only set after
 * «نعم»; «لا» leaves nothing here.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

export type OrgLinkRecord = { name: string; lang: string; linkedAt: string }

type State = { link: OrgLinkRecord | null; set: (patch: Partial<Omit<State, "set">>) => void }

export const useOrgLink = create<State>()(
  persist((set) => ({ link: null, set: (patch) => set(patch) }), { name: "rafeeq.org", version: 1 }),
)
