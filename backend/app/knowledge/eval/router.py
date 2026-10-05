"""KNW-04 team endpoints: the latest report, and the Sharia reviewer's
verdict on a normal answer (plan §5.6)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import Session, require_role
from app.knowledge.eval import report
from app.knowledge.eval.questions import load
from app.knowledge.models import EvalAnswer, EvalRun
from app.platform.models import User

router = APIRouter(prefix="/api/knowledge/eval", tags=["knowledge-eval"])
Team = Annotated[User, Depends(require_role("team", "sharia_reviewer"))]


@router.get("/latest")
async def latest(session: Session, _: Team) -> dict:
    ev = await session.scalar(select(EvalRun).where(EvalRun.report.is_not(None)).order_by(EvalRun.started_at.desc()).limit(1))
    if ev is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no_report")
    return {"run_id": str(ev.id), "status": ev.status, "started_at": ev.started_at, "finished_at": ev.finished_at, "report": ev.report}


class Review(BaseModel):
    review: str = Field(min_length=4, max_length=1000, description='"pass" or "fail: <reason>"')


@router.patch("/answers/{answer_id}")
async def review_answer(answer_id: uuid.UUID, body: Review, session: Session, user: Team) -> dict:
    if not user.has("sharia_reviewer"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "reviewer_only")
    a = await session.get(EvalAnswer, answer_id)
    if a is None or a.system != "rafeeq":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "answer_not_found")
    text = body.review.strip()
    if not (text.lower() == "pass" or text.lower().startswith("fail:")):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "review_must_be_pass_or_fail_with_reason")
    a.review = text
    await session.flush()
    ev = await session.get(EvalRun, a.run_id)
    ev.report = await report.build(session, ev, load())
    await session.commit()
    return {"ok": True}
