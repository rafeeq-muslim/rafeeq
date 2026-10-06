"""PLT-17 R8: every type registered for the review desk has a name in the desk.

The desk lists its known types in REVIEW_TYPES (frontend ReviewDesk.tsx), and
the frontend test checks each has a label in ar/en/tl. This test keeps that
list equal to what the backend registers, so a new type can't appear unnamed.
"""

import re
from pathlib import Path

import app.main  # noqa: F401  (imports every module that calls review.register)
from app.knowledge import review

DESK = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "app" / "pages" / "roles" / "ReviewDesk.tsx").read_text(encoding="utf-8")


def test_plt17_r8_desk_names_every_registered_review_type():
    listed = re.search(r"REVIEW_TYPES = \[(.*?)\] as const", DESK).group(1)
    assert sorted(re.findall(r'"([a-z_]+)"', listed)) == sorted(review._providers)
