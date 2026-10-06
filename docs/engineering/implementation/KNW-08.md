# KNW-08 Quran listening: implementation

**Feature:** `docs/domains/knowledge/features/KNW-08-quran-listening.md` · **Plan:** `docs/domains/knowledge/implementation-plan.md` §8.5
**Written:** 2026-10-05 by Claude (overnight build, Discover half). **Updated:** 2026-10-06 for the R2/R4 decision (six Quranpedia per-verse reciters, verse highlighting; branch `knw-08-r2-r4-reciters`).

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R4 (only recordings whose terms allow it; reciter and source named) | `backend/app/knowledge/recitation.py` | Plan step 1 checked live: IslamHouse recitation **728787** «المصحف المرتل للقارئ ماهر المعيقلي [نسخة مجمع الملك فهد]» has one MP3 per surah on `d1.islamhouse.com`; the IslamHouse policy allows audio in apps. `python -m app.knowledge.recitation --fetch` writes `content/discover/recitations.json`. The mushaf is one review-desk item `recitation` (the reviewer listens before use; no music); not approved → no listening screen |
| R1 (recitation as recorded, no music or effects) | `frontend/src/app/discover/Quran.tsx` | Plain `<audio>`; the app adds no sound. Toasts are silent everywhere in Rafeeq |
| R2 (meanings in the learner's language from the stored record, labelled, with source and version) | `Quran.tsx` | Text from `GET /api/scripture/quran` (paged by 40 ayat); label «ترجمة معاني»; source name and version from the response. No stored translation → Arabic only |
| R4 (decision 2026-10-06: six Quranpedia per-verse Hafs reciters) | `recitation.py`, `content/discover/verse_reciters.json` | Reciters 248, 249, 251, 253, 254, 255; URL `files.quranpedia.net/recitations/{id}/{sura:03d}{aya:03d}.mp3`. Only these ids, only `riwaya: hafs`, only on Quranpedia's own host (a reciter on `verse.mp3quran.net` is neither reviewed nor served). Each is a **gated** review item `recitation/quranpedia-{id}`, Arabic view only (one file for every language): learners get it only after the Sharia reviewer approves it; a later return withdraws it. Until one is approved al-Muaiqly plays as before; once one is, the listening screen offers the approved reciters only (choice kept on the device, `rafeeq.quranReciter`; default the first approved in file order) |
| R4 review flow | `frontend/src/app/discover/ReciterSample.tsx` in the review desk | The reviewer opens the reciter, plays a sample surah (default sample 1, 103, 108, 112, 113, 114; any other surah from the list) verse by verse over the stored text, then approves or returns it with a reason; `content_reviews` records the reviewer and date (shown in the item history) |
| R2 (decision 2026-10-06: highlight the verse being recited) | `Quran.tsx`, `player.ts` (`playVerse`, `nextAya`), `reciters.ts` (`followVerse`) | With an approved reciter the surah plays one verse file after another; the verse whose file is playing is highlighted (`aria-current`) in the stored text from `/api/scripture/quran`, and scrolled into view only when it is not visible (no smooth scroll under reduced motion). No timings, nothing generated. No lock-screen metadata is set (discreet mode) |
| R3 (meaning audio separate, never over the recitation) | `frontend/src/app/discover/player.ts` | One `HTMLAudioElement` for the whole screen: playing a meaning stops the recitation first. Meaning audio is QuranEnc's per-ayah file, **Tagalog only** (`tagalog_rwwad`, the same translation as the text) |
| R5 (no points, streak, badge, counter or completion message) | `Quran.tsx` | None rendered; no event sent |
| R6 (stop position on this device only) | `frontend/src/app/discover/quranPosition.ts` | `localStorage` `rafeeq.quranPos.{sura}` = `{time, aya}`; restored on open; never sent |

## 2. Endpoints

`GET /api/discover/recitations?lang=` → `{recitation: {id, reciter, title, source, origin_url, suras: {"1": url, …}} | null, reciters: [{id, quranpedia_id, reciter, source, origin_url}]}`. `recitation` is al-Muaiqly (merged, unless returned); `reciters` lists only Quranpedia reciters the reviewer approved (empty until then). The app builds each verse URL with `frontend/src/app/lib/quranpedia.ts` (shared with the lesson verse player, LRN-01 R4).

## 3. Data

`content/discover/recitations.json` (al-Muaiqly) and `content/discover/verse_reciters.json` (Quranpedia reciters, sample surahs). Approvals in `content_approvals` / `content_reviews` (`item_type = recitation`). No table, no migration.

## 4. Tests

| Example | Test |
| --- | --- |
| R4 ex1 (reciter and source shown) | `test_knw08_r4_approved_recitation_names_reciter_and_source` |
| R4 ex2 (unclear terms / not reviewed → not listed) | `test_knw08_r4_unapproved_recitation_is_not_served` |
| R2 ex1/ex2 (meanings label; Arabic alone without translation) | `R2: verse without stored translation shows Arabic only` (vitest, `quran.test.ts`) |
| R3 (meaning stops recitation first) | `R3: playing a meaning stops the recitation first` (vitest) |
| R6 ex1/ex2 (resume on this device; other device starts at 1) | `R6: position is kept per surah on this device only` (vitest) |
| R2 ex2 (al-Ikhlas by al-Minshawi: highlight moves to «ٱللَّهُ ٱلصَّمَدُ», screen follows) | `knw-08-r2 example: …` and the other `knw-08-r2` tests (vitest, `discover/knw08-reciters.test.tsx`) |
| R4 ex1 (reciter and source shown) | `test_knw08_r4_example1_approved_reciter_names_reciter_and_source`, `knw-08-r4 example: …` (vitest) |
| R4 ex3 (mp3quran-only reciter not added) | `test_knw08_r4_example2_mp3quran_only_reciter_is_not_added` |
| R4 decision (reviewer approves each reciter on a sample; al-Muaiqly until then; Hafs only) | `backend/tests/test_knw08_reciters.py` (`test_knw08_r4_*`), `knw-08-r4: …` (vitest) |

| R1 ex1 (the reciter alone) | `R1: playing a surah plays the reciter's file on the one audio element, and nothing else` (vitest, `quran.rules.test.tsx`) |
| R1 ex2 (an in-app notice during the recitation is silent) | `R1: an in-app notice during the recitation is shown without sound and leaves the recitation playing` (vitest) |
| R5 ex1 (no points, streak or message when a surah ends) | `R5: finishing a surah changes no progress, shows no completion message and sends nothing` (vitest); `test_knw08_r5_no_endpoint_records_listening` |
| R5 ex2 (the mentor sees nothing of the listening) | `test_knw08_r5_mentor_summary_has_nothing_about_listening` |

## 5. Open decisions

- English meaning audio exists only for `english_rwwad`, while the English text shown is `english_saheeh`: not offered until the team decides which translation English learners read.
- Audio streams from the sources' own hosts (`d1.islamhouse.com`, `d.quranenc.com`); proxying through Rafeeq stays open (KNW-08).
- **R2/R4 build choices (2026-10-06, for Musallam to confirm):** al-Muaiqly is no longer offered once at least one Quranpedia reciter is approved (the task's reading of «stays until a reciter is approved»; the feature text says «until the six are approved»). Default sample surahs 1, 103, 108, 112, 113, 114 (the reviewer may play any other). One Arabic decision per reciter. Default reciter: the first approved in the order of the decision (al-Minshawi first).
- **Not built (open questions stay open):** proxying audio through Rafeeq's domain; what the lock screen shows in discreet mode (PLT-05); background playback on mobile web.
- **CSP:** `media-src` must allow `https://files.quranpedia.net`; that change is in the lrn-01-r4 verse-recitation branch (merged first).
