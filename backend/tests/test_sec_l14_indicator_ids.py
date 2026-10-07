"""Security review 2026-10-07, B-L14 (MOT-08 R4, MOT-09): anonymous events
need no sign-in, so the lesson, unit and objective ids in them are whatever
the sender typed. The team's indicators list only ids that are in the path;
before, an unknown id was listed to the team exactly as typed."""

from app.motivation.indicators import learning_by_path, path_order
from app.motivation.models import AnonEvent
from tests.conftest import auth, with_roles

TYPED = "CALL-NOW"  # what a stranger might type into an id (a unit id takes 8 characters, a lesson id 16)


async def test_sec_l14_typed_ids_never_reach_the_team(client):
    order = path_order()
    lesson, unit = order[0]["lessons"][0]["lesson_id"], order[0]["unit_id"]
    objective = order[0]["lessons"][0]["objectives"][0]
    for i in range(12):  # twelve devices, so every count is over the «fewer than ten» rule
        events = [
            {"type": "lesson_completed", "lesson_id": TYPED},
            {"type": "unit_completed", "unit_id": TYPED},
            {"type": "first_answer", "objective_id": TYPED, "correct": True, "context": "lesson"},
            {"type": "lesson_completed", "lesson_id": lesson},
            {"type": "unit_completed", "unit_id": unit},
            {"type": "first_answer", "objective_id": objective, "correct": True, "context": "lesson"},
        ]
        r = await client.post("/api/events", json={"install_id": f"device-{i:04d}", "events": events})
        assert r.status_code == 202
    team = await with_roles(client, "team-1", "team")
    r = await client.get("/api/team/indicators", headers=auth(team))
    assert r.status_code == 200 and TYPED not in r.text
    body = r.json()
    learning = body["learning"]
    assert {"lesson_id": lesson, "unit_id": unit, "people": 12} in learning["per_lesson"]  # real ids are counted as before
    assert {"unit_id": unit, "people": 12} in learning["units_completed"]
    assert objective in body["understanding"]["objectives"]
    in_path = {x["lesson_id"] for u in order for x in u["lessons"]}
    assert {r["lesson_id"] for r in learning["per_lesson"]} == in_path
    assert [r["unit_id"] for r in learning["units_completed"]] == [u["unit_id"] for u in order]


def test_sec_l14_learning_by_path_lists_the_path_only():
    order = [{"unit_id": "u1", "lessons": [{"lesson_id": "u1-l1", "objectives": ["o1"]}]}]
    events = [
        AnonEvent(install_id="d1", type="lesson_completed", lesson_id="u1-l1"),
        AnonEvent(install_id="d1", type="lesson_completed", lesson_id="<b>typed</b>"),
        AnonEvent(install_id="d1", type="unit_completed", unit_id="typed-unit"),
    ]
    assert learning_by_path(events, order) == {
        "per_lesson": [{"lesson_id": "u1-l1", "unit_id": "u1", "people": 1}],
        "units_completed": [{"unit_id": "u1", "people": 0}],
    }
