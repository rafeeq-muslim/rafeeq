"""PRC-04 R2/R6 (moon-sighting announcements) and the approved Practice lines
(PRC-01 R5, PRC-04 R2). Client-side rules are tested in frontend/src/app/practice."""

from datetime import date

from app.practice.sightings import validate
from tests.conftest import auth, with_roles

BODY = {
    "country": "SA",
    "hijri_year": 1448,
    "hijri_month": 9,
    "expected": "2027-02-08",
    "source_url": "https://www.spa.gov.sa/",
}


async def test_prc04_r2_announcement_is_published_without_review(client):
    team = await with_roles(client, "nasser-1", "team")
    r = await client.post("/api/practice/sightings", json={**BODY, "start": "2027-02-09"}, headers=auth(team))
    assert r.status_code == 201, r.text
    items = (await client.get("/api/practice/sightings")).json()["items"]
    assert items == [{"country": "SA", "hijri_year": 1448, "hijri_month": 9, "start": "2027-02-09", "source_url": BODY["source_url"]}]


async def test_prc04_r2_more_than_one_day_from_expected_is_rejected(client):
    team = await with_roles(client, "nasser-1", "team")
    r = await client.post("/api/practice/sightings", json={**BODY, "start": "2027-02-11"}, headers=auth(team))
    assert r.status_code == 422 and r.json()["detail"] == "too_far_from_expected"
    assert (await client.get("/api/practice/sightings")).json()["items"] == []
    assert validate(date(2027, 2, 8), date(2027, 2, 7)) and not validate(date(2027, 2, 8), date(2027, 2, 6))


async def test_prc04_r2_learners_cannot_publish(client):
    from tests.conftest import register

    learner = (await register(client, username="joseph-1"))["access_token"]
    r = await client.post("/api/practice/sightings", json={**BODY, "start": "2027-02-08"}, headers=auth(learner))
    assert r.status_code == 403


async def test_prc04_r6_same_file_no_params(client):
    r1 = await client.get("/api/practice/sightings")
    r2 = await client.get("/api/practice/sightings?city=riyadh&lat=24.7")
    assert r1.json() == r2.json() and r1.headers["cache-control"].startswith("public")


async def _approve_line(client, token, line_id, lang):
    detail = (await client.get(f"/api/review/items/practice_line/{line_id}", headers=auth(token))).json()
    body = {"decision": "approved", "hash": detail["langs"][lang]["hash"]}
    assert (await client.post(f"/api/review/items/practice_line/{line_id}/{lang}", json=body, headers=auth(token))).status_code == 200


async def test_prc04_r2_local_line_only_after_approval(client):
    assert (await client.get("/api/practice/lines?lang=tl")).json()["lines"] == {}
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _approve_line(client, reviewer, "ramadan_local", "tl")
    lines = (await client.get("/api/practice/lines?lang=tl")).json()["lines"]
    assert list(lines) == ["ramadan_local"]
    assert (await client.get("/api/practice/lines?lang=en")).json()["lines"] == {}


async def test_prc01_r5_qibla_line_only_after_approval(client):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _approve_line(client, reviewer, "qibla_direction", "ar")
    lines = (await client.get("/api/practice/lines?lang=ar")).json()["lines"]
    assert lines["qibla_direction"].startswith("يكفيك أن تستقبل جهة القبلة")
