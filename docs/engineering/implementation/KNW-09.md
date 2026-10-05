# KNW-09 saved items: implementation

**Feature:** `docs/domains/knowledge/features/KNW-09-saved-items.md` · **Plan:** `docs/domains/knowledge/implementation-plan.md` §8.6
**Written:** 2026-10-05 by Claude (overnight build, Discover half).

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (save cards and items, find them with their source; no duplicates) | `frontend/src/app/discover/saved.ts` | Zustand store persisted in `localStorage` (`rafeeq.saved`), keyed `kind:ref` (`card:hadeethenc-66511`, `library:2835963`). Saving twice keeps one entry |
| R2 (answers: text + sources + date, question only by choice) | — | Saving assistant answers belongs to the Ask screen (another agent); the store accepts `kind: "answer"` with a payload so Ask can add it later |
| R3 (guest on the device; moved to the account) | `saved.ts` + `GET/PUT /api/me/saved` (`backend/app/knowledge/discover.py`) | Signed-in learners merge: union by `kind:ref`, earliest `saved_at` wins; stored in the existing `knw_saved_items` table |
| R4 (private) | — | No mentor, group or dashboard endpoint reads `knw_saved_items` |
| R5 (delete one or all; with the account) | `saved.ts` + `DELETE /api/me/saved[/{kind}/{ref}]`; table has `ON DELETE CASCADE` on `users.id` |
| R6 (withdrawn content not shown) | `frontend/src/app/discover/Saved.tsx` | Saved entries store ids only; display resolves the current approved card/item from the API; missing → «لم تعد متاحة» without old text |

## 2. Endpoints

`GET /api/me/saved` → `{items: [{kind, ref, saved_at}]}` · `PUT /api/me/saved` body `{items: [...]}` → merged list · `DELETE /api/me/saved` (all) · `DELETE /api/me/saved/{kind}/{ref}`. All require sign-in.

## 3. Data

`knw_saved_items (user_id, kind, ref_id, payload, saved_at)`, existing. Payload stays empty for cards and library items (ids only).

## 4. Tests

| Example | Test |
| --- | --- |
| R1 ex1/ex2 (saved with source; no duplicate) | `R1: saving twice keeps one entry` (vitest `saved.test.ts`) |
| R3 ex1 (4 guest cards appear in the account) | `test_knw09_r3_guest_items_move_to_account` |
| R3 ex2 (merge without duplicates) | `test_knw09_r3_merge_keeps_one_copy` + vitest `R3: merge is a union` |
| R4 (mentor cannot see) | `test_knw09_r4_saved_items_are_only_the_owners` |
| R5 ex1/ex2 (delete one; delete with account) | `test_knw09_r5_delete_one_and_all`, `test_knw09_r5_deleting_account_deletes_saved` |
| R6 (withdrawn card shows "no longer available") | `R6: an id missing from approved content is unavailable` (vitest) |
