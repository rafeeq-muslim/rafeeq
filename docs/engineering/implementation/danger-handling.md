# Danger handling: where it lives and how it is tested

**Status:** factual note, not a feature document. Since the companion rewrite (PR #21) CMP-01 lists danger cases as out of its scope («خارج النطاق: حالات الخطر وأرقام المساعدة»), and no feature document owns them. The behaviour comes from `docs/agents/rules.md` §2.8–2.9 and the fixed rules of `docs/domains/companion/README.md` («حالات الخطر تُعرض فورًا مع أرقام مساعدة رسمية موثّقة…»، «وحالة الخطر مستثناة، فيرد أول من يتاح»). **Decision needed:** who owns danger handling (a feature document and an owner); see `decisions-for-review.md` → «CMP audit gaps».
**Written:** 2026-10-06 by Claude (branch `cmp-audit-gaps`). Describes the code as it is; changes nothing.

## 1. The path of a danger case

| Step | Domain | Where | What happens |
| --- | --- | --- | --- |
| 1. Detect | Knowledge (KNW-01 R5) | `backend/app/knowledge/ask.py` (`_danger`, steps «Danger: phrases first» and the router's `danger` route); phrases in `content/knowledge/danger-phrases.json`, loaded by `backend/app/knowledge/ai/screen.py::is_danger` | A phrase hit (before any model or network call) or the router's `danger` route ends the answer: route `danger`, no AI text. Publishes `DangerDetected {ask_id, lang, detector}`: no identity, no question text (rules.md §2.9) |
| 2. Show help at once | Knowledge UI + Companion | `frontend/src/app/ask/parts.tsx` (`case "danger"` → `DangerHelpPanel`), `frontend/src/app/companion/Helplines.tsx`, numbers in `frontend/src/app/companion/helplineNumbers.ts` | The assistant shows only `DangerHelpPanel` («أريد إنسانًا الآن») and the verified helplines for the device's country (guessed on the device from its time zone, switchable). Saudi Arabia and the Philippines have numbers (research/08); other countries get «اتصل برقم الطوارئ في بلدك» and no number. Bundled, so it works offline |
| 3. Alert people | Companion | `backend/app/companion/events.py::on_danger` | `DangerDetected` becomes an urgent alert (`kind=urgent`, no owner, `ask_id` kept) at the top of every mentor's and team member's inbox, and every one of them gets a neutral push «طلب عاجل ينتظر ردًا» (`backend/app/companion/notify.py`, `to_responders`) |
| 4. Talk to a person | Companion | `backend/app/companion/help.py::create_request` (`kind=urgent`, `_claim_alert`, `_open_urgent`); `frontend/src/app/companion/HelpScreen.tsx` (`UrgentNotice`), `HelpThread.tsx` | The device that opens `/mentor/help?kind=urgent&ask=<ask_id>` becomes the alert's owner (same request). Urgent requests need no words and carry no question text. Every urgent conversation starts with what to do if in danger now and the helplines. A second urgent request from the same owner within 24 h returns the open one |
| 5. Who answers | Companion | `backend/app/companion/inbox.py::visible_clause` | Urgent requests reach every responder whatever the language and gender; the first available person answers (README exception to same-gender; it waited for the Sharia reviewer's confirmation and is confirmed by the product owner's blanket approval of 2026-10-06). Alerts nobody opened leave inboxes after 24 h. A paused mentor still gets urgent requests |
| 6. From a mentor | Companion (CMP-02 R5) | `inbox.py::make_urgent` | A mentor turns a harmful situation in a conversation into an urgent request for everyone |
| 7. From a group or conversation | Companion (CMP-04 R3) | `backend/app/companion/safety.py` | The report reason «خطر على أحد» goes first in the team's queue and alerts the team at once |

Limits on abuse: urgent requests are rate-limited per address (3/h) and overall (60/h) in `help.py::create_request`.

## 2. Tests

| Where | Tests |
| --- | --- |
| `backend/tests/test_knw01_ask.py` | `test_knw01_r5_danger_phrase_routes_to_human_without_model`, `test_knw01_r5_danger_event_carries_no_question_text`, `test_knw01_r5_router_danger_also_routes_to_human`, `test_knw01_every_danger_phrase_routes_to_human_without_network` |
| `backend/tests/test_cmp_danger.py` | `test_cmp_danger_event_creates_urgent_alert_first_in_every_inbox`, `test_cmp_danger_urgent_request_carries_no_question_text`, `test_cmp_danger_opening_urgent_reuses_the_alert`, `test_cmp_danger_first_available_answers_whatever_the_gender` |
| `backend/tests/test_cmp04_safety.py` | `test_cmp04_r3_danger_to_someone_tops_the_queue_and_alerts_the_team`, `test_cmp04_r3_dangerous_reason_also_alerts_the_team` |
| `backend/tests/test_knw04_eval.py`, `test_knw10_tasks.py` | danger questions are critical in the evaluation set; danger questions are never tagged for tasks |
| `frontend/src/app/companion/companion.test.tsx` | `cmp_danger_urgent_screen_shows_emergency_guidance_first`, `cmp_danger_guidance_reads_in_the_learner_language` |
| `frontend/src/app/companion/companion.rules.test.tsx` | `cmp_danger_saudi_panel_lists_only_the_verified_numbers`, `cmp_danger_philippines_panel_lists_911_and_1553`, `cmp_danger_other_country_shows_no_number`, `cmp_danger_never_shows_an_unverified_number`, `cmp_danger_country_is_guessed_on_the_device_and_can_change`, `cmp_danger_helplines_show_without_any_network_call` |

## 3. Open points (not decided here)

- **Owner and feature document** for danger handling (above).
- **Who watches urgent requests at night**, and the panel's promise «سيتواصل معك أحد فريقنا بلغتك» while nobody is on call (`decisions-for-review.md`, postponed item 2).
- Helplines are re-verified every six months (`docs/agents/sources.md`, helpline row).
