"""MOT-09 R6 on the placement figures (R2) and the R5 rates: no figure from
fewer than 10 people, people counted by device, not by event."""

from datetime import UTC, date, datetime

from app.motivation.indicators import understanding
from app.motivation.models import AnonEvent

T0 = datetime(2026, 10, 1, tzinfo=UTC)
DAY = T0.date()


def done(dev: str | None, units: int, seq: int = 1, day: date = DAY) -> AnonEvent:
    return AnonEvent(install_id=dev, type="placement_done", value=units, day=day, seq=seq, created_at=T0)


def skip(dev: str | None, seq: int = 1) -> AnonEvent:
    return AnonEvent(install_id=dev, type="placement_skipped", day=DAY, seq=seq, created_at=T0)


def quick(dev: str | None, correct: bool) -> AnonEvent:
    return AnonEvent(install_id=dev, type="first_answer", objective_id="o1", context="quick_check", correct=correct, day=DAY, created_at=T0)


def placement(ev: list[AnonEvent]) -> dict:
    return understanding(ev)["placement"]


# Placement distribution and skipped count ------------------------------------


def test_mot09_r2_r6_hundred_people_show_the_distribution_and_skipped():
    ev = [done(f"a{i}", 0) for i in range(60)] + [done(f"b{i}", 1) for i in range(30)] + [done(f"c{i}", 2) for i in range(10)]
    ev += [skip(f"s{i}") for i in range(12)]
    assert placement(ev) == {"distribution": {"0": 60, "1": 30, "2": 10}, "skipped": 12}


def test_mot09_r6_placement_under_ten_people_is_hidden():
    ev = [done(f"a{i}", 0) for i in range(6)] + [skip(f"s{i}") for i in range(3)]
    assert placement(ev) == {"distribution": {}, "skipped": None}


def test_mot09_r6_placement_from_ten_people_is_shown():
    ev = [done(f"a{i}", 0) for i in range(10)]
    assert placement(ev) == {"distribution": {"0": 10}, "skipped": 0}


def test_mot09_r6_placement_counts_people_not_events():
    # 4 devices each send 3 events (retakes, an offline queue sent twice): 4 people, not 12.
    ev = [done(f"a{i}", 0, seq=s) for i in range(4) for s in range(3)]
    ev += [skip(f"s{i}", seq=s) for i in range(2) for s in range(3)]
    assert placement(ev) == {"distribution": {}, "skipped": None}
    # A device's last outcome counts once: skipped first, then took the test.
    ev = [skip(f"a{i}", seq=1) for i in range(12)] + [done(f"a{i}", 1, seq=2) for i in range(12)]
    assert placement(ev) == {"distribution": {"1": 12}, "skipped": 0}


def test_mot09_r6_placement_ignores_events_unlinked_by_an_opt_out():
    ev = [done(f"a{i}", 0) for i in range(5)] + [done(None, 0) for _ in range(20)]
    assert placement(ev) == {"distribution": {}, "skipped": None}


def test_mot09_r6_a_small_bucket_is_hidden_and_cannot_be_worked_out():
    # 3 people passed 2 units: hidden. Alone it could be read off the rest,
    # so the next smallest figure (skipped, 11) is hidden too.
    ev = [done(f"a{i}", 0) for i in range(40)] + [done(f"b{i}", 1) for i in range(20)] + [done(f"c{i}", 2) for i in range(3)]
    ev += [skip(f"s{i}") for i in range(11)]
    assert placement(ev) == {"distribution": {"0": 40, "1": 20, "2": None}, "skipped": None}


def test_mot09_r6_hidden_buckets_of_ten_or_more_together_need_no_more_hiding():
    ev = [done(f"a{i}", 0) for i in range(40)] + [done(f"b{i}", 1) for i in range(6)] + [done(f"c{i}", 2) for i in range(5)]
    ev += [skip(f"s{i}") for i in range(11)]
    assert placement(ev) == {"distribution": {"0": 40, "1": None, "2": None}, "skipped": 11}


# R5 rates: the minimum counts people ----------------------------------------


def test_mot09_r5_guide_followed_from_ten_people():
    ev = [AnonEvent(install_id=f"d{i}", type="guide_shown", day=DAY) for i in range(10) for _ in range(30)]
    ev += [AnonEvent(install_id=f"d{i}", type="guide_followed", day=DAY) for i in range(10) for _ in range(18)]
    assert understanding(ev)["guide_followed"] == 0.6  # 180 of 300 messages


def test_mot09_r6_guide_followed_under_ten_people_is_hidden():
    # 300 messages, but from 4 devices: not enough data.
    ev = [AnonEvent(install_id=f"d{i}", type="guide_shown", day=DAY) for i in range(4) for _ in range(75)]
    ev += [AnonEvent(install_id=f"d{i}", type="guide_followed", day=DAY) for i in range(4) for _ in range(45)]
    assert understanding(ev)["guide_followed"] is None


def test_mot09_r6_guide_followed_unlinked_events_are_not_people():
    ev = [AnonEvent(install_id=None, type="guide_shown", day=DAY) for _ in range(50)]
    ev += [AnonEvent(install_id=f"d{i}", type="guide_shown", day=DAY) for i in range(9)]
    assert understanding(ev)["guide_followed"] is None


def test_mot09_r6_quick_check_under_ten_people_is_hidden():
    ev = [quick(f"d{i}", True) for i in range(3) for _ in range(20)]
    assert understanding(ev)["quick_check_correct"] is None


def test_mot09_r5_quick_check_from_ten_people():
    ev = [quick(f"d{i}", i < 7) for i in range(10)] + [quick(f"d{i}", True) for i in range(10)]
    assert understanding(ev)["quick_check_correct"] == 0.85  # 17 of 20 answers
