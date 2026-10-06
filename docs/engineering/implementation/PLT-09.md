# PLT-09 the organized home: implementation

**Feature:** `docs/domains/platform/features/PLT-09-organized-home.md` (version of commit 1303509: «كل ما في رفيق» and «اكتشف» removed, «يومي» follows the time) · **Rules touched:** `rules.md` §3 (worship never counted, rewarded or nagged about), §4 (location never leaves the device; minimum data), §2.6 (the model gets no identity) · **Written:** 2026-10-06 by Claude (branch `plt-09-organized-home-build`).

## 0. The setting (off by default)

PLT-09 is a draft that the product owner and the PLT owner have not approved yet (open question 1). So it is built behind a setting that is **off by default**. While it is off, the app is exactly as before: the current Home with its PLT-08 suggestion, «كل ما في رفيق», the Discover hub and «أدوات يومية» in «حسابي». The organized home makes no network call.

| How | Scope | Where |
| --- | --- | --- |
| `PLT09_ORGANIZED_HOME=true` in the backend environment (default `false`), then restart the API | Everyone | `backend/app/core/config.py::plt09_organized_home`, read by the app from `GET /api/home/config` |
| Team switch «الرئيسية المرتّبة (معاينة)» in «حسابي» → الفريق | One team account on one device | `useDevice.organizedHomePreview` (like the lesson preview switch) |

The app keeps the last answer of `/api/home/config` on the device (`useDevice.organizedHome`), so offline it keeps what it last knew; until it has read "on" it shows the current app. Turning the setting off brings the current app back at the next config read (within 30 minutes or on the next start).

The pattern follows the repo's existing flags: a typed boolean in `Settings` with an environment override (like `ASK_APPROVED_FAQ_ENABLED`), plus a team-only device switch (like `preview` for lessons in review).

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| Switch | `pages/Home.tsx` (`Home` renders `OrganizedHome` or the unchanged `CurrentHome`), `home/setting.ts::useOrganizedHome`, `home/UnlessOrganized.tsx` | The only change to the current Home is the wrapper. `/guide` and the Discover hub (`/discover`) lead to Home when the setting is on; Discover's sub-pages (card, library, Quran, saved) stay, and their back arrow goes to Home («محفوظاتي» to «حسابي») |
| R1 next step first; three main; ≤ 2 optional; nothing after | `home/OrganizedHome.tsx` | Header as on Home (greeting, day, streak, Hijri line). One next-step card: the short review when due (LRN-04), else the next lesson (LRN-02). Then the three main components in the day's order, then the optional ones, then nothing (no «كل ما في رفيق») |
| R2 «يومي» | `OrganizedHome.tsx::MyDay`, `home/layout.ts::prayerLine, adhkarLine`, `discover/player.ts::lastSura` | Next prayer and its time from the device city (PRC-01 code, on the device); no city → «اعرف وقت الصلاة حيث أنت». Adhkar line: morning from Fajr to Dhuhr, evening from Asr to Isha, after-prayer in the half hour after Dhuhr, Maghrib and Isha (the same windows as PRC-07 R6), sleep after Isha. Quran: «تابع سورة …» from the last surah listened to on this device (`rafeeq.quranLast`, written with the stop position), else «استمع إلى القرآن». Library. Each one tap; no counter |
| R2 «حسابي» | `pages/Me.tsx` | With the setting on, «أدوات يومية» (with its «كل ما في رفيق» row) is not shown, and «محفوظاتي» is. Qibla, the prayer reminder and Ramadan already live in the prayer-times screen (`practice/PracticeHome.tsx`) |
| R3 fixed optional list, eligibility on the device | `home/layout.ts::OPTIONAL, eligible`, `home/useOrganized.ts::useEligibility` | ramadan (14 days before to its end, PRC-04 data on the device); human (after the first lesson, no mentor: `/api/mentors/mine` when signed in); save (guest after the first lesson, not closed with «لاحقًا» nor hidden); reciter (listened on this device, no reciter chosen (`discover/reciters.ts::loadReciterChoice`), two or more approved reciters from `/api/discover/recitations`, as the surah page shows its picker from two; it opens the last surah's page, where the picker is); library (after `u01-l7`, an approved basics item in the learner's language) |
| R4 the model orders | `backend/app/platform/home.py` (`POST /api/home/order`), `knowledge/ai/agents.py::order_home`, prompt `knowledge/ai/prompts/home_order.md`; `home/useOrganized.ts::useDayOrder, orderBody` | Body = the guide's learning summary (`ask/guide.ts::buildSummary`: mastered, reviewing, next) + `bucket` + `lang`; the request model forbids any other field (422). Same model tier as the guide (fast). Output ids only, checked on the server and again on the device (`check_order` / `checkOrder`): every main id once, known optional ids, nothing else (so no next step). Refused, failed, slow (> 4 s) or offline → the fixed order (يومي، بطاقة اليوم، اسأل، then the table order). Offline: at once, no request |
| R5 once a day | `home/store.ts` (`rafeeq.home`: day, order, slots), `layout.ts::daySlots, visibleOptional` | The order is set on the first opening of the device day and kept until the next. Optional slots placed today keep their places: one no longer eligible disappears in place and its slot is not refilled that day; the contents of «يومي» and the next step change with time |
| R6 hide; no reward or blame | `OrganizedHome.tsx::OptionalCard`, `store.ts::hide` | One tap hides an optional component for good; the next eligible takes its slot. Kept on this device only (never sent, the model included). Copy introduces tools only |

Time-of-day bucket: from the device clock hour only (04–06 fajr, 06–11 morning, 11–15 dhuhr, 15–18 asr, 18–21 evening, else night), never from prayer times, which come from the location.

## 2. Tests

Backend `backend/tests/test_plt09_home.py` (provider never called: `tests/knw_fakes.py`, respx refuses any other host):

| Example | Test |
| --- | --- |
| Setting off by default, no model call | `test_plt09_setting_is_off_by_default`, `test_plt09_setting_off_never_calls_the_model`, `test_plt09_setting_on_is_reported`, `test_plt09_setting_off_team_preview_gets_the_order` |
| R4 ex1 | `test_plt09_r4_model_orders_main_and_whole_optional_list_from_summary_and_time` |
| R4 ex2 | `test_plt09_r4_invalid_output_is_refused_and_fixed_order_follows` (6 cases), `test_plt09_r4_outage_gives_null_without_error` |
| R4 «ما لا يدخل», R2 ex3 | `test_plt09_r4_nothing_opened_dismissed_worship_or_location_enters` (6 cases), `test_plt09_r4_bucket_is_one_of_six` |

Frontend `frontend/src/app/home/plt09.rules.test.tsx`:

| Example | Test |
| --- | --- |
| Setting off: Home, «حسابي», «كل ما في رفيق», Discover unchanged | `plt09_setting_is_off_by_default_on_the_device`, `plt09_setting_off_home_me_guide_and_discover_are_unchanged`, `plt09_setting_on_from_the_server_turns_the_organized_home_on`, `plt09_setting_team_preview_on_one_device_only` |
| R1 ex1 | `plt09_r1_one_next_step_card_then_main_then_two_optional_then_nothing` |
| R1 ex2 | `plt09_r1_the_next_step_stays_before_daily_whatever_the_order` |
| R2 ex1 | `plt09_r2_after_fajr_at_540_next_prayer_is_dhuhr_and_morning_adhkar_one_tap_each`, `plt09_r2_adhkar_row_opens_the_adhkar_with_one_tap`, `plt09_r2_without_a_city_the_line_invites_to_know_the_prayer_time`, `plt09_r2_quran_continues_the_last_surah_else_opens_listening` |
| R2 ex2 | `plt09_r2_me_has_no_daily_tools_nor_everything_link_but_has_saved_and_qibla_ramadan_live_in_prayer_times`, `plt09_r2_setting_on_removes_the_everything_and_discover_pages` |
| R2 ex3 | `plt09_r2_location_and_prayer_times_never_leave_the_device` |
| R3 ex1 | `plt09_r3_guest_after_first_lesson_without_a_mentor_human_and_save_are_eligible` |
| R3 ex2 | `plt09_r3_closing_save_progress_makes_it_ineligible` |
| R4 ex1 | `plt09_r4_model_order_is_used_and_the_device_keeps_the_first_two_eligible` |
| R4 ex2 | `plt09_r4_invalid_model_order_falls_back_to_the_fixed_order` |
| R4 ex3 | `plt09_r4_offline_shows_the_fixed_order_at_once_without_waiting_or_error` |
| R4 bucket | `plt09_r4_time_bucket_comes_from_the_clock_hour_only` |
| R5 ex1 | `plt09_r5_morning_then_afternoon_same_places_and_the_next_prayer_is_now_asr` |
| R5 ex2 | `plt09_r5_asr_in_40_minutes_is_highlighted_then_evening_adhkar_nothing_moves` |
| R5 (removed in place) | `plt09_r5_an_optional_component_no_longer_eligible_is_removed_in_place` |
| R6 ex1 | `plt09_r6_hidden_choose_reciter_does_not_return_and_the_next_eligible_takes_its_place` |
| R6 ex2 | `plt09_r6_days_without_adhkar_show_evening_adhkar_as_a_tool_without_blame` |

## 3. Defaults chosen where the document is silent (for the PLT owner)

- **Review or lesson as the one next-step card:** the short review when it is due, else the next lesson («أو للمراجعة القصيرة حين تستحق»).
- **First open of the day while online:** the main components show a short skeleton until the order arrives (at most 4 s), so nothing moves after it is shown. Offline: the fixed order at once.
- **«من المكتبة» «يناسب وحدته»:** library items have no unit tags yet, so the pick is the first approved item of the new-Muslim basics topic in the learner's language.
- **«اختر قارئك» «فتح الاستماع»:** counted from the last-surah record on this device (set once a surah was played); eligible only when two or more approved reciters exist (KNW-08 R4: the picker shows from two).
- **Time-of-day bucket** from the clock hour (above), not from prayer times.
- **Hiding «احفظ تقدّمك»** on the organized home is separate from the current Home's «لاحقًا»; either one keeps it away.
- **Ramadan optional component** opens the prayer-times screen, where the Ramadan card is.
- Not built here: MOT's pending badges and in-app reminder on Home (branch `mot-audit-gaps`) appear only on the current Home until they are added to `OrganizedHome` as well.
