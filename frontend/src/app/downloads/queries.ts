/** PLT-12: the download catalogue, item names and sizes for the UI. */
import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/app/lib/api"
import { num, type Key } from "@/app/i18n"
import { suraName } from "@/app/lesson/suras"
import { checkUpdates } from "./manager"
import type { Catalog, CatalogItem } from "./types"

type T = (key: Key, vars?: Record<string, string | number>) => string

const checked = new Set<string>()

/** The catalogue in `lang`; each new copy is compared with the downloads (R3). */
export function useCatalog(lang: string, enabled = true) {
  const q = useQuery({
    queryKey: ["downloads-catalog", lang],
    queryFn: () => api<Catalog>(`/api/downloads/catalog?lang=${lang}`),
    staleTime: 5 * 60_000,
    retry: 1,
    enabled,
  })
  React.useEffect(() => {
    if (!q.data || checked.has(`${lang}:${q.dataUpdatedAt}`)) return
    checked.add(`${lang}:${q.dataUpdatedAt}`)
    void checkUpdates(q.data).catch(() => undefined)
  }, [q.data, q.dataUpdatedAt, lang])
  return q
}

/** Latin digits always; MB with one decimal. */
export function formatSize(bytes: number, t: T): string {
  if (bytes < 1024) return t("downloads.size.b", { n: num(bytes) })
  if (bytes < 1024 ** 2) return t("downloads.size.kb", { n: num(Math.round(bytes / 1024)) })
  if (bytes < 1024 ** 3) return t("downloads.size.mb", { n: (bytes / 1024 ** 2).toFixed(1) })
  return t("downloads.size.gb", { n: (bytes / 1024 ** 3).toFixed(2) })
}

export function itemName(item: { kind: string; ref: string; title: string; id: string }, t: T, locale: string): string {
  if (item.kind === "quran_text") return t(item.id.endsWith(":ar") ? "downloads.quranTextAr" : "downloads.quranText")
  if (item.kind === "surah") return t("downloads.surah", { name: suraName(Number(item.ref), locale) })
  if (item.kind === "video") return t("downloads.video.name", { name: item.title })
  return item.title
}

/** A unit's videos in the catalogue (each its own item since 2026-10-10). */
export function unitVideos(catalog: Catalog | undefined, unitRef: string): CatalogItem[] {
  return catalog ? catalog.sections.lessons.filter((v) => v.kind === "video" && v.unit === unitRef) : []
}

/** The catalogue id of a lesson video: `video:` + the server's file id of its URL
 * (backend downloads.file_id: "f" + the first 24 hex of SHA-256). */
export async function videoItemId(url: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url)))
  const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("")
  return `video:f${hex.slice(0, 24)}`
}

/**
 * Owner decision 2026-10-10: a lesson video is its own download, never part of
 * the unit's. Its id and catalogue entry (size, before anything is fetched);
 * the entry only while online (one small request, not the whole catalogue).
 */
export function useVideoItem(url: string, lang: string, online: boolean) {
  const id = useQuery({ queryKey: ["video-item-id", url], queryFn: () => videoItemId(url), staleTime: Infinity, retry: false })
  const item = useQuery({
    queryKey: ["downloads-item", id.data, lang],
    queryFn: () => api<CatalogItem>(`/api/downloads/catalog/${encodeURIComponent(id.data!)}?lang=${lang}`),
    enabled: online && !!id.data,
    staleTime: 5 * 60_000,
    retry: false,
  })
  return { id: id.data, item: item.data }
}
