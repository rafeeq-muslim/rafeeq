"""Security review 2026-10-07, B-L4 (Origin part): the two routes authorised
by the refresh cookie alone refuse a request made by another origin's page.
(An app on a sibling subdomain is the same *site*, so SameSite=Lax lets its
POST carry the cookie: it could sign the person out, or rotate the session.)"""

import pytest
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.platform.models import RefreshSession
from app.platform.origin import is_same_origin
from tests.conftest import register

PUBLIC = "https://rafeeq.example"


@pytest.mark.parametrize(
    "origin,host,ok",
    [
        (None, "test", True),  # not a browser
        ("https://rafeeq.example", "backend:8000", True),  # the public address
        ("https://rafeeq.example:443", "backend:8000", True),
        ("http://test", "test", True),  # the page and the API on one host
        ("https://app.internal", "app.internal", True),
        ("http://localhost:5173", "localhost:5173", True),
        ("https://other.example", "test", False),
        ("https://sibling.rafeeq.example", "rafeeq.example", False),  # same site, other origin
        ("https://rafeeq.example.evil.example", "rafeeq.example", False),
        ("https://rafeeq.example:8443", "rafeeq.example", False),
        ("https://evilrafeeq.example", "rafeeq.example", False),
        ("null", "test", False),  # sandboxed frame
        ("", "test", False),
        ("chrome-extension://abcdef", "test", False),
        ("https://", "test", False),
        ("https://[bad", "test", False),
    ],
)
def test_sec_l4_same_origin(origin, host, ok):
    assert is_same_origin(origin, host, PUBLIC) is ok


async def sessions() -> int:
    async with SessionLocal() as s:
        return await s.scalar(select(func.count()).select_from(RefreshSession)) or 0


@pytest.mark.parametrize("headers", [{"Origin": "https://sibling.example"}, {"Origin": "null"}, {"Sec-Fetch-Site": "cross-site"}])
async def test_sec_l4_refresh_and_logout_refuse_another_origin(client, headers):
    await register(client)
    assert await sessions() == 1
    cookie = client.cookies.get("rafeeq_refresh")
    for path in ("/api/auth/refresh", "/api/auth/logout"):
        r = await client.post(path, headers=headers)
        assert r.status_code == 403 and r.json()["detail"] == "cross_site_request", path
        assert "set-cookie" not in r.headers
    assert await sessions() == 1 and client.cookies.get("rafeeq_refresh") == cookie  # still signed in, session not rotated


@pytest.mark.parametrize("headers", [{}, {"Origin": "http://test"}, {"Origin": "http://test", "Sec-Fetch-Site": "same-origin"}])
async def test_sec_l4_the_app_itself_and_non_browser_clients_still_work(client, headers):
    await register(client)
    r = await client.post("/api/auth/refresh", headers=headers)
    assert r.status_code == 200 and r.json()["access_token"]
    assert (await client.post("/api/auth/logout", headers=headers)).status_code == 204
    assert await sessions() == 0
