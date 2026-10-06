// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { translate } from "@/app/i18n"
import { useDevice } from "@/app/stores/device"

const users = [
  { id: "u1", username: "mentor-1", display_name: "Mentor One", roles: ["learner", "mentor"] },
  { id: "u2", username: "team-1", display_name: "Team One", roles: ["team"] },
]
let notice: string | null = null
vi.mock("@/app/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/api")>()),
  api: vi.fn(async (path: string) => {
    if (path === "/api/auth/register") return { access_token: "t", user: { id: "u3", username: "layla-1", display_name: "Layla", roles: ["learner"] }, notice }
    return path.startsWith("/api/admin/users") ? users : []
  }),
}))
vi.mock("@/app/lib/sync", () => ({ onSignedIn: vi.fn(async () => undefined) }))

const { default: Admin, rolesOffered } = await import("./Admin")
const { Create } = await import("../Account")

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

describe("MOT-08: the team role is granted only in the database", () => {
  it("mot08_team_role_not_offered_for_invite_codes", () => {
    show()
    const team = translate("en", "role.teamRole")
    expect(screen.queryByRole("radio", { name: team })).toBeNull()
    expect(screen.getByRole("radio", { name: translate("en", "role.mentor") })).toBeTruthy()
  })

  it("mot08_team_role_not_offered_to_someone_without_it_but_revocable_for_a_holder", async () => {
    show()
    fireEvent.change(screen.getByLabelText(translate("en", "admin.search")), { target: { value: "on" } })
    const team = translate("en", "role.teamRole")
    const mentorCard = (await screen.findByText("Mentor One")).closest("li")!
    const teamCard = screen.getByText("Team One").closest("li")!
    expect(mentorCard.textContent).not.toContain(team)
    expect(teamCard.textContent).toContain(team)
  })

  it("mot08_roles_offered_lists_other_roles_and_team_only_when_held", () => {
    expect(rolesOffered(["learner"])).toEqual(["learner", "mentor", "sharia_reviewer", "admin"])
    expect(rolesOffered(["team"])).toContain("team")
  })
})

describe("MOT-08: an old team invite opens a normal account", () => {
  async function signUp(withNotice: string | null) {
    notice = withNotice
    useDevice.setState({ locale: "en" })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Create onSignin={() => undefined} onCreated={() => undefined} inviteOpen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText(translate("en", "acct.displayName")), { target: { value: "Layla" } })
    fireEvent.change(screen.getByLabelText(translate("en", "acct.username")), { target: { value: "layla-1" } })
    fireEvent.change(screen.getByLabelText(translate("en", "acct.password")), { target: { value: "pass-1234-word" } })
    fireEvent.submit(screen.getByLabelText(translate("en", "acct.username")).closest("form")!)
    await screen.findByText(translate("en", "acct.credentials"))
  }

  it("mot08_old_team_invite_shows_one_neutral_line", async () => {
    await signUp("team_role_db_only")
    expect(screen.getByText(translate("en", "acct.teamRoleDbOnly"))).toBeTruthy()
  })

  it("mot08_ordinary_signup_shows_no_team_line", async () => {
    await signUp(null)
    expect(screen.queryByText(translate("en", "acct.teamRoleDbOnly"))).toBeNull()
  })
})
