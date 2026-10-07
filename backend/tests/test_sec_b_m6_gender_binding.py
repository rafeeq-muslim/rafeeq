"""Security review B-M6 (minimal part): the same-gender rule (CMP-01 R3)
does not bend to a later answer.

- A guest device's first answer to «أخ أم أخت؟» stays with its token.
- An account does not change its gender while it has a mentor, a group or a
  request that is not closed.
Whether a learner's gender should be verified at all is a product decision
(reported to the owner), not built here."""

from tests.cmp_helpers import group_with, person


async def ask(client, headers=None, **body):
    r = await client.post("/api/help/requests", json={"lang": "en", "body": "I need someone", **body}, headers=headers or {})
    assert r.status_code == 201, r.text
    return r.json()


async def inbox_ids(client, who) -> list[str]:
    return [r["id"] for r in (await client.get("/api/inbox/requests", headers=who.h)).json()]


# --- guests ----------------------------------------------------------------------


async def test_m6_a_guest_devices_first_gender_answer_stays_with_its_token(client):
    brother = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    sister = await person(client, "umm-yusuf", roles=("mentor",), gender="f", languages=("en",))
    first = await ask(client, gender="f")
    token = {"X-Help-Token": first["guest_token"]}

    second = await ask(client, headers=token, gender="m", body="Now route me to the brothers")

    assert second["request"]["gender"] == "f"
    assert second["request"]["id"] in await inbox_ids(client, sister)
    assert second["request"]["id"] not in await inbox_ids(client, brother)


async def test_m6_a_new_guest_device_still_answers_once(client):
    out = await ask(client, gender="m")
    assert out["request"]["gender"] == "m"
    again = await ask(client, headers={"X-Help-Token": out["guest_token"]}, body="No gender sent this time")
    assert again["request"]["gender"] == "m"


# --- accounts --------------------------------------------------------------------


async def change(client, who, gender: str) -> list[tuple[int, object]]:
    """Both ways an account sets its own gender."""
    a = await client.put("/api/mentors/me/match", json={"gender": gender, "languages": ["en"]}, headers=who.h)
    b = await client.patch("/api/me", json={"gender": gender}, headers=who.h)
    return [(a.status_code, a.json().get("detail")), (b.status_code, b.json().get("detail"))]


REFUSED = [(409, "gender_in_use"), (409, "gender_in_use")]


async def me_gender(client, who) -> str | None:
    return (await client.get("/api/me", headers=who.h)).json()["gender"]


async def test_m6_no_gender_change_while_the_account_has_a_mentor(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph", gender="m", languages=("en",))
    r = await client.post("/api/mentors/choose", json={"mentor_id": str(abu.id)}, headers=joseph.h)
    assert r.status_code == 200, r.text

    assert await change(client, joseph, "f") == REFUSED
    assert await me_gender(client, joseph) == "m"

    # Ending the link frees the choice again.
    assert (await client.delete("/api/mentors/mine", headers=joseph.h)).status_code == 204
    assert [s for s, _ in await change(client, joseph, "f")] == [200, 200]
    assert await me_gender(client, joseph) == "f"


async def test_m6_no_gender_change_while_the_account_is_in_a_group(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph", gender="m", languages=("en",))
    g = await group_with(client, abu, joseph)

    assert await change(client, joseph, "f") == REFUSED

    assert (await client.post(f"/api/groups/{g['id']}/leave", headers=joseph.h)).status_code == 204
    assert [s for s, _ in await change(client, joseph, "f")] == [200, 200]


async def test_m6_no_gender_change_while_a_request_is_not_closed(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    team = await person(client, "team-one", roles=("team",), gender="m", languages=("en",))
    joseph = await person(client, "joseph", gender="m", languages=("en",))
    rid = (await ask(client, headers=joseph.h))["request"]["id"]

    assert await change(client, joseph, "f") == REFUSED
    assert rid in await inbox_ids(client, abu)  # still with the brothers

    assert (await client.post(f"/api/inbox/requests/{rid}/close", headers=team.h)).status_code == 200
    assert [s for s, _ in await change(client, joseph, "f")] == [200, 200]


async def test_m6_the_same_gender_and_other_fields_still_save(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph", gender="m", languages=("en",))
    await client.post("/api/mentors/choose", json={"mentor_id": str(abu.id)}, headers=joseph.h)

    r = await client.put("/api/mentors/me/match", json={"gender": "m", "languages": ["en", "tl"]}, headers=joseph.h)
    assert r.status_code == 200 and r.json()["languages"] == ["en", "tl"]
    r = await client.patch("/api/me", json={"gender": "m", "display_name": "Joseph B"}, headers=joseph.h)
    assert r.status_code == 200 and r.json()["display_name"] == "Joseph B"


async def test_m6_an_account_with_nothing_open_sets_and_changes_its_gender(client):
    joseph = await person(client, "joseph", languages=("en",))
    assert [s for s, _ in await change(client, joseph, "m")] == [200, 200]
    assert [s for s, _ in await change(client, joseph, "f")] == [200, 200]
    # An urgent request asks no gender and does not hold it either.
    await ask(client, headers=joseph.h, kind="urgent", body=None)
    assert [s for s, _ in await change(client, joseph, "m")] == [200, 200]
