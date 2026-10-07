"""Requests that act on the refresh cookie come from Rafeeq's own pages.

Security review 2026-10-07 (B-L4): `/api/auth/refresh` and `/api/auth/logout`
are the two routes authorised by a cookie alone. SameSite=Lax already keeps
other *sites* out, but an app on a sibling subdomain is the same site; so the
browser's own `Origin` header is checked too. A browser always sends it with
a POST; a client that is not a browser (tests, scripts) sends none and has no
cookie jar to abuse, so an absent header is accepted."""

from urllib.parse import urlsplit

from fastapi import Depends, HTTPException, Request, status

from app.core.config import get_settings


def _host_port(url: str) -> tuple[str, int | None] | None:
    try:
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https") or not parts.hostname:
            return None
        return parts.hostname.lower(), parts.port or (443 if parts.scheme == "https" else 80)
    except ValueError:
        return None


def is_same_origin(origin: str | None, host_header: str | None, public_url: str, forwarded_host: str | None = None) -> bool:
    if origin is None:
        return True  # not a browser
    theirs = _host_port(origin.strip())
    if theirs is None:
        return False  # "null" (sandboxed frame, file:), or not a web origin
    if theirs == _host_port(public_url):
        return True
    # The page and the API share one host; TLS ends before this server, so the
    # scheme the browser saw is taken from its Origin.
    # The app's nginx passes `Host` without its port and the browser's own
    # Host, port included, as `X-Forwarded-Host`: either may name the page's
    # host, and each is compared with this request's own Origin only.
    scheme = urlsplit(origin.strip()).scheme
    return any(h and theirs == _host_port(f"{scheme}://{h.strip()}") for h in (host_header, forwarded_host))


async def _same_origin(request: Request) -> None:
    h = request.headers
    ok = is_same_origin(h.get("origin"), h.get("host"), get_settings().public_url, h.get("x-forwarded-host"))
    if not ok or request.headers.get("sec-fetch-site", "").lower() == "cross-site":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "cross_site_request")


SameOrigin = Depends(_same_origin)
