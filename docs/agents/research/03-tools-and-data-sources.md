# Rafeeq (رفيق): Tools and Data Sources — Feasibility, Licensing, Privacy

Research date: 2026-10-04. "Verified live" means I called the endpoint or read the file myself on that date. Numbers in brackets (e.g. [S5]) point to the source list in section 8. Where a license or term could not be found I write "unclear — contact needed". I did not confirm the challenge's "official reference package" itself; the approved-source list comes from the team brief.

## 1. Executive summary

- **Prayer times, Qibla and Hijri dates can run 100% on-device, offline, with no location sent anywhere.** Use `adhan` (MIT, zero dependencies, v4.4.6, Aug 2026) [S1][S3] for times and Qibla, and the browser's built-in `Intl` `islamic-umalqura` calendar for Hijri dates [S9]. Skip the Aladhan API: it would send coordinates to a third party [S5][S6].
- **The ICSA developer ecosystem (QuranEnc, HadeethEnc, IslamHouse) is the best fit for an open-source, free, privacy-minded app.** It needs no key for QuranEnc, HadeethEnc or Bayan al-Islam, and its published policy explicitly allows apps, commercial use, offline storage and "search, indexing, RAG, and AI assistants". The conditions are: unchanged text, clear source, version info, keep copies updated [S19].
- **Quran Foundation (Quran.com) API is a poor fit for this project.** It needs a backend-held OAuth secret, forbids caching over 1 week, forbids prepackaged databases and requires consent for ML models [S28]. Use Quranpedia, QuranEnc or the King Fahd Complex data instead.
- **Tagalog is better covered than expected.** QuranEnc has a Rowwad Tagalog translation with footnotes and per-ayah Tagalog audio [S18]. HadeethEnc has Tagalog hadith with explanations, including 151 seerah/history hadith [S20]. IslamHouse has 227 Tagalog books, 514 videos and more [S21]. Bayan al-Islam has 291 Tagalog items [S22].
- **Several approved sources have no reuse path.** dorar.net's FAQ says copying is not allowed and only a hadith-search JSONP API exists [S34]. Jamhara allows only "personal non-commercial" use [S35]. dawa.center/Bayyinat, Shamela and IslamQA have no stated license, or are restrictive [S36][S37][S38]. Plan on deep links plus written permission requests.
- **Web (PWA) cannot schedule offline adhan notifications reliably.** Chrome's Notification Triggers origin trial ended and launch is "not started" [S14], and iOS web push needs a home-screen install and a push server [S15]. Reliable adhan reminders mean a native wrapper (Expo/Capacitor local notifications [S16]) or an opt-in push server.
- **Content rule to bake in from day one:** no depiction of prophets or companions. The Saudi Permanent Committee fatwa rejects it even for "those new to Islam" [S44]. Do not play music or effects under Quran audio [S46].

## 2. Tools: options by area

Effort: H = hours, D = days. "1–3d" = feasible within the hackathon window.

### 2.1 Prayer times, Qibla, Hijri

| Option | What it provides | License / terms | Languages | Offline / privacy | Effort | Recommendation |
|---|---|---|---|---|---|---|
| **adhan-js** (batoulapps) | Times, Qibla(), SunnahTimes. Methods: MWL, Egyptian, Karachi, UmmAlQura, Dubai, Qatar, Kuwait, Moonsighting, Singapore, Turkey, Tehran, NorthAmerica, Other. Madhab, adjustments, rounding [S2] | MIT; v4.4.6 released 2026-08-31; no dependencies [S1][S3] | API in English; any UI | Pure computation, offline, no network | 4–8 H | **Use** (1–3d) |
| adhan-swift / adhan-kotlin | Same engine for native/React Native modules | MIT [S4] | n/a | Offline | later | Keep as the native fallback |
| Aladhan API | Times, Qibla, gToH/hToG, 20+ methods [S7] | No explicit license on the terms page [S5]. Staff reply: commercial use "Yes, you can", no SLAs [S6]. Rate limit ~12 req/s, 70 per 7 s [S6] | n/a | **Sends coordinates/city to a third party** | 2 H | Avoid in production. Optional test cross-check |
| PrayTimes.js | Times with high-latitude options | "License: GNU LGPL v3.0"; credit link to PrayTimes.org required [S8] | n/a | Offline | 4 H | Skip. adhan is MIT and more complete |

- **Umm al-Qura method.** Adhan's note says "add a +30 minute custom adjustment for Isha during Ramadan" [S2]. This matters for the Ramadan mode.
- **High latitude.** Adhan offers `MiddleOfTheNight`, `SeventhOfTheNight`, `TwilightAngle`, `HighLatitudeRule.recommended(coords)` and `PolarCircleResolution` (AqrabBalad/AqrabYaum). The Moonsighting method auto-applies 1/7 at or above 55° [S2]. Gulf-based users are rarely affected. A few Filipino users in Europe or Canada may be.
- **Method defaults (inference).** Pick the method by country: Umm al-Qura for Saudi Arabia, Qatar/Kuwait/Dubai methods for their countries. Aladhan's method table documents their parameters [S7].
- **Qibla.** `Qibla(coordinates)` returns degrees from North [S1]. On iOS the live compass needs `DeviceOrientationEvent.requestPermission()`, which requires HTTPS and a button tap [S13]. Ship a static bearing plus an optional compass.
- **Hijri.** `Intl.DateTimeFormat('en-u-ca-islamic-umalqura')` is built in, with no dependency. The spec defines it as KACST-calculated months for 1300–1600 AH, falling back to `islamic-civil` outside that range [S9]. I verified it in Node 24.18 and it gives 1 Ramadan 1447 = 2026-02-18 and **1 Ramadan 1448 = 2027-02-08**. Caveat: Umm al-Qura is calculated in advance, but the starts of Ramadan, Shawwal and Dhul Hijjah are announced by sighting, so show "expected" with a ±1 day note [S10] (from a search excerpt, not fetched). Libraries if needed: `@umalqura/core` (MIT, v0.0.7, last released 2019, so stale) and `moment-hijri` (MIT, v3.0.0, 2024) [S11]. `hijridate` documents table coverage of 1343–1500 AH for Python [S12].
- **Location without leaking it.** Preferred order, all on-device:
  1. A city picker over an offline GeoNames extract. GeoNames data is "cc-by" with a credit link [S17].
  2. A timezone-based default from `Intl.DateTimeFormat().resolvedOptions().timeZone` (browser default time zone) [S47], no permission needed.
  3. Optional GPS via the browser.
  Never send coordinates to your server. Whether browsers use network location providers is an open question I could not verify.
- **Notifications.** See the executive summary: web cannot schedule offline [S14][S15]. Native wrappers can use local scheduled notifications (daily/calendar triggers) [S16]; on Android 12+ they need the exact-alarm permission [S16].

### 2.2 Quran text, translations, audio

| Option | What it provides | License / terms | Languages | Offline / privacy | Effort | Recommendation |
|---|---|---|---|---|---|---|
| **QuranEnc API** | Arabic text + translation + footnotes per ayah, SQLite/PDF/EPUB downloads; per-ayah translation audio MP3 [S18] | Terms: "No modification, addition, or deletion", cite QuranEnc.com, show version, keep metadata, update to latest, no inappropriate ads [S18]. Repo policy explicitly allows apps, commercial use, offline storage, RAG/AI [S19] | 76 translations, 56 languages (verified live) | No key. Request reveals hostname; SQLite download allows full offline use | 4–8 H | **Primary translation source** |
| **Quranpedia API + dumps** | Mushaf text (Hafs and other qiraat), tafsir, 142 translation books, fatwas, versioned dumps [S27] | "Free to use inside apps… no attribution required"; republished dumps must credit Quranpedia.net and state the dump version. Rate limit 120/min, 10,000/day per IP. Do not bulk-scrape [S27]. Dump license excludes third-party GPL morphology fields [S27] | Many, incl. Tagalog | No auth. Dumps allow offline | 4–8 H | **Use for text and tafsir** (1–3d) |
| **King Fahd Complex (KFGQPC) dev platform** | Hafs text as CSV/JSON/SQL/XML + Unicode fonts [S26] | Font EULA (embedded in TTF): free "Use, Copy, Distribute", but "cannot be Sold, Modified, Altered, Translated, Reverse Engineered" [S26]. Data zip `read.me` has no license | Arabic; separate translation pages [S26] | Offline | 2–4 H | Use unmodified. Redistribution in a public repo and WOFF2 conversion: unclear — contact needed |
| **Tanzil** | Uthmani/simple text | "License: Creative Commons Attribution 3.0"; verbatim only, "CHANGING IT IS NOT ALLOWED", link to tanzil.net [S25]. Translations: "non-commercial purposes only" [S25] | No Tagalog in the list | Offline | 2 H | Fallback for text only |
| Quran Foundation (Quran.com) API | Chapters, verses, recitations, translations | OAuth2 backend only; client secret must not be in browser/mobile [S28]. Cache ≤1 week unless Content Sync; no prepackaged DB; no ML models without consent [S28] | Includes Tagalog (id 211) | Needs your backend, so more data flows | 1 D+ | **Avoid** for an open-source offline-first app |
| Al Quran Cloud / islamic.network CDN | Text, translations, ayah audio | Text free for non-commercial reproduction. Recitations "for free, non-commercial redistribution… personal and educational use" [S29] | Many | Keyless; ~12 req/s [S6] | 2 H | OK for audio streaming |
| EveryAyah | Ayah MP3 per reciter, timing files | No site-wide license; timings file requires a backlink [S30]. Audio: unclear — contact needed | Arabic + a few translations | Static files | 2 H | Use for per-ayah audio only after clarifying terms |
| mp3quran.net API v3 | 242 reciters, radios, tafsir audio; Tagalog surah names [S31] | No license text found: unclear — contact needed | 21 API languages incl. Tagalog | No auth | 2 H | Good for full-surah streaming |

- **Open-source GitHub.** Safe: code (MIT). Safe with conditions: unmodified QuranEnc/Quranpedia/Tanzil text with attribution, version and an update script. Avoid committing audio or QF-derived data. For Arabic fonts, **Amiri Quran** and **Scheherazade New** are "SIL Open Font License, Version 1.1" and avoid KFGQPC ambiguity [S32]. `batoulapps/quran-svg` is MIT but built from KFGQPC Illustrator files, so the upstream rights are unclear — contact needed [S33].
- **Modifying text.** Every Quran source above forbids altering the text, and QuranEnc/HadeethEnc forbid altering translations [S18][S20][S25][S26][S28]. Never run LLM rewriting on Quran or hadith strings that you attribute to a source.
- **Audio note.** A fatwa says background sounds or music with recitation is at least disliked (makruh), so do not mix or overlay [S46].

## 3. Approved-sources access table

| Source | API / export? | Terms | Languages | Notes |
|---|---|---|---|---|
| **dev.islamiccontent.org (ICSA portal)** | Catalog of 6 APIs: QuranEnc (75 translations), HadeethEnc (72 languages), IslamHouse v3, Risala Gateway (API key), Al-Montaka, Bayan Islam (131 languages per portal, 132 in its live language list). SDKs: npm `islamic-content-sdk` 1.0.7 (ISC), PyPI [S23][S24] | Portal footer: "جميع الحقوق محفوظة"; no license listed. Content terms live on each platform [S23] | 100+ | Verified live |
| **ICSA MCP server** | npm `islamic-content-mcp-server` 1.1.11 (2026-09-20), local stdio, no hosted endpoint [S24]. README lists 6 tools: `quran_services`, `islamhouse_quran`, `hadeethenc_services`, `islamhouse_library`, `bayan_al_islam`, `risalat_al_haramain` (each with `action` + `language` parameters) [S24]. Glama lists a 7th, `al_montaka` [S24]. Portal docs list per-endpoint names (`quranenc_translation_list`, `hadeethenc_categories`, `islamhouse_list_items`, `bayan_name_search`…) [S23]. Docs disagree; check the installed version | Repo says "ISC License"; npm registry shows no license field for the MCP package [S24] | Via `language` param, incl. `tl` | Maintainer is an individual GitHub account "for" ICSA, so provenance needs confirming. Useful for dev tooling, not the runtime path |
| **QuranEnc** | REST, no key, SQLite downloads [S18] | Terms in 2.2 [S18][S19] | 56 languages | Best Quran source |
| **HadeethEnc** | REST (`/api/v1/categories/list`, `/hadeeths/list`, `/hadeeths/one`), Excel/PDF per language [S20] | Same 7 terms as QuranEnc, "Inappropriate advertisements must not be included" [S20] | 72 | Hadith with explanation, grade, hints |
| **IslamHouse API v3** | REST with a shared public key shown in API responses; Postman docs [S21] | README policy: allowed in apps, commercial, offline, RAG/AI; keep text unchanged; summaries "must not be presented as an edition issued or approved by our platforms"; sale must not be excessive; written confirmation: admin@islamhouse.com [S19] | 147 approved languages [S19] | Request your own key (inference: the shared key could be rate-limited) |
| **Bayan al-Islam (byenah.com)** | `GET /{lang}/Api/languages/list`, `/content/muslims/full_list`, `/content/non-muslims/full_list`, `/recent-contents`, `/lookups`; no key; 20 items per page [S22] | "© Bayan Al-Islam, All Right Reserved" — own terms unclear — contact needed. Attachments are hosted on IslamHouse (IslamHouse policy likely applies; confirm) [S22] | 131–132 languages | Site sections include "Matters of New Muslim" and the Prophet's biography; endpoint is not language-filtered (filter client-side) |
| **Quranpedia.net** | Yes, REST + dumps [S27] | See 2.2 | Many | Also serves fatwas (sourced from IslamWeb/IslamQA), whose own terms may differ |
| **King Fahd Complex** | Downloads at qurancomplex.gov.sa/quran-dev [S26] | Font EULA; data license unclear | Arabic + translation pages incl. "التغالوغ (Tagalog)" [S26] | Contact the Complex |
| **dorar.net** | Only "خدمة واجهة الموسوعة الحديثية API": JSONP `https://dorar.net/dorar_api.json?skey=` for site owners, hadith search only [S34]. Bot-blocked (HTTP 403 for curl and WebFetch) | FAQ: encyclopedias "غير قابلة للتنزيل… ولا يسمح بنسخها واستخدامها" (not downloadable, copying/using not permitted). Footer: "جميع الحقوق محفوظة لمؤسسة الدرر السنية" [S34] | Arabic (English section exists) | Tafsir/aqeeda/fiqh/history: **no API, no reuse** without written permission. Deep links only |
| **islamic-content.com (Jamhara)** | No API found (`/api` returns 404). Web encyclopedia: Quran dictionary with 50+ translations, 2,000+ hadith, 14,000 biographies, 10,000 terms, historical encyclopedia [S35] | "الاستخدام الشخصي غير التجاري" (personal non-commercial use); content is republished from other sources whose rights are reserved [S35] | Arabic UI; translation dictionary multilingual | Contact for data. Do not scrape |
| **dawa.center (incl. Bayyinat, file/7937)** | Atom feed of all files `/feed`, sitemap; no API or terms pages (404) [S36] | None stated on the page; citation format provided: unclear — contact needed | Arabic, English, French UI | Bayyinat is a PDF book by Osool Center (2024) [S36]; chunking it for RAG needs written permission. dawa.center itself runs an AI assistant ("sources documented") |
| **shamela.ws** | Official API v4 requires a key; master and per-book databases (mail@shamela.ws for keys, per a third-party MIT client) [S37] | No terms page found (404): unclear — contact needed | Arabic | Books are third-party copyrighted works |
| **islamqa.info** | No public API found | Terms: "Personal Uses Permitted"; no use for commercial purposes [S38] | 17 languages, no Tagalog [S38] | Deep link and cite only |
| **binbaz.org.sa** | No API found | Footer: "جميع الحقوق محفوظة والنقل متاح لكل مسلم بشرط ذكر المصدر" (copying permitted for every Muslim provided the source is cited) [S39] | Arabic homepage | Re-use with citation seems allowed; confirm for app/AI use |

## 4. Privacy and discreet-mode patterns

- **Quick exit.** GOV.UK's "Exit this page" pattern: a button that goes to a neutral site, keyboard shortcut (press Shift 3 times), a loading overlay, an interruption page that explains the feature, and a safety page. Important caveat: it "is not a complete solution" and browsing history is not erased [S40]. For a PWA: exit to a neutral page and clear in-app state, and say plainly that browser history remains.
- **Disguised icon and name.** Grindr lets users replace its logo with neutral icons (notepad, clock), with a passcode, unsend and screenshot block, built with Article 19 and the Guardian Project and later offered globally [S41]. DV apps use calculator/news disguises or discreet icons [S42]. Native iOS offers `setAlternateIconName` [S43]. A **PWA's name and icon are fixed at install**, so Rafeeq should ship with a neutral default name/icon and offer a "Rafeeq" version as opt-in (inference; verify on iOS and Android).
- **Notifications.** On Android, lock-screen content is controlled by `VISIBILITY_PRIVATE`/`SECRET` plus `setPublicVersion` for a generic version; the user can override per channel [S43]. iOS preview visibility is a user setting under Settings > Notifications [S43]. So write neutral copy by default ("Reminder"), make prayer-name notifications opt-in, and default to off.
- **On-device by default (inference, standard practice).**
  - Prayer times, Qibla, Hijri and reading progress stay local.
  - No account is needed for core features.
  - No analytics SDKs and no third-party fonts or CDNs, because each one exposes usage to a third party.
  - Offer an app PIN, and a "wipe data" action next to quick exit.
- **Network visibility (inference).** Calls to `quranenc.com` or `islamhouse.com` appear in router and DNS logs. Cache Quran text and translations offline (QuranEnc SQLite, Quranpedia dumps) so reading generates no traffic. Proxy audio through your own neutral domain if the risk model requires it.
- **AI assistant.** Questions about conversion are sensitive, so do not log them, strip IPs, and state this in the UI. If you use RAG with Quran Foundation content, its terms restrict retention [S28]. IslamHouse/QuranEnc explicitly allow RAG and AI assistants [S19].

## 5. Content rules

- **No depiction of prophets, companions or imagined scenes.** The Saudi Permanent Committee (quoted on IslamWeb, fatwa 252433) says explaining Quran stories with drawings of prophets, messengers or righteous people is "تفسير بدعي محرم" (a prohibited innovation) and must be avoided "مهما كانت نية صاحبه حسنة، كدعوى تقريب فهم الآيات للصغار، أو لحديثي العهد بالإسلام" (however good the intention, such as making verses easier for children or new Muslims). Reasons given include mockery risk and the shirk precedent of Noah's people [S44].
- **Wider picture.** Most Sunni Muslims reject depictions of all prophets. Shia practice is more permissive, and historically Safavid art veiled the face or used a flame [S45]. The 1976 film *The Message* never showed the Prophet; the Muslim World League still rejected it [S45]. For Rafeeq, the safest rule is: **no figures of prophets, companions or the Prophet's family**, including AI-generated images. Use calligraphy, maps, places, objects and geometric art. Review third-party thumbnails (for example IslamHouse video images) before display.
- **Quran audio.** No background music or effects under recitation [S46].
- **Text integrity.** No edits to Quran text or translations [S18][S25][S26]. AI summaries must be labeled as your own work, not as the source's text [S19].
- **No ads beside Quran or hadith** [S18][S20].

## 6. Tagalog / Filipino availability (verified live 2026-10-04)

| Content | Source | Detail |
|---|---|---|
| Quran meaning translation | QuranEnc `tagalog_rwwad` v1.1.4 (updated 2025-02-04), footnotes included; also `bisayan_rwwad` (Cebuano) [S18] | Free API/SQLite/PDF/EPUB. Terms in 2.2 |
| Quran translation audio | `d.quranenc.com/data/audio/tagalog_rwwad/{sura3}{aya3}.mp3` (HTTP 206 on range request) [S18] | Per-ayah Tagalog audio; no hosted Tagalog audio alternative needed |
| Other Tagalog Quran | Quranpedia books 1963 and 2010 (Mukhtasar tafsir) [S27]; Quran.com id 211 Dar Al-Salam Center [S28]; KFGQPC lists Tagalog [S26]. **Not in Tanzil** [S25] | Choose one primary (Rowwad) for consistency |
| Recitation UI | mp3quran API in Tagalog (surah names e.g. "Ang Baka") [S31] | Recitation audio is Arabic |
| Hadith | HadeethEnc `language=tl`: 7 categories incl. "Ang Talambuhay at ang Kasaysayan" (151 hadith) vs 213 in English and 353 in Arabic [S20] | Includes explanation, grade, hints |
| Books/articles/media | IslamHouse tl: 227 books, 95 articles, 100 audios, 514 videos, 26 posters. English: 810, 494, 370, 1,615 [S21] | Includes new-Muslim guides, Ramadan materials. Data quirk: a Cebuano video appeared under `tl`, so filter |
| New-Muslim curriculum | Bayan al-Islam: Tagalog 291 items, English 656, Arabic 616, Maguindanaon 50 [S22] | Mostly PDFs/DOCX (IslamHouse files) |
| Not available | IslamQA (no Tagalog) [S38]; Tanzil [S25] | |

- **Typography.** Tagalog Quran text uses macrons and dots (for example "Allāh", "Muḥammad"). Use a font that supports them.
- **Ramadan content.** IslamHouse has Tagalog Ramadan journals/trackers for children and a 30-lesson Ramadan book [S21].
- **AI in Tagalog.** Retrieval from Tagalog sources is fine. If the model translates from Arabic or English, label it as AI translation, since unmodified source text is required [S19].

## 7. Risks, open questions, feasibility

**Feasible in 1–3 days:** adhan-js prayer times and Qibla with offline city picker and Umm al-Qura/Hijri display; Ramadan mode (Fajr/Maghrib countdown, +30 min Isha note, 1448 expected 2027-02-08); QuranEnc reader (Arabic, English, Tagalog) with Quranpedia text, streaming audio from mp3quran/islamic.network; HadeethEnc and IslamHouse content cards (facts/stories); neutral naming, quick exit, notification privacy defaults; RAG over ICSA sources with citations and a "not original text" label.

**Later:** native notifications and discreet icons (RN/Capacitor); full Quran offline pack with version-sync job (QuranEnc requires you to update copies [S19]); written permissions for dorar/Jamhara/dawa.center/Shamela/IslamQA; Tagalog glossary and curriculum review by Tagalog-speaking scholars; self-hosted audio proxy.

**Open questions to resolve by email:**
1. dorar.net: any licensing path beyond the hadith JSONP API? (Their API is bot-protected, so it may fail from servers.)
2. dawa.center/Osool: terms for RAG over the Bayyinat PDF and language versions.
3. Jamhara and Bayan al-Islam: own terms and data access (Bayan's attachments sit on IslamHouse).
4. KFGQPC: confirm public-repo redistribution of text data and WOFF2 conversion.
5. mp3quran and EveryAyah: audio redistribution terms.
6. Shamela: API key and terms.
7. IslamHouse: request a dedicated API key and the written confirmation offered at admin@islamhouse.com [S19].
8. ICSA MCP server: confirm official status and the tool list (docs disagree) [S23][S24].

**Other risks:**
- QuranEnc/HadeethEnc require updating to the latest version, so bundled copies need a sync script [S18][S20].
- Quranpedia warns that stale Quran copies are the distributor's responsibility [S27].
- Umm al-Qura Ramadan start can differ by one day from the calculated table [S10].
- The shared IslamHouse key and free APIs have no SLA [S6][S21].
- iOS 16.4+ and home-screen install are required for web push [S15].
- Some points rest on search excerpts I did not fetch in full: Grindr [S41], DV apps [S42], Calendrical [S10], Chrome Notification Triggers launch status [S14]. Apple's alternate-icon page was only partially readable [S43].
- I could not read dorar.net directly; I used Wayback captures from Dec 2025–Jan 2026 [S34].

## 8. Source list

- [S1] https://github.com/batoulapps/adhan-js
- [S2] https://raw.githubusercontent.com/batoulapps/adhan-js/master/METHODS.md
- [S3] https://registry.npmjs.org/adhan
- [S4] https://github.com/batoulapps
- [S5] https://aladhan.com/credits-and-terms
- [S6] https://community.islamic.network/d/2-is-there-a-rate-limit-on-the-apis and https://community.islamic.network/d/107-can-i-use-aladhan-api-for-commercial-use-in-my-app
- [S7] https://api.aladhan.com/v1/methods
- [S8] https://praytimes.org/code/v2/js/PrayTimes.js and https://praytimes.org/manual
- [S9] https://tc39.es/proposal-intl-era-monthcode/ (Node 24.18 `Intl.supportedValuesOf('calendar')` run locally)
- [S10] https://calendrical.hexdocs.pm/Calendrical.Islamic.UmmAlQura.html (search excerpt)
- [S11] https://registry.npmjs.org/@umalqura%2fcore and https://registry.npmjs.org/moment-hijri
- [S12] https://hijridate.readthedocs.io/en/stable/background.html
- [S13] https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static
- [S14] https://developer.chrome.com/docs/web-platform/notification-triggers
- [S15] https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- [S16] https://docs.expo.dev/versions/latest/sdk/notifications/
- [S17] https://www.geonames.org/export/
- [S18] https://quranenc.com/en/home/api, https://quranenc.com/api/v1/translations/list, https://quranenc.com/en/browse/tagalog_rwwad
- [S19] https://github.com/IslamHouse-API/multilingual-quran-hadith-islamic-content-database-api-hub
- [S20] https://hadeethenc.com/en/home and https://hadeethenc.com/api/v1/categories/list/?language=tl
- [S21] https://api3.islamhouse.com/v3/paV29H2gm56kvLPy/main/books/tl/tl/1/5/json and https://documenter.getpostman.com/view/7929737/TzkyMfPc
- [S22] https://byenah.com/en/about, https://byenah.com/ar/Api/languages/list, https://dev.islamiccontent.org/api/apis/5
- [S23] https://dev.islamiccontent.org/docs and https://dev.islamiccontent.org/api/apis
- [S24] https://github.com/2yousefreda/islamic-content-mcp, https://glama.ai/mcp/servers/2yousefreda/islamic-content-mcp, https://registry.npmjs.org/islamic-content-mcp-server, https://registry.npmjs.org/islamic-content-sdk
- [S25] https://tanzil.net/docs/Text_License and https://tanzil.net/trans/
- [S26] https://qurancomplex.gov.sa/quran-dev/, https://download.qurancomplex.gov.sa/resources_dev/kfgqpc_hafs_smart_4.zip (EULA read from font file), https://qurancomplex.gov.sa/quran-translations/
- [S27] https://quranpedia.net/api-docs, https://quranpedia.net/dumps/LICENSE.md, https://api.quranpedia.net/v1/translation-books/tl
- [S28] https://api-docs.quran.foundation/legal/developer-terms/, https://api-docs.quran.foundation/docs/quickstart/, https://api.quran.com/api/v4/resources/translations
- [S29] https://alquran.cloud/terms-and-conditions
- [S30] https://everyayah.com/data/timings_files/000_disclaimer.txt
- [S31] https://mp3quran.net/eng/api, https://mp3quran.net/api/v3/languages, https://mp3quran.net/api/v3/suwar?language=tl
- [S32] https://raw.githubusercontent.com/google/fonts/main/ofl/amiriquran/OFL.txt, https://raw.githubusercontent.com/google/fonts/main/ofl/scheherazadenew/OFL.txt
- [S33] https://github.com/batoulapps/quran-svg
- [S34] https://web.archive.org/web/20251217020811/https://dorar.net/article/389/ (API service page), https://web.archive.org/web/20260103121223/https://dorar.net/feedback (FAQ and footer)
- [S35] https://islamic-content.com/page/about, https://islamic-content.com/page/copyright
- [S36] https://dawa.center/file/7937, https://dawa.center/feed
- [S37] https://cdn.jsdelivr.net/npm/shamela@1.5.3/README.md, https://shamela.ws/
- [S38] https://islamqa.info/en/terms
- [S39] https://binbaz.org.sa/
- [S40] https://design-system.service.gov.uk/patterns/exit-a-page-quickly
- [S41] https://www.sbs.com.au/voices/article/grindr-has-introduced-protections-for-users-in-anti-lgbt-countries/db6vwrkr7, https://www.globaldatinginsights.com/news/grindr-makes-discreet-icon-safety-feature-available-worldwide/
- [S42] https://www.domesticshelters.org/articles/technology/apps-designed-to-keep-you-safe
- [S43] https://developer.android.com/develop/ui/views/notifications/build-notification, https://developer.apple.com/documentation/uikit/uiapplication/setalternateiconname(_:completionhandler:), https://support.apple.com/guide/iphone/change-notification-settings-iph7c3d96bab/ios
- [S44] https://www.islamweb.net/ar/fatwa/252433 (read via https://api.quranpedia.net/v1/fatwa/76)
- [S45] https://en.wikipedia.org/wiki/Depictions_of_Muhammad, https://en.wikipedia.org/wiki/Aniconism_in_Islam, https://en.wikipedia.org/wiki/The_Message_(1976_film)
- [S46] https://islamqa.info/ar/answers/145931 (read via https://api.quranpedia.net/v1/fatwa/1623)
- [S47] https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat
