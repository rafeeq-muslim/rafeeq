"""The only network door of the live connectors (PRD live v3 §6, §9).

- SSRF-safe: https only, port 443, no user info, the host must be one of the
  connector's own hosts (exact match), and every address it resolves to must
  be public (no localhost, private, link-local / cloud metadata, multicast or
  reserved ranges). Redirects are followed by hand, at most MAX_REDIRECTS,
  and every hop is checked again. URLs are built by the adapters from record
  ids; a URL typed by the user is never fetched.
- Bounded: every call (a GET and its checked redirect hops) counts against
  the connector's and the attempt's transport budget, gets at most the time left in the collection window, and
  reads at most MAX_BYTES.
- One transient retry (timeout, connection error, 429, 502/503/504) inside
  the budget, honouring Retry-After when it fits the window; never for
  4xx other than 429.
- Private: one client per attempt (cookies die with it), an honest
  User-Agent, no identity headers, nothing about the asker.

Residual risk (documented in the report): DNS is checked before connecting,
so a resolver that answers differently a few milliseconds later (DNS
rebinding) is not fully excluded; the host allowlist limits it to the
connectors' own domains."""

import asyncio
import ipaddress
import logging
import socket
import time
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime

import httpx

from app.knowledge.live_sources import types as T

# A26 / PRD §8: httpx logs every request line at INFO, query string included,
# which would write the search words of a question to the backend log.
# Request lines are never logged; warnings and errors still are.
for _name in ("httpx", "httpcore"):
    logging.getLogger(_name).setLevel(logging.WARNING)

MAX_REDIRECTS = 3
MAX_BYTES = 3_000_000
# A page that is parsed as HTML (security review 2026-10-07, A-M7): parsing
# cost grows with size, and a fatwa or card page is far smaller than this.
HTML_MAX_BYTES = 500_000
MIN_REQUEST_SECONDS = 0.5
RETRY_STATUSES = {429, 502, 503, 504}


class FetchError(Exception):
    """A transport-level failure with a known reason code (types.*)."""

    def __init__(self, code: str, retry_after: float | None = None, transient: bool = False):
        super().__init__(code)
        self.code = code
        self.retry_after = retry_after
        self.transient = transient or code in (T.TIMEOUT, T.TRANSPORT_ERROR, T.RATE_LIMITED)


@dataclass
class Budget:
    """Shared by all connectors of one attempt: total transport calls and the
    collection deadline (time.monotonic)."""

    max_calls: int
    deadline: float
    calls: int = 0

    def remaining(self) -> float:
        return self.deadline - time.monotonic()


@dataclass
class SourceBudget:
    """One connector's share: at most `max_calls` transport calls (retries included)."""

    shared: Budget
    max_calls: int
    calls: int = 0
    hosts: frozenset[str] = field(default_factory=frozenset)

    def take(self) -> float:
        """Count one call; return the timeout it may use. Raises before sending."""
        if self.calls >= self.max_calls or self.shared.calls >= self.shared.max_calls:
            raise FetchError(T.BUDGET_EXHAUSTED)
        left = self.shared.remaining()
        if left < MIN_REQUEST_SECONDS:
            raise FetchError(T.WINDOW_CLOSED)
        self.calls += 1
        self.shared.calls += 1
        return left


async def resolve_host(host: str) -> list[str]:
    """Addresses `host` resolves to (tests replace this function)."""
    infos = await asyncio.get_running_loop().getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    return sorted({i[4][0] for i in infos})


def ip_is_public(ip: str) -> bool:
    try:
        a = ipaddress.ip_address(ip.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(a, ipaddress.IPv6Address) and a.ipv4_mapped is not None:
        a = a.ipv4_mapped
    return a.is_global and not (a.is_multicast or a.is_reserved or a.is_loopback or a.is_link_local or a.is_private)


def check_url(url: str | httpx.URL, hosts: frozenset[str]) -> httpx.URL:
    """The URL may be fetched by this connector, or FetchError(blocked_url)."""
    try:
        u = httpx.URL(str(url))
    except (httpx.InvalidURL, TypeError, ValueError):
        raise FetchError(T.BLOCKED_URL) from None
    host = (u.host or "").lower()
    if u.scheme != "https" or u.userinfo or u.port not in (None, 443) or not host or host not in hosts:
        raise FetchError(T.BLOCKED_URL)
    try:
        ipaddress.ip_address(host.strip("[]"))
        raise FetchError(T.BLOCKED_URL)  # an address literal is never a connector host
    except ValueError:
        pass
    return u


async def _check_dns(host: str) -> None:
    try:
        ips = await resolve_host(host)
    except OSError:
        raise FetchError(T.TRANSPORT_ERROR) from None
    if not ips or not all(ip_is_public(ip) for ip in ips):
        raise FetchError(T.BLOCKED_URL)


def _retry_after(r: httpx.Response) -> float | None:
    v = r.headers.get("retry-after")
    if not v:
        return None
    try:
        return max(0.0, float(v))
    except ValueError:
        try:
            return max(0.0, parsedate_to_datetime(v).timestamp() - time.time())
        except (TypeError, ValueError, IndexError):
            return None


@dataclass
class Fetched:
    url: str  # the final URL after checked redirects
    status: int
    text: str
    content_type: str


def new_client(user_agent: str) -> httpx.AsyncClient:
    """One client per attempt: connections are reused inside it, cookies end with it."""
    return httpx.AsyncClient(
        follow_redirects=False,
        headers={"User-Agent": user_agent, "Accept-Language": "ar,en;q=0.8"},
        timeout=httpx.Timeout(10.0, connect=5.0),
    )


async def _once(
    client: httpx.AsyncClient, budget: SourceBudget, url: httpx.URL, accept: str, per_request_s: float, max_bytes: int = MAX_BYTES
) -> Fetched:
    for hop in range(MAX_REDIRECTS + 1):
        url = check_url(url, budget.hosts)
        await _check_dns(url.host)
        # One logical call per fetch: its checked redirect hops (at most
        # MAX_REDIRECTS) do not take another call, but must fit the window.
        if hop == 0:
            timeout = min(per_request_s, budget.take())
        else:
            timeout = min(per_request_s, budget.shared.remaining())
            if timeout < MIN_REQUEST_SECONDS:
                raise FetchError(T.WINDOW_CLOSED)
        try:
            async with client.stream("GET", url, headers={"Accept": accept}, timeout=timeout) as r:
                if r.status_code in (301, 302, 303, 307, 308):
                    loc = r.headers.get("location")
                    if not loc:
                        raise FetchError(T.BAD_RESPONSE)
                    url = url.join(loc)
                    continue
                if r.status_code in RETRY_STATUSES:
                    raise FetchError(T.RATE_LIMITED if r.status_code == 429 else T.HTTP_ERROR, _retry_after(r), transient=True)
                if r.status_code != 200:
                    raise FetchError(T.HTTP_ERROR)
                body = bytearray()
                async for chunk in r.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise FetchError(T.BAD_RESPONSE)
                return Fetched(
                    str(url), r.status_code, body.decode(r.encoding or "utf-8", errors="replace"), r.headers.get("content-type", "")
                )
        except httpx.TimeoutException:
            raise FetchError(T.TIMEOUT) from None
        except httpx.HTTPError:
            raise FetchError(T.TRANSPORT_ERROR) from None
    raise FetchError(T.BAD_RESPONSE)  # too many redirects


async def get(
    client: httpx.AsyncClient,
    budget: SourceBudget,
    url: str,
    *,
    accept: str = "application/json",
    params: dict[str, str] | None = None,
    per_request_s: float = 8.0,
) -> Fetched:
    """GET with the checks above and one transient retry. A page asked for
    as HTML may be at most HTML_MAX_BYTES; anything else MAX_BYTES."""
    u = httpx.URL(url, params=params) if params else httpx.URL(url)
    max_bytes = HTML_MAX_BYTES if accept.startswith("text/html") else MAX_BYTES
    try:
        return await _once(client, budget, u, accept, per_request_s, max_bytes)
    except FetchError as e:
        if not e.transient:
            raise
        wait = e.retry_after or 0.0
        if wait > 0 and wait + MIN_REQUEST_SECONDS + 1.0 > budget.shared.remaining():
            raise  # Retry-After does not fit the window: report it, do not wait
        if wait > 0:
            await asyncio.sleep(wait)
        return await _once(client, budget, u, accept, per_request_s, max_bytes)
