"""Security review 2026-10-07, B-L13 (KNW-06 R1 link health): the scheduled
link check requests only IslamHouse's own hosts, at public addresses, and
never follows a redirect to another host. Before, it followed any redirect
from the server itself (to an internal address too)."""

import httpx
import pytest

from app.core.db import SessionLocal
from app.knowledge import library
from app.knowledge.live_sources import http as live_http
from tests.test_knw06_library import _item

PUBLIC_IP = "203.0.113.10"  # TEST-NET-3 (documentation range); `ip_is_public` is replaced below


@pytest.fixture
def net(monkeypatch):
    """A fake network: which addresses names resolve to, how hosts answer, what was requested."""
    resolved: dict[str, list[str]] = {}
    answers: dict[str, httpx.Response] = {}
    asked: list[str] = []

    async def fake_resolve(host: str) -> list[str]:
        return resolved.get(host, [PUBLIC_IP])

    def handler(request: httpx.Request) -> httpx.Response:
        asked.append(str(request.url))
        for part, response in answers.items():
            if part in str(request.url):
                return response(request) if callable(response) else response
        return httpx.Response(200)

    monkeypatch.setattr(live_http, "resolve_host", fake_resolve)
    monkeypatch.setattr(live_http, "ip_is_public", lambda ip: ip == PUBLIC_IP)

    class Net:
        pass

    n = Net()
    n.resolved, n.answers, n.asked = resolved, answers, asked  # type: ignore[attr-defined]
    n.client = lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))  # type: ignore[attr-defined]
    return n


async def check(net, monkeypatch, *items) -> dict[str, int]:
    monkeypatch.setattr(library, "load", lambda: list(items))
    async with SessionLocal() as s, net.client() as http:
        return await library.check_library_links(s, http)


def redirect(to: str) -> httpx.Response:
    return httpx.Response(302, headers={"Location": to})


@pytest.mark.parametrize(
    "location",
    [
        "http://169.254.169.254/latest/meta-data/",
        "https://internal.example/admin",
        "http://localhost:8000/api/admin/users",
        "https://d1.islamhouse.com:8443/x",
        "https://user@d1.islamhouse.com/x",
        "//evil.example/x",
    ],
)
async def test_sec_l13_a_redirect_to_another_host_is_never_requested(net, monkeypatch, location):
    net.answers["/1.pdf"] = redirect(location)
    counts = await check(net, monkeypatch, _item(1))
    assert net.asked == ["https://d1.islamhouse.com/data/tl/1.pdf"]  # the redirect target was not asked
    assert counts == {"ok": 1, "hidden": 0}  # the source answered: the item stays


async def test_sec_l13_a_redirect_inside_the_library_hosts_is_followed_and_checked(net, monkeypatch):
    net.answers["/1.pdf"] = redirect("https://islamhouse.com/moved/1")
    net.answers["/moved/1"] = httpx.Response(404)
    net.answers["/2.pdf"] = redirect("/data/tl/2-new.pdf")
    counts = await check(net, monkeypatch, _item(1), _item(2))
    assert counts == {"ok": 1, "hidden": 1}
    assert net.asked == [
        "https://d1.islamhouse.com/data/tl/1.pdf",
        "https://islamhouse.com/moved/1",
        "https://d1.islamhouse.com/data/tl/2.pdf",
        "https://d1.islamhouse.com/data/tl/2-new.pdf",
    ]


async def test_sec_l13_redirects_are_bounded(net, monkeypatch):
    net.answers["/1.pdf"] = redirect("/data/tl/1.pdf")  # to itself, for ever
    counts = await check(net, monkeypatch, _item(1))
    assert counts == {"ok": 0, "hidden": 1} and len(net.asked) == library.LINK_REDIRECTS + 1


async def test_sec_l13_a_host_that_resolves_to_a_private_address_is_not_requested(net, monkeypatch):
    net.resolved["d1.islamhouse.com"] = ["10.0.0.5"]
    counts = await check(net, monkeypatch, _item(1))
    assert net.asked == [] and counts == {"ok": 1, "hidden": 0}  # not asked, so never a reason to hide


async def test_sec_l13_a_redirect_to_a_library_host_at_a_private_address_is_not_requested(net, monkeypatch):
    net.resolved["islamhouse.com"] = ["127.0.0.1"]
    net.answers["/1.pdf"] = redirect("https://islamhouse.com/moved/1")
    await check(net, monkeypatch, _item(1))
    assert net.asked == ["https://d1.islamhouse.com/data/tl/1.pdf"]


async def test_sec_l13_a_catalogue_address_on_another_host_is_not_requested(net, monkeypatch):
    counts = await check(net, monkeypatch, _item(1, host="files.other.example"))
    assert net.asked == [] and counts == {"ok": 1, "hidden": 0}


async def test_sec_l13_dead_and_living_links_are_still_told_apart(net, monkeypatch):
    net.answers["/2.pdf"] = httpx.Response(404)
    net.answers["/3.pdf"] = lambda r: httpx.Response(405 if r.method == "HEAD" else 206)  # HEAD refused: one byte is asked
    assert await check(net, monkeypatch, _item(1), _item(2), _item(3)) == {"ok": 2, "hidden": 1}
    assert net.asked.count("https://d1.islamhouse.com/data/tl/3.pdf") == 2
