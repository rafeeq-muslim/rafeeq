"""Encryption at rest for the one contact detail Rafeeq keeps (CMP-08 R3:
the mentor applicant's email or phone number).

- `encrypt` / `decrypt`: Fernet (AES-128-CBC + HMAC-SHA256) through
  MultiFernet. `APPLICATION_CONTACT_KEYS` is a comma-separated list, newest
  first: the first key encrypts, every key decrypts, so a key is rotated by
  putting a new one in front and running `rotate`.
- `contact_digest`: HMAC-SHA256 of the normalised contact under
  `APPLICATION_CONTACT_HMAC_KEY`, stored beside the ciphertext so "the same
  contact applied before" is found without decrypting every row.

A missing or malformed key never stops the app. In production the helper is
then *unavailable*: nothing new is encrypted (the caller refuses the write),
`decrypt` returns None, and one warning names the two settings. Outside
production a fixed, public development key is used instead (tests, local
runs): it protects nothing.

What this protects: database dumps, backups and anyone who reads only the
database. It does not protect against someone who controls the server, where
the keys live beside the database.

    python -m app.core.crypto migrate   # encrypt contacts still stored as plain text
    python -m app.core.crypto rotate    # re-encrypt every contact with the newest key
"""

import asyncio
import base64
import hashlib
import hmac
import logging
import sys
from dataclasses import dataclass
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.core.config import get_settings

log = logging.getLogger(__name__)

# NOT SECRETS: public development values, refused in production.
DEV_ONLY_NOT_SECRET_KEY = base64.urlsafe_b64encode(b"rafeeq-dev-only-not-a-secret-key").decode()
DEV_ONLY_NOT_SECRET_HMAC_KEY = "rafeeq-dev-only-not-a-secret-hmac-key"
HMAC_KEY_MIN = 32

HOW_TO_SET = (
    "Add both lines to the secrets file (~/.config/rafeeq/secrets.env) and redeploy:\n"
    "  APPLICATION_CONTACT_KEYS=<value>      generate: "
    'python3 -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"\n'
    "  APPLICATION_CONTACT_HMAC_KEY=<value>  generate: "
    'python3 -c "import secrets;print(secrets.token_urlsafe(32))"'
)


class CryptoUnavailable(RuntimeError):
    """No usable key: the caller must not store the value."""


@dataclass(frozen=True)
class _Keys:
    fernet: MultiFernet
    hmac_key: bytes


@lru_cache
def _keys() -> _Keys | None:
    """Read the settings once; logs one warning when the keys are the development ones or unusable."""
    s = get_settings()
    raw = [k.strip() for k in s.application_contact_keys.split(",") if k.strip()]
    mac = s.application_contact_hmac_key.strip()
    if not raw and not mac and not s.is_production:
        log.warning(
            "APPLICATION_CONTACT_KEYS and APPLICATION_CONTACT_HMAC_KEY are not set: using the public development key (no protection)"
        )
        raw, mac = [DEV_ONLY_NOT_SECRET_KEY], DEV_ONLY_NOT_SECRET_HMAC_KEY
    problem = None
    if not raw or not mac:
        problem = "missing"
    elif len(mac) < HMAC_KEY_MIN:
        problem = f"APPLICATION_CONTACT_HMAC_KEY is shorter than {HMAC_KEY_MIN} characters"
    elif s.is_production and (DEV_ONLY_NOT_SECRET_KEY in raw or mac == DEV_ONLY_NOT_SECRET_HMAC_KEY):
        problem = "the public development key is not accepted in production"
    else:
        try:
            return _Keys(MultiFernet([Fernet(k) for k in raw]), mac.encode())
        except (ValueError, TypeError):
            problem = "APPLICATION_CONTACT_KEYS holds a value that is not a Fernet key"
    log.warning(
        "APPLICATION_CONTACT_KEYS / APPLICATION_CONTACT_HMAC_KEY unusable (%s): mentor applications are closed "
        "and stored contacts cannot be read until they are set. %s",
        problem,
        HOW_TO_SET,
    )
    return None


def reset() -> None:
    """Read the settings again (tests; a process restart does the same)."""
    _keys.cache_clear()


def available() -> bool:
    return _keys() is not None


def _need() -> _Keys:
    keys = _keys()
    if keys is None:
        raise CryptoUnavailable("application contact keys are not set")
    return keys


def encrypt(value: str) -> str:
    return _need().fernet.encrypt(value.encode()).decode()


def decrypt(token: str | None) -> str | None:
    """None when there is nothing, no key, or the token does not open with any key."""
    keys = _keys()
    if not token or keys is None:
        return None
    try:
        return keys.fernet.decrypt(token.encode()).decode()
    except (InvalidToken, UnicodeDecodeError):
        return None


def contact_digest(normalized: str) -> str:
    """Lookup value for a normalised contact (64 hex characters)."""
    return hmac.new(_need().hmac_key, normalized.encode(), hashlib.sha256).hexdigest()


async def _main(command: str) -> int:
    # The table belongs to Companion; this module only offers the command line.
    from app.companion import applications
    from app.core.db import SessionLocal, engine

    if not available():
        print("The keys are not set; nothing was changed.\n" + HOW_TO_SET, file=sys.stderr)
        return 1
    try:
        async with SessionLocal() as session:
            if command == "migrate":
                print(f"encrypted {await applications.encrypt_plaintext(session)} contact(s) that were stored as plain text")
                return 0
            done, unreadable = await applications.rotate(session)
            print(
                f"re-encrypted {done} contact(s) with the newest key; {unreadable} could not be read with any key and were left as they are"
            )
            return 2 if unreadable else 0
    finally:
        await engine.dispose()


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("migrate", "rotate"):
        print("usage: python -m app.core.crypto migrate|rotate", file=sys.stderr)
        raise SystemExit(64)
    # Run the imported module, not this `__main__` copy: one key cache, one warning.
    from app.core import crypto as _crypto

    raise SystemExit(asyncio.run(_crypto._main(sys.argv[1])))
