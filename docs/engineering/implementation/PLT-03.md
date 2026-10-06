# PLT-03 languages and direction: implementation

**Feature:** `docs/domains/platform/features/PLT-03-languages-and-direction.md` (PR #25) · **Rules touched:** `rules.md` §1.2 (approved glossary over machine translation), §1.3 (scripture from stored records) · **Written:** 2026-10-06 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 three languages, change any time, progress kept | `frontend/src/app/i18n/*`, `stores/device.ts` (locale) apart from `stores/learning.ts` | Existing; tested |
| R2 RTL for Arabic, LTR for the others, arrows mirror | `i18n/index.ts::dirOf`, `AppLayout.tsx::useDocumentLocale` (`<html dir lang>`), arrows drawn for RTL with `ltr:rotate-180` | Existing; tested |
| R3 scripture stays Arabic RTL with its meaning after it | `lesson/VerseBlock.tsx` (`<blockquote lang="ar" dir="rtl">`, then the translation) | Existing; tested inside an LTR Tagalog page |
| R4 Latin digits | `i18n/index.ts::num` (`en-US`), dictionaries | Existing; test also checks no Arabic-Indic digit in any dictionary |
| R5 approved glossary term | KNW-03 service `GET /api/glossary`; `frontend/src/app/lesson/GlossaryText.tsx` in `pages/Lesson.tsx::CardView` | Lesson cards mark the first occurrence of each approved term (or approved alternate, whole words) as a quiet button that opens its approved definition; the text itself is never changed (KNW-03 R4) and hadith cards and verses are never marked. Terms come only from the approved snapshot of the learner's language; none → the card as it is (R5). ⚠️ `content/glossary/terms.json` is still empty (KNW-03 open question: the reviewer picks the first terms), so nothing is marked yet; it works as soon as terms are approved. The assistant's use of terms is KNW-03 R3 (KNW agent) |
| R6 missing Tagalog falls back to English, never a key | `i18n/index.ts::translate` | **Changed:** a missing or empty string falls back to English, then Arabic, and never to the key (before: an empty string showed blank and a missing one could show the key) |

Content objects picked with `pick()` are unchanged: a missing translation of approved content stays empty rather than showing another language's approved text, since approval is per language (KNW-05 R6).

## 2. Tests

Backend: `test_knw03_glossary.py::test_plt03_r5_term_is_shown_with_its_approved_translation_not_a_machine_one`.

Frontend `src/app/lesson/GlossaryText.test.tsx` (`plt03_r5_*`): «Tawhid» shown with its approved explanation, text never changed, alternates and whole words, Arabic terms, no approved term → the card as it is, terms fetched for the learner's language.

Frontend `src/app/platform.rules.test.tsx` (`plt-03 …`): change language keeps three lessons; directions and the back arrow; verse RTL with meaning after; Latin digits and «244°»; missing Tagalog → English, never a key.
