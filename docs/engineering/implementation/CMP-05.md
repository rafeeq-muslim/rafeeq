# CMP-05 small groups: implementation

**Feature:** `docs/domains/companion/features/CMP-05-small-groups.md` (draft by Claude, for review) · **Related:** CMP-04, MOT-06 (`implementation/MOT-06.md`) · **Rules touched:** companion fixed rules (single gender, mentor-led, report button), PLT-02 R5 (display name only)
**Written:** 2026-10-05 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (mentor creates) | `app/companion/groups.py::create` | Role `mentor` with a gender; `lang ∈ mentor.languages`; `gender = mentor.gender`; `capacity` 2–15, default 10; `join_code` = 8 chars from an unambiguous alphabet. Publishes `GroupCreated {group_id, mentor_id}` |
| R2 (join by code) | `groups.py::join` | Account; `409 match_profile_required` without a gender; gender mismatch or language not spoken → `403 group_not_suitable` (no details); full → `409 group_full`; already in a group → `409 already_in_group`. Publishes `GroupJoined {group_id, user_id}` |
| R3 (display name only) | `groups.py::detail` | Members `{id, display_name, is_me}` + mentor display name. No username, status or progress |
| R4 (text chat with reporting, no contacts) | `groups.py::messages` / `post` | Members + group mentor only (`403` otherwise). `text.contact_violation` → `422`. Hidden messages and blocked authors are filtered (CMP-04). Rate limit 20/min |
| R5 (leave / remove, silently) | `groups.py::leave` / `remove_member` | Deletes the membership, no system message, publishes `GroupLeft {group_id, user_id}`. A removal (mentor, or the team's `remove_member` in CMP-04) also writes `cmp_group_removals (group_id, user_id)`; `join` then answers `403 group_unavailable` for that group only (see "Removed members" below) |
| R6 (challenge on the group page) | frontend `ChallengeCard` | Reads MOT-06 `GET /api/groups/{id}/challenge`; shows «6 من 8 أتمّوا» |

## 2. Endpoints

`POST /api/groups` (mentor) · `GET /api/groups/mine` · `POST /api/groups/join {code}` · `GET /api/groups/{id}` · `POST /api/groups/{id}/leave` · `DELETE /api/groups/{id}/members/{user_id}` (mentor) · `GET /api/groups/{id}/messages?after=` · `POST /api/groups/{id}/messages` · `POST /api/groups/{id}/messages/{mid}/hide` (mentor).

## 3. Frontend

Learner: `/mentor/group` (join by code, or the group: challenge, members, chat). Mentor: `/inbox` groups tab (create, list with codes) and `/inbox/g/:id` (chat with hide/remove, challenge creation). Chat polls every 10 s while open.

## 4. Tests (`backend/tests/test_cmp05_groups.py`)

| Example | Test |
| --- | --- |
| R1 ex1 create | `test_cmp05_r1_mentor_creates_group_in_his_gender_and_language` |
| R1 ex2 learner can't | `test_cmp05_r1_learner_cannot_create_group` |
| R2 ex1 join + event | `test_cmp05_r2_join_by_code_emits_group_joined` |
| R2 ex2 wrong gender | `test_cmp05_r2_other_gender_gets_not_suitable_without_details` |
| R2 ex3 full | `test_cmp05_r2_full_group_rejects` |
| R2 ex4 one group | `test_cmp05_r2_one_group_at_a_time` |
| R3 ex1 display names only | `test_cmp05_r3_members_show_display_names_only` |
| R4 ex1 post seen by all | `test_cmp05_r4_member_message_is_seen_with_display_name` |
| R4 ex2 non-member | `test_cmp05_r4_non_member_cannot_read_messages` |
| R4 ex3 telegram link | `test_cmp05_r4_messenger_link_is_rejected` |
| R5 ex1 leave silently | `test_cmp05_r5_leaving_is_silent_and_emits_group_left` |
| R5 ex2 mentor removes | `test_cmp05_r5_mentor_removes_member` |
| R5 ex3 removed member can't rejoin by code | `test_cmp05_r5_removed_member_cannot_rejoin_with_the_same_code`, `test_cmp05_r5_removal_does_not_affect_other_groups_or_members`; team removal: `test_cmp04_r4_team_removes_member_and_emits_group_left`, `test_cmp04_r4_team_removal_holds_even_if_the_author_left_first` (`test_cmp04_safety.py`) |
| R5 ex4 left on his own, rejoins | `test_cmp05_r5_member_who_left_can_rejoin` |
| PLT-05 R5 deletion clears the removal | `test_cmp05_r5_account_deletion_clears_the_removal` |
| R6 ex1 «6 من 8» | `test_cmp05_r6_group_page_challenge_shows_count_only` (in `test_mot06_challenges.py`) |

## Suspended or de-roled mentor (security review B-M1, 2026-10-07)

`groups.py::access` used to check only `g.mentor_id == me.id`, and the mentor gate ran only on creation, so a suspended mentor, one whose approval was withdrawn, or an account that lost the `mentor` role kept reading, writing, hiding and removing in his groups. `access` now calls `mentor_only` (role + `inbox.mentor_gate`) whenever the caller is the group's mentor: `403 mentors_only | mentor_suspended | mentor_rules_required`. `GET /api/groups/mine` leaves his led groups out (no join code). MOT-06 asks `companion/public.py::may_lead_groups` in `challenges.py::_role` (`403 group_mentor_only`). Checked live on every call, so no event is needed for a role change by the admin, and reinstating restores access. Members are untouched: the group's long-term fate is an open question in the feature doc (rule 7). Tests: `backend/tests/test_sec_b_m1_group_mentor_access.py` (5).

## Rewrite (PR #21, 2026-10-06)

R1: `DEFAULT_CAPACITY = 10`, `MAX_CAPACITY = 15`, `MENTOR_MEMBER_LIMIT = 25` as the sum of the mentor's group caps (`409 {code: mentor_member_limit, limit, remaining}`); `PUT /api/groups/{id}/capacity` for the mentor (2–15, not below current members, within 25). Frontend: cap editor in the members drawer and the hint in the create form. Tests: `backend/tests/test_cmp05_groups.py` (`test_cmp05_r1_*`).

## Removed members (cmp-05-r5-removed-rejoin, 2026-10-06)

A member the mentor removed (`DELETE /api/groups/{id}/members/{user_id}`) or the team removed (CMP-04 `remove_member`) used to rejoin at once with the same code. `remove(..., removed=True)` now also writes one row in `cmp_group_removals (group_id, user_id, created_at)` (migration `2b3c4d5e6f7a`, additive); `join` answers `403 group_unavailable` for that group only, shown as `cmp.group.err.unavailable` (neutral, no reason, CMP-04 R5). Leaving on one's own writes nothing, so that member can rejoin. The team's removal is recorded even when the author left before the team acted. The row cascades with the group and with the person's account (PLT-05 R5). No undo yet: an open question in the feature doc.

Why a per-person record and not a new code: rotating the code would lock out every other person the mentor already gave it to, and a removed member would still learn the new code from any member; the record blocks only the removed person and only for that group.
