"""ORG-03 organisation dashboard: one test (at least) per example."""

import re
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.db import SessionLocal
from app.organizations.figures import Subject, dashboard, partition, share
from app.organizations.jobs import snapshot_all
from app.organizations.models import OrgLink, OrgLinkStatus, OrgSnapshot
from tests.org_helpers import device, link, make_org

NOW = datetime(2026, 12, 20, 9, tzinfo=UTC)
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def subject(linked_at: datetime, *changes: tuple[float, str | None], lang="tl", first: str | None = "new") -> Subject:
    """A linked learner: `first` status at linking, then (days after linking, status) changes."""
    history = [(linked_at, first)] + [(linked_at + timedelta(days=d), st) for d, st in changes]
    return Subject(lang=lang, linked_at=linked_at, status=history[-1][1], history=history)


# --- R1 ---------------------------------------------------------------------


async def test_org03_r1_the_dashboard_is_counts_and_shares_only(client):
    org = await make_org(client)
    devices = [await link(client, org.codes["tl"]) for _ in range(12)]
    for d in devices:
        await client.post("/api/events", json={"install_id": d, "events": [{"type": "lesson_completed", "lesson_id": "u1-l1"}]})
    r = await client.get(f"/api/org/{org.id}/dashboard", headers=org.coordinator.h)
    assert r.status_code == 200
    body = r.json()
    assert body["linked"] == {"n": 12} and body["statuses"]["new"] == {"n": 12, "pct": 1.0}
    assert not UUID_RE.search(r.text) and not any(d in r.text for d in devices)


async def test_org03_r1_another_offices_coordinator_or_a_mentor_cannot_open_it(client):
    from tests.test_org02_mentors import org_mentor

    org = await make_org(client, suffix="1")
    other = await make_org(client, name="Other office", languages=("en",), suffix="2")
    mentor = await org_mentor(client, org, "abu-abdullah", gender="m", languages=("ar",))
    for h in (other.coordinator.h, mentor.h):
        assert (await client.get(f"/api/org/{org.id}/dashboard", headers=h)).status_code == 403
        assert (await client.get(f"/api/org/{org.id}/codes", headers=h)).status_code == 403
    assert (await client.get(f"/api/org/{org.id}/dashboard")).status_code == 401


async def test_org03_r1_a_new_office_sees_no_figures_yet_and_its_codes(client):
    org = await make_org(client)
    body = (await client.get(f"/api/org/{org.id}/dashboard", headers=org.coordinator.h)).json()
    assert body["empty"] is True and body["linked"] == {"n": None}
    assert {c["lang"]: c["code"] for c in body["codes"]} == org.codes


# --- R2 ---------------------------------------------------------------------


def test_org03_r2_four_returns_show_less_than_ten_and_no_rate():
    start = NOW - timedelta(days=200)
    lapsed = [subject(start, (40, "lapsed")) for _ in range(30)]
    for s in lapsed[:4]:
        s.history.append((NOW - timedelta(days=5), "returning"))
        s.status = "returning"
    out = dashboard(lapsed, NOW)
    assert out["returned"] == {"n": None, "pct": None}  # «أقل من 10», no rate
    assert out["statuses"]["returning"]["n"] is None


def test_org03_r2_every_count_under_ten_is_hidden_with_no_share():
    assert share(4, 40) == {"n": None, "pct": None}
    assert share(12, 15) == {"n": None, "pct": None}  # the 3 others would show
    out = dashboard([subject(NOW - timedelta(days=2)) for _ in range(9)], NOW)
    assert out["linked"] == {"n": None} and out["statuses"]["new"] == {"n": None, "pct": None}


def test_org03_r2_a_hidden_count_cannot_be_worked_out_from_the_others():
    cells = {"new": 0, "active": 70, "at_risk": 45, "lapsed": 0, "returning": 5, "none": 0}
    out = partition(cells, 120)
    assert out["returning"]["n"] is None
    assert out["at_risk"]["n"] is None  # also hidden, so 120 - 70 does not give the 5 away
    assert out["active"] == {"n": 70, "pct": round(70 / 120, 4)}


# --- R3 ---------------------------------------------------------------------


def test_org03_r3_october_cohort_continuation_after_30_days_is_55_percent():
    october = [datetime(2026, 10, 5 + i % 20, 8, tzinfo=UTC) for i in range(40)]
    subjects = [subject(t, (25, "active" if i < 22 else "at_risk")) for i, t in enumerate(october)]
    out = dashboard(subjects, NOW)
    oct_row = next(c for c in out["cohorts"] if c["month"] == "2026-10")
    assert oct_row["size"] == {"n": 40}
    assert oct_row["d30"] == {"due": True, "n": 22, "pct": 0.55}


def test_org03_r3_november_cohort_90_days_not_yet():
    november = [subject(datetime(2026, 11, 10, 8, tzinfo=UTC), (3, "active")) for _ in range(15)]
    nov_row = dashboard(november, NOW)["cohorts"][0]
    assert nov_row["month"] == "2026-11"
    assert nov_row["d90"] == {"due": False, "n": None, "pct": None}  # «لم يحن بعد»
    assert nov_row["d30"]["due"] is True


def test_org03_r3_continuing_means_new_active_or_returning():
    t = datetime(2026, 9, 1, 8, tzinfo=UTC)
    subjects = (
        [subject(t, (10, "active")) for _ in range(10)]
        + [subject(t, (1, "lapsed"), (29, "returning")) for _ in range(10)]
        + [subject(t, (10, "at_risk")) for _ in range(10)]
    )
    row = dashboard(subjects, NOW)["cohorts"][0]
    assert row["d30"] == {"due": True, "n": 20, "pct": round(20 / 30, 4)}


# --- R4 ---------------------------------------------------------------------


def test_org03_r4_120_linked_70_active_25_at_risk():
    t = NOW - timedelta(days=100)
    subjects = (
        [subject(t, (90, "active")) for _ in range(70)]
        + [subject(t, (90, "at_risk")) for _ in range(25)]
        + [subject(t, (90, "lapsed")) for _ in range(25)]
    )
    out = dashboard(subjects, NOW)
    assert out["linked"] == {"n": 120}
    assert out["statuses"]["active"] == {"n": 70, "pct": round(70 / 120, 4)}
    assert out["statuses"]["at_risk"] == {"n": 25, "pct": round(25 / 120, 4)}


def test_org03_r4_return_rate_over_the_last_30_days():
    start = NOW - timedelta(days=200)
    lapsed = [subject(start, (40, "lapsed")) for _ in range(40)]
    for s in lapsed[:12]:
        s.history.append((NOW - timedelta(days=3), "returning"))
    assert dashboard(lapsed, NOW)["returned"] == {"n": 12, "pct": 0.3}


# --- R5 ---------------------------------------------------------------------


def test_org03_r5_language_is_the_only_split_and_small_ones_are_pooled():
    t = NOW - timedelta(days=10)
    subjects = [subject(t, lang="tl") for _ in range(35)] + [subject(t, lang="ar") for _ in range(3)]
    out = dashboard(subjects, NOW)
    assert out["languages"] == [{"lang": "tl", "n": 35}, {"lang": "other", "n": None}]
    assert dashboard(subjects, NOW, "other")["linked"] == {"n": None}
    assert dashboard(subjects, NOW, "tl")["linked"] == {"n": 35}


async def test_org03_r5_no_other_split_is_accepted(client):
    org = await make_org(client)
    h = org.coordinator.h
    assert (await client.get(f"/api/org/{org.id}/dashboard?lang=tl", headers=h)).status_code == 200
    assert (await client.get(f"/api/org/{org.id}/dashboard?lang=PH", headers=h)).status_code == 422
    body = (await client.get(f"/api/org/{org.id}/dashboard?nationality=PH&gender=m", headers=h)).json()
    assert "nationality" not in str(body) and "gender" not in str(body)


# --- R6 ---------------------------------------------------------------------


async def test_org03_r6_joseph_unlinked_on_15_november_and_14_november_stays(client):
    org = await make_org(client)
    devices = [device() for _ in range(12)]
    for d in devices:
        await link(client, org.codes["tl"], d)
    joseph = devices[0]
    oct_1 = datetime(2026, 10, 1, 8, tzinfo=UTC)
    async with SessionLocal() as s:
        for ln in (await s.scalars(select(OrgLink))).all():
            ln.linked_at, ln.status = oct_1, "active"
            for row in (await s.scalars(select(OrgLinkStatus).where(OrgLinkStatus.link_id == ln.id))).all():
                row.at, row.status = oct_1, "active"
        await s.commit()
    async with SessionLocal() as s:
        await snapshot_all(s, datetime(2026, 11, 13, 21, 15, tzinfo=UTC))  # 00:15 on 14 November in Riyadh
    assert (await client.post("/api/org/link/remove", json={"install_id": joseph})).status_code == 204
    async with SessionLocal() as s:
        await snapshot_all(s, datetime(2026, 11, 15, 21, 15, tzinfo=UTC))  # 16 November
    h = org.coordinator.h
    nov_14 = (await client.get(f"/api/org/{org.id}/dashboard/2026-11-14", headers=h)).json()
    nov_16 = (await client.get(f"/api/org/{org.id}/dashboard/2026-11-16", headers=h)).json()
    assert nov_14["linked"] == {"n": 12} and nov_14["statuses"]["active"]["n"] == 12
    assert nov_16["linked"] == {"n": 11} and nov_16["statuses"]["active"]["n"] == 11  # without Joseph
    async with SessionLocal() as s:
        await snapshot_all(s, datetime(2026, 11, 13, 22, tzinfo=UTC))  # never recomputed
        assert (await s.get(OrgSnapshot, (uuid.UUID(org.id), datetime(2026, 11, 14).date()))).figures["linked"] == {"n": 12}
