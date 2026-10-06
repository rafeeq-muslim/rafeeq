# PLT-09 the organized home: implementation

**Feature:** `docs/domains/platform/features/PLT-09-organized-home.md` (approved 2026-10-06, PR #37: «كل ما في رفيق» and «اكتشف» removed, «يومي» follows the time; replaces PLT-08 rules 1, 4, 5) · **Rules touched:** `rules.md` §3 (worship never counted, rewarded or nagged about), §4 (location never leaves the device; minimum data), §2.6 (the model gets no identity) · **Written:** 2026-10-06 by Claude (branch `plt-09-organized-home-build`).

## 0. The setting (on by default, a roll-back switch)

PLT-09 is approved and **on by default** (product owner's instruction, 2026-10-06; PLT owner ناصر بن خالد informed). The setting stays so it can be switched off to roll back: with it off, the app is exactly as before (the previous Home with its PLT-08 suggestion, «كل ما في رفيق», the Discover hub and «أدوات يومية» in «حسابي»), and no `/api/home/order` call is made.

| How | Where |
| --- | --- |
| Roll back: `PLT09_ORGANIZED_HOME=false` in the backend environment, then restart the API. Back on: remove it (default `true`) | `backend/app/core/config.py::plt09_organized_home`, read by the app from `GET /api/home/config` |

Home reads `/api/home/config` (at most every 30 minutes) and keeps the answer on the device (`useDevice.organizedHome`, default `true`); the other screens read only that kept value, so they make no request. Offline the device keeps what it last knew. After switching off, the first Home opened may still show the organized home until the config answer arrives; the next screen follows it.

The pattern follows the repo's existing flags: a typed boolean in `Settings` with an environment override (like `ASK_APPROVED_FAQ_ENABLED`).

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| Switch | `pages/Home.tsx` (`Home` renders `OrganizedHome` or the unchanged `CurrentHome`), `home/setting.ts::useOrganizedHome` (Home) / `useOrganizedHomeCached` (other screens), `home/UnlessOrganized.tsx` | The only change to the previous Home is the wrapper. `/guide` and the Discover hub (`/discover`) lead to Home; Discover's sub-pages (card, library, Quran, saved) stay, and their back arrow goes to Home («محفوظاتي» to «حسابي») |
| R1 next step first; three main; ≤ 2 optional; nothing after | `home/OrganizedHome.tsx` | Header as on Home (greeting, day, streak, Hijri line). One next-step card: the short review when due (LRN-04), else the next lesson (LRN-02). Then the three main components in the day's order, then the optional ones, then nothing (no «كل ما في رفيق») |
| R2 «يومي» | `OrganizedHome.tsx::MyDay`, `home/layout.ts::prayerLine, adhkarLine`, `discover/player.ts::lastSura` | Next prayer and its time from the device city (PRC-01 code, on the device); no city → «اعرف وقت الصلاة حيث أنت». Adhkar line: morning from Fajr to Dhuhr, evening from Asr to Isha, after-prayer in the half hour after Dhuhr, Maghrib and Isha (the same windows as PRC-07 R6), sleep after Isha. Quran: «تابع سورة …» from the last surah listened to on this device (`rafeeq.quranPos.last`, written with the stop position; KNW-08 R6 keeps only stop positions), else «استمع إلى القرآن». Library. Each one tap; no counter |
| R2 «حسابي» | `pages/Me.tsx` | «أدوات يومية» (with its «كل ما في رفيق» row) is not shown, and «محفوظاتي» is. Qibla, the prayer reminder and Ramadan already live in the prayer-times screen (`practice/PracticeHome.tsx`) |
| R3 fixed optional list, eligibility on the device | `home/layout.ts::OPTIONAL, eligible`, `home/useOrganized.ts::useEligibility` | ramadan (14 days before to its end, PRC-04 data on the device); human (after the first lesson, no mentor: `/api/mentors/mine` when signed in); save (guest after the first lesson, not closed with «لاحقًا» nor hidden); reciter (listened on this device, no reciter chosen (`discover/reciters.ts::loadReciterChoice`), two or more approved reciters from `/api/discover/recitations`, as the surah page shows its picker from two; it opens the last surah's page, where the picker is); library (after `u01-l7`, an approved basics item in the learner's language) |
| R4 the model orders | `backend/app/platform/home.py` (`POST /api/home/order`), `knowledge/ai/agents.py::order_home`, prompt `knowledge/ai/prompts/home_order.md`; `home/useOrganized.ts::useDayOrder, orderBody` | Body = the guide's learning summary (`ask/guide.ts::buildSummary`: mastered, reviewing, next) + `bucket` + `lang`; the request model forbids any other field (422). Same model tier as the guide (fast). Output ids only, checked on the server and again on the device (`check_order` / `checkOrder`): every main id once, known optional ids, nothing else (so no next step). Refused, failed, slow (> 4 s) or offline → the fixed order (يومي، بطاقة اليوم، اسأل، then the table order). Offline: at once, no request |
| R5 once a day | `home/store.ts` (`rafeeq.home`: day, order, slots), `layout.ts::daySlots, visibleOptional` | The order is set on the first opening of the device day and kept until the next. Optional slots placed today keep their places: one no longer eligible disappears in place and its slot is not refilled that day; the contents of «يومي» and the next step change with time |
| R6 hide; no reward or blame | `OrganizedHome.tsx::OptionalCard`, `store.ts::hide` | One tap hides an optional component for good; its slot stays empty that day and the next eligible takes it the next day (§4). Kept on this device only (never sent, the model included). Copy introduces tools only |

Time-of-day bucket: from the device clock hour only (04–06 fajr, 06–11 morning, 11–15 dhuhr, 15–18 asr, 18–21 evening, else night), never from prayer times, which come from the location.

## 2. Tests

Backend `backend/tests/test_plt09_home.py` (provider never called: `tests/knw_fakes.py`, respx refuses any other host):

| Example | Test |
| --- | --- |
| Setting on by default; switched off: reported, no model call | `test_plt09_setting_is_on_by_default`, `test_plt09_setting_on_is_reported`, `test_plt09_setting_switched_off_is_reported_and_never_calls_the_model`, `test_plt09_setting_env_false_switches_it_off` |
| R4 ex1 | `test_plt09_r4_model_orders_main_and_whole_optional_list_from_summary_and_time` |
| R4 ex2 | `test_plt09_r4_invalid_output_is_refused_and_fixed_order_follows` (6 cases), `test_plt09_r4_outage_gives_null_without_error` |
| R4 «ما لا يدخل», R2 ex3 | `test_plt09_r4_nothing_opened_dismissed_worship_or_location_enters` (6 cases), `test_plt09_r4_bucket_is_one_of_six` |

Frontend `frontend/src/app/home/plt09.rules.test.tsx`:

| Example | Test |
| --- | --- |
| Setting on by default; switched off restores the previous app | `plt09_setting_is_on_by_default_on_the_device`, `plt09_setting_on_by_default_home_me_guide_and_discover_follow_plt09`, `plt09_setting_switched_off_by_the_server_restores_the_previous_app`, `plt09_setting_switched_back_on_by_the_server_turns_the_organized_home_on` |
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
| R6 ex1 | `plt09_r6_hidden_choose_reciter_does_not_return_and_the_next_eligible_takes_its_place_the_next_day` |
| R6 ex2 | `plt09_r6_days_without_adhkar_show_evening_adhkar_as_a_tool_without_blame` |

## 3. Defaults chosen where the document is silent (for the PLT owner)

- **Review or lesson as the one next-step card:** the short review when it is due, else the next lesson («أو للمراجعة القصيرة حين تستحق»).
- **First open of the day while online:** the main components show a short skeleton until the order arrives (at most 4 s), so nothing moves after it is shown. Offline: the fixed order at once.
- **«من المكتبة» «يناسب وحدته»:** library items have no unit tags yet, so the pick is the first approved item of the new-Muslim basics topic in the learner's language.
- **«اختر قارئك» «فتح الاستماع»:** counted from the last-surah record on this device (set once a surah was played); eligible only when two or more approved reciters exist (KNW-08 R4: the picker shows from two).
- **Time-of-day bucket** from the clock hour (above), not from prayer times.
- **Hiding «احفظ تقدّمك»** on the organized home is separate from the current Home's «لاحقًا»; either one keeps it away.
- **Ramadan optional component** opens the prayer-times screen, where the Ramadan card is.
- PLT-08 tests of rules 1 and 5 (`platform.gaps.rules.test.tsx`) now run on the previous Home (setting off), which is what those rules describe since PLT-09 replaced them.

## 4. Reconciliation with PLT-08 (2026-10-06)

PLT-09 replaces PLT-08 rules 1, 4 and 5, not rule 3, so on the organized home PLT-09 decides the layout and PLT-08 R3 still limits what is new (the audit `prd-audit-2026-10-06` found the two in conflict; PLT-09 is the newer, approved document and wins wherever they truly differ):

- **One new optional component a day** (PLT-08 R3): `home/layout.ts::daySlots` fills up to two slots (PLT-09 R1) but at most one component never shown before; `store.ts::shown` keeps the day each was first shown. So day one shows one, the next day two.
- **Hiding frees nothing until tomorrow** (PLT-08 R3 «the next one waits until tomorrow»): the hidden component keeps its slot, shown as nothing, for the rest of the day; the next eligible takes it the next day (PLT-09 R6 ex1, read as «after that», not «at once»).
- **Never offered after the feature was opened** (PLT-08 R3 ex3): `eligible()` checks `opened`: Ramadan and «لست وحدك» from the guide's `used` keys, save progress (`/me/account`) and the library (`/discover/library`) from `layout.ts::openedBy`, recorded by `useGuideTracker`.
- **Save progress in Ramadan** (PLT-02 R1): Ramadan holds a slot all month, so while it is eligible `keepSaveInReach` keeps the save-progress offer within the first two eligible; outside Ramadan the day's order stands (PLT-09 R4).

Tests: `plt08_r3_ex2_day_one_shows_one_new_optional_component_not_two`, `plt08_r3_ex2_hiding_today_brings_no_replacement_until_tomorrow`, `plt08_r3_ex3_a_feature_already_opened_is_not_offered`, `plt08_r3_ex3_opening_the_library_or_the_mentor_screen_ends_its_component_on_home`, `plt02_r1_save_progress_is_not_crowded_out_in_ramadan`, and `plt09_r6_hidden_choose_reciter_does_not_return_and_the_next_eligible_takes_its_place_the_next_day` (renamed).
