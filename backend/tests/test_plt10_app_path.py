"""PLT-10 R2/R3: the app lives under /app; push links and organisation links open inside it."""

import re
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.organizations.manage import welcome_path
from app.platform import push


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("/next", "/app/next"),
        ("/", "/app/"),
        ("/inbox?tab=groups", "/app/inbox?tab=groups"),
        ("/mentor/help/7", "/app/mentor/help/7"),
        ("/app/next", "/app/next"),
        ("/app", "/app"),
        ("https://example.org/x", "https://example.org/x"),
        ("//evil.example/x", "//evil.example/x"),
    ],
)
def test_plt10_r3_push_targets_open_inside_the_app(given, expected):
    assert push.app_url(given) == expected


async def test_plt10_r3_reminder_tap_opens_the_next_lesson_inside_the_app(monkeypatch):
    sent: list[dict] = []
    monkeypatch.setattr(push, "get_settings", lambda: SimpleNamespace(vapid_private_key="k"))
    monkeypatch.setattr(push, "_send_sync", lambda sub, payload: sent.append(payload))
    sub = SimpleNamespace(endpoint="https://fcm.googleapis.com/fcm/send/abc")
    # A caller written before the move ("/mentor/help/…") still lands inside /app.
    assert await push.send(sub, {"title": "t", "body": "", "url": "/mentor/help/1"})
    assert await push.send(sub, {"title": "t", "body": "", "url": "/app/next", "tag": "reminder"})
    assert [p["url"] for p in sent] == ["/app/mentor/help/1", "/app/next"]


def test_plt10_r2_organisation_link_opens_welcome_inside_the_app():
    code = SimpleNamespace(lang="tl", code="K7M2QX9P")
    assert welcome_path(code) == "/app/welcome?lang=tl&org=K7M2QX9P"


# --- The container's nginx config (infra/web.nginx.conf) ------------------

NGINX = (Path(__file__).resolve().parents[2] / "infra" / "web.nginx.conf").read_text(encoding="utf-8")
BLOCKS = [(m.group(1), m.group(2), m.group(3)) for m in re.finditer(r"^\s*location\s+(=|~)?\s*(\S+)\s*\{(.*)\}\s*$", NGINX, re.MULTILINE)]


def answer(path: str) -> str:
    """The body of the location nginx picks for a path: exact, then regex, then longest prefix."""
    for mod, pat, body in BLOCKS:
        if mod == "=" and pat == path:
            return body
    for mod, pat, body in BLOCKS:
        if mod == "~" and re.search(pat, path):
            return body
    prefixes = [(pat, body) for mod, pat, body in BLOCKS if not mod and path.startswith(pat)]
    return max(prefixes, key=lambda pb: len(pb[0]))[1] if prefixes else ""


def test_plt10_r1_bare_address_serves_the_landing_page_without_redirect():
    assert "try_files /landing/index.html" in answer("/")
    assert "return 30" not in answer("/")


@pytest.mark.parametrize(
    "old",
    [
        "/learn",
        "/learn/lesson/l1",
        "/ask",
        "/me",
        "/me/account",
        "/practice/times",
        "/discover/quran",
        "/review-desk",
        "/inbox",
        "/guide",
        "/next",
        "/privacy",
        "/welcome",
    ],
)
def test_plt10_r2_old_links_reach_the_same_page_under_app(old):
    assert "return 301 /app$request_uri" in answer(old)  # $request_uri keeps ?lang=tl&org=…


def test_plt10_r2_only_whole_segments_and_app_pages_use_the_shell():
    assert "return 301" not in answer("/media")
    assert "try_files $uri /index.html" in answer("/app/learn")
    assert "return 301 /app/" in answer("/app")


def test_plt10_r2_printed_landing_qr_still_reaches_the_landing_page():
    assert "try_files $uri $uri/ =404" in answer("/landing/")
    assert "return 301 /$is_args$args" in answer("/landing")


def test_plt10_nginx_keeps_headers_cache_proxy_and_relative_redirects():
    for line in re.findall(r"^\s*location\s.*\{.*\}\s*$", NGINX, re.MULTILINE):
        assert "include /etc/nginx/snippets/security-headers.inc" in line, line
    assert "proxy_pass http://backend:8000;" in NGINX
    assert 'location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable";' in NGINX
    assert "absolute_redirect off;" in NGINX
