"""PLT-06 web push and the MOT-05 gentle reminder.

PLT-06 R2: two of the three notification types travel by push and each has
its own switch on the device's subscription: the learning reminder
(`reminder_enabled`) and replies from a human (`replies_enabled`). Both are
off until the person turns them on (R1); turning one off leaves the other.
The third type, the prayer reminder, is computed and shown on the device
while Rafeeq is open and never reaches the server (PRC-05; PLT-06 open
question default).

A device subscribes with its push endpoint (no account needed). The
reminder is off until the learner turns it on and picks a time (R1). The
device tells us the days it learned (a date, nothing else) so we never
remind on a day they already learned (R2). Reminder text is neutral: no
app name, no religious word, no streak, no blame (R3). Ignored reminders
thin out: daily, then every other day after 3, weekly after 6; learning
resets it (R4). The notification opens /next, which the app resolves to
the next lesson or a review session (R5).
"""

import asyncio
import json
import logging
import re
from datetime import UTC, date, datetime
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import requests
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, or_, select

from app.core import ratelimit
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.deps import OptionalUser, Session
from app.platform.models import PushSubscription

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/push", tags=["push"])

REMINDER_TEXT = {  # MOT-05 R3 (Layla's lock screen example)
    "ar": ("لحظة لك", "لديك درس قصير جاهز متى شئت"),
    "en": ("A moment for you", "A short lesson is ready whenever you are"),
    "tl": ("Sandali para sa iyo", "May maikling aralin na handa kapag gusto mo"),
}

# --- PLT-13 notifications on iPhone ------------------------------------------
# R5: the «جرّب الإشعار» text. Neutral like every push (PLT-06 R3): no app
# name, no religious word.
TEST_TEXT = {
    "ar": ("تجربة", "وصل هذا الإشعار إلى جهازك"),
    "en": ("Test", "This notification reached your device"),
    "tl": ("Pagsubok", "Nakarating ang abisong ito sa iyong device"),
}
TEST_PER_DAY = 3  # R5: at most three a day per device
# R6: the in-app base path the notification links live under. PLT-10 moves the
# app to /app/: change this together with the payload urls (tests follow it).
APP_BASE = "/"


def in_app(path: str = "") -> str:
    return APP_BASE + path.lstrip("/")


def urgency_of(payload: dict) -> str:
    """R3: replies from a person (CMP tags) are urgent, everything else normal."""
    return "high" if str(payload.get("tag", "")).startswith("cmp-") else "normal"


class Keys(BaseModel):
    p256dh: str = Field(max_length=255)
    auth: str = Field(max_length=255)


# Security review #3: the server POSTs to the endpoint, so only the browsers'
# own push services are accepted (no SSRF to internal hosts), and redirects
# are never followed when sending.
PUSH_HOSTS = (
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "web.push.apple.com",
    ".notify.windows.com",
    ".push.apple.com",
)


def allowed_endpoint(url: str) -> bool:
    host = urlsplit(url).hostname or ""
    return url.startswith("https://") and any(host == h or (h.startswith(".") and host.endswith(h)) for h in PUSH_HOSTS)


class SubscriptionIn(BaseModel):
    endpoint: str = Field(max_length=1024, pattern=r"^https://")
    keys: Keys

    @field_validator("endpoint")
    @classmethod
    def _known_push_service(cls, v: str) -> str:
        if not allowed_endpoint(v):
            raise ValueError("unknown push service")
        return v


class SubscribeIn(BaseModel):
    install_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    subscription: SubscriptionIn
    locale: str = Field(default="ar", pattern=r"^(ar|en|tl)$")
    timezone: str = Field(default="Asia/Riyadh", max_length=64)

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("unknown timezone") from None
        return v


class ReminderIn(BaseModel):
    endpoint: str = Field(max_length=1024)
    enabled: bool
    time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    locale: str | None = Field(default=None, pattern=r"^(ar|en|tl)$")
    timezone: str | None = Field(default=None, max_length=64)


class RepliesIn(BaseModel):
    endpoint: str = Field(max_length=1024)
    enabled: bool


class LearnedIn(BaseModel):
    endpoint: str | None = Field(default=None, max_length=1024)
    day: date


class EndpointIn(BaseModel):
    endpoint: str = Field(max_length=1024)


@router.get("/public-key")
async def public_key() -> dict:
    return {"key": get_settings().vapid_public_key or None}


async def _by_endpoint(session, endpoint: str) -> PushSubscription:
    sub = await session.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_subscribed")
    return sub


@router.post("/subscribe", status_code=204)
async def subscribe(body: SubscribeIn, session: Session, user: OptionalUser, request: Request) -> None:
    ratelimit.hit(f"push-sub:{request.client.host if request.client else '-'}", limit=20, window_s=3600)
    sub = await session.scalar(select(PushSubscription).where(PushSubscription.endpoint == body.subscription.endpoint))
    if sub is None:
        sub = PushSubscription(endpoint=body.subscription.endpoint)
        session.add(sub)
    sub.p256dh, sub.auth = body.subscription.keys.p256dh, body.subscription.keys.auth
    sub.install_id, sub.locale, sub.timezone, sub.failed_at = body.install_id, body.locale, body.timezone, None
    if user is not None:
        sub.user_id = user.id
    await session.commit()


@router.put("/reminder")
async def set_reminder(body: ReminderIn, session: Session) -> dict:
    sub = await _by_endpoint(session, body.endpoint)
    if body.enabled and not (body.time or sub.reminder_time):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "time_required")  # R1: the learner picks the time
    sub.reminder_enabled = body.enabled
    if body.time:
        sub.reminder_time = body.time
    if body.locale:
        sub.locale = body.locale
    if body.timezone:
        try:
            ZoneInfo(body.timezone)
        except (ZoneInfoNotFoundError, ValueError):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown_timezone") from None
        sub.timezone = body.timezone
    await session.commit()
    return {"enabled": sub.reminder_enabled, "time": sub.reminder_time}


@router.post("/state")
async def state(body: EndpointIn, session: Session) -> dict:
    """The switches stored for this device, so «حسابي» shows what the server
    will really do (the endpoint goes in the body, never in a URL)."""
    sub = await session.scalar(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint))
    if sub is None or sub.failed_at is not None:  # PLT-13 R3: a subscription the push service dropped shows off
        return {"subscribed": False, "reminder": False, "time": None, "replies": False}
    return {"subscribed": True, "reminder": sub.reminder_enabled, "time": sub.reminder_time, "replies": sub.replies_enabled}


@router.put("/replies")
async def set_replies(body: RepliesIn, session: Session) -> dict:
    """PLT-06 R2: this device's «replies from a human» switch."""
    sub = await _by_endpoint(session, body.endpoint)
    sub.replies_enabled = body.enabled
    await session.commit()
    return {"enabled": sub.replies_enabled}


@router.post("/learned", status_code=204)
async def learned(body: LearnedIn, session: Session, user: OptionalUser) -> None:
    """MOT-05 R2: no reminder on a day the person learned. Signed in, a
    learning day on one device marks every device of the account."""
    day = body.day.isoformat()
    who = [PushSubscription.endpoint == body.endpoint] if body.endpoint else []
    if user is not None:
        who.append(PushSubscription.user_id == user.id)
    if not who:
        return
    for sub in await session.scalars(select(PushSubscription).where(or_(*who))):
        if sub.last_learned_on is None or day > sub.last_learned_on:
            sub.last_learned_on = day
    await session.commit()


@router.post("/unsubscribe", status_code=204)
async def unsubscribe(body: EndpointIn, session: Session) -> None:
    await session.execute(delete(PushSubscription).where(PushSubscription.endpoint == body.endpoint))
    await session.commit()


class ResubscribeIn(SubscribeIn):
    """PLT-13 R4: Safari never fires pushsubscriptionchange, so the app renews a
    lost or changed subscription itself and moves this device's switches."""

    old_endpoint: str | None = Field(default=None, max_length=1024)
    reminder: bool = False
    time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    replies: bool = False


@router.post("/resubscribe")
async def resubscribe(body: ResubscribeIn, session: Session, user: OptionalUser, request: Request) -> dict:
    """R4: the new endpoint takes the device's settings. What the server learned
    about the old one (learning days, ignored reminders, account) moves too, but
    only from a subscription of the same install, and the old row is removed."""
    ratelimit.hit(f"push-sub:{request.client.host if request.client else '-'}", limit=20, window_s=3600)
    new_ep = body.subscription.endpoint
    old = None
    if body.old_endpoint and body.old_endpoint != new_ep:
        old = await session.scalar(select(PushSubscription).where(PushSubscription.endpoint == body.old_endpoint))
        if old is not None and old.install_id != body.install_id:
            old = None
    sub = await session.scalar(select(PushSubscription).where(PushSubscription.endpoint == new_ep))
    if sub is None:
        sub = PushSubscription(endpoint=new_ep)
        session.add(sub)
    sub.p256dh, sub.auth = body.subscription.keys.p256dh, body.subscription.keys.auth
    sub.install_id, sub.locale, sub.timezone, sub.failed_at = body.install_id, body.locale, body.timezone, None
    if old is not None:
        sub.user_id = old.user_id
        sub.reminder_time = old.reminder_time
        sub.ignored_in_row, sub.last_reminder_on, sub.last_learned_on = old.ignored_in_row, old.last_reminder_on, old.last_learned_on
        await session.delete(old)
    if user is not None:
        sub.user_id = user.id
    if body.time:
        sub.reminder_time = body.time
    sub.reminder_enabled = body.reminder and bool(sub.reminder_time)  # MOT-05 R1: never on without a time
    sub.replies_enabled = body.replies
    await session.commit()
    return {"subscribed": True, "reminder": sub.reminder_enabled, "time": sub.reminder_time, "replies": sub.replies_enabled}


@router.post("/test")
async def test_push(body: EndpointIn, session: Session) -> dict:
    """PLT-13 R5: one neutral test notification to this device only, three a day
    at most. The count lives in the limiter (keyed by endpoint), not the
    database: a restart forgets it, which is harmless."""
    sub = await session.scalar(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint))
    if sub is None or sub.failed_at is not None or not (sub.reminder_enabled or sub.replies_enabled):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_subscribed")
    ratelimit.hit(f"push-test:{sub.endpoint}", limit=TEST_PER_DAY, window_s=24 * 3600)
    title, text = TEST_TEXT.get(sub.locale, TEST_TEXT["en"])
    sent = await send(sub, {"title": title, "body": text, "url": in_app(), "tag": "plt13-test"})
    await session.commit()  # send() marks a gone subscription
    return {"sent": sent}


# --- Sending -------------------------------------------------------------


def due(sub: PushSubscription, now: datetime) -> tuple[bool, int]:
    """Whether to remind now, and the ignored-in-a-row count to store if so."""
    if not (sub.reminder_enabled and sub.reminder_time and re.fullmatch(r"\d\d:\d\d", sub.reminder_time)):
        return False, sub.ignored_in_row
    local = now.astimezone(ZoneInfo(sub.timezone))
    today = local.date()
    if local.strftime("%H:%M") < sub.reminder_time:
        return False, sub.ignored_in_row
    if sub.last_reminder_on == today.isoformat() or sub.last_learned_on == today.isoformat():  # R2
        return False, sub.ignored_in_row
    if sub.last_reminder_on is None:
        return True, 0
    last = date.fromisoformat(sub.last_reminder_on)
    ignored = sub.last_learned_on is None or sub.last_learned_on < sub.last_reminder_on
    streak = sub.ignored_in_row + 1 if ignored else 0
    gap = 1 if streak < 3 else 2 if streak < 6 else 7  # R4
    return (today - last).days >= gap, streak


class Gone(Exception):
    pass


class Rejected(Exception):
    """PLT-13 R3: the push service refused our signature (403). The device did
    nothing wrong: keep the subscription and tell the team."""


def _no_redirects() -> requests.Session:
    session = requests.Session()
    session.max_redirects = 0
    return session


def _send_sync(sub: PushSubscription, payload: dict) -> None:
    s = get_settings()
    if not allowed_endpoint(sub.endpoint):
        raise Gone
    try:
        webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=s.vapid_private_key,
            vapid_claims={"sub": s.vapid_subject},
            ttl=6 * 3600,
            headers={"Urgency": urgency_of(payload)},  # PLT-13 R3
            timeout=10,
            requests_session=_no_redirects(),
        )
    except WebPushException as e:
        code = e.response.status_code if e.response is not None else None
        if code in (404, 410):
            raise Gone from e
        if code == 403:
            raise Rejected(urlsplit(sub.endpoint).hostname or "-") from None
        raise


async def send(sub: PushSubscription, payload: dict) -> bool:
    """Send one push; drop the subscription if the browser says it is gone."""
    if not get_settings().vapid_private_key:
        return False
    try:
        await asyncio.to_thread(_send_sync, sub, payload)
        return True
    except Gone:
        sub.reminder_enabled = False
        sub.failed_at = datetime.now(UTC)
        return False
    except Rejected as e:  # PLT-13 R3: only the push host is logged, never the endpoint or the person
        log.error("push signature rejected (403) by %s: check VAPID keys and subject", e)
        return False
    except Exception:  # network trouble: try again next run
        log.warning("push failed", exc_info=True)
        return False


async def send_to_user(session, user_id, payload: dict) -> int:
    """PLT-06: e.g. a mentor's reply, to the account's devices whose replies
    switch is on (R2). Neutral text is the caller's job."""
    subs = await session.scalars(
        select(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.failed_at.is_(None),
            PushSubscription.replies_enabled.is_(True),
        )
    )
    return sum([await send(s, payload) for s in subs])


async def run_reminders(now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    sent = 0
    async with SessionLocal() as session:
        subs = await session.scalars(select(PushSubscription).where(PushSubscription.reminder_enabled.is_(True)))
        for sub in subs:
            ok, streak = due(sub, now)
            if not ok:
                continue
            title, body = REMINDER_TEXT.get(sub.locale, REMINDER_TEXT["en"])
            if await send(sub, {"title": title, "body": body, "url": "/next", "tag": "reminder"}):
                sub.last_reminder_on = now.astimezone(ZoneInfo(sub.timezone)).date().isoformat()
                sub.ignored_in_row = streak
                sent += 1
        await session.commit()
    return sent
