# Approved sources and how we may use them

"Approved" means the source is Sharia-acceptable for Rafeeq (the challenge package's list plus the team's additions 💬). Whether we may **store, index and quote** it at runtime depends on its license. Details and citations: `research/03`.

**Usage modes**
- **Index:** may be stored, indexed for retrieval (RAG), and quoted in answers, unmodified and with attribution.
- **Link:** cite and deep-link only; do not copy content into the app or the index until written permission exists.

| Source | What it gives us | Access | Terms (summary) | Mode now |
| --- | --- | --- | --- | --- |
| **QuranEnc** (ICSA) | Quran text + 76 translations in 56 languages incl. Tagalog (Rowwad) and Cebuano, footnotes, per-ayah translation audio | REST, no key; SQLite/PDF/EPUB downloads | No modification; cite QuranEnc.com; show version; keep updated; no inappropriate ads. Policy explicitly allows apps, offline storage, RAG and AI assistants | **Index** |
| **HadeethEnc** (ICSA) | Hadith with grade, explanation, lessons; 72 languages incl. Tagalog | REST, no key | Same terms as QuranEnc | **Index** |
| **IslamHouse** (ICSA) | Books, articles, audio, video for new Muslims; 147 languages (Tagalog: 227 books, 514 videos) | REST v3 with a public key; request our own key | Apps, commercial, offline, RAG/AI allowed; text unchanged; summaries must not be presented as their edition. Written confirmation: admin@islamhouse.com | **Index** |
| **Bayan al-Islam** (ICSA) | Content for new Muslims and non-Muslims; 131 languages (Tagalog 291 items) | REST, no key | Own terms unclear; files hosted on IslamHouse | **Index** for IslamHouse-hosted files; confirm terms |
| **Quranpedia** | Mushaf text, tafsir, 142 translation books, versioned dumps | REST (120 req/min), dumps | Free inside apps; credit Quranpedia and dump version if republishing; no bulk scraping | **Index** |
| **King Fahd Quran Complex** | Official Hafs text and fonts | Downloads | Font: use and distribute, no modification. Data redistribution in a public repo unclear | Index text; confirm repo redistribution |
| **binbaz.org.sa** | Fatwas and articles of Sheikh Ibn Baz | Website, no API | "Copying is permitted for every Muslim provided the source is cited" | **Index** with citation; confirm for AI use |
| **islamqa.info** | General Q&A and fatwas, 17 languages (no Tagalog) | No API | "Personal uses permitted"; no commercial use | **Link** until permission |
| **dorar.net** | Tafsir, hadith, aqeeda, fiqh, history encyclopedias | Hadith-search JSONP only; bot-blocked | Copying and use not permitted | **Link** until permission |
| **islamic-content.com** (Jamhara) | Encyclopedia and dictionary of Islamic terms (approved glossary) | No API | Personal non-commercial use only | **Link**; request data access for the glossary |
| **dawa.center** (incl. Bayyinat Q&A) | Da'wa repository; Bayyinat answers to doubts | Feed and PDFs | No terms stated | **Link** until permission |
| **shamela.ws** | Classical books | API with key | No terms found | **Link** until permission |

## Learning path content (Learning domain, `LRN-01`)

Chosen by the Learning owner and Sharia reviewer (مهند بن صالح الفوزان) on 2026-10-05. Local copies are git-ignored in `docs/domains/learning/learning sources/`; only these records are committed.

| Source | Use in Rafeeq | Where | Terms (summary) | Mode now |
| --- | --- | --- | --- | --- |
| **Step photos** from the Arabic PDF of المختصر المفيد | 21 photos (WebP, transparent, no text) in `content/units/unit-01/images/`, shown on wudu and prayer step cards (LRN-01) | Extracted from the PDF (IslamHouse 2831443) | Covered by the author's permission; removable as content | **Committed** |
| **newmuslimguideline.com** — the book's official project site (المختصر المفيد للمسلم الجديد / New Muslim Guideline) | **The single text source for all three languages** (decision 2026-10-05): clean Arabic of the same edition as the PDF (8 wudu steps, 12 prayer steps), and the project's own English and Filipino translations, which follow the same 8 steps | Site pages `/`, `/English`, `/Filipino`; also BOOK.pdf, MOBILE.pdf and a PPSX per language; local text copies in the git-ignored sources folder | No terms stated on the site; covered by the author's permission (below). Remove invisible formatting characters and kashida only; never change letters. Hide transliterated lines (the Filipino and English pages contain some) | **Index** |
| **المختصر المفيد للمسلم الجديد** — محمد بن الشيبة الشهري (Arabic) | Reference edition (same text as the official site); PDF used for step photos | IslamHouse item 2831443 (also Bayan al-Islam 21217); same file as the local PDF | IslamHouse policy (apps, offline allowed; text unchanged; summaries not presented as their edition). Permission to use the whole book obtained by مهند بن صالح الفوزان (reported 2026-10-05 💬) | **Index** |
| **New Muslim Guideline** — Muhammad al-Shehri (English, 1441 H / 2020) | Alternate English translation, not used (the official site's English is used) | Bayan al-Islam item 4784 (`cdn.byenah.com`) | Bayan's own terms unclear (see Bayan row above); not hosted on IslamHouse ⚠️ | **Index** pending written confirmation |
| **Ang Pinaiksing Makatuturan Para sa Muslim** — Muḥammad Ash-Shahrīy (Tagalog, revised 04/05/1443 H / 09/12/2021) | Alternate Tagalog translation of a revised edition (10 wudu steps), not used (the official site's Filipino is used) | IslamHouse item 2835963 (listed with a Swahili title) | IslamHouse policy | **Index** |
| **كيف أتوضأ؟ / How to perform wudu'** — مركز أصول (Osoul Center) video | Optional support video, wudu lessons | IslamHouse 2834583 (Arabic, 7:17), 2834586 (English, 7:17, same footage) | IslamHouse policy; served from Rafeeq, never embedded from a video platform | **Index** pending written confirmation |
| **كيف أصلي؟ / HOW CAN I PRAY?** — مركز أصول (Osoul Center) video | Optional support video, prayer lessons | IslamHouse 2832089 (Arabic, 13:42), 2838921 (English, 13:59; its video track did not play in a test browser ⚠️) | Same as above | **Index** pending written confirmation |

| **المختصر في تفسير القرآن الكريم — سورة الفاتحة** (audio: recitation by صابر عبد الحكم + tafsir read by عبد الله الأسمري; مركز تفسير) | Al-Fatiha audio for Arabic learners (LRN-01 rule 4) | IslamHouse audio 2831350 | IslamHouse policy | **Index** |
| **Explanation of the meanings of the Noble Quran in English — Al-Fatihah** (Rowad Translation Center; recitation by Saad Al-Ghamdi, then the English meaning, verse by verse) | Al-Fatiha audio for English learners | IslamHouse audio 2839573 | IslamHouse policy | **Index** |
| **Pagsasalin ng mga kahulugan ng Banal na Quran (Tagalog) — Al-Fatihah** (recitation by Mishary Al-Afasy, then the Tagalog meaning, verse by verse) | Al-Fatiha audio for Tagalog learners | IslamHouse audio 2839167 | IslamHouse policy | **Index** |

Prayer adhkar have **no separate audio** (decision 2026-10-05): Arabic and English learners hear them in the Osoul prayer video; Tagalog learners get the book's reassurance and are invited to learn them with their mentor. Reviewed and not used: Hisn al-Muslim audio books (IslamHouse 263352, 2799103), the Quran "teaching mushaf" sets (Juz' 'Amma only, no Al-Fatiha), EveryAyah (no stated terms). All audio must be listened to in full by the Sharia reviewer before use (no music or effects).

Not yet used: no Tagalog wudu/prayer video matches the Osoul description (IslamHouse 2832524 is a different production by Sh. Haitham Sarhan). Reviewed for later units: الوجيز (مركز أصول, free with attribution and no change to the text), منهج تعليم المسلم الجديد (Zulfi dawah association, ordering reference only, no terms found).

Every video must be watched in full by the Sharia reviewer before use (no music or effects, description matches the book).

## Tools (no Sharia content, license only)

| Tool | Use | License |
| --- | --- | --- |
| `adhan` (batoulapps) | Prayer times and qibla, on-device | MIT |
| `Intl` `islamic-umalqura` calendar | Hijri dates, built into browsers | Built in |
| Amiri Quran, Scheherazade New | Arabic and Quran fonts | SIL OFL 1.1 |
| GeoNames extract | Offline city picker | CC BY (credit link) |
| ICSA MCP server (`islamic-content-mcp-server`) | Developer access to ICSA sources | ISC per repo; confirm official status |
| Thmanyah (Sans, Serif Display, Serif Text) | Brand typeface | Licence https://font.thmanyah.com/licenses: free for commercial use incl. embedding in web/mobile apps as part of the bundled product; **no redistribution, hosting for download, or modification**. Download only from font.thmanyah.com; files kept in git-ignored `design-system/public/fonts/thmanyah/`, never committed |
| IBM Plex Sans Arabic, Noto Naskh Arabic (`@fontsource`) | Self-hosted fallback fonts for UI and reading | SIL OFL 1.1 |
| Tabler Icons (`@tabler/icons-react`) | Icon set named in the brand guide | MIT |
| shadcn/ui, Radix UI, Tailwind CSS, Vite, React, sonner, vaul, input-otp, `@shadcn/react` | Design-system code (`design-system/`) | MIT |
| Agent skills in `.claude/skills/` | shadcn (MIT), Anthropic Design plugin (Apache-2.0), cuellarfr/design-skills (MIT), design-system-ops subset (MIT), Emil Kowalski mobile-native/animate/break-ui (MIT), pwa-skill-suite pwa-rtl (MIT); licence file kept in each skill folder. `frontend-design` is Anthropic's official plugin (installed via the plugin directory, not vendored) | As listed |

## Avoid

- **Aladhan API** for production: sends the user's location to a third party.
- **Quran Foundation (Quran.com) API**: requires a backend secret, forbids caching beyond one week and prepackaged databases, and requires consent for ML use.

## Permission requests to send (owner: Knowledge & Ask)

islamqa.info · dorar.net · islamic-content.com (glossary data) · dawa.center (Bayyinat) · shamela.ws · King Fahd Complex (repo redistribution) · IslamHouse (own key + written confirmation, including: self-hosting the Osoul videos and the Al-Fatiha audio files) · mp3quran.net and EveryAyah (audio terms).
