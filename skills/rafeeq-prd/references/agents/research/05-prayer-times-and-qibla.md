# Prayer times and qibla: Sharia basis, official references, verification

Research date: 2026-10-05. Supports PRC-01 (مواقيت الصلاة والقبلة). Numbers in brackets point to the source list in section 5. "Read" means the page was opened and read on that date; "secondary" means the claim comes from a page quoting the original.

## 1. Summary

- **Qibla:** whoever is far from the Kaaba must face its direction (الجهة), not its exact point; a slight deviation does not matter. Using compasses and modern devices to find it is permitted. In a mosque, follow its mihrab [D1][D2][B1].
- **Prayer times:** relying on accurate calendars and the radio is acceptable for whoever cannot hear a mosque; do not pray until the time has most likely entered; whoever hears the adhan prays with the mosque [B2].
- **Saudi Arabia:** the Umm al-Qura calendar is the official reference, developed and managed by KACST [U1]. `adhan`'s `UmmAlQura` method (Fajr 18.5°, Isha = Maghrib + 90 min; +30 min in Ramadan) [A1] matches it within one minute in all 13 published cities (section 3).
- **Asr:** IslamQA sets the majority view (shadow equal to the object) above the Hanafi one (twice the object), which makes Asr 30 minutes or more later [Q1]. Following the official calendar of the user's country follows local practice without asking a new Muslim to choose a madhhab.
- **High latitudes (48°–66°):** when the signs of Isha and Fajr disappear, estimate them proportionally on latitude 45° (MWL Fiqh Academy, 19th session, Shawwal 1428 / Nov 2007) [M1]. `adhan`'s `HighLatitudeRule` options are not this rule; implementing it needs a decision.

## 2. Sharia basis (from approved sources)

| Topic | Ruling | Source | Status |
| --- | --- | --- | --- |
| Facing the qibla from afar | The obligation for whoever is far from the Kaaba is to face its direction; majority view, chosen by Ibn Baz and Ibn Uthaymeen, consensus reported | Dorar, Fiqh Encyclopedia, Prayer › Qibla › 2nd matter, 3rd branch [D1] | Read |
| Slight deviation | Does not harm whoever faces the direction; Permanent Committee fatwa; evidence includes «ما بين المشرق والمغرب قبلة» | [D1] 4th branch; Ibn Baz, Nur ala al-Darb [B1] | Read |
| Devices and compass | Permitted (Ibn Abidin, Ibn Baz, Ibn Uthaymeen); they give at least preponderant belief, which suffices | [D2] 2nd branch | Read |
| Compass caveat | "A good, useful tool, but people of knowledge must handle it"; for an old mosque, refer to local scholars | Ibn Baz [B1] | Read |
| Mosque mihrab | Must be followed; one's own ijtihad is not allowed against it (four schools) | [D2] 4th branch | Read |
| Calendars | Whoever is far from mosques seeks the time by clock, sight, radio, "accurate calendars" or trustworthy people, and waits until the time has most likely entered | Ibn Baz, Nur ala al-Darb [B2] | Read |
| Asr start | Majority: shadow equals object; Hanafi: twice. Majority is "more correct" | IslamQA 220820 [Q1] | Read |
| Umm al-Qura Fajr | Ibn Uthaymeen held it about 5 minutes early (Fatawa 19/302) and advised imams to delay 5 minutes; others affirmed the calendar | [S1][S2] | Secondary ⚠️ |
| High latitudes | 48°–66°: when signs vanish, estimate Isha and Fajr proportionally on 45°; joining prayers allowed for hardship but not as a standing rule | MWL Fiqh Academy, 19th session [M1] | Secondary (report of the decision) |

## 3. Verification against the official calendar

Official times for 2026-10-05 from the Umm al-Qura home page [U1], compared with `adhan` 4.4.6, method `UmmAlQura`, GeoNames city coordinates. Values are `adhan` minus official, in minutes, for Mecca, Medina, Riyadh, Buraydah, Dammam, Abha, Tabuk, Hail, Arar, Jazan, Najran, Al Bahah and Sakaka.

| Setting | Fajr | Sunrise | Dhuhr | Asr | Maghrib | Isha |
| --- | --- | --- | --- | --- | --- | --- |
| Default (round to nearest) | −1 to 0 | 0 to +1 | −1 to 0 | −1 to 0 | −1 to 0 | −1 to 0 |
| Round up, +1 min on prayers, −1 min on sunrise | 0 to +1 | 0 | +1 | 0 to +1 | +1 to +2 | +1 to +2 |

- The default can show a prayer **one minute before** the official time. The second setting never does, and never shows sunrise later than the official time. PRC-01 rule 3 requires this.
- Riyadh, official: Fajr 04:30, Sunrise 05:46, Dhuhr 11:42, Asr 15:05, Maghrib 17:37, Isha 19:07.
- One day only. The test suite should compare a full year of official times for the 13 cities. The site's own API (`umqserv.kacst.gov.sa/api/v1/Prayer/GetPrayers?...&lat=&lon=&zone=3`, used by ummulqura.org.sa) returns exactly the published Riyadh times for GeoNames' Riyadh point (24.68773, 46.72185), so the gap comes from rounding, not the city point. Use the API to build test fixtures; never call it from the app.

**Qibla:** `adhan`'s `Qibla()` uses the great-circle bearing formula from *Spherical Trigonometry* (p. 50) with Makkah at 21.4225241, 39.8261818 [A2]. Riyadh (24.68773, 46.72185) gives 244.15°, and an independent implementation of the same formula agrees. Great circle is the method used by most bodies; a minority in North America uses the rhumb line [W1]. The two agree closely for the Gulf and the Philippines.

### 3.1 World coverage

`adhan` computes any coordinates on Earth. MWL method, local time, 2026-10-05 and 2027-06-21:

| City | Lat | 2026-10-05 Fajr / Isha | 2027-06-21 Fajr / Isha | Qibla |
| --- | --- | --- | --- | --- |
| Manila | 14.6 | 04:35 / 18:50 | 04:08 / 19:43 | 289° |
| Addis Ababa | 9.0 | 05:03 / 19:19 | 04:50 / 19:59 | 5° |
| Colombo | 6.9 | 04:49 / 19:05 | 04:40 / 19:40 | 295° |
| Kathmandu | 27.7 | 04:41 / 18:59 | 03:36 / 20:29 | 272° |
| Toronto | 43.7 | 05:45 / 20:21 | 03:13 / 23:15 | 55° |
| London | 51.5 | 05:16 / 20:14 | **01:02 / 01:02** | 119° |
| Oslo | 59.9 | 05:12 / 20:49 | **01:19 / 01:19** | 139° |
| Tromsø | 69.6 | 03:44 / 21:03 | **no times (midnight sun)** | 154° |
| Sydney | −33.9 | 05:03 / 20:20 | 05:30 / 18:18 | 278° |

- Below about 48° the times are normal all year.
- Above it, in summer, `adhan`'s default `MiddleOfTheNight` rule puts Fajr and Isha at the same minute, and above the Arctic circle it returns nothing. Neither follows the MWL Fiqh Academy decision [M1]. PRC-01 keeps these cities out until the decision is implemented.

## 4. Countries outside Saudi Arabia

| Country | What we found | Proposed default |
| --- | --- | --- |
| Kuwait, Qatar, UAE | `adhan` has `Kuwait`, `Qatar`, `Dubai` methods [A1] | Those methods; verify against each official timetable |
| Philippines | No published official method found; sites use MWL (18°/17°) [P1] | MWL ✅ (decided 2026-10-05) |
| Sri Lanka | All Ceylon Jamiyyathul Ulama (ACJU) is cited as the official source; its parameters were not found [L1] | MWL until ACJU's method is verified ⚠️ |
| Ethiopia, Eritrea, India, Nepal, and any country with no official calendar | No official calendar found | MWL ✅ (decided 2026-10-05); Hanafi-majority countries' Asr is an open question in PRC-01 |

## 5. Sources

- [D1] Dorar, Fiqh Encyclopedia, «استقبال عين الكعبة»: https://dorar.net/feqhia/859
- [D2] Dorar, Fiqh Encyclopedia, «الاستدلال على القبلة»: https://dorar.net/feqhia/861
- [B1] Ibn Baz, «حكم الاعتماد على البوصلة في تحديد القبلة»: https://binbaz.org.sa/fatwas/8758
- [B2] Ibn Baz, «الاعتماد في معرفة أوقات الصلاة على المذياع والتقويم»: https://binbaz.org.sa/fatwas/9682
- [Q1] IslamQA 220820, «الفرق بين مذهب الحنفية والجمهور في مواقيت الصلاة»: https://islamqa.info/ar/answers/220820
- [M1] MWL Islamic Fiqh Academy, 19th session decisions (report): https://sunnionline.us/arabic/2007/12/125/ ; SPA notice: https://www.spa.gov.sa/497737
- [S1] Ibn Uthaymeen on calendar Fajr (quoted): https://al-fatawa.com/fatwa/128161
- [S2] Discussion of the Umm al-Qura calendar's accuracy: https://midad.com/article/221380
- [U1] Umm al-Qura official calendar: https://www.ummulqura.org.sa/
- [A1] adhan-js METHODS.md: https://github.com/batoulapps/adhan-js/blob/master/METHODS.md
- [A2] adhan-js Qibla source: https://github.com/batoulapps/adhan-js/blob/master/src/Qibla.ts
- [W1] Qibla direction, great circle vs rhumb line: https://en.wikipedia.org/wiki/Qibla
- [P1] Manila prayer times (MWL): https://www.islamicfinder.org/world/philippines/1701668/manila-prayer-times/
- [L1] Sri Lanka prayer times (ACJU): https://www.prayers.lk/
