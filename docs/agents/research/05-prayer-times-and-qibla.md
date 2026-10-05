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
- One day only. The test suite should compare a full year of official times for the 13 cities. Part of the remaining gap is the city point: Riyadh spans about 0.6° of longitude, roughly 2–3 minutes.

**Qibla:** `adhan`'s `Qibla()` uses the great-circle bearing formula from *Spherical Trigonometry* (p. 50) with Makkah at 21.4225241, 39.8261818 [A2]. Riyadh (24.68773, 46.72185) gives 244.15°, and an independent implementation of the same formula agrees. Great circle is the method used by most bodies; a minority in North America uses the rhumb line [W1]. The two agree closely for the Gulf and the Philippines.

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
