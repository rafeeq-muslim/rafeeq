"""Argon2 off the event loop (security audit 2026-10-07, A-M5).

One Argon2id hash or check takes tens of milliseconds of CPU and 64 MiB of
memory. Run inline in a request handler it stops every other request of the
single backend process for that time, so a burst of sign-ins freezes the
app. Here each one runs in a worker thread (argon2-cffi releases the GIL),
at most `MAX_CONCURRENT` at a time: the rest wait their turn without
blocking the loop, and memory stays bounded.

`app.core.security` keeps the hashing itself; this module only schedules it.
"""

import asyncio

from app.core import security

MAX_CONCURRENT = 2
_slots: dict[int, asyncio.Semaphore] = {}  # one per event loop (tests and scripts start their own)


def _slot() -> asyncio.Semaphore:
    loop = id(asyncio.get_running_loop())
    if loop not in _slots:
        _slots[loop] = asyncio.Semaphore(MAX_CONCURRENT)
    return _slots[loop]


async def hash_password(password: str) -> str:
    async with _slot():
        return await asyncio.to_thread(security.hash_password, password)


async def verify_password(password_hash: str, password: str) -> bool:
    async with _slot():
        return await asyncio.to_thread(security.verify_password, password_hash, password)
