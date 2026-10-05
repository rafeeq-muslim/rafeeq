# Prayer reminders and daily adhkar: Sharia basis, sources, feasibility

Research date: 2026-10-05. Supports PRC-05 (تذكير الصلاة) and the proposed daily-adhkar feature. Numbers in brackets point to section 3.

## 1. Prayer reminders (PRC-05)

| Topic | Finding | Source | Status |
| --- | --- | --- | --- |
| Adhan audio as a call ringtone | Not allowed: it demeans the words of the adhan (al-Barrak) | IslamQA 115674 [Q1] | Read |
| Adhan audio when the prayer time actually enters | "No harm", it matches the purpose of the adhan | [Q1] | Read |
| Adhan audio to wake up for prayer | No objection seen; likened to the first Fajr adhan | [Q1] | Read |
| Adhan audio for other alerts | Doubtful; safer to avoid and use a permitted tone | [Q1] | Read |
| Web scheduling | Web cannot schedule offline notifications reliably (Notification Triggers trial ended; iOS web push needs install and a push server). Native local notifications work offline; Android 12+ needs the exact-alarm permission | `research/03` [S14][S15][S16] | From research/03 |

Design consequences:
- A reminder **before** the time never plays the adhan; that would announce a time that has not entered.
- Scheduling is local on the phone, so no schedule, city or time zone reaches a server.
- The lock-screen text is neutral by default (`rules.md` §4, PLT rules).

## 2. Daily adhkar (proposed feature)

Checked live on 2026-10-05 through the HadeethEnc API (`/api/v1/categories/list`):

| HadeethEnc category | Arabic | English | Tagalog |
| --- | --- | --- | --- |
| Morning and evening adhkar (301) | 9 | 7 | 7 |
| Adhkar of the prayer (465) | 31 | 23 | 23 |
| Unrestricted adhkar (302) | 10 | 8 | 8 |
| Entering and leaving the home (303) | 2 | 2 | 2 |
| Entering and leaving the mosque (306) | 2 | 2 | 2 |
| Reported supplications (313) | 44 | 33 | 32 |

- **Text, grade, translation, explanation:** HadeethEnc, 72 languages, terms allow apps, offline storage and AI use with unchanged text (`sources.md`: Index). Coverage is smaller than a full Hisn al-Muslim, and smaller in English and Tagalog than in Arabic.
- **Quran parts of the adhkar** (Ayat al-Kursi, the last three surahs): QuranEnc Arabic text and the Tagalog Rowwad translation with per-ayah Tagalog audio (`research/03`).
- **Hisn al-Muslim (al-Qahtani):** a Tagalog translation appears among IslamHouse books ⚠️ (seen in search results, not opened). IslamHouse terms allow apps; ask admin@islamhouse.com before extracting text from a PDF book.
- **Arabic audio of the adhkar.** `rn0x/Adhkar-json` bundles audio from hisnmuslim.com (reader: Hamad al-Durayhim) with **no license**. `asellam/HisnElMuslim` is MIT, but that covers the repository, not the rights to the book's text.
- **Resolved 2026-10-05:** the domain owner obtained hisnmuslim.com's approval (data open to the public; written confirmation to be filed). Pulled from its public API into `data/hisnmuslim/`: 132 chapters in Arabic and in English, 398 audio links (397 downloaded, 185 MB, kept out of git).
- **Team rules that apply:** no transliteration of adhkar in non-Arabic letters (pronunciation by listening); no counter and no tracking (`research/05`, Ibn Uthaymeen via IslamQA 109125); each dhikr shown from stored records with its source and grade.
- **Domain:** the content belongs to Knowledge & Ask (approved content); the daily screen belongs to Daily Practice. Needs the event «محتوى معتمد» to reach Daily Practice as well as Learning.

### 2.1 Haramain adhan recordings (PRC-05)

- The recordings belong to the General Authority for the Affairs of the Two Holy Mosques (gph.gov.sa); no official download with stated terms was found.
- Internet Archive items from haramainrecordings.com (e.g. a 2007 Fajr adhan by Ali Ahmed Mullah) have **no license or rights field** (checked through the archive.org metadata API).
- aladhan.com's adhan downloads include no Haramain muezzin and state no per-file terms.
- Next step: written permission from the General Authority, covering a short clip of the first two takbirs.

## 3. Sources

- [Q1] IslamQA 115674, «أحوال استعمال الأذان نغمة للجوال وحكم كل واحدة منها»: https://islamqa.info/ar/answers/115674
- HadeethEnc categories API: https://hadeethenc.com/api/v1/categories/list/?language=ar (also `en`, `tl`)
- IslamHouse Tagalog books: https://islamhouse.com/en/books/tl/1/
- rn0x/Adhkar-json: https://github.com/rn0x/Adhkar-json
- asellam/HisnElMuslim: https://github.com/asellam/HisnElMuslim
- IslamQA 109125: https://islamqa.info/ar/answers/109125
- hisnmuslim.com API: https://www.hisnmuslim.com/api/husn.json
- General Authority for the Affairs of the Two Holy Mosques: https://gph.gov.sa/index.php/ar/
- Internet Archive, Fajr adhan by Ali Ahmed Mullah: https://archive.org/details/20thJuly2007FajrAthan-sheikhAliAhmedMullah
- aladhan adhan downloads: https://aladhan.com/download-adhans
