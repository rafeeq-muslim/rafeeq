"""CMP-01 open question «أخت بكل لغة» (default until decided): a sister's
request goes to sisters only, and the team is reminded that it needs a
sister (and a brother) who answers in each of Rafeeq's languages.

`GET /api/team/coverage` counts, for each language × gender, the people who
can answer an ordinary request (mentors and team members of that gender who
speak that language) and how many of them take requests now (a mentor who
paused does not). Counts only: no names. Team and admin only.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import ARRAY, String, cast, select

from app.companion.common import RESPONDER_ROLES, is_team
from app.companion.models import MentorProfile
from app.core.deps import CurrentUser, Session
from app.platform.models import User

router = APIRouter(prefix="/api/team", tags=["companion"])
LANGS = ("ar", "en", "tl")
GENDERS = ("f", "m")


async def team_only(user: CurrentUser) -> User:
    if not is_team(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "team_only")
    return user


class Cell(BaseModel):
    lang: str
    gender: str
    responders: int  # can answer this pair
    available: int  # of them, taking requests now
    covered: bool  # someone is available now


class CoverageOut(BaseModel):
    cells: list[Cell]
    uncovered: int  # pairs with nobody available now
    without_gender: int  # responders who have not set their gender: they see urgent requests only


@router.get("/coverage", response_model=CoverageOut)
async def coverage(session: Session, _: Annotated[User, Depends(team_only)]) -> CoverageOut:
    rows = await session.execute(
        select(User, MentorProfile.accepting)
        .outerjoin(MentorProfile, MentorProfile.user_id == User.id)
        .where(User.roles.op("&&")(cast(list(RESPONDER_ROLES), ARRAY(String(20)))))
    )
    counts = {(lang, g): [0, 0] for lang in LANGS for g in GENDERS}
    without_gender = 0
    for user, accepting in rows:
        if user.gender not in GENDERS:
            without_gender += 1
            continue
        # Same rule as common.same_gender_available: a team member has no pause.
        available = is_team(user) or accepting is not False
        for lang in set(user.languages or [user.locale]):
            if (lang, user.gender) in counts:
                counts[(lang, user.gender)][0] += 1
                counts[(lang, user.gender)][1] += int(available)
    cells = [Cell(lang=lang, gender=g, responders=n, available=a, covered=a > 0) for (lang, g), (n, a) in counts.items()]
    return CoverageOut(cells=cells, uncovered=sum(not c.covered for c in cells), without_gender=without_gender)
