"""KNW-02 islamqa reader: the dump file is named data.ndjson.gz but the
2026-10-11 dump arrived as plain NDJSON (the weekly refresh failed with
BadGzipFile). The reader picks gzip or plain by the magic bytes, not the name.
Texts are dummies: never real islamqa content."""

import gzip
import json

import pytest

from app.knowledge.sources import islamqa


@pytest.mark.parametrize("gz", [True, False], ids=["gzip", "plain"])
def test_reads_gzip_and_plain_dump_by_magic_bytes(tmp_path, gz):
    line = {"op": "created", "type": "answer", "data": {"reference": 7, "title": "TEST_TITLE", "body": "TEST_BODY"}}
    raw = (json.dumps(line) + "\n").encode()
    f = tmp_path / "en" / "data.ndjson.gz"
    f.parent.mkdir()
    f.write_bytes(gzip.compress(raw) if gz else raw)

    [p] = list(islamqa.iter_passages(tmp_path))

    assert (p["id"], p["quote_text"], p["context_text"]) == ("islamqa:en:7", "TEST_BODY", "TEST_TITLE")
