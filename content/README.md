# Rafeeq learning content (محتوى التعلّم)

> **الحالة:** مسودة لم تُراجَع شرعيًا (`draft_unreviewed`). الوحدة الأولى «دليل اليوم الأول» جاهزة للبرمجة عليها، و**بقية الوحدات الخمس (LRN-09) قادمة** بالشكل نفسه. لا يُعرض أي محتوى للمستخدمين قبل اعتماد المراجع الشرعي (مهند بن صالح الفوزان) بكل لغة.
>
> **Status:** draft, not yet Sharia-reviewed. Unit 1 is ready to build against; **units 2–6 (LRN-09) are coming** in the same format. Nothing here is shown to users until the Sharia reviewer approves it, per language (`docs/agents/rules.md` §1.4).

## What is here

| Path | What it is |
| --- | --- |
| `units/unit-01/unit.json` | Unit 1 «دليل اليوم الأول» (LRN-01): 7 lessons, 21 learning objectives, 39 cards, 43 exercises, in Arabic, English and Filipino |
| `units/unit-01/images/` | 21 step photos from the Arabic edition (WebP, transparent background, no text), about 0.6 MB |
| `units/unit-01/build_unit.py` | How `unit.json` was built from the book's site text (needs the git-ignored source texts) |
| `check_content.py` | Checker: run it after every edit |

```bash
python3 content/check_content.py content/units/unit-01/unit.json
```

## Where the content comes from

- **Card text:** the book «المختصر المفيد للمسلم الجديد» by محمد بن الشيبة الشهري, from its official site **newmuslimguideline.com**, taken as written in all three languages (only invisible characters, kashida and list numbers are removed). The author's permission covers the whole book (`docs/agents/sources.md`).
- **Edits, all recorded in each card's `edited` field:** transliterated adhkar, Al-Fatihah and the shahada in the English and Filipino text are replaced with the Arabic wording from the Arabic edition (no transliteration, `rules.md` §1.4).
- **Verses and hadiths** are taken from the site, as the reviewer decided, and each carries a `verify` note: check verses against the King Fahd Complex text and QuranEnc, and link hadiths to HadeethEnc with source and grade, **before release**.
- **Objectives, exercises, unit and lesson names, the badge name and the credit text** were written by AI (Claude) from the book's information only, during content preparation (LRN-08 method). They are drafts for the Sharia reviewer.
- **Audio and video** links are listed under `media` (IslamHouse; `docs/agents/sources.md`). Serve them from Rafeeq's own storage.

## File format (`unit.json`)

Every user-facing text is an object `{"ar": …, "en": …, "tl": …}`.

| Field | Meaning |
| --- | --- |
| `status`, `review_note` | Review state of the whole unit |
| `title`, `badge`, `credit` | Unit name, its badge (MOT-03), and the one-per-unit source credit (LRN-01 rule 3) |
| `media.support_video.{wudu,salah}` | Support videos per language; `null` = no video in that language (LRN-01 rule 5) |
| `media.audio.fatiha` | Al-Fatihah audio per language (Arabic one file; English and Filipino verse by verse) |
| `omitted` | What was deliberately left out, and why |
| `lessons[]` | `id`, `order`, `title`, `support_video` (key into `media`, optional), `objectives`, `cards`, `exercises` |
| `objectives[]` | `id`, `text` (LRN-10) |
| `cards[]` | `id`, `kind` (`text`, `quran`, `hadith`, `fatiha`, `reassurance`), `text`, `provenance` (source and section, never shown on the card), `objectives`, optional `image`, `extra_images`, `ref` (surah:ayah), `quran_ref`, `quran_text`, `audio`, `edited`, `note`, `verify`, `excerpt`, `contains_hadith` |
| `exercises[]` | `id`, `type` (`choice`, `order`, `match`), `objectives`, `prompt`, `explain_card` (the card shown after a mistake and used for «لماذا؟»), and `options` + `answer`, or `items` + `answer` (correct order of ids), or `pairs` |

Rules the checker enforces: every objective has at least two exercises and at least one card; every card is linked to an objective; IDs are unique; answers exist; images exist; no transliterated adhkar or Quran in English or Filipino.

## Before anything is shown to users

1. Several review passes of all text, objectives and exercises (Claude), then the Sharia reviewer's approval per language.
2. Verify every `verify` item (verses, hadiths), including the known Filipino reference error in `u01-l2-c1`.
3. Listen to the three Al-Fatihah audio sources and watch the two Osoul videos in full (no music, and matching the book).
