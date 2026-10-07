# KNW-09 saved items: implementation

**Feature:** `docs/domains/knowledge/features/KNW-09-saved-items.md` · **Plan:** `docs/domains/knowledge/implementation-plan.md` §8.6
**Written:** 2026-10-05 by Claude (overnight build, Discover half).

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (save cards and items, find them with their source; no duplicates) | `frontend/src/app/discover/savedStore.ts` | Zustand store persisted in `localStorage` (`rafeeq.saved`), keyed `kind:ref` (`card:hadeethenc-66511`, `library:2835963`). Saving twice keeps one entry |
| R2 (answers: text + sources + date, question only by choice) | `frontend/src/app/ask/saved.ts` → `savedStore.ts`; `Saved.tsx`; `GET /api/scripture/passages` (`backend/app/knowledge/scripture.py`) | Saving an answer keeps `{lang, answer, source_ids}` under `rafeeq.savedAnswers` (keyed by the random ask id) and the entry's `saved_at`; never the question (the consent rule is an open question, so until it is decided the question is not stored anywhere). On the Saved screen the answer's Quran/hadith/fatwa words are fetched by passage id from the stored records (`/api/scripture/passages`, same source cards as `/api/ask`, eligible sources only), never from the saved copy |
| R3 (guest on the device; moved to the account) | `savedStore.ts` + `GET/PUT /api/me/saved` (`backend/app/knowledge/discover.py`) | Signed-in learners merge: union by `kind:ref`, earliest `saved_at` wins; stored in the existing `knw_saved_items` table. A saved answer moves with its `answer: {lang, answer, source_ids}` payload (extra fields such as a question are refused, 422) and comes back to other devices |
| R4 (private) | — | No mentor, group or dashboard endpoint reads `knw_saved_items` |
| R5 (delete one or all; with the account) | `savedStore.ts` + `DELETE /api/me/saved[/{kind}/{ref}]`; table has `ON DELETE CASCADE` on `users.id` | Removing an answer, or clearing all, also removes its text from `rafeeq.savedAnswers`; text left by older builds without an entry is pruned on load |
| R6 (withdrawn content not shown) | `frontend/src/app/discover/Saved.tsx`, `resolve.ts` | Saved entries store ids only; display resolves the current approved card/item from the API; missing → «لم تعد متاحة» without old text. A saved answer is shown only if every source id is still served; otherwise «لم تعد متاحة» (until the open question on changed sources is decided: hidden, never half-sourced). Offline → "can't be shown right now", not "withdrawn" |

## 2. Endpoints

`GET /api/me/saved` → `{items: [{kind, ref, saved_at, answer?}]}` · `PUT /api/me/saved` body `{items: [...]}` → merged list · `DELETE /api/me/saved` (all) · `DELETE /api/me/saved/{kind}/{ref}`. All require sign-in. `answer` = `{lang, answer, source_ids}`, only for `kind: "answer"`.

`GET /api/scripture/passages?ids=…&ids=…` (1–40 ids, public, no identity) → `{cards: [...]}`: the stored records of those passage ids; ids not stored or from a source no longer used are left out.

## 3. Data

`knw_saved_items (user_id, kind, ref_id, payload, saved_at)`, existing. Payload stays empty for cards and library items (ids only); for answers it holds `{lang, answer, source_ids}` (no migration: the column already existed).

## 4. Tests

| Example | Test |
| --- | --- |
| R1 ex1/ex2 (saved with source; no duplicate) | vitest `knw-09-r1` (`savedStore.test.ts`) |
| R2 ex1 (answer + sources + date, no question) | vitest `knw-09-r2` (`savedStore.test.ts`, `Saved.test.tsx`) + `test_knw09_r2_saved_answer_keeps_text_sources_and_date_not_the_question` |
| R2 ex2 (ayah from the stored record) | vitest `knw09_r2_ayah_in_a_saved_answer_comes_from_the_stored_record_by_id` + `test_knw09_r2_ayah_in_a_saved_answer_comes_from_the_stored_record` |
| R3 ex1 (4 guest cards appear in the account) | `test_knw09_r3_guest_items_move_to_account` |
| R3 ex2 (merge without duplicates) | `test_knw09_r3_merge_keeps_one_copy` + vitest `knw-09-r3` |
| R3 (answers move with their text) | `test_knw09_r3_saved_answer_moves_to_the_account` + vitest `knw09_r3_saved_answer_text_moves_to_the_account_and_back_without_the_question` |
| R4 (mentor cannot see) | `test_knw09_r4_saved_items_are_only_the_owners` |
| R5 ex1/ex2 (delete one; delete with account) | `test_knw09_r5_delete_one_and_all`, `test_knw09_r5_deleting_a_saved_answer_removes_its_text`, `test_knw09_r5_deleting_account_deletes_saved`, vitest `knw-09-r5` (no answer text left on the device) |
| R6 (withdrawn card shows "no longer available") | vitest `knw-09-r6` (cards and answers) + `test_knw09_r6_passages_of_a_source_no_longer_used_are_not_shown` |
| Ceiling (security review 2026-10-07, A-M3): an account keeps at most 500 saved items; past that the newest of the device's new items are taken first and the rest stay on the device only; 30 writes a minute per account | `test_m3_an_account_keeps_at_most_500_saved_items`, `test_m3_saved_writes_are_limited_per_account` |
