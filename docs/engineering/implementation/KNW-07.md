# KNW-07 stories, benefits and the daily card: implementation

**Feature:** `docs/domains/knowledge/features/KNW-07-stories-benefits-daily-card.md` · **Plan:** `docs/domains/knowledge/implementation-plan.md` §8.4
**Written:** 2026-10-05 by Claude (overnight build, Discover half).

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (approved, sourced; hadith text from the stored record) | `backend/app/knowledge/daily.py` | Cards live in `content/discover/daily-cards.json`, built by `python -m app.knowledge.daily --build` from the normalized HadeethEnc corpus (`hadeethenc.jsonl`). The hadith text, title, grade, attribution and benefits (`hints`) are copied **unchanged** with the hadith id, origin URL and corpus version. Each card is a review-desk item `daily_card`; learners get only the approved snapshot of their language |
| R1 error (unapproved card on its day → next approved) | `frontend/src/app/discover/daily.ts::cardOfDay` | Walks forward from today's index to the next card approved in the learner's language |
| R2 (stories from sources, labelled as Rafeeq's wording) | `daily.py` | Card `kind: "story"` is supported in the file and the view carries `rafeeq_wording: true`; no stories are written tonight (none drafted by the team) |
| R3 (no images of prophets/companions) | `frontend/src/app/discover/CardView.tsx` | Cards render text only, with the brand flower; there is no image field in the data |
| R4 (one card a day, same all day, restart after the set) | `daily.ts::dayNumber`, `cardOfDay` | `index = dayNumber(local date) mod N` over the ordered list. The day is the device's local calendar date (KNW-07 open question; MOT-02 uses the same) |
| R5 (no points/streak, nothing about missed days) | `CardView.tsx` | No event is sent, no counter, no "you missed" copy |
| R6 (learner's language, no machine translation) | `daily.py` + `daily.ts` | Only languages present in the source record exist; selection skips cards not approved in the language |

Plan §8.4 step 6 (keep the old modulus until a remainder-0 day when the set grows) is implemented in `cardOfDay` with an optional `{since, count}` anchor in the API response (`previous`): if the set changed on day `since`, the old count is used until the first day `d ≥ since` with `d mod oldCount = 0`.

## 2. Endpoints

`GET /api/discover/cards?lang=ar|en|tl` → `{lang, cards: [{id, order, kind, title, text, text_ar?, explanation?, benefits[], grade, attribution, source: {name, url, version}}], previous: {count, since} | null}`. Same response for every user, `Cache-Control: public, max-age=300`. No user data in or out.

## 3. Data

No table. `content/discover/daily-cards.json` (ordered; `previous` anchor optional). Approvals in `content_approvals` (`item_type = daily_card`).

## 4. Tests

| Example | Test |
| --- | --- |
| R1 ex1 (approved benefit: text from the record, source) | `test_knw07_r1_approved_card_served_with_source` (pytest) |
| R1 ex2 (unapproved → not served) | `test_knw07_r1_unapproved_card_is_not_served` (pytest); `R1: unapproved card on its day → next approved` (vitest) |
| R1 text unchanged | `test_knw07_r1_card_text_matches_stored_record` (pytest, skipped when the corpus is absent) |
| R4 ex1 (same card morning and evening) | `R4: same card all day` (vitest) |
| R4 ex2 (restart after the set) | `R4: the set restarts after the last card` (vitest) |
| R5 ex2 (back after 3 days: today's card only) | `R5: returning after days away shows only today's card` (vitest) |
| R6 (not approved in Tagalog → another approved Tagalog card) | `test_knw07_r6_language_without_approval_gets_other_cards` (pytest) + vitest R1 case |
| Plan §8.4 step 6 | `step 6: grown set keeps the old modulus until a remainder-0 day` (vitest) |

## 5. Open decisions

- Card list (14 HadeethEnc benefits) is «مقترح من Claude، يعتمده المراجع الشرعي»; the order is part of the content.
- The explanation shown is HadeethEnc's own explanation, unchanged; it is long for some cards, so the card shows benefits first and the explanation behind a disclosure.
