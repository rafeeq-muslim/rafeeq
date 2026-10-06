"""Units written by the Learning team in their own format
(`content/units/<dir>/unit.json`, see content/README.md), converted to the
lesson shape the app serves. A team unit replaces any pipeline unit with the
same `order` (teammates' content wins over Claude's drafts).

Conversion never rewrites the team's text. Two presentation choices:
- `quran` cards show the verse from the stored QuranEnc record by `ref`
  (rules.md §1.3; also the check each card's `verify` note asks for), so the
  quoted verse text is not repeated on the card.
- the `fatiha` card keeps its text and shows Al-Fatihah from the stored
  record by `quran_ref`, with the unit's audio for the learner's language.
"""

import json
import re
from pathlib import Path
from typing import Any

MEDIA_ROUTE = "/api/content/media"


def _ref(ref: str | None) -> dict | None:
    """'2:222' or '1:1-7' → {"sura": 2, "ayat": [222, 222]}."""
    m = re.fullmatch(r"(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?", (ref or "").strip())
    if not m:
        return None
    a = int(m.group(2))
    return {"sura": int(m.group(1)), "ayat": [a, int(m.group(3) or a)]}


def _image(unit_dir: str, rel: str | None) -> str | None:
    return f"{MEDIA_ROUTE}/{unit_dir}/{rel}" if rel else None


def _playable(video: dict | None) -> dict | None:
    """LRN-01 R5: a language whose video URL is missing or not https gets no
    player at all (null), never an empty or broken one."""
    if not isinstance(video, dict):
        return None
    return {lg: url if isinstance(url, str) and url.startswith("https://") else None for lg, url in video.items()}


def convert(unit: dict, unit_dir: str) -> tuple[dict, list[dict]]:
    media = unit.get("media") or {}
    lessons: list[dict] = []
    for les in unit.get("lessons", []):
        cards = []
        for c in les.get("cards", []):
            kind = c.get("kind", "text")
            quran = _ref(c.get("ref") or c.get("quran_ref")) if kind in ("quran", "fatiha") else None
            if quran and c.get("excerpt"):
                # LRN-01 R2: the book quotes part of the verse; per language a word span of
                # the stored Arabic and, for en/tl, the book's own translation of that part.
                quran["excerpt"] = c["excerpt"]
            card: dict[str, Any] = {
                "id": c["id"],
                "kind": "step" if c.get("image") else "text",
                # Verse-only card: an empty string per language, never {} (issue #9: an
                # empty object reached the page as card text and crashed lesson 1).
                "text": dict.fromkeys(("ar", "en", "tl"), "") if (kind == "quran" and quran) else c.get("text", {}),
                "image_url": _image(unit_dir, c.get("image")),
                "extra_images": [_image(unit_dir, i) for i in c.get("extra_images", [])],
                "quran": quran,
            }
            if kind == "hadith":
                card["hadith"] = True
            if c.get("hadith_ids"):
                # KNW-05 R2: the HadeethEnc ids the card cites; the review desk shows each
                # beside the card from the stored record (text, grade, reference).
                card["hadith_ids"] = [int(h) for h in c["hadith_ids"]]
            if c.get("audio"):
                card["audio"] = (media.get("audio") or {}).get(c["audio"])  # {lang: [urls] | None}
            cards.append(card)

        obj_cards: dict[str, list[str]] = {}
        for c in les.get("cards", []):
            for o in c.get("objectives", []):
                obj_cards.setdefault(o, []).append(c["id"])
        objectives = [
            # label: the learner's short name for the objective (LRN-10 R1); text is the team's wording
            {"id": o["id"], "text": o["text"], "label": o.get("label", {}), "cards": obj_cards.get(o["id"], []), "key": bool(o.get("key"))}
            for o in les.get("objectives", [])
        ]

        exercises = []
        for e in les.get("exercises", []):
            explain = (
                [e["explain_card"]]
                if e.get("explain_card")
                else sorted({cid for o in e.get("objectives", []) for cid in obj_cards.get(o, [])})
            )
            base = {"id": e["id"], "objectives": e.get("objectives", []), "cards": explain, "prompt": e["prompt"]}
            if e["type"] == "choice":
                exercises.append({**base, "type": "choose", "options": e["options"], "answer": e["answer"]})
            elif e["type"] == "order":
                exercises.append({**base, "type": "order", "items": e["items"], "answer": e["answer"]})
            elif e["type"] == "match":
                pairs = e["pairs"]
                exercises.append(
                    {
                        **base,
                        "type": "match",
                        "left": [{"id": f"l{i}", "text": p["left"]} for i, p in enumerate(pairs)],
                        "right": [{"id": f"r{i}", "text": p["right"]} for i, p in enumerate(pairs)],
                        "answer": [[f"l{i}", f"r{i}"] for i in range(len(pairs))],
                    }
                )

        video_key = les.get("support_video")
        lessons.append(
            {
                "id": les["id"],
                "unit": unit["id"],
                "order": les.get("order", len(lessons) + 1),
                "title": les["title"],
                "cards": cards,
                "objectives": objectives,
                "exercises": exercises,
                "media": {"video": _playable((media.get("support_video") or {}).get(video_key))} if video_key else None,
                "source": None,
            }
        )
    out_unit = {
        "id": unit["id"],
        "order": unit.get("order", 1),
        "title": unit["title"],
        "badge_name": unit.get("badge", {}),
        "source_credit": unit.get("credit", {}),
        "lessons": [lesson["id"] for lesson in lessons],
    }
    return out_unit, lessons


def load(root: Path) -> list[tuple[dict, list[dict]]]:
    base = root / "units"
    if not base.exists():
        return []
    return [convert(json.loads(f.read_text(encoding="utf-8")), f.parent.name) for f in sorted(base.glob("*/unit.json"))]
