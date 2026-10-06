// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { translate } from "@/app/i18n"
import { ApiError } from "@/app/lib/api"
import { useDevice } from "@/app/stores/device"

const invites = [
  { code: "MEN-AVAIL001", role: "mentor", used: false, status: "available", expires_at: "2026-10-13T00:00:00Z", created_at: "" },
  { code: "MEN-USED0001", role: "mentor", used: true, status: "used", created_at: "" },
  { code: "ADM-EXPIRED1", role: "admin", used: false, status: "expired", created_at: "" },
  { code: "SHA-REVOKED1", role: "sharia_reviewer", used: false, status: "revoked", created_at: "" },
  { code: "ORG-COORD001", role: "org_coordinator", used: false, status: "available", created_at: "" },
]
const users = [{ id: "u1", username: "mentor-1", display_name: "Mentor One", roles: ["learner", "mentor"] }]
let refuse: string | null = null
const calls: { path: string; method?: string; body?: unknown }[] = []

vi.mock("@/app/lib/api", async (orig) => {
  const real = await orig<typeof import("@/app/lib/api")>()
  return {
    ...real,
    api: vi.fn(async (path: string, opts?: { method?: string; body?: unknown }) => {
      calls.push({ path, method: opts?.method, body: opts?.body })
      if (path.endsWith("/roles") && opts?.method === "PUT") {
        if (refuse) throw new real.ApiError(409, refuse)
        return { roles: (opts.body as { roles: string[] }).roles }
      }
      if (path.includes("/revoke")) return { status: "revoked" }
      if (path === "/api/admin/invites") return invites
      if (path.startsWith("/api/admin/users")) return path.includes("nobody") ? [] : users
      return []
    }),
  }
})

const { default: Admin, roleDiff, roleErrorKey } = await import("./Admin")
const en = (k: Parameters<typeof translate>[1], p?: Record<string, string | number>) => translate("en", k, p)

beforeEach(() => {
  refuse = null
  calls.length = 0
})
afterEach(cleanup)

function show() {
  useDevice.setState({ locale: "en" })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Admin />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function search(name: string) {
  fireEvent.change(screen.getByLabelText(en("admin.search")), { target: { value: name } })
}

describe("PLT-17 R12: invite codes show their status and can be revoked", () => {
  it("plt17 r12 each code shows available, used, expired or revoked", async () => {
    show()
    await screen.findByText("MEN-AVAIL001")
    const status = (code: string) => screen.getByText(code).closest("li")!.querySelector("[data-status]")!.textContent
    expect(status("MEN-AVAIL001")).toBe(en("admin.status.available"))
    expect(status("MEN-USED0001")).toBe(en("admin.status.used"))
    expect(status("ADM-EXPIRED1")).toBe(en("admin.status.expired"))
    expect(status("SHA-REVOKED1")).toBe(en("admin.status.revoked"))
  })

  it("plt17 r12 an organisation coordinator's code names its role", async () => {
    show()
    const row = (await screen.findByText("ORG-COORD001")).closest("li")!
    expect(row.textContent).toContain(en("role.org_coordinator"))
  })

  it("plt17 r12 only an available code can be revoked, and revoking calls the API", async () => {
    show()
    await screen.findByText("MEN-AVAIL001")
    const revokeIn = (code: string) => screen.getByText(code).closest("li")!.querySelector("button:last-of-type")
    expect(screen.getByText("MEN-USED0001").closest("li")!.textContent).not.toContain(en("admin.revoke"))
    expect(screen.getByText("ADM-EXPIRED1").closest("li")!.textContent).not.toContain(en("admin.revoke"))
    fireEvent.click(revokeIn("MEN-AVAIL001")!)
    await waitFor(() => expect(calls.some((c) => c.path === "/api/admin/invites/MEN-AVAIL001/revoke" && c.method === "POST")).toBe(true))
  })
})

describe("PLT-17 R11: role changes are confirmed, and refusals are explained", () => {
  it("plt17 r11 saving asks for confirmation and shows what changes", async () => {
    show()
    await search("mentor-1")
    await screen.findByText("Mentor One")
    fireEvent.click(screen.getByLabelText(en("role.sharia_reviewer")))
    fireEvent.click(screen.getByRole("button", { name: en("admin.saveRoles") }))
    expect(await screen.findByText(en("admin.confirm.title", { name: "Mentor One" }))).toBeTruthy()
    expect(screen.getByText(en("admin.confirm.add", { roles: en("role.sharia_reviewer") }))).toBeTruthy()
    expect(calls.some((c) => c.method === "PUT")).toBe(false) // nothing saved before confirming
    fireEvent.click(screen.getByRole("button", { name: en("admin.confirm.ok") }))
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/api/admin/users/u1/roles")).toBe(true))
  })

  it("plt17 r11 going back saves nothing", async () => {
    show()
    await search("mentor-1")
    await screen.findByText("Mentor One")
    fireEvent.click(screen.getByLabelText(en("role.mentor")))
    fireEvent.click(screen.getByRole("button", { name: en("admin.saveRoles") }))
    fireEvent.click(await screen.findByRole("button", { name: en("admin.confirm.cancel") }))
    expect(calls.some((c) => c.method === "PUT")).toBe(false)
  })

  it("plt17 r11 the save button waits for a change", async () => {
    show()
    await search("mentor-1")
    await screen.findByText("Mentor One")
    expect((screen.getByRole("button", { name: en("admin.saveRoles") }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("plt17 r11 refusals map to their own messages", () => {
    expect(roleErrorKey(new ApiError(409, "cannot_remove_own_admin"))).toBe("admin.err.ownAdmin")
    expect(roleErrorKey(new ApiError(409, "last_admin"))).toBe("admin.err.lastAdmin")
    expect(roleErrorKey(new Error("x"))).toBe("common.error")
    expect(roleDiff(["learner", "admin"], ["learner", "mentor"])).toEqual({ added: ["mentor"], removed: ["admin"] })
  })
})

describe("PLT-17 R13: search says when nothing matches", () => {
  it("plt17 r13 no user with that name", async () => {
    show()
    await search("nobody")
    expect(await screen.findByText(en("admin.noUsers"))).toBeTruthy()
  })
})
