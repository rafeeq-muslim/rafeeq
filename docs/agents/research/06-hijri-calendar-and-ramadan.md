# Hijri calendar and Ramadan: Sharia basis, official references, verification

Research date: 2026-10-05. Supports PRC-04 (التقويم الهجري ووضع رمضان). Builds on `research/03` §2.1 and `research/05`. Numbers in brackets point to section 4.

## 1. Summary

- **Hijri date:** the browser's built-in `Intl` `islamic-umalqura` calendar matches the official Umm al-Qura calendar on every date checked (section 3). No library and no network needed.
- **Start of Ramadan and Shawwal:** by sighting the crescent, not by calculation (Ibn Baz, Majmu' Fatawa 15/119) [B1]. A Muslim fasts with the people of his country when they follow the Sharia sighting; if they do not, he follows a Sharia sighting in an Islamic country (Ibn Baz) [B2]. So a calculated date is only "expected".
- **Suhoor ends at Fajr:** "imsak" times placed before Fajr (e.g. a quarter of an hour) have no known basis; abstaining starts at true dawn (Ibn Baz, Majmu' Fatawa 15/280) [B3]. Some other bodies call a short margin a precaution [I1]; the approved source above is followed.
- **Isha in Ramadan (Saudi Arabia):** the official calendar moves Isha from Maghrib + 90 to Maghrib + 120 minutes for the whole of Ramadan, and back on 1 Shawwal (section 3). This matches `adhan`'s note for `UmmAlQura` [A1].

## 2. Sharia basis

| Topic | Ruling | Source | Status |
| --- | --- | --- | --- |
| Month start | Rely on sighting; calculation is not relied on for fasting and breaking the fast | Ibn Baz, Majmu' Fatawa 15/119 [B1] | Read |
| Whose sighting | Fast with the people of your country if they follow the Sharia sighting; otherwise follow a Sharia sighting in an Islamic country | Ibn Baz, Nur ala al-Darb [B2] | Read |
| Imsak before Fajr | "I know no basis for this detail"; abstaining is at the rise of Fajr | Ibn Baz, Majmu' Fatawa 15/280 [B3] | Read |
| Tracking fasting | Not done: Ibn Uthaymeen (Majmu' Fatawa 16/111) called personal worship-tracking tables an innovation (IslamQA 109125) | [Q1] | Read |

## 3. Verification against the official calendar

Source: the KACST API behind ummulqura.org.sa [U1], Riyadh at GeoNames' point (24.68773, 46.72185), time zone +3. `Intl` column: `new Intl.DateTimeFormat('en-u-ca-islamic-umalqura')` in Node 24.

| Gregorian | Official Hijri | `Intl` Hijri | Fajr | Maghrib | Isha | Isha − Maghrib |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-05 | 24 Rabi II 1448 | 24 Rabi II 1448 | 04:30 | 17:37 | 19:07 | 90 |
| 2027-02-07 | 30 Sha'ban 1448 | 30 Sha'ban 1448 | 05:13 | 17:43 | 19:13 | 90 |
| 2027-02-08 | 1 Ramadan 1448 | 1 Ramadan 1448 | 05:12 | 17:43 | 19:43 | 120 |
| 2027-02-20 | 13 Ramadan 1448 | — | 05:05 | 17:51 | 19:51 | 120 |
| 2027-03-09 | 1 Shawwal 1448 | 1 Shawwal 1448 | 04:51 | 18:00 | 19:30 | 90 |

- Expected 1 Ramadan 1448 = 2027-02-08 and 1 Shawwal 1448 = 2027-03-09, both "expected" until sighting is announced.
- The test suite should cover every day of Ramadan 1448 and the days around it.
- Last year's check: the calculated 1 Ramadan 1447 (2026-02-18, `research/03`) matched the Supreme Court's sighting decision, announced by the Royal Court on SPA [S1].

**Announcements.** The Supreme Court calls for sighting and announces the result through the Royal Court on the Saudi Press Agency, as news articles [S1][S2]. We found no official machine-readable feed ⚠️. An automated job can read SPA on the sighting night, but a person must approve before the file reaches users.

## 4. Sources

- [B1] Ibn Baz, «الأحاديث الصحيحة تدل على وجوب اعتماد الرؤية وعدم اعتبار الحساب»: https://binbaz.org.sa/fatwas/11061
- [B2] Ibn Baz, «الأصل أن المسلم يصوم مع أهل بلده»: https://binbaz.org.sa/fatwas/15134
- [B3] Ibn Baz, «حكم الإمساكيات التي توزع في شهر رمضان»: https://binbaz.org.sa/fatwas/11916
- [Q1] IslamQA 109125: https://islamqa.info/ar/answers/109125
- [I1] IslamWeb 30009 (contrary view, not an approved source): https://www.islamweb.net/ar/fatwa/30009
- [U1] Umm al-Qura official calendar: https://www.ummulqura.org.sa/ ; API: `https://umqserv.kacst.gov.sa/api/v1/Prayer/GetPrayers?lang=en&format=24&yg=2027&mg=2&dg=8&lon=46.72185&lat=24.68773&zone=3`
- [A1] adhan-js METHODS.md: https://github.com/batoulapps/adhan-js/blob/master/METHODS.md
- [S1] SPA, Royal Court: Supreme Court decides Wednesday is 1 Ramadan 1447: https://www.spa.gov.sa/N2516791
- [S2] SPA, Supreme Court calls for sighting the Ramadan crescent: https://www.spa.gov.sa/N2513476
