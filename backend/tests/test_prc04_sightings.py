"""PRC-04 R2/R6 (moon-sighting announcements) and the short Sharia Practice lines
(PRC-01 R5, PRC-04 R2). Client-side rules are tested in frontend/src/app/practice.

Announcements are entered by the team in the app and published without review.
The lines are merged content: since 2026-10-06 (rules.md §1.4) they are
reviewed before merging and shown directly; a line the reviewer returns is
withdrawn in that language until corrected."""

from datetime import date

import pytest

from app.practice import router as practice
from app.practice.sightings import validate
from tests.conftest import auth, with_roles, withdraw

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


@pytest.fixture
def local_line(monkeypatch):
    data = [
        {
            "id": "ramadan_local",
            "feature": "PRC-04 R2",
            "text": {"ar": "يبدأ الصوم مع إعلان بلدك أو مسجدك عن دخول الشهر.", "en": "", "tl": "Nagsisimula ang pag-aayuno."},
        }
    ]
    monkeypatch.setattr(practice, "_lines", lambda: data)
    return data


async def test_prc04_r2_merged_local_line_shown_without_approval(client, local_line):
    assert (await client.get("/api/practice/lines?lang=tl")).json()["lines"] == {"ramadan_local": "Nagsisimula ang pag-aayuno."}
    assert (await client.get("/api/practice/lines?lang=en")).json()["lines"] == {}  # no English text: nothing translated


async def test_prc04_r2_returned_local_line_withdrawn_until_corrected(client, local_line):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await withdraw(client, reviewer, "practice_line", "ramadan_local", "tl", note="Kulang ang pangungusap")
    assert (await client.get("/api/practice/lines?lang=tl")).json()["lines"] == {}
    assert list((await client.get("/api/practice/lines?lang=ar")).json()["lines"]) == ["ramadan_local"]  # other languages unaffected
    local_line[0]["text"]["tl"] = "Nagsisimula ang pag-aayuno kapag inihayag ng iyong bansa o masjid."  # the corrected line is merged
    lines = (await client.get("/api/practice/lines?lang=tl")).json()["lines"]
    assert lines == {"ramadan_local": local_line[0]["text"]["tl"]}


async def test_prc01_r5_merged_qibla_line_shown(client):
    lines = (await client.get("/api/practice/lines?lang=ar")).json()["lines"]
    assert lines["qibla_direction"].startswith("يكفيك أن تستقبل جهة القبلة")
