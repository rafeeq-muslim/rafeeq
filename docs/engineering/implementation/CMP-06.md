# CMP-06 private questions notebook: implementation

**Feature:** `docs/domains/companion/features/CMP-06-private-questions-notebook.md` · **Rules touched:** `rules.md` §1.2 (no religious or sensitive inference), §4 (minimum data) · **Written:** 2026-10-06 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 | `frontend/src/app/companion/notebook.ts` | Zustand store persisted in this browser only (`rafeeq.notebook`); no API, no event. First use shows that it stays on this device and does not move between devices (`introSeen`) |
| R2 | `notebook.ts::sendToMentor`, `assistantHandOff`; `pages/Ask.tsx` | One question at a time. Mentor: an ordinary message in the mentor thread (`/api/mentors/mine/thread`, then `/api/help/requests/{id}/messages`). Assistant: route state `{notebookQuestion}` read once by Ask and asked as a typed question. Offline: nothing leaves, the question stays marked «لم يُرسل بعد» |
| R3 | — | `Notebook.tsx` reads the store; the only other reader is `privacy/SignOutButton.tsx` (PLT-05 R7), which reads only the **number** of notes to warn that signing out would erase them, never their text. A test fails if any other source file imports it |
| R4 | `notebook.ts` | Delete one question or the whole notebook; clearing site data removes it for good |
| R5 | `Notebook.tsx` | «لا يوجد سؤال صغير أو بسيط. اكتب ما يخطر لك» and «أريد إنسانًا» (`/mentor/help?from=mentor`) |

Route `/mentor/notebook`, entry from «مرشدي». Questions are capped at 600 characters (the assistant's limit), so each can go either way.

## 2. Tests (vitest `companion.rules.test.tsx`)

`cmp06_r1_saved_on_this_device_without_any_request`, `cmp06_r1_first_use_says_it_does_not_move_between_devices`, `cmp06_r2_only_the_chosen_question_reaches_the_mentor`, `cmp06_r2_offline_question_stays_and_is_marked_not_sent`, `cmp06_r2_question_to_the_assistant_is_an_ordinary_question`, `cmp06_r3_no_code_outside_the_notebook_screen_reads_it`, `cmp06_r4_delete_one_or_all_and_cleared_site_data_leaves_nothing`, `cmp06_r5_reassures_in_one_line_and_offers_a_human`.
