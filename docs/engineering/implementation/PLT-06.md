# PLT-06 notifications: implementation

**Feature:** `docs/domains/platform/features/PLT-06-notifications.md` (PR #25) · **Rules touched:** `rules.md` §3 (notifications), §4 (neutral by default) · **Written:** 2026-10-06 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 nothing until turned on; permission once, after a tap | `frontend/src/app/lib/push.ts::askPermission`, `subscribe`; `push_subscriptions.replies_enabled` (migration `b7c8d9e0f1a2`) | Permission is requested only from a switch the person taps, only while the browser has not answered. A new subscription has both push types off |
| R2 three types, one switch each, in one place | `Me.tsx::NotificationSettings`; `PUT /api/push/replies`, `POST /api/push/state` (`backend/app/platform/push.py`) | Learning reminder (MOT-05, server push), replies from a person (CMP-01, server push), prayer reminder (PRC-05, computed and shown on the device while Rafeeq is open; no permission needed). Turning one off leaves the others. With both push types off the subscription is removed on the server and in the browser (minimum data). Switches are read back from the server on opening Me |
| R3 neutral lock screen | `backend/app/companion/notify.py::TEXTS`, `push.py::REMINDER_TEXT` (unchanged, now tested), `notif.neutral` line in Me | «لديك رد جديد» only; no app name, no religious word, no message text |
| R4 iPhone | `push.ts::pushState` («ios-home-screen» for iPhone/iPad outside the Home Screen) | Me explains how to add Rafeeq to the Home Screen; the push switches are off and disabled, never shown on |
| R5 refused permission | `pushState` («denied»), `askPermission` | Me says notifications are off in the device settings and how to allow them again; push switches disabled; the app never asks again |
| R6 discreet mode | `practice/reminders.ts::reminderText` | The prayer reminder (the only notification text that can carry a religious word) is «تذكير» in discreet mode. Server pushes never know discreet mode and are always neutral |

Server-side respect of each switch: `push.send_to_user` and `notify.to_endpoint` send only to subscriptions with `replies_enabled`; `run_reminders` only to `reminder_enabled`.

**Migration `b7c8d9e0f1a2`** (additive): `replies_enabled boolean not null default false`. Subscriptions that existed before are set to true, because they were receiving replies and the person had turned notifications on; the switch shows on and can be turned off. The previous image ignores the column and still runs.

## 2. Tests

Backend `tests/test_plt06_notifications.py`: `test_plt06_r1_a_new_device_gets_nothing_until_it_turns_a_type_on`, `test_plt06_r2_turning_the_learning_reminder_off_keeps_replies`, `…_turning_replies_off_stops_them_for_a_guest_device_too`, `…_the_device_reads_back_each_switch`, `…_replies_switch_needs_a_subscribed_device`, `test_plt06_r3_lock_screen_shows_only_you_have_a_new_reply`, `test_plt06_r3_r6_no_server_notification_names_rafeeq_or_a_religious_word`.

Frontend `src/app/platform.rules.test.tsx` (`plt-06-r1` … `plt-06-r6`): nothing asked on opening Me and every switch off; permission asked once; three switches in one section; reminder off keeps replies and the subscription; both off removes it; prayer switch needs no permission; lock-screen note; prayer name only when chosen; iPhone note with switches off and disabled; refused permission explained, never asked again; discreet prayer reminder neutral.
