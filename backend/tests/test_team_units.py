"""Team-authored units (content/units/*/unit.json) load in place of pipeline units."""

from app.learning import content, team_units


def test_team_unit_replaces_the_pipeline_unit_of_the_same_order():
    content.store.cache_clear()
    s = content.store()
    first = s.units[0]
    assert first["id"] == "u01" and first["order"] == 1
    assert not any(lid.startswith("u1-") for lid in s.lessons)


def test_quran_cards_show_the_stored_verse_not_a_quotation():
    unit, lessons = team_units.convert(
        {
            "id": "u01",
            "title": {"ar": "x"},
            "lessons": [
                {
                    "id": "l1",
                    "title": {"ar": "y"},
                    "objectives": [{"id": "o1", "text": {"ar": "z"}}],
                    "cards": [{"id": "c1", "kind": "quran", "ref": "2:222", "text": {"ar": "قال تعالى ..."}, "objectives": ["o1"]}],
                    "exercises": [
                        {
                            "id": "e1",
                            "type": "match",
                            "objectives": ["o1"],
                            "prompt": {"ar": "p"},
                            "explain_card": "c1",
                            "pairs": [{"left": {"ar": "a"}, "right": {"ar": "b"}}, {"left": {"ar": "c"}, "right": {"ar": "d"}}],
                        },
                    ],
                }
            ],
        },
        "unit-01",
    )
    card = lessons[0]["cards"][0]
    assert card["quran"] == {"sura": 2, "ayat": [222, 222]}
    # issue #9: the learner view must carry a string, never an empty object
    assert {lg: content.lang_view(card, lg)["text"] for lg in ("ar", "en", "tl")} == {"ar": "", "en": "", "tl": ""}
    ex = lessons[0]["exercises"][0]
    assert ex["type"] == "match" and ex["answer"] == [["l0", "r0"], ["l1", "r1"]] and ex["cards"] == ["c1"]
    assert lessons[0]["objectives"][0]["cards"] == ["c1"]


async def test_media_route_serves_only_step_images(client):
    ok = await client.get("/api/content/media/unit-01/images/wudu-2-hands.webp")
    assert ok.status_code == 200 and ok.headers["content-type"] == "image/webp"
    for bad in ("unit-01/unit.json", "unit-01/build_unit.py", "unit-01/images/../unit.json", "../units.json"):
        assert (await client.get(f"/api/content/media/{bad}")).status_code == 404


def test_lrn01_r2_unit1_verse_card_carries_the_quoted_span():
    content.store.cache_clear()
    card = next(c for c in content.store().lessons["u01-l2"]["cards"] if c["id"] == "u01-l2-c1")
    assert card["quran"]["sura"] == 2 and card["quran"]["ayat"] == [222, 222]
    view = content.lang_view(card, "en")["quran"]["excerpt"]
    assert view["words"] == [22, 27] and view["translation"].startswith("Indeed, Allah loves")
    assert content.lang_view(card, "ar")["quran"]["excerpt"] == {"words": [22, 27]}


def _video(lesson: dict, lang: str):
    return content.lang_view({"media": lesson["media"]}, lang)["media"]["video"]


def test_lrn01_r5_english_prayer_lessons_show_no_video_while_the_only_file_is_hevc():
    content.store.cache_clear()
    s = content.store()
    salah = [lesson for lesson in s.lessons.values() if "how-to-pray" in str((lesson.get("media") or {}).get("video"))]
    assert salah, "unit 1 has prayer lessons with a support video"
    for lesson in salah:
        assert _video(lesson, "en") is None  # no player, like Tagalog
        assert _video(lesson, "tl") is None
        assert _video(lesson, "ar").startswith("https://d1.islamhouse.com/")


def test_lrn01_r5_english_wudu_video_still_plays():
    content.store.cache_clear()
    s = content.store()
    wudu = [lesson for lesson in s.lessons.values() if "wudu" in str((lesson.get("media") or {}).get("video", {}).get("en", ""))]
    assert wudu and all(_video(lesson, "en").endswith(".mp4") for lesson in wudu)


def test_lrn01_r5_an_empty_or_non_https_video_entry_renders_no_player():
    unit = {
        "id": "u09",
        "title": {"ar": "x"},
        "media": {"support_video": {"v": {"ar": "", "en": "http://example.com/a.mp4", "tl": None}}},
        "lessons": [{"id": "l1", "title": {"ar": "y"}, "support_video": "v", "objectives": [], "cards": [], "exercises": []}],
    }
    _, lessons = team_units.convert(unit, "unit-09")
    for lang in ("ar", "en", "tl"):
        assert _video(lessons[0], lang) is None
