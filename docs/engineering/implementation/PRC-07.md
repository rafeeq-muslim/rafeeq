# PRC-07 daily adhkar: implementation

**Feature:** `docs/domains/practice/features/PRC-07-daily-adhkar.md` (draft by Claude for review) · **Data:** `data/hisnmuslim/README.md`
**Written:** 2026-10-05 by Claude (overnight build).

## 1. Rules → modules

| Rule / example | Module | What it does |
| --- | --- | --- |
| R1 reviewed before merge, shown when merged; returned → withdrawn; text unchanged | `backend/app/practice/adhkar.py` | Reads `data/hisnmuslim/raw/{ar,en}/<chapter>.json` byte-for-byte (lenient JSON), builds one learner view per dhikr per language and registers item type `dhikr` (`hisn-<ID>`, group = chapter) with the KNW-05 review desk. Learners get the merged text through `review.published()` (rules.md §1.4 (2026-10-06): merged content is shown directly; a version the reviewer returns in the desk is withdrawn in that language until corrected) |
| R1 chapter with nothing live in my language | `GET /api/practice/adhkar` | A chapter is listed with `approved_count` (dhikr live in that language, i.e. merged and not returned); the client shows «قيد المراجعة بلغتك» when it is 0 |
| R2 verses from the stored Quran record | `content/practice/adhkar.json` (`verses`) + `adhkar.py::segments` | Each `﴿…﴾` span in the Arabic text is replaced, in order, by a reference `{sura, from, to}` listed for that dhikr. A dhikr with `﴿` and no complete mapping is **not offered** for review. The client renders references with `/api/scripture/quran` (QuranEnc); offline → reference only |
| R3 Arabic + meaning from the same source; no transliteration; no MT | `adhkar.py::view` | `ar`: segments. `en`: segments + `meaning` = Hisn English `TRANSLATED_TEXT`, except where that text is itself a Quran translation (`en_meaning:false` in the mapping; the QuranEnc translation is shown with the verse instead). `tl`: segments + `meaning: null`. `LANGUAGE_ARABIC_TRANSLATED_TEXT` (transliteration) is never read |
| R4 repeat as text; no counter; no tracking | view `repeat` (int) → «3 مرات» | No tap counter, no endpoint that records anything, no event. The Rafeeq guide (PLT-08) does not store that adhkar were opened either: `guide/suggest.ts::QUIET_MOMENTS` keeps adhkar out of `used`, and opening them ends the suggestion as a dateless dismissal, the same state a «not now» leaves (`guide/store.ts`, persist v2 drops an old `used.adhkar`) |
| R5 audio from Rafeeq; missing file → no button | `GET /api/practice/adhkar/audio/{id}.mp3` | `FileResponse` from `data/hisnmuslim/audio/ar/<ID>.mp3` (git-ignored, copied to the server). `audio` in the view is true only when the file exists, so adding audio changes the view; under rules.md §1.4 the reviewer listens before the files are added, and the desk can still return it |
| R6 groups and suggestion by the time of day | `content/practice/adhkar.json` (`groups`) + `frontend/src/app/practice/adhkar.ts::suggestGroup` | Groups: `morning_evening` (27), `after_prayer` (25), `sleep` (28), `waking` (1), `daily` (10, 11, 13, 14, 8, 9, 69, 70). Suggestion from the device city's prayer times; no city → fixed order |

## 2. Endpoints (`app/practice/router.py`)

- `GET /api/practice/adhkar?lang=` → `{"groups":[{"key","chapters":[{"id","title","approved_count","total"}]}], "source":{…}}`
- `GET /api/practice/adhkar/{chapter}?lang=` → approved dhikr views of that chapter, in source order.
- `GET /api/practice/adhkar/audio/{id}.mp3` → audio file or 404. No identity, no logging.

Same JSON for everyone (`Cache-Control: public, max-age=300`).

## 3. Data

No table. Views are rebuilt from the files; approvals live in `content_approvals`.

## 4. Tests

| Example | Test (`backend/tests/test_prc07_adhkar.py` unless noted) |
| --- | --- |
| R1 merged text unchanged | `test_prc07_r1_merged_dhikr_shown_unchanged` |
| R1 returned dhikr hidden | `test_prc07_r1_returned_dhikr_withdrawn_until_corrected` |
| R1 merged chapter lists every offered dhikr | `test_prc07_r1_merged_chapter_shows_every_offered_dhikr` |
| R2 Ayat al-Kursi from the record | `test_prc07_r2_verses_are_references_not_text` |
| R2 unmapped verse never offered | `test_prc07_r2_unmapped_verse_not_offered` |
| R3 English meaning, no transliteration | `test_prc07_r3_english_meaning_without_transliteration` |
| R3 Tagalog: Arabic only | `test_prc07_r3_tagalog_has_no_machine_translation` |
| R4 repeat as text, no counter | `test_prc07_r4_repeat_is_data_and_nothing_is_recorded` |
| R4 opening is not stored (guide) | `frontend/src/app/guide/quiet-moments.test.ts` |
| R5 audio from Rafeeq / missing | `test_prc07_r5_audio_served_locally`, `test_prc07_r5_missing_audio_has_no_button` |
| R6 suggestion (6:30 am → morning/evening, 10:30 pm → sleep, no city → fixed order) | `frontend/src/app/practice/practice.test.ts` "PRC-07 R6: suggested adhkar group from the time of day" |
