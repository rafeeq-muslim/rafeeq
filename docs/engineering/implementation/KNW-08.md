# KNW-08 Quran listening: implementation

**Feature:** `docs/domains/knowledge/features/KNW-08-quran-listening.md` · **Plan:** `docs/domains/knowledge/implementation-plan.md` §8.5
**Written:** 2026-10-05 by Claude (overnight build, Discover half).

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R4 (only recordings whose terms allow it; reciter and source named) | `backend/app/knowledge/recitation.py` | Plan step 1 checked live: IslamHouse recitation **728787** «المصحف المرتل للقارئ ماهر المعيقلي [نسخة مجمع الملك فهد]» has one MP3 per surah on `d1.islamhouse.com`; the IslamHouse policy allows audio in apps. `python -m app.knowledge.recitation --fetch` writes `content/discover/recitations.json`. The mushaf is one review-desk item `recitation` (the reviewer listens before use; no music); not approved → no listening screen |
| R1 (recitation as recorded, no music or effects) | `frontend/src/app/discover/Quran.tsx` | Plain `<audio>`; the app adds no sound. Toasts are silent everywhere in Rafeeq |
| R2 (meanings in the learner's language from the stored record, labelled, with source and version) | `Quran.tsx` | Text from `GET /api/scripture/quran` (paged by 40 ayat); label «ترجمة معاني»; source name and version from the response. No stored translation → Arabic only |
| R3 (meaning audio separate, never over the recitation) | `frontend/src/app/discover/player.ts` | One `HTMLAudioElement` for the whole screen: playing a meaning stops the recitation first. Meaning audio is QuranEnc's per-ayah file, **Tagalog only** (`tagalog_rwwad`, the same translation as the text) |
| R5 (no points, streak, badge, counter or completion message) | `Quran.tsx` | None rendered; no event sent |
| R6 (stop position on this device only) | `frontend/src/app/discover/quranPosition.ts` | `localStorage` `rafeeq.quranPos.{sura}` = `{time, aya}`; restored on open; never sent |

## 2. Endpoints

`GET /api/discover/recitations?lang=` → `{recitation: {id, reciter, title, source, origin_url, suras: {"1": url, …}} | null}` (approved snapshot only).

## 3. Data

`content/discover/recitations.json`. Approvals in `content_approvals` (`item_type = recitation`). No table.

## 4. Tests

| Example | Test |
| --- | --- |
| R4 ex1 (reciter and source shown) | `test_knw08_r4_approved_recitation_names_reciter_and_source` |
| R4 ex2 (unclear terms / not reviewed → not listed) | `test_knw08_r4_unapproved_recitation_is_not_served` |
| R2 ex1/ex2 (meanings label; Arabic alone without translation) | `R2: verse without stored translation shows Arabic only` (vitest, `quran.test.ts`) |
| R3 (meaning stops recitation first) | `R3: playing a meaning stops the recitation first` (vitest) |
| R6 ex1/ex2 (resume on this device; other device starts at 1) | `R6: position is kept per surah on this device only` (vitest) |
| R1 ex1 (the reciter alone) | `R1: playing a surah plays the reciter's file on the one audio element, and nothing else` (vitest, `quran.rules.test.tsx`) |
| R1 ex2 (an in-app notice during the recitation is silent) | `R1: an in-app notice during the recitation is shown without sound and leaves the recitation playing` (vitest) |
| R5 ex1 (no points, streak or message when a surah ends) | `R5: finishing a surah changes no progress, shows no completion message and sends nothing` (vitest); `test_knw08_r5_no_endpoint_records_listening` |
| R5 ex2 (the mentor sees nothing of the listening) | `test_knw08_r5_mentor_summary_has_nothing_about_listening` |

## 5. Open decisions

- English meaning audio exists only for `english_rwwad`, while the English text shown is `english_saheeh`: not offered until the team decides which translation English learners read.
- Audio streams from the sources' own hosts (`d1.islamhouse.com`, `d.quranenc.com`); proxying through Rafeeq stays open (KNW-08).
