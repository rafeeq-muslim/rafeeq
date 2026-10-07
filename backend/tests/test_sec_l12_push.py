"""Security review 2026-10-07, B-L12 (PLT-06): the push endpoint's address is
read strictly (exact hosts, port 443 only), and knowing an endpoint does not
let a stranger replace its keys or its account link."""

import pytest
from sqlalchemy import select

from app.core.db import SessionLocal
from app.platform.models import PushSubscription
from app.platform.push import allowed_endpoint
from tests.conftest import auth, register

EP = "https://fcm.googleapis.com/fcm/send/daniel-device"
KEYS = {"p256dh": "TEST_DEVICE_KEY", "auth": "TEST_DEVICE_AUTH"}
OTHER = {"p256dh": "TEST_STRANGER_KEY", "auth": "TEST_STRANGER_AUTH"}


@pytest.mark.parametrize(
    "url",
    [
        "https://fcm.googleapis.com/fcm/send/abc",
        "https://fcm.googleapis.com:443/fcm/send/abc",
        "https://updates.push.services.mozilla.com/wpush/v2/abc_-def",
        "https://web.push.apple.com/QGk3abc",
        "https://api.push.apple.com/3/device/abc",
        "https://wns2-par02p.notify.windows.com/w/?token=abc%2bdef",
    ],
)
def test_sec_l12_real_push_services_are_accepted(url):
    assert allowed_endpoint(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://fcm.googleapis.com:8443/fcm/send/abc",  # any port was accepted before
        "https://fcm.googleapis.com:22/",
        "https://fcm.googleapis.com:0443/x",
        "https://fcm.googleapis.com:/x",
        "https://user@fcm.googleapis.com/x",
        "https://user:pass@fcm.googleapis.com/x",
        "https://fcm.googleapis.com@evil.example/x",
        "https://evil.example\\@fcm.googleapis.com/x",
        "https://evil.example/x#@fcm.googleapis.com",
        "https://evil.example/.push.apple.com",
        "https://fcm.googleapis.com.evil.example/x",
        "https://evilfcm.googleapis.com/x",
        "https://.push.apple.com/x",  # the suffix alone is not a host
        "https://push.apple.com/x",
        "https://x_y.push.apple.com/x",  # odd host characters
        "https://x%2e.push.apple.com/x",
        "https://xn--аpple.push.apple.com/x",
        "https://FCM.googleapis.com/x",  # browsers give lower case; anything else is not from one
        "https://fcm.googleapis.com/x y",
        "https://fcm.googleapis.com/x\n",
        "https://fcm.googleapis.com/x\\y",
        "https://fcm.googleapis.com",  # no path
        "https://[::1]/x",
        "https://127.0.0.1/x",
        "http://fcm.googleapis.com/x",
        " https://fcm.googleapis.com/x",
    ],
)
def test_sec_l12_anything_else_is_refused(url):
    assert not allowed_endpoint(url)


async def row() -> PushSubscription:
    async with SessionLocal() as s:
        sub = await s.scalar(select(PushSubscription).where(PushSubscription.endpoint == EP))
        assert sub is not None
        return sub


def body(keys=KEYS, install="dev-12345678", **extra) -> dict:
    return {"install_id": install, "subscription": {"endpoint": EP, "keys": keys}, "locale": "ar", **extra}


async def test_sec_l12_subscribe_refuses_a_port(client):
    b = body()
    b["subscription"]["endpoint"] = "https://fcm.googleapis.com:8443/fcm/send/abc"
    assert (await client.post("/api/push/subscribe", json=b)).status_code == 422


async def test_sec_l12_a_stranger_cannot_replace_keys_or_account_link(client):
    """Before: anyone who knew the endpoint could point the subscription at
    their own keys and their own account (the owner's replies then stop)."""
    owner = await register(client, username="daniel-1")
    assert (await client.post("/api/push/subscribe", json=body(), headers=auth(owner["access_token"]))).status_code == 204
    stranger = await register(client, username="stranger-1")
    # as a guest, then signed in to another account: same empty answer, nothing changed
    for headers in ({}, auth(stranger["access_token"])):
        r = await client.post("/api/push/subscribe", json=body(OTHER, install="stranger-device-1", locale="en"), headers=headers)
        assert r.status_code == 204
        r = await client.post(
            "/api/push/resubscribe",
            json=body(OTHER, install="stranger-device-1", reminder=True, time="03:00", replies=True),
            headers=headers,
        )
        assert r.status_code == 200
    sub = await row()
    assert (sub.p256dh, sub.auth) == (KEYS["p256dh"], KEYS["auth"])
    assert str(sub.user_id) == owner["user"]["id"] and sub.install_id == "dev-12345678" and sub.locale == "ar"
    assert sub.reminder_enabled is False and sub.reminder_time is None and sub.replies_enabled is False


async def test_sec_l12_the_device_itself_still_updates_and_links_an_account(client):
    assert (await client.post("/api/push/subscribe", json=body())).status_code == 204  # as a guest
    me = await register(client, username="daniel-1")
    r = await client.post("/api/push/subscribe", json=body(locale="en"), headers=auth(me["access_token"]))  # same keys: the same device
    assert r.status_code == 204
    sub = await row()
    assert str(sub.user_id) == me["user"]["id"] and sub.locale == "en"


async def test_sec_l12_the_linked_account_may_renew_its_keys(client):
    me = await register(client, username="daniel-1")
    h = auth(me["access_token"])
    await client.post("/api/push/subscribe", json=body(), headers=h)
    assert (await client.post("/api/push/subscribe", json=body(OTHER), headers=h)).status_code == 204
    sub = await row()
    assert sub.p256dh == OTHER["p256dh"] and str(sub.user_id) == me["user"]["id"]
