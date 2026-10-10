/**
 * Size budget 2026-10-10: the precache fills several files at a time, from
 * the end of the list, under Workbox's keys; never refetches a cached file.
 */
import { describe, expect, it } from "vitest"

import { fillPrecache } from "./precache-fill"
import { PRECACHE_GLOB_IGNORES, globToRegExp } from "./plt11-precache"

const BASE = "https://rafeeq.nan.sa/sw.js"
const ORIGIN = "https://rafeeq.nan.sa"

function fakeCache(initial: string[] = []) {
  const store = new Map<string, Response>(initial.map((k) => [k, new Response("old")]))
  return {
    store,
    match: async (k: RequestInfo | URL) => store.get(String(k)),
    put: async (k: RequestInfo | URL, r: Response) => void store.set(String(k), r),
  }
}

const keyFor = (href: string) => (href.endsWith("index.html") ? `${href}?__WB_REVISION__=abc` : href)

describe("size budget: parallel precache fill", () => {
  it("stores every entry under Workbox's key, from the end of the list", async () => {
    const cache = fakeCache()
    const order: string[] = []
    const fetch = async (url: string) => {
      order.push(url)
      return new Response("x", { status: 200 })
    }
    const n = await fillPrecache(["assets/a.js", { url: "assets/b.css", revision: null }, { url: "index.html", revision: "abc" }], { cache, keyFor, fetch, base: BASE, parallel: 1 })
    expect(n).toBe(3)
    expect(order).toEqual([`${ORIGIN}/index.html`, `${ORIGIN}/assets/b.css`, `${ORIGIN}/assets/a.js`])
    expect([...cache.store.keys()].sort()).toEqual([`${ORIGIN}/assets/a.js`, `${ORIGIN}/assets/b.css`, `${ORIGIN}/index.html?__WB_REVISION__=abc`])
  })

  it("does not download a file already in the precache (a new version keeps most hashed files)", async () => {
    const cache = fakeCache([`${ORIGIN}/assets/a.js`])
    const fetched: string[] = []
    const fetch = async (url: string) => (fetched.push(url), new Response("x"))
    await fillPrecache(["assets/a.js", "assets/new.js"], { cache, keyFor, fetch, base: BASE })
    expect(fetched).toEqual([`${ORIGIN}/assets/new.js`])
  })

  it("leaves failures, redirects and non-200 answers to Workbox", async () => {
    const cache = fakeCache()
    const fetch = async (url: string) => {
      if (url.endsWith("down.js")) throw new TypeError("offline")
      if (url.endsWith("gone.js")) return new Response("", { status: 404 })
      return new Response("x")
    }
    const n = await fillPrecache(["assets/ok.js", "assets/down.js", "assets/gone.js"], { cache, keyFor, fetch, base: BASE })
    expect(n).toBe(1)
    expect([...cache.store.keys()]).toEqual([`${ORIGIN}/assets/ok.js`])
  })

  it("skips URLs Workbox does not precache", async () => {
    const cache = fakeCache()
    let calls = 0
    const n = await fillPrecache(["assets/a.js"], { cache, keyFor: () => undefined, fetch: async () => (calls++, new Response("x")), base: BASE })
    expect([n, calls]).toEqual([0, 0])
  })

  it("keeps the 512 px manifest icon out of the precache (the browser fetches it at install)", () => {
    const ignored = (p: string) => PRECACHE_GLOB_IGNORES.some((g) => globToRegExp(g).test(p))
    expect(ignored("brand/rafeeq-app-icon-512.png")).toBe(true)
    expect(ignored("brand/rafeeq-app-icon-180.png")).toBe(false) // apple-touch-icon, notifications
  })
})
