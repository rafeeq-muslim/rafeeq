"""PLT-13 R3 manual probe: does Apple's push service accept our VAPID signature?

Sends one signed, empty push to a made-up device path on web.push.apple.com.
No device exists there, so a good signature is answered with a device error
(400 BadDeviceToken, 404 or 410); a bad one with 403 (BadJwtToken,
BadPublicKey, ...). Nothing reaches anybody.

    cd backend && set -a && . ~/.config/rafeeq/secrets.env && set +a && uv run python scripts/apple_push_probe.py

Reads VAPID_PRIVATE_KEY / VAPID_SUBJECT from the environment (the same names
the app reads). Never prints a key.
"""

import os
import secrets
import sys
import time

import requests
from py_vapid import Vapid02

HOST = "https://web.push.apple.com"


def main() -> int:
    private = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    subject = os.environ.get("VAPID_SUBJECT", "mailto:team@rafeeq.nan.sa").strip()
    if not private:
        print("VAPID_PRIVATE_KEY is not set: nothing to probe")
        return 2
    vapid = Vapid02.from_string(private)
    headers = vapid.sign({"sub": subject, "aud": HOST, "exp": int(time.time()) + 12 * 3600})  # as pywebpush signs
    headers.update({"TTL": "60", "Urgency": "normal", "Content-Length": "0"})
    url = f"{HOST}/QGuuid-{secrets.token_hex(16)}"  # a device path that cannot exist
    r = requests.post(url, headers=headers, data=b"", timeout=15, allow_redirects=False)
    reason = ""
    try:
        reason = r.json().get("reason", "")
    except ValueError:
        reason = r.text[:120]
    print(f"subject: {subject}")
    print(f"apple answered: {r.status_code} {reason}".rstrip())
    if r.status_code == 403:
        print("RESULT: Apple rejected the signature (fix VAPID keys / subject before shipping)")
        return 1
    if r.status_code in (400, 404, 410):
        print("RESULT: signature accepted; only the made-up device was refused")
        return 0
    print("RESULT: unexpected answer, check by hand")
    return 3


if __name__ == "__main__":
    sys.exit(main())
