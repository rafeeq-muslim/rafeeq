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
| R3 ex1 restore | `test_cmp04_r3_team_restores_message` |
| R3 ex2 remove member | `test_cmp04_r3_team_removes_member_and_emits_group_left` |
| R3 ex3 mentor hides | `test_cmp04_r3_group_mentor_hides_message_with_record` |
| R3 ex4 learner can't see queue | `test_cmp04_r3_learner_cannot_open_report_queue` |
| R4 ex1 author doesn't see reporter | `test_cmp04_r4_author_sees_hidden_without_reporter` |
| R5 ex1 block member | `test_cmp04_r5_blocked_member_messages_are_hidden_for_blocker` |
| R5 ex2 block mentor | `test_cmp04_r5_blocking_mentor_ends_link` |
| R5 ex3 block responder | `test_cmp04_r5_blocking_responder_returns_request_to_pool` |
| R5 ex4 self | `test_cmp04_r5_cannot_block_self` |
