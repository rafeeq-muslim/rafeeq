"""PLT-09: the organized home (draft behind the `PLT09_ORGANIZED_HOME` setting,
off by default until the product owner and the PLT owner approve it).

- GET /api/home/config -> {"organized": bool}: the server setting the app reads
  (the app keeps the last answer, so offline it uses what it knew).
- POST /api/home/order (R4): the learning guide's model (LRN-07, KNW-10 R3)
  ranks the three main components and the whole optional list from the
  learning summary, a time-of-day bucket and the interface language only.
  The request model forbids any other field: nothing the learner opened or
  dismissed, nothing about worship, no location (PLT-08 R6). The output is
  ids only; it is checked (known ids, each main component once, no next step)
  and anything else gives {"order": null}, which the app reads as the fixed
  order. Nothing is stored (like the guide's summary, KNW-10 R4).
"""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from app.core import ratelimit
from app.core.config import get_settings
from app.core.deps import OptionalUser, Session
from app.knowledge.ai import agents
from app.knowledge.ai.client import AiUnavailable
from app.knowledge.tasks import approved_names, client_key

router = APIRouter(prefix="/api/home", tags=["home"])

MAIN = ("daily", "card", "ask")  # R1: «يومي», «بطاقة اليوم», «اسأل رفيق»
OPTIONAL = ("ramadan", "human", "save", "reciter", "library")  # R3 table order (the fixed order)
Bucket = Literal["fajr", "morning", "dhuhr", "asr", "evening", "night"]
Id = Annotated[str, Field(max_length=24)]


class NextStep(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lesson_id: str | None = Field(default=None, max_length=16)
    review: bool = False


class OrderIn(BaseModel):
    """The learning summary given to the guide (LRN-07), plus the bucket. Nothing else."""

    model_config = ConfigDict(extra="forbid")
    lang: Literal["ar", "en", "tl"]
    bucket: Bucket
    mastered: list[Id] = Field(default_factory=list, max_length=60)
    reviewing: list[Id] = Field(default_factory=list, max_length=60)
    next: NextStep | None = None


def enabled(user) -> bool:
    """On for everyone with the setting; team accounts may preview it (their device switch)."""
    return get_settings().plt09_organized_home or bool(user and user.has("team"))


def check_order(data: Any) -> dict[str, list[str]] | None:
    """R4: known ids only, every main component exactly once, the next step
    never in the order. The optional list may come partial; what is missing
    follows in the table order. Anything else is refused (→ fixed order)."""
    if not isinstance(data, dict):
        return None
    main, optional = data.get("main"), data.get("optional")
    if not isinstance(main, list) or not isinstance(optional, list):
        return None
    if len(main) != len(MAIN) or set(main) != set(MAIN):
        return None
    if len(set(optional)) != len(optional) or any(o not in OPTIONAL for o in optional):
        return None
    return {"main": list(main), "optional": [*optional, *(o for o in OPTIONAL if o not in optional)]}


@router.get("/config")
async def config() -> dict:
    return {"organized": get_settings().plt09_organized_home}


@router.post("/order")
async def order(body: OrderIn, session: Session, request: Request, user: OptionalUser) -> dict:
    if not enabled(user):
        return {"order": None}
    ratelimit.hit(f"home-order:{client_key(request, user)}", 10, 60)
    ratelimit.hit(f"home-order:d:{client_key(request, user)}", 20, 86400)  # R5: once a day per device in normal use
    objectives, lessons = await approved_names(session, body.lang, learner=True)
    nxt: dict[str, str] | None = None
    if body.next and body.next.review:
        nxt = {"step": "review session"}
    elif body.next and body.next.lesson_id in lessons:
        nxt = {"step": "next lesson", "lesson": lessons[body.next.lesson_id]}
    summary = {
        "mastered": [objectives[i] for i in body.mastered if i in objectives],
        "needs_review": [objectives[i] for i in body.reviewing if i in objectives],
        "next": nxt,
    }
    try:
        raw = await agents.order_home(summary, body.bucket, body.lang)
    except AiUnavailable:
        return {"order": None}
    return {"order": check_order(raw)}  # the summary is not stored
