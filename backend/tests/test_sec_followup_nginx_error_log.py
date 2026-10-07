"""Security review 2026-10-07, follow-up (rules.md §4, MOT-07 R4): the app's
nginx keeps no visitor address in its error log either. nginx adds the address
to every error line about a connection or a request, so the server writes
none; nginx's own log (start, reload, configuration mistakes) is untouched.
The file is checked as text here; it was also loaded and exercised in a local
nginx (see docs/engineering/implementation/PLT-05.md)."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONF = (ROOT / "infra" / "web.nginx.conf").read_text(encoding="utf-8")
DOCKERFILE = (ROOT / "frontend" / "Dockerfile").read_text(encoding="utf-8")


def directives() -> str:
    """The file without comments."""
    return "\n".join(line.split("#", 1)[0] for line in CONF.splitlines())


def server_block() -> str:
    m = re.search(r"\nserver \{\n(.*)\n\}", directives(), re.S)
    assert m, "server block not found"
    return m.group(1)


def test_the_server_writes_no_error_lines():
    own = [line.strip() for line in server_block().splitlines() if line.startswith("  ") and not line.startswith("   ")]
    assert "error_log /dev/null emerg;" in own  # at server level, so it covers every location
    # one setting in the whole file: no location (or a second server) turns a log back on
    assert re.findall(r"error_log\s+([^;]+);", directives()) == ["/dev/null emerg"]
    assert directives().count("server {") == 1


def test_nginx_keeps_its_own_log_for_start_up_and_configuration_mistakes():
    # The file is loaded inside `http {}` of the image's nginx.conf, whose own
    # error_log (process messages, no visitor address) is not replaced.
    assert "COPY infra/web.nginx.conf /etc/nginx/conf.d/default.conf" in DOCKERFILE
    assert "nginx.conf /etc/nginx/nginx.conf" not in DOCKERFILE
    assert not directives().lstrip().startswith("error_log")
    assert "error_log" not in directives().split("server {")[0]


def test_no_log_line_is_given_the_visitor_address():
    fmt = re.search(r"log_format rafeeq_noip '([^']*)'", CONF).group(1)
    for var in ("$remote_addr", "$realip_remote_addr", "$http_x_real_ip", "$http_x_forwarded_for", "$proxy_add_x_forwarded_for"):
        assert var not in fmt
    assert re.findall(r"access_log\s+([^;]+);", directives()) == ["/dev/stdout rafeeq_noip"]
    # a limit refusal stays below the level nginx's own log starts at
    assert "limit_req_log_level info;" in directives()
    assert "limit_conn" not in directives()  # no second limiter with its own log level
