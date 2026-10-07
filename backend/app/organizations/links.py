"""ORG-01 join through an organisation: the learner's side.

- R1: one code per organisation and language, for everyone. Resolving a code
  sends only the code and gets back only the organisation's name and the
  code's language; nothing is stored and nothing about the person is sent.
- R2/R3: the app asks once; only «نعم» calls `POST /api/org/link`. «لا» calls
  nothing, so nothing about the organisation is kept anywhere.
- R4: one organisation at a time; unlinking deletes the link and its history
  at once and tells nobody. Figures already frozen stay as they were (ORG-03 R6).
- R5: the link gives the organisation no access to the learner: there is no
  endpoint that lists, names or messages a linked learner.

The link is held against the device's random install ID (MOT-07's subject),
never the account. The install ID only travels in request bodies (POST), not
in URLs, so it does not reach access logs.
"""

import re
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select

from app.core import ratelimit
from app.core.deps import Session
from app.motivation.public import current_status
from app.organizations.models import Organization, OrgCode, OrgLink, OrgLinkStatus

router = APIRouter(prefix="/api/org", tags=["organizations"])
CODE_RE = re.compile(r"^[A-Z0-9]{4,16}$")
INSTALL = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
# Security review B-M4 (minimal part): an install ID is the device's own word,
# so a script can link many made-up devices and push a small number past the
# «less than 10» rule (ORG-03 R2). Until install IDs are issued by the server
# (product decision), one code takes a bounded number of new links a day and
# the admin sees each code's counts. Default until the ORG owner decides.
LINKS_PER_CODE_DAY = 200


async def links_last_day(session, org_id: uuid.UUID, lang: str, now: datetime) -> int:
    """Devices linked through one code (organisation + language) in the last 24 hours."""
    return (
        await session.scalar(
            select(func.count())
            .select_from(OrgLink)
            .where(OrgLink.org_id == org_id, OrgLink.lang == lang, OrgLink.linked_at > now - timedelta(hours=24))
        )
        or 0
    )


def normalize(code: str) -> str:
    return re.sub(r"[\s-]", "", code or "").upper()


def _ip(request: Request) -> str:
    return request.client.host if request.client else "-"  # in memory only, for the limit


async def resolve(session, code: str) -> tuple[OrgCode, Organization]:
    """R3 ex2: a wrong or retired code says only «تحقق من الرمز»."""
    c = normalize(code)
    row = await session.get(OrgCode, c) if CODE_RE.match(c) else None
    org = await session.get(Organization, row.org_id) if row else None
    if row is None or org is None or not org.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "code_invalid")
    return row, org


class CodeOut(BaseModel):
    name: str
    lang: str


@router.get("/codes/{code}", response_model=CodeOut)
async def code_info(code: str, session: Session, request: Request) -> CodeOut:
    """The name for the consent question. Stores nothing (R1 ex2, R2 ex2)."""
    ratelimit.hit(f"org-code:{_ip(request)}", 20, 600)  # no guessing other offices' codes
    row, org = await resolve(session, code)
    return CodeOut(name=org.name, lang=row.lang)


class LinkIn(BaseModel):
    code: str = Field(min_length=4, max_length=24)
    install_id: str = INSTALL


class InstallIn(BaseModel):
    install_id: str = INSTALL


class LinkOut(BaseModel):
    linked: bool
    name: str | None = None
    lang: str | None = None
    linked_at: datetime | None = None


async def _out(session, link: OrgLink | None) -> LinkOut:
    if link is None:
        return LinkOut(linked=False)
    org = await session.get(Organization, link.org_id)
    return LinkOut(linked=True, name=org.name if org else None, lang=link.lang, linked_at=link.linked_at)


async def unlink(session, install_id: str) -> None:
    """R4: the link and its status history go at once (history cascades)."""
    await session.execute(delete(OrgLink).where(OrgLink.install_id == install_id))


@router.post("/link", response_model=LinkOut, status_code=201)
async def link(body: LinkIn, session: Session, request: Request) -> LinkOut:
    """R2 ex1 / R3 ex1: the learner said «نعم». R4 ex2: a new link ends the old one."""
    ratelimit.hit(f"org-code:{_ip(request)}", 20, 600)
    row, org = await resolve(session, body.code)
    await unlink(session, body.install_id)
    await session.flush()
    now = datetime.now(UTC)
    if await links_last_day(session, org.id, row.lang, now) >= LINKS_PER_CODE_DAY:
        await session.rollback()  # the device's previous link stays as it was
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "rate_limited")  # B-M4
    st = await current_status(session, body.install_id)
    ln = OrgLink(org_id=org.id, install_id=body.install_id, lang=row.lang, linked_at=now, status=st)
    session.add(ln)
    await session.flush()
    session.add(OrgLinkStatus(link_id=ln.id, status=st, at=now))
    await session.commit()
    return await _out(session, ln)


@router.post("/link/status", response_model=LinkOut)
async def link_status(body: InstallIn, session: Session) -> LinkOut:
    """For «حسابي» and the data copy (PLT-05 R6): is this device linked, and to whom."""
    return await _out(session, await session.scalar(select(OrgLink).where(OrgLink.install_id == body.install_id)))


@router.post("/link/remove", status_code=204)
async def link_remove(body: InstallIn, session: Session) -> None:
    """R4 ex1: from «حسابي», on erasing the device and on deleting the account. Nobody is told."""
    await unlink(session, body.install_id)
    await session.commit()
