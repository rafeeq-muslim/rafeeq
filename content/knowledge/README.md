# Knowledge content

Content the Ask assistant (KNW-01) reads at run time, and the question sets that measure it (KNW-04, KNW-01 §10.2, KNW-02 §9).

| File | What it holds |
| --- | --- |
| `approved-answers.json` | Saved answers for frequent questions (KNW-01 R7). Only `status: "approved"` is ever served. |
| `danger-phrases.json`, `screen-phrases.json`, `fixed-replies.json` | Danger and manipulation screening, and the fixed replies. `status: "approved"` since 2026-10-06 by the product owner's blanket approval (`approved_by`, `approved_on`); not reviewed by the Sharia reviewer (`reviewed_by` empty). |
| `eval/questions.jsonl` | KNW-04 reliability set (see `eval/README.md`). |
| `eval/reference-set.jsonl` | Reference set with expected sources for KNW-01 §10.2 and KNW-02 §9. |

## Review drafts (KNW-01 R7, KNW-01 §10.2, KNW-02 §9)

Both files below were **drafted by Claude on 2026-10-06** from passages in the production `knw_passages` table. Every passage id, `source_id`, `ref_key` and `version` was read from the database, not typed by hand. Nothing in them counts until a person reviews it.

### Approved answers: مهند approves

`approved-answers.json` holds answers to the three knowledge starter suggestions in Ask (`ask.suggest.1–3`: the meaning of the shahadatayn, the virtue of wudu, treating parents well), in Arabic, English and Tagalog. Tagalog is included because HadeethEnc and QuranEnc have Tagalog passages for all three.

- All 9 entries have `status: "approved"`, `reviewer: "مهند بن صالح الفوزان"` and `approved_at: "2026-10-06"`, with a `note`; the Tagalog wording still needs a native reader. They are served by default (`ASK_APPROVED_FAQ_ENABLED`, false turns it off). The server serves only `approved` entries with a reviewer and a date (`backend/app/knowledge/ai/screen.py`, `backend/app/knowledge/approved.py`), so a draft or returned entry is never shown to users.
- Each answer is built only from its cited passages. `{{q:ID}}` markers show the stored Quran or hadith text, and `source_versions` records the version of each source that was used.
- **The Sharia reviewer مهند بن صالح الفوزان approves each answer.** To approve one, set `status` to `"approved"`, `reviewer` to his name and `approved_at` to the date. If a cited source is removed or its version changes, set the answer back to `draft` until he reviews it again (R7).
- A Tagalog reader should still check the Tagalog wording (مهند approved the Tagalog and English answers on the strength of the approved Arabic ones).
- The answers cite only sources that are on the default answer list (`KNW_ANSWER_SOURCES`). They don't cite islamqa.

### Reference set: مسلّم confirms the expected sources

`eval/reference-set.jsonl` has one question per line. It uses the KNW-04 fields (`id`, `lang`, `text`, `kind`, `expected_route`, `expected_action`, `must_cite`), so `app.knowledge.eval.questions.load(path)` accepts it. It adds these fields:

| Field | Meaning |
| --- | --- |
| `category` | `covered` (evidence found), `overlap` (evidence in both islamqa and binbaz) or `negative` (safety and out-of-scope cases) |
| `source_family` | `islamqa`, `binbaz`, `both`, or `core` (QuranEnc, HadeethEnc, IslamHouse) |
| `negative_type` | `personal`, `danger`, `out_of_scope`, `manipulation` or `uncovered` |
| `expected_outcome` | `answered`, `referral`, `danger`, `refused` or `no_source` |
| `expected_sources` | The passages checked to contain the answer: `id`, `source_id`, `ref_key`, `version`. `must_cite` holds the same ids. A trailing `:` (e.g. `islamqa:ar:83172:`) accepts any part of a split passage |
| `evidence`, `suggestion_key` | What the passage says, and which Ask suggestion the question tests |
| `status`, `reviewer` | `"draft"` and `null` until reviewed; `"confirmed"` and who confirmed |

What "islamqa family" and "binbaz family" mean here: the evidence was confirmed in that source, and a title search found no matching passage in the other one. binbaz has no English passages. A title search is not proof that the other source has nothing, so the reviewer confirms the family.

- **مسلّم بن عبدالعزيز العمير (Knowledge owner) must confirm every row's expected sources before the row counts toward an acceptance gate**: Recall@8 per source family (KNW-02 §9) and first-attempt success (KNW-01 §10). Until then, a gate result on this set is only an indication.
- **2026-10-06:** all 62 rows are `"confirmed"` by the product owner's blanket approval (`reviewer`: "product owner blanket approval 2026-10-06 (ناصر بن عبدالعزيز العويمر)"). مسلّم has not checked them row by row; when he does, he fixes rows and sets `reviewer` to his name.
- To confirm a row, set `status` to `"confirmed"` and `reviewer` to his name. Fix or remove expected sources that don't actually answer the question. Don't remove hard questions after seeing results (KNW-02 §9).
- `uncovered` rows were written so that no source should answer them. مسلّم confirms that no passage does.
