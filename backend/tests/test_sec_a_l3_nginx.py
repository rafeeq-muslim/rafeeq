"""Security review 2026-10-07, A-L3: the app's nginx has one general, generous
limit per visitor address for /api/ (the file is checked as text here; it was
also loaded and exercised in a local nginx: see the commit message)."""

import re
from pathlib import Path

CONF = (Path(__file__).resolve().parents[2] / "infra" / "web.nginx.conf").read_text(encoding="utf-8")
# A first open: the offline warm-up (about 130 adhkar chapters and the verses
# they quote) plus the start-up calls; a full Quran text download is about 215.
COLD_START_CALLS = 500


def directives() -> str:
    """The file without comments."""
    return "\n".join(line.split("#", 1)[0] for line in CONF.splitlines())


def api_block() -> str:
    m = re.search(r"location /api/ \{(.*?)\n  \}", directives(), re.S)
    assert m, "location /api/ not found"
    return m.group(1)


def test_l3_one_zone_keyed_by_the_restored_visitor_address():
    zones = re.findall(r"limit_req_zone\s+(\S+)\s+zone=(\w+):(\w+)\s+rate=(\d+)r/s;", directives())
    assert zones == [("$binary_remote_addr", "rafeeq_api", "10m", "200")]
    # the address is the visitor's only because X-Real-IP is restored from the host router
    assert "real_ip_header X-Real-IP;" in directives() and "set_real_ip_from 127.0.0.1;" in directives()


def test_l3_the_limit_covers_all_of_api_and_is_far_above_a_cold_start():
    block = api_block()
    m = re.search(r"limit_req zone=rafeeq_api burst=(\d+) nodelay;", block)
    assert m, block
    burst = int(m.group(1))
    assert burst >= 8 * COLD_START_CALLS  # several devices behind one address open at once
    assert "limit_req_status 429;" in block
    # nothing under /api/ has its own location that would escape the limit
    assert re.findall(r"location\s+[=~^*\s]*(/api\S*)", directives()) == ["/api/"]


def test_l3_a_refusal_never_writes_the_visitor_address_to_the_log():
    # nginx logs a refusal with the client address at this level; the error log starts at `notice`.
    assert "limit_req_log_level info;" in api_block()
    assert "error_log" not in directives()  # the image's default (notice) is kept
    assert "$remote_addr" not in re.search(r"log_format rafeeq_noip '([^']*)'", CONF).group(1)
