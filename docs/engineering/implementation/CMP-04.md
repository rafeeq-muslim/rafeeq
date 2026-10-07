# CMP-04 report and block: implementation

**Feature:** `docs/domains/companion/features/CMP-04-report-and-block.md` (draft by Claude, for review) · **Related:** CMP-01 R3, CMP-05 · **Rules touched:** companion fixed rules (no unmoderated community; marriage/money/recruitment reported at once)
**Written:** 2026-10-05 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (one-tap report with reason) | `app/companion/safety.py::report` | `POST /api/reports {target_type: group_message|help_message, target_id, reason, note?}`. Reasons `marriage | money | recruitment | abuse | other`. The reporter must be able to see the message (group member / owner of the help thread). Guests report help messages with `X-Help-Token` (`reporter_guest_hash`) |
| R2 (dangerous reasons hide for all at once) | `safety.py` | `reason ∈ {marriage, money, recruitment}` → `hidden=true`, `priority=high`. Other reasons: visible to others, filtered out for the reporter (`cmp_reports` row by that reporter) |
| R3 (team queue; mentor hides in own group) | `safety.py::team_*`, `groups.py::hide` | `GET /api/team/reports` (role `team`): open, high first, oldest first, with the message text, author display name and place. `POST /api/team/reports/{id} {action: keep_hidden|restore|remove_member}`; `remove_member` deletes the membership and publishes `GroupLeft`. A group mentor's hide creates an `actioned` report (`reason=mentor_hidden`) so the team has a record |
| R4 (no reporter identity; no block notice) | `groups.py::_message_out` | The author sees `hidden: true` on their own message, nothing about who reported. Blocks are never surfaced to the blocked person |
| R5 (block member / mentor / responder) | `safety.py::block`, `mentors.py::block`, `help.py::block` | `cmp_blocks(blocker_id | blocker_guest_hash, blocked_id)`. Group messages of blocked users are filtered for the blocker; blocking one's mentor ends the link; blocking the responder clears `mentor_id`, sets `status=open`, and `_visible` hides the request from the blocked mentor. Self-block → `400 cannot_block_self` |

**Security review B (2026-10-07).** L9: `safety.py::_may_hide_for_all` runs before a dangerous report is saved: no hide-for-all when the reporter (account or guest hash) already filed `HIDE_PER_REPORTER_DAY = 5` dangerous reports in the last 24 h, or `HIDE_PER_AUTHOR_DAY = 2` on messages by the same author (same group and author; in a help thread the same request and side), or when a report on that message was `dismissed` (the team restored it). The report is still stored with `priority=high` and the team is pushed; `hidden_for_all` in the answer says what happened; the reporter no longer sees the message (R2, by his own report row). Counted from `cmp_reports`, no new column. L11: `_answers` calls `inbox.mentor_gate`, so a mentor without the accepted rules or suspended cannot report a learner's message (404). Tests: `backend/tests/test_sec_b_l9_l10_l11.py`.

## 2. Data

`cmp_reports` gains `priority`, `reporter_guest_hash`, `group_id` (for the queue's context); new `cmp_blocks`.

## 3. Frontend

`ReportSheet` (reason chips + optional note + "also block") on every group message and every mentor message in a help thread. Team queue `ReportsQueue` inside `/inbox` (tab visible to `team` only), exported for the main session's Team screen.

## 4. Tests (`backend/tests/test_cmp04_safety.py`)

| Example | Test |
| --- | --- |
| R1 ex1 money report → queue | `test_cmp04_r1_report_reaches_team_queue` |
| R1 ex2 guest reports | `test_cmp04_r1_guest_can_report_mentor_message` |
| R2 ex1 marriage hides for all | `test_cmp04_r2_marriage_report_hides_message_for_everyone` |
| R2 ex2 abuse hides for reporter only | `test_cmp04_r2_other_reason_hides_only_for_reporter` |
| R4 ex1 restore (was R3) | `test_cmp04_r4_team_restores_message` |
| R4 ex2 remove member (was R3) | `test_cmp04_r4_team_removes_member_and_emits_group_left` |
| R4 ex3 mentor hides (was R3) | `test_cmp04_r4_group_mentor_hides_message_with_record` |
| R4 ex4 learner can't see queue (was R3) | `test_cmp04_r4_learner_cannot_open_report_queue` |
| R5 ex1 author doesn't see reporter (was R4) | `test_cmp04_r5_author_sees_hidden_without_reporter` |
| R6 ex1 block member (was R5) | `test_cmp04_r6_blocked_member_messages_are_hidden_for_blocker` |
| R6 ex2 block mentor (was R5) | `test_cmp04_r6_blocking_mentor_ends_link` |
| R6 ex3 block responder (was R5) | `test_cmp04_r6_blocking_responder_returns_request_to_other_sisters` |
| R6 ex4 self (was R5) | `test_cmp04_r6_cannot_block_self` |

## Rewrite (PR #21, 2026-10-06)

Rules renumbered: R3 is new («خطر على أحد»), old R3–R5 became R4–R6.

| Rule | Change |
| --- | --- |
| R1 | A scholar's answer can be reported like any reply |
| R3 | Reason `danger` → `priority = "danger"`; queue order danger, high, then oldest; `notify.to_role(["team","admin"], "report_danger")` at once. Dangerous reasons push `report` too (open-question default). `danger` hides for the reporter only |
| R6 ex3 | Blocking the sister who answered returns the request to other sisters only (same-gender pool) |

Tests: `backend/tests/test_cmp04_safety.py`, vitest `cmp04_r3_*`.

## Audit gaps (branch `cmp-audit-gaps`, 2026-10-06)

| Rule | Change |
| --- | --- |
| R1 | `POST /api/reports` also accepts a `help_message` written by the learner when the reporter is a responder who can open that request in his inbox (`inbox.visible_request`): a help thread or the mentor thread. Same reasons, hiding and queue. The inbox thread offers «بلّغ عن هذه الرسالة» on the learner's messages; a message the responder reported for a non-dangerous reason is hidden for him only |
| R4 ex3 | The team's queue has «السجل» (`include_closed=true`): reviewed reports and the group mentor's `mentor_hidden` records, with «تراجع عن الإخفاء» (`restore`) on a message still hidden |
| R5 | Help threads (learner and responder side) keep the author's own hidden message, flagged `hidden` and shown as «أُخفيت هذه الرسالة للمراجعة»; nobody else sees it and the reporter is never named |

Tests: `backend/tests/test_cmp_audit_gaps.py` (`test_cmp04_*`), vitest `companion/cmp-audit-gaps.test.tsx`.
