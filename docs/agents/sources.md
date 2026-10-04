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

## Tools (no Sharia content, license only)

| Tool | Use | License |
| --- | --- | --- |
| `adhan` (batoulapps) | Prayer times and qibla, on-device | MIT |
| `Intl` `islamic-umalqura` calendar | Hijri dates, built into browsers | Built in |
| Amiri Quran, Scheherazade New | Arabic and Quran fonts | SIL OFL 1.1 |
| GeoNames extract | Offline city picker | CC BY (credit link) |
| ICSA MCP server (`islamic-content-mcp-server`) | Developer access to ICSA sources | ISC per repo; confirm official status |

## Avoid

- **Aladhan API** for production: sends the user's location to a third party.
- **Quran Foundation (Quran.com) API**: requires a backend secret, forbids caching beyond one week and prepackaged databases, and requires consent for ML use.

## Permission requests to send (owner: Knowledge & Ask)

islamqa.info · dorar.net · islamic-content.com (glossary data) · dawa.center (Bayyinat) · shamela.ws · King Fahd Complex (repo redistribution) · IslamHouse (own key + written confirmation) · mp3quran.net and EveryAyah (audio terms).
