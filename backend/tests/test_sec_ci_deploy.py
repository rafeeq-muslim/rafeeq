"""Security review 2026-10-07 (scope C): the repo is public.

H1  no CI job may reach a self-hosted runner (a pull request brings its own
    workflow file); deploys only from main of the team's repository, through
    the protected `production` environment; actions pinned to a commit.
H2  a failed deploy never prints the backend log in the public Actions run.
M1  a stranger's pull-request title or branch name never reaches the events
    log an AI session reads; every value is cut to 200 characters.
M3  container logs are capped.
Public repo: no home-directory paths and no account names in the tree.
"""

import json
import os
import re
import stat
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"
PINNED = re.compile(r"^[\w.-]+/[\w./-]+@[0-9a-f]{40}$")
HOME_PATH = re.compile(r"/home/[A-Za-z0-9_.-]+/")


def workflow(name: str) -> dict:
    return yaml.safe_load((WORKFLOWS / name).read_text(encoding="utf-8"))


def all_steps():
    for path in sorted(WORKFLOWS.glob("*.yml")):
        for job_name, job in yaml.safe_load(path.read_text(encoding="utf-8"))["jobs"].items():
            for step in job.get("steps", []):
                yield f"{path.name}:{job_name}", step


# --- H1 ---------------------------------------------------------------------------------


def test_h1_ci_jobs_run_only_on_github_hosted_runners():
    jobs = workflow("ci.yml")["jobs"]
    assert set(jobs) == {"backend", "frontend", "content"}
    for name, job in jobs.items():
        assert job["runs-on"] == "ubuntu-latest", name
        assert job["timeout-minutes"] == (30 if name == "backend" else 20), name
        # A condition in this file is no protection (the PR's own copy is what runs),
        # and one that skips fork PRs would leave strangers' changes untested.
        assert "if" not in job, name


def test_h1_ci_keeps_the_postgres_service_the_tests_use():
    backend = workflow("ci.yml")["jobs"]["backend"]
    db = backend["services"]["db"]
    assert db["image"] == "pgvector/pgvector:pg16"
    assert db["ports"] == ["127.0.0.1:5443:5432"]
    assert "@127.0.0.1:5443/rafeeq_test" in backend["env"]["DATABASE_URL"]


def test_h1_every_action_is_pinned_to_a_commit():
    used = [(where, step["uses"]) for where, step in all_steps() if "uses" in step]
    assert used
    for where, uses in used:
        assert PINNED.match(uses), f"{where}: {uses} is not pinned to a commit"


def test_h1_no_checkout_leaves_a_token_on_the_runner():
    checkouts = [(where, step) for where, step in all_steps() if step.get("uses", "").startswith("actions/checkout@")]
    assert checkouts
    for where, step in checkouts:
        assert step.get("with", {}).get("persist-credentials") is False, where


def test_h1_only_deploy_and_notify_name_a_self_hosted_runner():
    self_hosted = {}
    for path in sorted(WORKFLOWS.glob("*.yml")):
        for job_name, job in yaml.safe_load(path.read_text(encoding="utf-8"))["jobs"].items():
            if job["runs-on"] != "ubuntu-latest":
                self_hosted[f"{path.name}:{job_name}"] = job["runs-on"]
    assert self_hosted == {
        "deploy.yml:deploy": ["self-hosted", "rafeeq-deploy"],
        "notify.yml:notify": ["self-hosted", "rafeeq-events"],
    }


def test_h1_deploy_only_from_main_of_the_team_repository_through_the_environment():
    wf = workflow("deploy.yml")
    triggers = wf[True]  # YAML reads the key `on` as a boolean
    assert set(triggers) == {"push", "workflow_dispatch"}
    assert triggers["push"] == {"branches": ["main"]}
    assert wf["permissions"] == {"contents": "read"}
    deploy = wf["jobs"]["deploy"]
    assert "github.ref == 'refs/heads/main'" in deploy["if"]
    assert "github.repository == 'rafeeq-muslim/rafeeq'" in deploy["if"]
    assert "||" not in deploy["if"]
    assert deploy["environment"] == "production"
    assert wf["jobs"]["live-cache-headers"]["runs-on"] == "ubuntu-latest"


# --- H2 ---------------------------------------------------------------------------------

STUBS = {
    # Never the real docker: `logs` prints what a backend error could hold.
    "docker": """#!/bin/sh
echo "$RAFEEQ_CONFIG_DIR|$RAFEEQ_CORPUS_DIR|$*" >> "$STUB_CALLS"
case "$*" in
  *" logs "*) echo "SECRET-ROW [parameters: ('person@example.invalid',)]"; echo "SECRET-ERR" >&2 ;;
  "image inspect"*) exit 1 ;;
esac
exit 0
""",
    "curl": "#!/bin/sh\nexit 22\n",  # the health check never answers
    "sleep": "#!/bin/sh\nexit 0\n",
    "git": "#!/bin/sh\necho abc1234\n",
}


@pytest.fixture
def failed_deploy(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in STUBS.items():
        (bin_dir / name).write_text(body)
        (bin_dir / name).chmod(0o755)
    home = tmp_path / "home"
    (home / ".config/rafeeq").mkdir(parents=True)
    (home / ".config/rafeeq/secrets.env").write_text("VAPID_PUBLIC_KEY=test-public-key\n")
    env = {"PATH": f"{bin_dir}:{os.environ['PATH']}", "HOME": str(home), "STUB_CALLS": str(tmp_path / "calls")}
    run = subprocess.run(["bash", str(ROOT / "infra/scripts/deploy.sh")], env=env, capture_output=True, text=True, timeout=120)
    return run, home, (tmp_path / "calls").read_text().splitlines()


def test_h2_failed_deploy_keeps_the_backend_log_out_of_the_actions_run(failed_deploy):
    run, home, calls = failed_deploy
    assert run.returncode == 1
    shown = run.stdout + run.stderr
    assert "rolling back" in shown
    assert "SECRET" not in shown and "example.invalid" not in shown
    log = home / ".local/state/rafeeq/deploy-fail-abc1234.log"
    # The run says where to look, without naming the account's home directory.
    assert "~/.local/state/rafeeq/deploy-fail-abc1234.log" in shown
    assert str(home) not in shown
    saved = log.read_text()
    assert "SECRET-ROW" in saved and "SECRET-ERR" in saved
    assert stat.S_IMODE(log.stat().st_mode) == 0o600
    assert stat.S_IMODE(log.parent.stat().st_mode) == 0o700
    # The rollback still happens after the log is saved.
    assert calls[-1].endswith("up -d --no-build")


def test_public_repo_deploy_takes_server_paths_from_the_running_account(failed_deploy):
    _, home, calls = failed_deploy
    compose_calls = [c for c in calls if "|compose " in c]
    assert compose_calls
    for call in compose_calls:
        config_dir, corpus_dir, _ = call.split("|", 2)
        assert config_dir == f"{home}/.config/rafeeq"
        assert corpus_dir == f"{home}/.local/share/rafeeq/corpus"


# --- M1 ---------------------------------------------------------------------------------


def notify_step() -> dict:
    (step,) = workflow("notify.yml")["jobs"]["notify"]["steps"]
    return step


def test_m1_fork_pull_request_text_is_blanked_before_it_reaches_the_log():
    wf = workflow("notify.yml")
    assert wf["permissions"] == {}
    assert not any("uses" in s for s in wf["jobs"]["notify"]["steps"])  # nothing checked out
    step = notify_step()
    env = step["env"]
    same_repo = "github.event.pull_request.head.repo.full_name == github.repository &&"
    assert env["PR_TITLE"] == "${{ " + same_repo + " github.event.pull_request.title || '' }}"
    assert env["PR_BRANCH"] == "${{ " + same_repo + " github.event.pull_request.head.ref || '' }}"
    assert "github.event.pull_request.head.repo.full_name != github.repository" in env["EXTERNAL"]
    assert "github.event_name == 'pull_request_target'" in env["EXTERNAL"]  # a push is never external
    # Text travels through env only: no expression is pasted into the script.
    assert "${{" not in step["run"]


def run_notify_script(tmp_path, **values) -> dict:
    script = notify_step()["run"].split("<<'PY'", 1)[1].split("\n", 1)[1].rsplit("PY", 1)[0]
    path = tmp_path / "notify.py"
    path.write_text(script)
    out = subprocess.run(
        [sys.executable, str(path)], env={"PATH": os.environ["PATH"], **values}, capture_output=True, text=True, check=True
    ).stdout
    assert out.count("\n") == 1  # exactly one line per event
    return json.loads(out)


def test_m1_every_logged_value_is_cut_to_200_characters(tmp_path):
    long = "x" * 5000
    names = ("EVENT", "REF", "ACTOR", "PR_NUMBER", "PR_TITLE", "PR_BRANCH", "EXTERNAL", "SHA")
    event = run_notify_script(tmp_path, COMMIT_MSG=long + "\nsecond line " + long, **dict.fromkeys(names, long))
    assert set(event) == {n.lower() for n in names} | {"commit", "at"}
    for key, value in event.items():
        assert len(value) <= 200, key
    assert event["commit"] == "x" * 200


def test_m1_external_flag_and_empty_text_are_logged_as_given(tmp_path):
    event = run_notify_script(
        tmp_path, EVENT="pull_request_target", ACTOR="someone", PR_NUMBER="7", PR_TITLE="", PR_BRANCH="", EXTERNAL="1", COMMIT_MSG=""
    )
    assert (event["external"], event["pr_title"], event["pr_branch"], event["commit"]) == ("1", "", "", "")
    assert (event["pr_number"], event["actor"]) == ("7", "someone")
    own = run_notify_script(tmp_path, EVENT="push", REF="main", COMMIT_MSG="knw-01-r2: fix\n\nbody")
    assert (own["external"], own["commit"]) == ("", "knw-01-r2: fix")


# --- M3 (compose part) and the public tree ----------------------------------------------


def test_m3_every_production_container_has_capped_logs():
    services = yaml.safe_load((ROOT / "infra/compose.prod.yml").read_text(encoding="utf-8"))["services"]
    assert set(services) == {"db", "backend", "web"}
    for name, service in services.items():
        assert service["logging"] == {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}}, name


def test_public_repo_compose_paths_come_from_variables():
    services = yaml.safe_load((ROOT / "infra/compose.prod.yml").read_text(encoding="utf-8"))["services"]
    secrets = "${RAFEEQ_CONFIG_DIR:-${HOME}/.config/rafeeq}/secrets.env"
    assert services["db"]["env_file"] == secrets
    assert services["backend"]["env_file"] == secrets
    assert services["backend"]["volumes"] == ["${RAFEEQ_CORPUS_DIR:-${HOME}/.local/share/rafeeq/corpus}:/srv/corpus:ro"]


def public_text_files():
    folders = [".github", "infra", "docs", "skills", "frontend/scripts", "content/tools"]
    suffixes = {".md", ".yml", ".yaml", ".sh", ".py", ".mjs", ".ts", ".html", ".conf", ".inc", ".json", ".toml"}
    for folder in folders:
        for path in (ROOT / folder).rglob("*"):
            if path.is_file() and path.suffix in suffixes and "node_modules" not in path.parts:
                yield path
    yield from (p for p in ROOT.glob("*.md"))


def test_public_repo_tree_names_no_home_directory():
    hits = []
    for path in public_text_files():
        for number, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if HOME_PATH.search(line):
                hits.append(f"{path.relative_to(ROOT)}:{number}")
    assert not hits, hits


def test_public_repo_status_does_not_name_the_bootstrap_admin():
    for rel in ("docs/engineering/STATUS.md", "skills/rafeeq-prd/references/engineering/STATUS.md"):
        text = (ROOT / rel).read_text(encoding="utf-8")
        assert "the bootstrap admin (name in the secrets file)" in text, rel
        assert not re.search(r"bootstrap admin\s*`", text), rel
