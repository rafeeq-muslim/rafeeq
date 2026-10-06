# Rafeeq learning content (محتوى التعلّم)

> **الحالة:** مسودة لم تُراجَع شرعيًا (`draft_unreviewed`). الوحدة الأولى «دليل اليوم الأول» جاهزة للبرمجة عليها، و**بقية الوحدات الخمس (LRN-09) قادمة** بالشكل نفسه. لا يُعرض أي محتوى للمستخدمين قبل اعتماد المراجع الشرعي (مهند بن صالح الفوزان) بكل لغة.
>
> **Status:** draft, not yet Sharia-reviewed. Unit 1 is ready to build against; **units 2–6 (LRN-09) are coming** in the same format. Nothing here is shown to users until the Sharia reviewer approves it, per language (`docs/agents/rules.md` §1.4).

## What is here

| Path | What it is |
| --- | --- |
| `quran_excerpts.json` | Verses the book quotes only in part (12 cards: 2 in unit 1, 10 in units 2–6): the word span of the stored verse to show per language, and the book's own translation of the quoted part; read by both builders and checked by both checkers |
| `objective_labels.json` | The learner's name for every objective of units 1–6 (ar/en/tl), read by both builders; a missing name stops the build |
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
| `objectives[]` | `id`, `text` (the team's wording, never shown to learners), `label` (the short name a learner reads, from `objective_labels.json`; LRN-10 R1) |
| `cards[]` | `id`, `kind` (`text`, `quran`, `hadith`, `fatiha`, `reassurance`), `text`, `provenance` (source and section, never shown on the card), `objectives`, optional `image`, `extra_images`, `ref` (surah:ayah), `quran_ref`, `quran_text`, `audio`, `edited`, `note`, `verify`, `excerpt`, `contains_hadith` |
| `exercises[]` | `id`, `type` (`choice`, `order`, `match`), `objectives`, `prompt`, `explain_card` (the card shown after a mistake and used for «لماذا؟»), and `options` + `answer`, or `items` + `answer` (correct order of ids), or `pairs` |

Rules the checker enforces: every objective has at least two exercises and at least one card; every card is linked to an objective; IDs are unique; answers exist; images exist; no transliterated adhkar or Quran in English or Filipino.

## Before anything is shown to users

1. Several review passes of all text, objectives and exercises (Claude), then the Sharia reviewer's approval per language.
2. Verify every `verify` item (verses, hadiths), including the known Filipino reference error in `u01-l2-c1`.
3. Listen to the three Al-Fatihah audio sources and watch the two Osoul videos in full (no music, and matching the book).

---

> **Note (Claude, 2026-10-06):** the section below documents the earlier pipeline (`units.json` + `lessons/*.json`, built by `tools/build.py`) that produced units 2–6. Unit 1 is served from مهند's `units/unit-01/unit.json` above, which replaces the pipeline's unit 1 (teammates' content wins over Claude drafts).

## Learning content — units 1–6 (LRN-01, LRN-03, LRN-09, LRN-10)

**Status: every lesson is `in_review` in ar/en/tl.** Nothing here may be shown to learners until the Sharia
reviewer (مهند بن صالح الفوزان) approves it per language (rules.md 1.4; LRN-01 rule 6), including every wrong
option of every exercise.

## Files

| File | What it is |
| --- | --- |
| `units.json` | 6 units: title, badge name, lesson ids, source credit (ar/en/tl) |
| `lessons/u1-l1.json` … `u6-l4.json` | 25 lessons: cards, objectives, exercises, `dropped`, `notes`, `review_status` |
| `day-one-media.json` | Al-Fatiha audio (ar/en/tl) and the Osoul wudu/prayer videos (ar/en), from the IslamHouse API |
| `unplaced.json` | Book text that no PRD lesson covers (the istinja paragraph), kept for the reviewer to place |
| `tools/` | The scripts that produced and checked everything, the text snapshots, and two reports |

`tools/`: `linearize.py` (site HTML → numbered text), `sheet_snapshot.py` (spreadsheet → numbered text),
`spec_u1.py`…`spec_u6.py` + `spec_units.py` (which lines go in which card; objectives; exercises),
`build.py` (writes the JSON), `validate.py`, `fetch_media.py`, `compare_sheet_site.py`,
`source/` (the snapshots the cards are cut from), `verses_moved_to_quran_field.txt` (every verse removed
from a card, with its reference), `sheet_vs_site.txt` (all wording differences spreadsheet ↔ site).

## Sources of the text

| Language | Source of card text |
| --- | --- |
| Arabic, English | The aligned Arabic/English spreadsheet of «المختصر المفيد للمسلم الجديد» supplied by the coordinator (258 rows; `page_number` 1–10). Not committed. |
| Filipino (tl) | The book's official site, page `/Filipino` (saved 2026-10-05) |
| Step photos | The official site, page `/` (Arabic), wudu tabs 2–8 and prayer tabs 2–13 |

The coordinator asked to prefer the spreadsheet wording where it differs from the site. It agrees with the
printed Arabic book (IslamHouse 2831443, checked page by page) where the site is wrong, e.g. «الزبور: أنزله الله
على نبيه داوود» (the Arabic site says «عيسى»). **This departs from `docs/agents/sources.md`, which names the site as
the single text source; the spreadsheet is not yet in the sources/licenses log and its origin is not recorded.**
The product owner should record it (rules.md 5) or tell us to switch back — switching back only means pointing
`SOURCE_FILES` in `build.py` at the site snapshots and re-cutting the ar/en card references.

The printed Arabic PDF (IslamHouse 2831443) and the printed English PDF from the site were used only to check
step numbering, page numbers and two disputed wordings; no card text was taken from them.

## How the files were produced

```
python3 tools/linearize.py <saved site page>.html tools/source/{ar,en,tl}.txt   # site snapshots
python3 tools/sheet_snapshot.py <book>.xlsx                                       # ar_sheet.txt, en_sheet.txt
python3 tools/build.py          # writes units.json, lessons/*.json, unplaced.json
python3 tools/fetch_media.py    # writes day-one-media.json (IslamHouse API, 30 s timeout per call)
python3 tools/validate.py       # must print PASS
python3 tools/compare_sheet_site.py   # writes tools/sheet_vs_site.txt
```

Card text is never typed: each card line is cut from a snapshot by line number and start/end markers. After
building, `build.py` proves that **every letter of each lesson's section is in exactly one card, in `dropped`,
or inside a Quran verse moved to the `quran` field**; `validate.py` independently proves that every card line is
made only of pieces of the source, in source order.

### Exact cleanup applied to the book text

1. Invisible formatting characters removed (Unicode category Cf: LRM/RLM, LRO/PDF, zero-width marks, BOM…).
2. Tatweel/kashida (U+0640) removed (e.g. «العـذار» → «العذار»; the spreadsheet used tatweel as a list dash).
3. Whitespace collapsed; one sentence that the site split over two blocks is re-joined with one space.
4. Spreadsheet Arabic only: the honorific written out as «-صلى الله عليه وسلم-» is shown as the sign «ﷺ», the form
   of the printed book and the site (same words; the dashes were typographic).
5. A list bullet at the start of a line («•», «*», «-») is removed; list numbers stay as the source has them.
6. Where text was dropped (below), the space left before `. , ; : )` is closed up. No letter was changed, added,
   paraphrased, shortened (beyond the recorded drops) or translated.

### What was taken out of cards (all recorded in each lesson's `dropped`, 112 entries)

* **Transliteration** in en/tl: Al-Fatiha, every dhikr, the opening supplication, the Tashahhud, the salam, the
  divine names written in Latin letters (e.g. "Ar-Razzāq:"), and Arabic phrases in Latin letters ("la ilaha illa
  Allah", "Hadath Akbar/Asghar", "Asmaa was sifaat", "lawhul mahfudh", "Subhān Allah").
* **Step labels** "الخطوة N:", "Step N:", "Final Step:" (LRN-01 rule 3: no step number on the card).
* Lines that **repeat the section title** (shown as the lesson title instead), and two site defects in Filipino
  (an English heading; the step-11 text duplicated inside the step-12 tab).
* **Quran verses**: the verse text, its bracketed reference and the punctuation right after it are removed and the
  card gets `"quran": {"sura", "ayat"}` (31 cards). Display contract: **card text first, then the verse from the
  Quran database**. Cards end where a verse begins and the next card resumes after it. Two cards have an empty
  text in one language because the book gives only the verse there (u2-l1-c3 tl, u6-l2-c1 en).

## Counts

| Lesson | Cards | Objectives | Exercises | Dropped |
| --- | --- | --- | --- | --- |
| u1-l1 أشهد | 4 | 3 | 5 | 1 |
| u1-l2 قبل الوضوء | 5 | 3 | 6 | 0 |
| u1-l3 أتوضأ (1) | 4 | 3 | 6 | 10 |
| u1-l4 أتوضأ (2) | 6 | 4 | 9 | 8 |
| u1-l5 أتهيأ للصلاة | 4 | 4 | 8 | 7 |
| u1-l6 أصلي (1) | 7 | 4 | 7 | 24 |
| u1-l7 أصلي (2) | 8 | 4 | 8 | 39 |
| u2-l1 ربي الله | 5 | 3 | 5 | 0 |
| u2-l2 من أسماء ربي الحسنى | 4 | 4 | 8 | 13 |
| u2-l3 نبيي محمد ﷺ | 4 | 3 | 6 | 2 |
| u2-l4 القرآن كلام ربي | 3 | 3 | 5 | 0 |
| u3-l1 أركان الإسلام الخمسة | 3 | 2 | 5 | 1 |
| u3-l2 الصلاة والزكاة | 7 | 3 | 7 | 0 |
| u3-l3 الصوم والحج | 5 | 3 | 6 | 0 |
| u4-l1 الإيمان بالله | 7 | 4 | 8 | 2 |
| u4-l2 الملائكة والكتب | 8 | 4 | 8 | 0 |
| u4-l3 الرسل واليوم الآخر | 6 | 4 | 7 | 0 |
| u4-l4 القدر | 3 | 3 | 6 | 1 |
| u5-l1 المسح على الخفين | 6 | 4 | 9 | 2 |
| u5-l2 الغسل | 3 | 3 | 5 | 0 |
| u5-l3 التيمم | 3 | 3 | 6 | 0 |
| u6-l1 حجاب المرأة المسلمة | 3 | 3 | 6 | 0 |
| u6-l2 من صفات المؤمن | 4 | 4 | 8 | 2 |
| u6-l3 سعادتي في ديني (1) | 7 | 4 | 7 | 0 |
| u6-l4 سعادتي في ديني (2) | 7 | 4 | 8 | 0 |
| **Total** | **126** | **86** | **169** (124 choose, 34 match, 11 order) | **112** |

Validation (`tools/validate.py`): **PASS** — schema, unique ids, every card in ≥ 1 exercise, every objective in ≥ 2
exercises, 2–4 objectives with exactly 2 `key`, answers point at existing ids, order 3–8 items, match 2–4 pairs,
wudu = 8 step cards and prayer = 12 step cards, all three languages present, no transliteration pattern and no
Arabic script (other than ﷺ ﷻ) in en/tl text, no verse text in cards, every card line traceable to the source.

## Judgement calls (for the reviewer)

1. **Text source** — ar/en from the spreadsheet, tl from the site (see above). Conflicts with sources.md.
2. **Transliteration rule applied at clause level.** LRN-01 rule 4's example keeps the step text "without the
   dhikr in Latin letters". When a transliterated dhikr was dropped, its English/Filipino meaning in brackets and
   the words that introduce it ("I say …", "saying: …") were dropped with it, so that a learner is not led to
   recite a translation in prayer; the action stays. Result: English/Filipino prayer cards describe the movements
   but not what is said (e.g. en step 8 now reads "prostrate on my hands, knees, feet, forehead and nose."). The
   Arabic cards keep every dhikr in Arabic. Reviewer may prefer to keep the meanings.
3. **Single-word Arabic terms stay** in en/tl (Wudu, Salah, Zakah, Niyyah, Ruku‘, Sujūd, Tashahhud, Shahādah,
   Imān, Ghusl, Tayammum, Khuff, Mahram, Riba, Tawheed, Ruboobeeyah, Uluhiyah, Qadar, Jibreel/Jibril…); multi-word
   Arabic phrases and names of Allah in Latin letters were dropped.
4. **Prayer = 12 steps** as in the printed book: the two Tashahhud paragraphs belong to step 11 (pp. 104–106), so
   u1-l7 has step 11 + two "step 11" text cards. The site shows them as a 13th tab.
5. **Istinja paragraph not placed** (site tab3_10, printed p. 74): outside the PRD range for u1-l4 (67–73) and
   absent from the spreadsheet. Its three-language text is in `unplaced.json`.
6. **Lesson boundaries**: u1-l2 also takes the verse on p. 60; u1-l5 also takes the "five prayers" sentence that
   opens the prayer section; u2-l1/u2-l2 split at «من أسمائه الحسنى»; u3-l1 = pillars intro + one review card
   (its exercise counts toward the u1-l1 objectives; the two pillar-1 verses are not repeated); u6-l3/u6-l4 split
   at the paragraph «تلك الحلاوة» (spreadsheet rows 252/253, p. 122).
7. **Verse references** follow the Arabic where translations cite wrongly: 2:222 (spreadsheet/tl say 2:22), 2:183
   for fasting (spreadsheet ar/en and tl say 2:110), 16:97 for u6-l3 (tl quotes a different verse, 4:124).
8. English u4-l1-c7: the words in braces "{there is nothing like unto Him…}" were dropped as a Quran quotation; the
   Arabic keeps «وأنه ليس كمثله شيء وهو السميع البصير» because it is written as prose.
9. **Hadith** are kept as the book quotes them (no hadith database id yet). rules.md 1.3 asks for hadith by id with
   source and grade — needs a decision.
10. Book typos and translation slips are kept verbatim and listed: en "read s the Qur’an" (u6-l4-c5); en third
    wudu nullifier numbered "4-"; en sideburns sentence repeated in fragments (u1-l4-c2); tl hijab rule 3 repeated
    as rule 4 (the "loose, not tight" rule is missing in tl); Arabic «الُحسنى», «وخالقة», «وحدة».
11. **Language gaps**: tl lacks the two sentences on obeying the Prophet ﷺ and the message of all prophets
    (u2-l3), the sentence on ghusl after menstruation (u5-l2), and adds items to the Last Day list (u4-l3); the tl
    reflection on creation (u2-l2-c4) differs in detail. Exercises use only facts present in all three languages.
12. **Disputed points kept out of exercises**: number of strikes in tayammum, wiping the head more than once,
    a junub passing through a masjid, when the wiping period starts, cloth socks, the mahram list details.
13. **Wrong options** are the contrary of a card statement, or another fact from the same lesson that does not
    answer the question; a few creed questions use sentence-completion or sentence-ordering to avoid putting false
    statements about Allah in front of learners. Some wrong options still state a falsehood (e.g. "Something in
    His creation is like Him") — reviewer to accept or replace.
14. **Key objectives** (two per lesson, for the placement test) were chosen by me; u1-l5 marks purity and dress
    as key rather than the "if you have not memorised the words" objective.
15. **Images**: step cards only (unit 1). The photos show an ordinary present-day man (checked two of them),
    not a prophet or companion; units 2–6 use no image although the site has tab images for wiping, ghusl and
    tayammum.
16. Unit and badge names, objectives and all exercise prompts/options are my own wording (not Sharia text);
    the **Tagalog exercise text needs a native speaker's review**.

## Spreadsheet vs website (full list: `tools/sheet_vs_site.txt`)

Wording differences that matter (harakat-only differences — 58 ar / 99 en sentences — are counted, not listed):

| Where | Spreadsheet (used) | Website |
| --- | --- | --- |
| u4-l2 الزبور | «أنزله الله على نبيه **داوود**» (= printed book, en, tl) | «… نبيه **عيسى**» — error |
| u5-l1 مبطلات المسح | «ما يوجب **الوضوء أو** الغسل» (= printed Arabic book); en sheet "Wudū' or Ghusl" | «ما يوجب الغُسل»; en site and printed English book "Ghusl"; tl "paligo" only — **fiqh difference, reviewer must decide** |
| u2-l2 الخالق | «مُوْجِدُ الأشياءِ ومُبْدِعُها» | «… ومُخْتَرِعُها» (= printed book) |
| u2-l2 names | "name: meaning" in one line | names only as tab labels |
| u2-l3, u1-l2 | «على الخير»، «وبقي على أصل خلقته» | «علي» (typo) |
| u6-l4 closing | «… وصحبه أجمعين» | «… وصحبه» |
| en honorific | "(pbuh)" (= printed English book) | "(Allah’s prayers and peace be upon him)" — abbreviating the salawat is disliked by many scholars; reviewer |
| en u3-l3 fasting | "abstaining from eating, drinking, and sexual intercourse" | adds "and other things that break the fast" |
| en u4-l3 Last Day | "… Paradise, Hell, etc." | "… and other things related to the Last Day" |
| en u1-l4 face | 3 sentences (two are fragments) | 6 sentences incl. Al-Eadhar / Al-Baiad definitions |
| en u1-l5 | "a must covered body parts" | "body parts that must be covered during prayer" |
| en u2-l2 | names list fully transliterated (dropped) | same |
| en Al-Fatiha | transliteration + meaning (moved to quran / dropped) | meaning only |
| tl | — (site only) | — |

The spreadsheet has no istinja paragraph and no step tab for «صفة التيمم» as a heading; the site's extra English
face-boundary sentences are not in the spreadsheet and therefore not in the cards.

## Media (`day-one-media.json`)

Fetched from the IslamHouse API (key from sources.md; a curl User-Agent was needed, the default Python one got 403):

* Al-Fatiha ar 2831350 — one mp3 (recitation + Al-Mukhtasar tafsir); en 2839573 and tl 2839167 — seven mp3s each,
  one per verse (recitation then meaning), listed in verse order in `mp3_urls`.
* Videos: wudu ar 2834583, en 2834586; prayer ar 2832089, en 2838921. The English prayer video is a LINK attachment
  on `ih-download.islamenc.com` with size "0 B" (the LRN-01 open question about this file stands). No Tagalog video.
* Every file must be heard/watched in full by the reviewer; IslamHouse written confirmation is still pending.

## Not done / open

* The unit-1 source credit must also name the Al-Fatiha translation and its version (QuranEnc terms, LRN-01 rule 3)
  once the app's Quran translation is chosen — not invented here.
* Hadith ids/grades (judgement 9), the spreadsheet's licence record (judgement 1), the wiping-nullifier wording.
* The istinja paragraph needs a place in the path (or a decision to leave it out).
