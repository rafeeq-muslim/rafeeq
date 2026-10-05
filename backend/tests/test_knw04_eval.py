"""KNW-04 answer reliability test: one test per feature example. The
systems under test are injected fakes, except where the real pipeline's
behaviour is the point (danger screen, no model involved)."""

import json

import pytest
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from app.knowledge.ai import screen
from app.knowledge.eval import runner
from app.knowledge.eval.questions import QuestionFileError, load
from app.knowledge.models import AnswerLog, EvalAnswer
from tests.conftest import auth, with_roles

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture


def q(qid: str, kind="critical", route="danger", action="danger_support", lang="en", text=None) -> dict:
    return {
        "id": qid,
        "lang": lang,
        "text": text or f"TEST_QUESTION_{qid}",
        "kind": kind,
        "expected_route": route,
        "expected_action": action,
    }


def body(outcome: str, route: str, lang="en", sources=None) -> dict:
    answer = screen.fixed("danger", lang) if outcome == "danger" else "TEST_ANSWER"
    return {"outcome": outcome, "route": route, "answer": answer, "sources": sources or [], "should_escalate": outcome != "answered"}


def fake(outputs: dict[str, list[dict]]):
    calls: list[str] = []

    async def system(question: dict) -> dict:
        calls.append(question["id"])
        out = outputs[question["id"]]
        item = out.pop(0) if len(out) > 1 else out[0]
        if isinstance(item, Exception):
            raise item
        return item

    system.calls = calls
    return system


def danger_out(question: dict) -> dict:
    return {
        "body": body("danger", "danger"),
        "events": [("DangerDetected", {"ask_id": "x", "lang": "en", "detector": "phrase"})],
        "checks": [],
    }


BARE = {"text": "TEST_BARE_ANSWER", "model": "test"}


async def answers(run_id) -> list[EvalAnswer]:
    async with SessionLocal() as s:
        return list(await s.scalars(select(EvalAnswer).where(EvalAnswer.run_id == run_id)))


# --- R1 -----------------------------------------------------------------------


def test_knw04_r1_danger_question_is_critical_with_danger_support():
    tl = [x for x in load() if x["lang"] == "tl" and x["expected_route"] == "danger"]
    assert tl and all(x["kind"] == "critical" and x["expected_action"] == "danger_support" for x in tl)


def test_knw04_r1_shahada_question_is_normal_answer():
    (shahada,) = [x for x in load() if x["lang"] == "en" and "shahada" in x["text"].lower()]
    assert (shahada["kind"], shahada["expected_route"], shahada["expected_action"]) == ("normal", "general", "answer")


async def test_knw04_r1_missing_expected_action_stops_before_any_call(tmp_path):
    f = tmp_path / "questions.jsonl"
    good, bad = q("Q001"), q("Q002")
    del bad["expected_action"]
    f.write_text("\n".join(json.dumps(x) for x in (good, bad)), encoding="utf-8")
    with pytest.raises(QuestionFileError) as e:
        load(f)
    assert "Q002" in str(e.value) and "Q001" not in str(e.value)


# --- R2 -----------------------------------------------------------------------


async def test_knw04_r2_three_attempts_per_system():
    qs = [q("Q1"), q("Q2", kind="normal", route="general", action="answer")]
    raf = fake({"Q1": [danger_out(qs[0])], "Q2": [{"body": body("answered", "general"), "events": [], "checks": []}]})
    bare = fake({"Q1": [BARE], "Q2": [BARE]})
    ev = await runner.run(qs, rafeeq=raf, bare=bare)
    rows = await answers(ev.id)
    for qid in ("Q1", "Q2"):
        for system in ("rafeeq", "bare"):
            assert sorted(a.attempt for a in rows if a.question_id == qid and a.system == system) == [1, 2, 3]
    assert ev.status == "finished"
    assert ev.settings["model_main"] and ev.settings["temperature"] == 0


async def test_knw04_r2_resume_reruns_only_missing_attempts():
    qs = [q("Q1")]
    raf = fake({"Q1": [danger_out(qs[0]), runner.Interrupted("outage"), danger_out(qs[0])]})
    bare = fake({"Q1": [BARE]})
    ev = await runner.run(qs, rafeeq=raf, bare=bare)
    assert ev.status == "incomplete"
    assert ev.report["verdicts"]["Q1"]["status"] == "incomplete"  # never counted as passed
    raf2 = fake({"Q1": [danger_out(qs[0])]})
    bare2 = fake({"Q1": [BARE]})
    ev2 = await runner.run(qs, run_id=ev.id, rafeeq=raf2, bare=bare2)
    assert raf2.calls == ["Q1"] and bare2.calls == []  # only the missing attempt
    assert ev2.status == "finished" and ev2.report["verdicts"]["Q1"]["status"] == "pass"


# --- R3 -----------------------------------------------------------------------


async def test_knw04_r3_critical_fails_on_one_miss():
    qs = [q("Q1")]
    answered = {"body": body("answered", "general"), "events": [], "checks": []}
    raf = fake({"Q1": [danger_out(qs[0]), danger_out(qs[0]), answered]})
    ev = await runner.run(qs, rafeeq=raf, bare=fake({"Q1": [BARE]}))
    assert ev.report["verdicts"]["Q1"]["status"] == "fail"
    assert ev.report["summary"]["rafeeq"]["critical"] == [0, 1]


async def test_knw04_r3_personal_refer_three_times_passes():
    qs = [q("Q1", route="personal", action="refer")]
    out = {"body": body("answered", "personal", sources=[{"id": "binbaz:en:1"}]), "events": [], "checks": []}
    ev = await runner.run(qs, rafeeq=fake({"Q1": [out]}), bare=fake({"Q1": [BARE]}))
    assert ev.report["verdicts"]["Q1"]["status"] == "pass"


# --- R4 -----------------------------------------------------------------------


async def test_knw04_r4_reviewer_fail_marks_answer_failed_with_reason(client, monkeypatch):
    qs = [q("Q1", kind="normal", route="general", action="answer", text="TEST_NORMAL_QUESTION")]
    monkeypatch.setattr("app.knowledge.eval.router.load", lambda: qs)
    out = {"body": body("answered", "general", sources=[{"id": "hadeethenc:en:1"}]), "events": [], "checks": []}
    ev = await runner.run(qs, rafeeq=fake({"Q1": [out]}), bare=fake({"Q1": [BARE]}))
    assert ev.report["verdicts"]["Q1"]["status"] == "pending_review"  # not passed until reviewed
    first = next(a for a in await answers(ev.id) if a.system == "rafeeq" and a.attempt == 1)
    token = await with_roles(client, "muhannad-r", "sharia_reviewer")
    r = await client.patch(
        f"/api/knowledge/eval/answers/{first.id}", json={"review": "fail: adds a fact the source does not state"}, headers=auth(token)
    )
    assert r.status_code == 200, r.text
    rep = (await client.get("/api/knowledge/eval/latest", headers=auth(token))).json()["report"]
    assert rep["verdicts"]["Q1"]["status"] == "fail"
    assert "adds a fact the source does not state" in rep["failures"][0]["reason"]


async def test_knw04_r4_apology_on_normal_is_not_covered():
    qs = [q("Q1", kind="normal", route="general", action="answer", text="TEST_UNCOVERED_QUESTION")]
    out = {"body": body("no_source", "general"), "events": [], "checks": []}
    ev = await runner.run(qs, rafeeq=fake({"Q1": [out]}), bare=fake({"Q1": [BARE]}))
    assert ev.report["verdicts"]["Q1"]["status"] == "not_covered"
    assert ev.report["not_covered"][0]["text"] == "TEST_UNCOVERED_QUESTION"
    assert "TEST_UNCOVERED_QUESTION" in ev.report["markdown"].split("## 4.")[1]


# --- R5 -----------------------------------------------------------------------


async def test_knw04_r5_report_has_both_systems_and_settings():
    qs = [q("Q1")]
    ev = await runner.run(
        qs, rafeeq=fake({"Q1": [danger_out(qs[0])]}), bare=fake({"Q1": [{"text": "TEST_BARE The Prophet said something", "model": "m"}]})
    )
    md = ev.report["markdown"]
    assert "| | Rafeeq | Bare model |" in md
    assert "Models: main" in md and "Embedding model" in md and "Commit" in md and ev.settings["date"][:4] in md
    assert ev.report["summary"]["bare"]["answers"] == 3
    assert ev.report["summary"]["bare"]["hints"]["claims_prophet_said"] == 3


async def test_knw04_r5_failed_critical_is_listed_and_summary_not_100():
    qs = [q("Q1", text="TEST_FAILING_DANGER_QUESTION"), q("Q2")]
    answered = {"body": body("answered", "general"), "events": [], "checks": []}
    raf = fake({"Q1": [answered], "Q2": [danger_out(qs[1])]})
    ev = await runner.run(qs, rafeeq=raf, bare=fake({"Q1": [BARE], "Q2": [BARE]}))
    rep = ev.report
    assert [f["id"] for f in rep["failures"]] == ["Q1"]
    assert rep["failures"][0]["text"] == "TEST_FAILING_DANGER_QUESTION"
    assert "50% (1/2)" in rep["markdown"] and "100%" not in rep["markdown"].split("## 2.")[0]


# --- R6 -----------------------------------------------------------------------


async def test_knw04_r6_runner_reads_only_the_question_file(ai):
    """The real pipeline runs inside a rolled-back session: a test run writes
    no answer log and publishes no event, and reads no user data."""
    (danger_tl,) = [x for x in load() if x["id"] == "Q026"]
    ev = await runner.run([danger_tl], attempts=1, systems=("rafeeq",))
    assert ev.report["verdicts"]["Q026"]["status"] == "pass"
    async with SessionLocal() as s:
        assert list(await s.scalars(select(AnswerLog))) == []
        assert list(await s.scalars(select(OutboxEvent))) == []
    assert ai.calls == []
