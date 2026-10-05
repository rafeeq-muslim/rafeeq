# KNW-06 library: implementation

**Feature:** `docs/domains/knowledge/features/KNW-06-library.md` · **Plan:** `docs/domains/knowledge/implementation-plan.md` §8.3
**Written:** 2026-10-05 by Claude (overnight build, Discover half).

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 (only curated, reviewer-approved items) | `backend/app/knowledge/library.py` | `python -m app.knowledge.library --fetch` pulls **candidates** from IslamHouse API v3 (documented public key) — categories 179666 «Matters of New Muslim» and 221824 «New Muslims' Stories», source languages ar/en/tl, types books/articles/videos/audios — into `content/discover/library.json` (metadata and file URLs only). Every candidate is a review-desk item `library_item` (one language each); learners see only approved ones |
| R1 error (removed item / dead link hidden) | `library.py::check_library_links` (job, daily 03:00 UTC, `app/knowledge/jobs.py`) | HEADs every attachment URL of approved items; a dead item gets a `knw_library_items` row with `status = "hidden"`; the learner endpoint drops hidden ids. A link that works again is set back to `approved` |
| R2 (learner's language by topic; English on request) | `GET /api/discover/library?lang=` + `frontend/src/app/discover/Library.tsx` | Topics: `basics` (category 179666) and `stories` (221824). Tagalog topic with no items → empty note and a "show English items" button, which fetches `lang=en` |
| R2 error (mislabelled language) | reviewer | The desk view shows the item's declared language and file; the reviewer returns mislabelled ones (no code heuristic) |
| R3 (shown as in the source, with source card) | `LibraryItem.tsx` | Title, author/organisation, source «IslamHouse.com», language, type, origin link; the file opens unchanged from IslamHouse's file host |
| R4 (no unreviewed thumbnails) | data + UI | Thumbnails are never fetched or stored; every item shows a neutral Rafeeq petal tile |
| R5 (no ad/tracking platforms) | `library.py` | Only attachments on `d1.islamhouse.com` / `islamhouse.com` are kept; items whose files are elsewhere (e.g. a video platform) are dropped at fetch time |
| R6 (opening is not logged) | — | No event or log on open; the API is the same for everyone |

## 2. Endpoints

`GET /api/discover/library?lang=` → `{lang, topics: [{id, items: [{id, type, title, authors[], description, lang, origin_url, files: [{url, ext, size}]}]}]}`. Public cache; no identity.

## 3. Data

`content/discover/library.json` (candidate metadata, IslamHouse policy allows storage). `knw_library_items` (existing table) is used only for link health: `external_id`, `status` (`approved`/`hidden`), `last_checked_at`. No migration.

## 4. Tests (`backend/tests/test_knw06_library.py`)

| Example | Test |
| --- | --- |
| R1 ex1 (approved Tagalog book shown) | `test_knw06_r1_approved_item_is_listed` |
| R1 ex2 (unapproved never shown) | `test_knw06_r1_unapproved_item_is_hidden` |
| R1 ex3 (dead link hidden) | `test_knw06_r1_dead_link_is_hidden_after_check` |
| R2 ex1 (Tagalog items under topic) | `test_knw06_r2_items_in_learner_language_only` |
| R2 ex2 (no Tagalog → empty topic, English on request) | `test_knw06_r2_empty_topic_and_english_on_request` |
| R3 (title, author, source, language, type, origin link, file) | `test_knw06_r3_item_carries_source_card_fields` |
| R5 (no video-platform files) | `test_knw06_r5_non_islamhouse_files_are_dropped` |

## 5. Open decisions

- Topics are the two source categories, not the path's units (KNW-06 open question «ما الموضوعات؟»): mapping 200+ items to units needs the reviewer's time.
- Files stream from IslamHouse's own host; proxying through Rafeeq for learners who hide their Islam stays open (KNW-06).
