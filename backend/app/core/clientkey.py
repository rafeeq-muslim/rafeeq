"""The one client key every limiter caller uses (security audit 2026-10-07, A-H3).

- Address: the client address the proxies restored (`request.client.host`).
  An IPv6 address is keyed by its /64: a home or mobile line owns a whole
  /64, so each of its 2^64 addresses must not be a separate client. An
  IPv4-mapped IPv6 address is keyed as the IPv4 address.
- `hit` counts a request against the address AND, when signed in, against
  the account. Free accounts on one address therefore share the address's
  allowance, and one account moving between addresses keeps its own.

`app.core.ratelimit.hit` does the counting; this module only builds keys.
"""

import ipaddress

from fastapi import Request

from app.core import ratelimit


def address_key(host: str | None) -> str:
    if not host:
        return "-"
    try:
        ip = ipaddress.ip_address(host.split("%", 1)[0])
    except ValueError:
        return host[:64]  # not an address (a test client's name): still one bounded key
    if ip.version == 6:
        if ip.ipv4_mapped is not None:
            return str(ip.ipv4_mapped)
        return f"{ipaddress.ip_network((ip, 64), strict=False).network_address}/64"
    return str(ip)


def address(request: Request) -> str:
    return address_key(request.client.host if request.client else None)


def keys(request: Request, user) -> list[str]:
    """`a:<address or /64>` always, then `u:<account id>` when signed in."""
    out = [f"a:{address(request)}"]
    if user is not None:
        out.append(f"u:{user.id}")
    return out


def primary(request: Request, user) -> str:
    """One key naming the client: the account when signed in, else the address."""
    return keys(request, user)[-1]


def hit(scope: str, request: Request, user, limit: int, window_s: int) -> None:
    """Count one request in `scope` against the address and the account.
    Raises 429 `rate_limited` when either is over `limit` per `window_s`."""
    for key in keys(request, user):
        ratelimit.hit(f"{scope}:{key}", limit, window_s)
