"""PRC-04 R2/R6 (moon-sighting announcements) and the short Sharia Practice lines
(PRC-01 R5, PRC-04 R2). Client-side rules are tested in frontend/src/app/practice.

Announcements are entered by the team in the app and published without review.
The lines are merged content: since 2026-10-06 (rules.md §1.4) they are
reviewed before merging and shown directly; a line the reviewer returns is
withdrawn in that language until corrected."""

from datetime import date, timedelta

import pytest

from app.practice import router as practice
from app.practice.sightings import expected_start, validate
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


async def test_prc04_r2_server_computes_the_expected_date(client):
    # A caller cannot widen the ±1 day check by sending its own "expected":
    # 1 Ramadan 1448 is expected on 8 Feb 2027 whatever the body says.
    team = await with_roles(client, "nasser-1", "team")
    lie = {**BODY, "expected": "2027-02-11", "start": "2027-02-11"}
    r = await client.post("/api/practice/sightings", json=lie, headers=auth(team))
    assert r.status_code == 422 and r.json()["detail"] == "too_far_from_expected"
    assert (await client.get("/api/practice/sightings")).json()["items"] == []
    no_expected = {k: v for k, v in BODY.items() if k != "expected"}
    r = await client.post("/api/practice/sightings", json={**no_expected, "start": "2027-02-09"}, headers=auth(team))
    assert r.status_code == 201, r.text


def test_prc04_r2_expected_dates_match_umm_al_qura():
    # research/06 §3: 1 Ramadan 1447 = 18 Feb 2026, 1 Ramadan 1448 = 8 Feb 2027, 1 Shawwal 1448 = 9 Mar 2027;
    # PRC-04 R1: 5 Oct 2026 = 24 Rabi' al-Akhir 1448.
    assert expected_start(1447, 9) == date(2026, 2, 18)
    assert expected_start(1448, 9) == date(2027, 2, 8)
    assert expected_start(1448, 10) == date(2027, 3, 9)
    assert expected_start(1448, 4) + timedelta(days=23) == date(2026, 10, 5)
    assert expected_start(1439, 9) is None and expected_start(1601, 1) is None


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
