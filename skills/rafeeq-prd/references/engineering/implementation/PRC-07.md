# PRC-07 daily adhkar: implementation

**Feature:** `docs/domains/practice/features/PRC-07-daily-adhkar.md` (draft by Claude for review) · **Data:** `data/hisnmuslim/README.md`
**Written:** 2026-10-05 by Claude (overnight build).

## 1. Rules → modules

| Rule / example | Module | What it does |
| --- | --- | --- |
| R1 approval per dhikr per language; text unchanged | `backend/app/practice/adhkar.py` | Reads `data/hisnmuslim/raw/{ar,en}/<chapter>.json` byte-for-byte (lenient JSON), builds one learner view per dhikr per language and registers item type `dhikr` (`hisn-<ID>`, group = chapter) with the KNW-05 review desk. Learners get approved snapshots only |
| R1 chapter not approved in my language | `GET /api/practice/adhkar` | A chapter is listed with `approved_count`; the client shows «قيد المراجعة بلغتك» when it is 0 |
| R2 verses from the stored Quran record | `content/practice/adhkar.json` (`verses`) + `adhkar.py::segments` | Each `﴿…﴾` span in the Arabic text is replaced, in order, by a reference `{sura, from, to}` listed for that dhikr. A dhikr with `﴿` and no complete mapping is **not offered** for review. The client renders references with `/api/scripture/quran` (QuranEnc); offline → reference only |
| R3 Arabic + meaning from the same source; no transliteration; no MT | `adhkar.py::view` | `ar`: segments. `en`: segments + `meaning` = Hisn English `TRANSLATED_TEXT`, except where that text is itself a Quran translation (`en_meaning:false` in the mapping; the QuranEnc translation is shown with the verse instead). `tl`: segments + `meaning: null`. `LANGUAGE_ARABIC_TRANSLATED_TEXT` (transliteration) is never read |
| R4 repeat as text; no counter; no tracking | view `repeat` (int) → «3 مرات» | No tap counter, no endpoint that records anything, no event |
| R5 audio from Rafeeq; missing file → no button | `GET /api/practice/adhkar/audio/{id}.mp3` | `FileResponse` from `data/hisnmuslim/audio/ar/<ID>.mp3` (git-ignored, copied to the server). `audio` in the view is true only when the file exists, so adding audio changes the view and needs a new approval (the reviewer listens first) |
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
| R1 approved text unchanged | `test_prc07_r1_approved_dhikr_shown_unchanged` |
| R1 unapproved hidden | `test_prc07_r1_unapproved_dhikr_hidden` |
| R1 chapter in review | `test_prc07_r1_chapter_without_approval_reports_zero` |
| R2 Ayat al-Kursi from the record | `test_prc07_r2_verses_are_references_not_text` |
| R2 unmapped verse never offered | `test_prc07_r2_unmapped_verse_not_offered` |
| R3 English meaning, no transliteration | `test_prc07_r3_english_meaning_without_transliteration` |
| R3 Tagalog: Arabic only | `test_prc07_r3_tagalog_has_no_machine_translation` |
| R4 repeat as text, no counter | `test_prc07_r4_repeat_is_data_and_nothing_is_recorded` |
| R5 audio from Rafeeq / missing | `test_prc07_r5_audio_served_locally`, `test_prc07_r5_missing_audio_has_no_button` |
| R6 suggestion | `frontend/src/app/practice/adhkar.test.ts` |
