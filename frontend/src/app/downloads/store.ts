/**
 * PLT-12: what this device downloaded (metadata only; the bytes are in Cache
 * Storage `rafeeq-downloads`). Kept under `rafeeq.downloads`, so erasing the
 * device (PLT-05) removes it with everything else (R4). Nothing here leaves
 * the device.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { CatalogFile, CatalogItem, Section } from "./types"

export type Status = "queued" | "downloading" | "paused" | "done" | "failed"

export type SavedItem = {
  id: string
  section: Section
  kind: string
  ref: string
  title: string
  lang: string
  version: string
  /** Size shown before the download (catalogue). */
  bytes: number
  files: CatalogFile[]
  /** Keys of the files complete in the cache (R2: the item counts only when all are). */
  done: string[]
  status: Status
  error?: "quota" | "network" | "unavailable" | null
  /** R5: the size the download needed when the space ran out. */
  needed?: number
  /** R3: a changed media file, offered with its size, never fetched on its own. */
  update?: { bytes: number; version: string } | null
  /** Files of the previous version, dropped once the update completes. */
  obsolete?: string[]
}

type State = {
  items: Record<string, SavedItem>
  /** Bytes received of the file being downloaded, per item (not persisted). */
  progress: Record<string, number>
  persistAsked: boolean
  put: (item: SavedItem) => void
  patch: (id: string, p: Partial<SavedItem>) => void
  drop: (id: string) => void
  clear: () => void
  setProgress: (id: string, bytes: number) => void
  set: (p: Partial<Pick<State, "persistAsked">>) => void
}

export const useDownloads = create<State>()(
  persist(
    (set) => ({
      items: {},
      progress: {},
      persistAsked: false,
      put: (item) => set((s) => ({ items: { ...s.items, [item.id]: item } })),
      patch: (id, p) => set((s) => (s.items[id] ? { items: { ...s.items, [id]: { ...s.items[id], ...p } } } : s)),
      drop: (id) =>
        set((s) => {
          const items = { ...s.items }
          delete items[id]
          const progress = { ...s.progress }
          delete progress[id]
          return { items, progress }
        }),
      clear: () => set({ items: {}, progress: {} }),
      setProgress: (id, bytes) => set((s) => ({ progress: { ...s.progress, [id]: bytes } })),
      set: (p) => set(p),
    }),
    { name: "rafeeq.downloads", version: 1, partialize: (s) => ({ items: s.items, persistAsked: s.persistAsked }) },
  ),
)

export function fromCatalog(item: CatalogItem, lang: string, prev?: SavedItem): SavedItem {
  const keys = new Set(item.files.map((f) => f.key))
  return {
    id: item.id,
    section: item.section,
    kind: item.kind,
    ref: item.ref,
    title: item.title,
    lang,
    version: item.version,
    bytes: item.bytes,
    files: item.files,
    done: (prev?.done ?? []).filter((k) => keys.has(k)),
    status: "queued",
    error: null,
    update: null,
    obsolete: prev ? prev.files.map((f) => f.key).filter((k) => !keys.has(k)) : [],
  }
}

/** Bytes of the complete files of an item. */
export function storedBytes(item: SavedItem): number {
  const done = new Set(item.done)
  return item.files.filter((f) => done.has(f.key)).reduce((n, f) => n + (f.bytes ?? 0), 0)
}

/** Whether a file (by the URL the app requests) is complete on this device, in any
 * download: a lesson video downloaded alone, or held by a unit downloaded before
 * videos left the unit (owner decision 2026-10-10). */
export function useHeld(key: string): boolean {
  return useDownloads((s) => Object.values(s.items).some((i) => i.done.includes(key)))
}

/** Bytes all downloads take, each shared file counted once (R4: the storage numbers). */
export function totalStored(items: Record<string, SavedItem>): number {
  const seen = new Map<string, number>()
  for (const it of Object.values(items)) {
    const done = new Set(it.done)
    for (const f of it.files) if (done.has(f.key)) seen.set(f.key, f.bytes ?? 0)
  }
  return [...seen.values()].reduce((a, b) => a + b, 0)
}
