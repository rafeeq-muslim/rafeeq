"""KNW-08 R5 server side: listening is worship, so nothing about it reaches
the server, and a mentor's view of a mentee has no place for it. The client
side (no points, streak, message or request when a surah ends; R1 one sound
only) is in frontend/src/app/discover/quran.rules.test.tsx."""

import re

from fastapi.routing import APIRoute

from app.companion.inbox import MenteeOut
from app.main import app

LISTENING = re.compile(r"listen|quran|recit|surah|sura", re.I)


def test_knw08_r5_no_endpoint_records_listening():
    writes = [
        r.path
        for r in app.routes
        if isinstance(r, APIRoute)
        and r.methods & {"POST", "PUT", "PATCH"}
        and LISTENING.search(r.path)
        and not r.path.startswith("/api/review/")
    ]
    assert writes == []  # listening is never counted, rewarded or logged


def test_knw08_r5_mentor_summary_has_nothing_about_listening():
    assert [f for f in MenteeOut.model_fields if LISTENING.search(f)] == []
