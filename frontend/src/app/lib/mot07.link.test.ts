/**
 * MOT-07 R4/R6 (mot-07-r6-account-status): at sign-in the device joins the
 * account's one engagement status only while it shares events; a device that
 * opted out is never tied to the account. Server side:
 * backend/tests/test_mot07_account_status.py.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { useAuth, type Me } from "@/app/stores/auth"
import { useDevice } from "@/app/stores/device"
import { onSignedIn } from "./sync"

const ME = { id: "u1", display_name: "Joseph", roles: [] } as unknown as Me
let urls: string[] = []

function stubFetch() {
  urls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url)
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  useAuth.getState().set({ token: null, me: null })
})

describe("MOT-07 R4/R6: linking the device at sign-in", () => {
  it("mot07_r6_a_sharing_device_joins_the_account_status", async () => {
    stubFetch()
    useDevice.setState({ shareEvents: true })
    useAuth.getState().set({ token: "t", me: ME })
    await onSignedIn()
    expect(urls).toContain("/api/me/install")
  })

  it("mot07_r4_an_opted_out_device_is_never_tied_to_the_account", async () => {
    stubFetch()
    useDevice.setState({ shareEvents: false })
    useAuth.getState().set({ token: "t", me: ME })
    await onSignedIn()
    expect(urls).not.toContain("/api/me/install")
  })
})
