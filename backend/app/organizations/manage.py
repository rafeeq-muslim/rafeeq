"""The organisation's side: its coordinators (ORG-02 mentors, ORG-03
dashboard, its codes) and the Rafeeq team, who create organisations after
checking they are licensed (ORG-01 open question, default until decided).

A coordinator sees only their own organisation (ORG-03 R1 ex2: another
organisation's coordinator, or one of its mentors, gets 403). Nothing here
names, lists or reaches a linked learner (ORG-01 R5), and a mentor's row is
load and state only, never mentees or conversations (ORG-02 R3).
"""

import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.companion.public import mentor_loads, waiting_pairs
from app.core.deps import CurrentUser, Session, require_role
from app.core.events import publish
from app.organizations import figures
from app.organizations.models import Organization, OrgCode, OrgLink, OrgLinkStatus, OrgMember, OrgSnapshot
from app.platform.models import Invite, User

router = APIRouter(prefix="/api/org", tags=["organizations"])
admin = APIRouter(prefix="/api/admin/orgs", tags=["organizations"])
Admin = Annotated[User, Depends(require_role("admin"))]
Lang = Literal["ar", "en", "tl"]
INVITE_DAYS = 7  # ORG-02 open question: 7 days until decided
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L


def new_code(n: int = 8) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(n))


def welcome_path(code: OrgCode) -> str:
    """ORG-01 R1/R2: the link carries the organisation's code and the
    language, nothing else (PLT-01 R2 conflict resolved as research/10 §3
    proposes; see docs/engineering/decisions-for-review.md)."""
    return f"/app/welcome?lang={code.lang}&org={code.code}"  # PLT-10 R2


async def coordinator_of(session, user: User, org_id: uuid.UUID) -> Organization:
    m = await session.get(OrgMember, user.id)
    org = await session.get(Organization, org_id)
    if org is None or m is None or m.org_id != org_id or m.kind != "coordinator" or m.status != "active" or not user.has("org_coordinator"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    return org


class OrgOut(BaseModel):
    id: uuid.UUID
    name: str
    languages: list[str]


class CodeRow(BaseModel):
    code: str
    lang: str
    path: str


@router.get("/mine", response_model=list[OrgOut])
async def mine(session: Session, user: CurrentUser) -> list[OrgOut]:
    m = await session.get(OrgMember, user.id)
    if m is None or m.kind != "coordinator" or m.status != "active" or not user.has("org_coordinator"):
        return []
    org = await session.get(Organization, m.org_id)
    return [OrgOut(id=org.id, name=org.name, languages=org.languages)] if org else []


async def _codes(session, org_id: uuid.UUID) -> list[CodeRow]:
    rows = await session.scalars(select(OrgCode).where(OrgCode.org_id == org_id).order_by(OrgCode.lang))
    return [CodeRow(code=c.code, lang=c.lang, path=welcome_path(c)) for c in rows]


@router.get("/{org_id}/codes", response_model=list[CodeRow])
async def codes(org_id: uuid.UUID, session: Session, user: CurrentUser) -> list[CodeRow]:
    await coordinator_of(session, user, org_id)
    return await _codes(session, org_id)


# --- ORG-03 dashboard ------------------------------------------------------


async def subjects_of(session, org_id: uuid.UUID) -> list[figures.Subject]:
    links = list(await session.scalars(select(OrgLink).where(OrgLink.org_id == org_id)))
    history: dict[uuid.UUID, list] = {ln.id: [] for ln in links}
    if links:
        rows = await session.scalars(
            select(OrgLinkStatus).where(OrgLinkStatus.link_id.in_(list(history))).order_by(OrgLinkStatus.at, OrgLinkStatus.id)
        )
        for r in rows:
            history[r.link_id].append((r.at, r.status))
    return [figures.Subject(lang=ln.lang, linked_at=ln.linked_at, status=ln.status, history=history[ln.id]) for ln in links]


async def compute(session, org_id: uuid.UUID, now: datetime, lang: str | None = None) -> dict:
    return figures.dashboard(await subjects_of(session, org_id), now, lang)


@router.get("/{org_id}/dashboard")
async def dashboard(
    org_id: uuid.UUID,
    session: Session,
    user: CurrentUser,
    lang: Annotated[Literal["ar", "en", "tl", "other"] | None, Query()] = None,
) -> dict:
    """R1: counts and shares only. R5: `lang` is the only split."""
    await coordinator_of(session, user, org_id)
    out = await compute(session, org_id, datetime.now(UTC), lang)
    if out["empty"] and lang is None:
        out["codes"] = [c.model_dump() for c in await _codes(session, org_id)]  # R1 ex3: share your codes
    return out


@router.get("/{org_id}/dashboard/{day}")
async def dashboard_on(org_id: uuid.UUID, day: date, session: Session, user: CurrentUser) -> dict:
    """R6: a past day's figures exactly as they were frozen."""
    await coordinator_of(session, user, org_id)
    snap = await session.get(OrgSnapshot, (org_id, day))
    if snap is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    return {"day": snap.day, **snap.figures}


# --- ORG-02 mentors --------------------------------------------------------


class MentorRow(BaseModel):
    id: uuid.UUID
    display_name: str
    languages: list[str]
    gender: str | None
    state: Literal["receiving", "paused", "suspended", "awaiting_rules"]
    mentees: int
    capacity: int
    group_members: int
    group_limit: int


class Pair(BaseModel):
    lang: str
    gender: str


class MentorsOut(BaseModel):
    mentors: list[MentorRow]
    missing: list[Pair]


@router.get("/{org_id}/mentors", response_model=MentorsOut)
async def mentors(org_id: uuid.UUID, session: Session, user: CurrentUser) -> MentorsOut:
    """R3: load and state per mentor. R4: which (gender, language) pairs the
    organisation lacks for requests waiting now; pairs only, no counts."""
    org = await coordinator_of(session, user, org_id)
    rows = list(
        await session.execute(
            select(User, OrgMember)
            .join(OrgMember, OrgMember.user_id == User.id)
            .where(OrgMember.org_id == org_id, OrgMember.kind == "mentor")
            .order_by(User.display_name)
        )
    )
    loads = await mentor_loads(session, [u.id for u, _ in rows])
    out = []
    covered: set[tuple[str, str]] = set()
    for u, m in rows:
        load = loads[u.id]
        if m.status == "suspended" or load.suspended:
            state = "suspended"
        elif not load.rules_accepted:
            state = "awaiting_rules"
        elif not load.accepting:
            state = "paused"
        else:
            state = "receiving"
            covered |= {(lang, u.gender) for lang in (u.languages or [u.locale]) if u.gender}
        out.append(
            MentorRow(
                id=u.id,
                display_name=u.display_name,
                languages=u.languages or [u.locale],
                gender=u.gender,
                state=state,
                mentees=load.mentees,
                capacity=load.capacity,
                group_members=load.group_members,
                group_limit=load.group_limit,
            )
        )
    missing = sorted(await waiting_pairs(session, org.languages) - covered)
    return MentorsOut(mentors=out, missing=[Pair(lang=lang, gender=g) for lang, g in missing])


class InviteOut(BaseModel):
    code: str
    expires_at: datetime | None
    used: bool = False


async def _invite(session, org_id: uuid.UUID, role: str, by: uuid.UUID) -> InviteOut:
    if role not in ("mentor", "org_coordinator"):  # MOT-08: never a team invite (granted only in the database)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "team_role_db_only" if role == "team" else "role_not_allowed")
    code = f"{'MEN' if role == 'mentor' else 'ORG'}-{secrets.token_hex(4).upper()}"
    expires = datetime.now(UTC) + timedelta(days=INVITE_DAYS)
    session.add(Invite(code=code, role=role, created_by=by, org_id=org_id, expires_at=expires))
    await session.commit()
    return InviteOut(code=code, expires_at=expires)


@router.post("/{org_id}/invites", response_model=InviteOut, status_code=201)
async def create_invite(org_id: uuid.UUID, session: Session, user: CurrentUser) -> InviteOut:
    """R1: a one-time code for one volunteer, valid 7 days."""
    await coordinator_of(session, user, org_id)
    return await _invite(session, org_id, "mentor", user.id)


@router.get("/{org_id}/invites", response_model=list[InviteOut])
async def list_invites(org_id: uuid.UUID, session: Session, user: CurrentUser) -> list[InviteOut]:
    await coordinator_of(session, user, org_id)
    rows = await session.scalars(
        select(Invite).where(Invite.org_id == org_id, Invite.role == "mentor").order_by(Invite.created_at.desc()).limit(50)
    )
    return [InviteOut(code=i.code, expires_at=i.expires_at, used=i.used_by is not None) for i in rows]


async def _org_mentor(session, org_id: uuid.UUID, mentor_id: uuid.UUID) -> OrgMember:
    m = await session.get(OrgMember, mentor_id)
    if m is None or m.org_id != org_id or m.kind != "mentor":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    return m


@router.post("/{org_id}/mentors/{mentor_id}/suspend", status_code=204)
async def suspend(org_id: uuid.UUID, mentor_id: uuid.UUID, session: Session, user: CurrentUser) -> None:
    """R5: mentees get a neutral notice and choose again; open requests return to the pool."""
    await coordinator_of(session, user, org_id)
    m = await _org_mentor(session, org_id, mentor_id)
    m.status = "suspended"
    await publish(session, "MentorSuspended", "ORG", {"mentor_id": str(mentor_id)})
    await session.commit()


@router.post("/{org_id}/mentors/{mentor_id}/reinstate", status_code=204)
async def reinstate(org_id: uuid.UUID, mentor_id: uuid.UUID, session: Session, user: CurrentUser) -> None:
    await coordinator_of(session, user, org_id)
    m = await _org_mentor(session, org_id, mentor_id)
    m.status = "active"
    await publish(session, "MentorApproved", "ORG", {"mentor_id": str(mentor_id)})
    await session.commit()


@router.delete("/{org_id}/mentors/{mentor_id}", status_code=204)
async def revoke(org_id: uuid.UUID, mentor_id: uuid.UUID, session: Session, user: CurrentUser) -> None:
    """R5: approval withdrawn: as a suspension, and the organisation lets the mentor go."""
    await coordinator_of(session, user, org_id)
    m = await _org_mentor(session, org_id, mentor_id)
    await publish(session, "MentorSuspended", "ORG", {"mentor_id": str(mentor_id)})
    await session.delete(m)
    await session.commit()


# --- the Rafeeq team creates organisations ----------------------------------


class OrgIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    languages: list[Lang] = Field(min_length=1, max_length=3)


class AdminOrgOut(OrgOut):
    active: bool
    codes: list[CodeRow]
    coordinators: int


async def _admin_out(session, org: Organization) -> AdminOrgOut:
    n = len(list(await session.scalars(select(OrgMember.user_id).where(OrgMember.org_id == org.id, OrgMember.kind == "coordinator"))))
    return AdminOrgOut(
        id=org.id, name=org.name, languages=org.languages, active=org.active, codes=await _codes(session, org.id), coordinators=n
    )


@admin.post("", response_model=AdminOrgOut, status_code=201)
async def create_org(body: OrgIn, session: Session, _: Admin) -> AdminOrgOut:
    """ORG-01 R1: one code per language of the organisation."""
    langs = list(dict.fromkeys(body.languages))
    org = Organization(name=" ".join(body.name.split()), languages=langs, active=True)
    session.add(org)
    await session.flush()
    for lang in langs:
        session.add(OrgCode(code=new_code(), org_id=org.id, lang=lang))
    await session.commit()
    return await _admin_out(session, org)


@admin.get("", response_model=list[AdminOrgOut])
async def list_orgs(session: Session, _: Admin) -> list[AdminOrgOut]:
    orgs = await session.scalars(select(Organization).order_by(Organization.created_at.desc()))
    return [await _admin_out(session, o) for o in orgs]


@admin.post("/{org_id}/invites", response_model=InviteOut, status_code=201)
async def coordinator_invite(org_id: uuid.UUID, session: Session, me: Admin) -> InviteOut:
    """A one-time code for the organisation's coordinator, valid 7 days."""
    if await session.get(Organization, org_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    return await _invite(session, org_id, "org_coordinator", me.id)
