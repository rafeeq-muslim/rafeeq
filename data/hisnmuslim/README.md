# Hisn al-Muslim (حصن المسلم) data

Adhkar and supplications from *Hisn al-Muslim* by Sa'id bin Ali bin Wahf al-Qahtani, as published by hisnmuslim.com. For the daily-adhkar feature (PRC-07). Sources and licence: `docs/agents/sources.md`; research: `docs/agents/research/07-prayer-reminder-and-adhkar.md`.

## Permission

The team's domain owner (ناصر بن خالد العويمر) contacted hisnmuslim.com on 2026-10-05; they approved the use and said the data is open to the public. ⚠️ Keep their written confirmation (email or message) with the team and record its date here before launch.

## What is here

| Path | Content | In git |
| --- | --- | --- |
| `raw/husn.json` | Language index (Arabic, English) | Yes |
| `raw/<lang>/husn_<lang>.json` | 132 chapters: ID, title, chapter audio URL, text URL | Yes |
| `raw/<lang>/<ID>.json` | Items of one chapter: Arabic text, transliteration, translation, repeat count, audio URL | Yes |
| `audio/` | 397 MP3 files (185 MB), per chapter and per dhikr | **No** (git-ignored) |
| `fetch.py` | Downloads everything again; `--audio` adds the MP3s | Yes |

Files are saved **byte-for-byte as served**. Never edit them: fix problems in the code that reads them.

Pulled 2026-10-05: Arabic 132 chapters, English 132 chapters, 398 audio links.

## Known source defects

- Some English files contain raw tab characters inside strings: parse with a lenient JSON reader (`strict=False` in Python).
- `raw/en/126.json`: the chapter-title key is missing its closing quote. `fetch.py` repairs it in memory only.
- One audio link has no file name (`.../audio/ar/.mp3`) and cannot be downloaded.

## Rules before anything reaches users

- **Sharia review first:** no dhikr is shown until the Sharia reviewer (مهند بن صالح الفوزان) approves it (`docs/agents/rules.md` §1.4).
- **Quran text from the Quran database:** items that contain verses (e.g. Ayat al-Kursi in chapter 27) must render the verses from stored Quran records by surah and ayah, not from this text (`rules.md` §1.3).
- **No transliteration on screen:** the English `LANGUAGE_ARABIC_TRANSLATED_TEXT` field holds Latin transliteration (e.g. «La ilaha illal-lah») or a short instruction (e.g. «Then recite Soorah al-Ikhlaas…»). Never show the transliteration: the team does not show adhkar in non-Arabic letters, and pronunciation is taught with the audio.
- **No counter and no tracking:** `REPEAT` is shown as text («3 مرات»), never as a tap counter.
- Show the source with each dhikr: *Hisn al-Muslim*, hisnmuslim.com.
