/**
 * PLT-12 download manager (device side).
 *
 * - Only on the learner's request (R3); before the first download the
 *   browser is asked to keep Rafeeq's storage (R5, navigator.storage.persist).
 * - One item at a time, its files one by one, each written whole to Cache
 *   Storage `rafeeq-downloads` under the URL the app requests. An item is
 *   «منزّلة» only when every file is there (R2).
 * - Connection lost: the item pauses and continues from the next missing
 *   file when the connection returns (R5).
 * - Space ran out (QuotaExceededError): the download stops, the item's own
 *   files are deleted, earlier downloads stay intact, and the learner sees
 *   the size it needed (R5).
 * - Requests carry no account or device id: no credentials, no headers (R4).
 * - Text that changed is fetched again silently when online; a changed media
 *   file is offered with its size and fetched only on request (R3).
 */
import { fromCatalog, useDownloads, type SavedItem } from "./store"
import type { Catalog, CatalogFile, CatalogItem } from "./types"

export const DOWNLOADS_CACHE = "rafeeq-downloads"
export const CHANGED_MESSAGE = "plt12:downloads-changed"

type Deps = {
  fetch: typeof fetch
  caches: CacheStorage
  persist: () => Promise<boolean>
  notify: () => void
}

const defaults = (): Deps => ({
  fetch: (...a) => fetch(...a),
  caches: globalThis.caches,
  persist: async () => (await navigator.storage?.persist?.()) ?? false,
  notify: () => navigator.serviceWorker?.controller?.postMessage({ type: CHANGED_MESSAGE }),
})

let deps: Deps = defaults()

/** Tests: replace the browser APIs. */
export function setDeps(d: Partial<Deps>) {
  deps = { ...defaults(), ...d }
}

const store = () => useDownloads.getState()

class HttpError extends Error {
  status: number
  constructor(status: number) {
    super(`http_${status}`)
    this.status = status
  }
}

const isQuota = (e: unknown) => (e as { name?: string })?.name === "QuotaExceededError"

/** Keys of `id` that no other downloaded item uses. */
function ownKeys(id: string, keys: string[]): string[] {
  const others = new Set(
    Object.values(store().items)
      .filter((i) => i.id !== id)
      .flatMap((i) => i.done),
  )
  return keys.filter((k) => !others.has(k))
}

async function dropKeys(keys: string[]) {
  if (!keys.length || !deps.caches) return
  const cache = await deps.caches.open(DOWNLOADS_CACHE)
  await Promise.all(keys.map((k) => cache.delete(k)))
}

/** The response body, counted as it streams into the cache; an incomplete body fails. */
function counted(res: Response, onBytes: (n: number) => void): BodyInit | null {
  const expected = Number(res.headers.get("content-length") ?? NaN)
  if (!res.body || typeof TransformStream === "undefined") return res.body
  let n = 0
  return res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, c) {
        n += chunk.byteLength
        onBytes(n)
        c.enqueue(chunk)
      },
      flush(c) {
        if (Number.isFinite(expected) && n !== expected) c.error(new TypeError("incomplete"))
      },
    }),
  )
}

async function fetchFile(cache: Cache, id: string, f: CatalogFile): Promise<number> {
  const res = await deps.fetch(f.url, { credentials: "omit", cache: "no-store" })
  if (!res.ok) throw new HttpError(res.status)
  let size = 0
  const body = counted(res, (n) => {
    size = n
    store().setProgress(id, n)
  })
  const headers = { "Content-Type": f.mime, "Accept-Ranges": "bytes" }
  if (body === res.body || body === null) {
    const blob = await res.blob()
    size = blob.size
    await cache.put(f.key, new Response(blob, { headers: { ...headers, "Content-Length": String(blob.size) } }))
    return size
  }
  await cache.put(f.key, new Response(body, { headers }))
  return size
}

async function runItem(id: string) {
  const start = store().items[id]
  if (!start || start.status === "done") return
  store().patch(id, { status: "downloading", error: null })
  const cache = await deps.caches.open(DOWNLOADS_CACHE)
  for (const f of start.files) {
    const now = store().items[id]
    if (!now) return // deleted meanwhile
    if (now.done.includes(f.key)) continue
    try {
      // A file another download already holds (the path's text, a shared page) is not fetched twice.
      const have = await cache.match(f.key, { ignoreVary: true })
      const size = have ? Number(have.headers.get("content-length") ?? f.bytes ?? 0) : await fetchFile(cache, id, f)
      const cur = store().items[id]
      if (!cur) return void (await dropKeys(ownKeys(id, [f.key])))
      store().patch(id, {
        done: [...cur.done, f.key],
        files: cur.files.map((x) => (x.key === f.key ? { ...x, bytes: size || x.bytes } : x)),
      })
      store().setProgress(id, 0)
    } catch (e) {
      const cur = store().items[id]
      if (!cur) return
      if (isQuota(e)) {
        // R5: stop, delete this item's files (never another item's), say how much it needed.
        await dropKeys(ownKeys(id, [...cur.done, f.key]))
        store().patch(id, { status: "failed", error: "quota", needed: cur.bytes, done: [] })
      } else if (e instanceof HttpError) {
        store().patch(id, { status: "failed", error: "unavailable" })
      } else {
        store().patch(id, { status: "paused", error: "network" }) // resumes from this file (R5)
      }
      store().setProgress(id, 0)
      deps.notify()
      return
    }
  }
  const cur = store().items[id]
  if (!cur) return
  await dropKeys(ownKeys(id, cur.obsolete ?? []))
  store().patch(id, { status: "done", error: null, obsolete: [], needed: undefined })
  deps.notify()
}

const queue: string[] = []
let pumping: Promise<void> | null = null

function pump(): Promise<void> {
  pumping ??= (async () => {
    try {
      while (queue.length) await runItem(queue.shift()!)
    } finally {
      pumping = null
    }
  })()
  return pumping
}

function enqueue(id: string) {
  if (!queue.includes(id)) queue.push(id)
  return pump()
}

async function askPersist() {
  if (store().persistAsked) return
  store().set({ persistAsked: true })
  await deps.persist().catch(() => false)
}

/** R2/R3: download (or update) an item the learner asked for. */
export async function download(item: CatalogItem, lang: string) {
  if (!item.downloadable) return
  await askPersist()
  store().put(fromCatalog(item, lang, store().items[item.id]))
  return enqueue(item.id)
}

/** R5: continue every unfinished download (on reconnect, on opening the center). */
export function resume() {
  for (const it of Object.values(store().items)) if (["queued", "downloading", "paused"].includes(it.status)) void enqueue(it.id)
  return pumping ?? Promise.resolve()
}

/** R4: delete one item; files another download uses stay. */
export async function remove(id: string) {
  const it = store().items[id]
  if (!it) return
  const keys = ownKeys(id, [...it.done, ...it.files.map((f) => f.key)])
  store().drop(id)
  await dropKeys(keys)
  deps.notify()
}

/** R4: delete every download at once. */
export async function removeAll() {
  store().clear()
  queue.length = 0
  await deps.caches?.delete(DOWNLOADS_CACHE)
  deps.notify()
}

/**
 * Owner decision 2026-10-10: videos left the unit download. A video that a unit
 * downloaded earlier already holds becomes a downloaded item of its own, so the
 * unit's update (which drops files it no longer lists) never deletes it; it
 * keeps playing offline, and the learner removes it from the center if they wish.
 */
function adoptVideos(items: CatalogItem[]) {
  for (const next of items) {
    if (next.kind !== "video" || store().items[next.id]) continue
    const holder = Object.values(store().items).find((i) => next.files.every((f) => i.done.includes(f.key)))
    if (!holder) continue
    store().put({ ...fromCatalog(next, holder.lang), done: next.files.map((f) => f.key), status: "done" })
  }
}

/**
 * R3: compare the downloaded items with the catalogue. Changed text is fetched
 * again now (silently); a changed or added media file is offered with its size.
 */
export async function checkUpdates(catalog: Catalog) {
  const latest = new Map(Object.values(catalog.sections).flat().map((i) => [i.id, i]))
  adoptVideos([...latest.values()])
  const cache = await deps.caches.open(DOWNLOADS_CACHE)
  for (const it of Object.values(store().items)) {
    const next = latest.get(it.id)
    if (!next || it.status !== "done" || next.version === it.version) continue
    const done = new Set(it.done)
    const missing = next.files.filter((f) => f.kind === "media" && !done.has(f.key))
    const texts = next.files.filter((f) => f.kind === "text")
    let ok = true
    for (const f of texts) {
      try {
        await fetchFile(cache, it.id, f)
      } catch {
        ok = false // offline or failed: the old text stays; tried again next time
      }
    }
    if (!ok) continue
    const textKeys = texts.map((f) => f.key)
    if (missing.length === 0) {
      const keys = new Set(next.files.map((f) => f.key))
      const obsolete = it.files.map((f) => f.key).filter((k) => !keys.has(k))
      store().patch(it.id, {
        version: next.version,
        files: next.files,
        done: [...new Set([...it.done.filter((k) => keys.has(k)), ...textKeys])],
        title: next.title,
        bytes: next.bytes,
        update: null,
      })
      await dropKeys(ownKeys(it.id, obsolete))
    } else {
      const bytes = missing.reduce((n, f) => n + (f.bytes ?? 0), 0)
      store().patch(it.id, { update: { bytes, version: next.version } })
    }
  }
  deps.notify()
}

/** Item status for a catalogue entry: none | the saved state. */
export function savedOf(id: string): SavedItem | undefined {
  return store().items[id]
}

/** Library: open the downloaded copy of a file (offline too). */
export async function openDownloaded(key: string, open: (url: string) => void = (u) => window.open(u, "_blank", "noopener")) {
  const res = await (await deps.caches.open(DOWNLOADS_CACHE)).match(key, { ignoreVary: true })
  if (!res) return false
  const url = URL.createObjectURL(await res.blob())
  open(url)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

export type StorageSummary = { app: number; saved: number; downloads: number; available: number | null }

/** R1: what Rafeeq takes, in three parts, and what the browser says is left. */
export async function storageSummary(downloads: number, storage: Storage = localStorage): Promise<StorageSummary> {
  let saved = 0
  try {
    for (const k of Object.keys(storage)) if (k === "rafeeq.saved") saved += (storage.getItem(k) ?? "").length * 2
  } catch {
    /* blocked storage */
  }
  const est = (await navigator.storage?.estimate?.().catch(() => null)) ?? null
  const usage = est?.usage ?? 0
  return {
    downloads,
    saved,
    app: Math.max(0, usage - downloads - saved),
    available: est?.quota != null ? Math.max(0, est.quota - usage) : null,
  }
}

if (typeof window !== "undefined") window.addEventListener("online", () => void resume())
