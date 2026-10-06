# PLT-05 privacy and discreet mode: implementation

**Feature:** `docs/domains/platform/features/PLT-05-privacy-and-discreet-mode.md` (PR #25) · **Rules touched:** `rules.md` §4 (minimum data, delete at any time, no third parties), PDPL art. 4, 12 · **Written:** 2026-10-06 by Claude. · **Policy text approved** by the product owner 2026-10-06 (§2).

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 policy before any data | `frontend/src/app/pages/Privacy.tsx` (route `/privacy` in `main.tsx`, outside the first-run guard), keys `policy.*` in `i18n/{ar,en,tl}.ts` | Readable with no account and before onboarding. Linked from the language screen (`Welcome.tsx`), «حسابي» → الخصوصية, account creation (`Account.tsx`, above the fields), «أريد إنسانًا» (`HelpScreen.tsx`, above the message box), Ask (`Ask.tsx`, under the AI disclosure before the first question: the question goes to the AI provider) and mentor matching (`ChooseMentor.tsx::MatchForm`, before «أنا أخ / أخت», key `privacy.beforeYouChoose`: gender is kept for matching) via `PrivacyLink` |
| R2 quick exit | `AppLayout.tsx::QuickExit`, `AppLayout.tsx::PublicFrame` (wraps `/welcome` and `/privacy`, which sit outside AppLayout, in `main.tsx`), `lib/privacy.ts::exitNow`, `shiftTimesThree` | Button at the top of every screen when on, the language screen and the policy included; Shift pressed three times (within 5 s, no other key between; GOV.UK pattern) does the same. The page is covered at once, then replaced by BBC Weather (`location.replace`). The setting carries `privacy.historyNote`: no page can erase history, how to remove it |
| R3 discreet mode | `AppLayout.tsx::useDocumentLocale` (title «Notes»), `public/boot-title.js` + `index.html`, `lib/discreetPref.ts` + `sw.ts`, `practice/reminders.ts::reminderText` | The title is «Notes» from the first moment: a classic same-origin script (the CSP allows no inline script) runs in `<head>` before the static fallback `<title>Rafeeq</title>` and reads the persisted device settings (before: «نظام تصميم رفيق» showed until React loaded). The in-app prayer reminder is «تذكير» even with the prayer name chosen. Push texts are always neutral (PLT-06); in discreet mode the page mirrors the switch into Cache Storage (`rafeeq-prefs`, this device only) and the service worker shows a plain note icon and badge (`public/brand/neutral-note-*.png`, drawn for Rafeeq, no word or symbol) instead of the flower. The browser may still show the site address, or the installed app's name, next to a notification; the copy (`notif.neutral`, `privacy.discreetHint`) now says so instead of promising «no Rafeeq name». Installed name «Rafeeq» and icon are not changed (out of scope; no religious word or symbol) |
| R4 erase this device | `lib/privacy.ts::wipeDevice`; `DELETE /api/help/guest` (`backend/app/companion/help.py::erase_guest`) | Removes every `rafeeq.*` key, session storage, caches, the push subscription (server and browser), signs out, and for a guest deletes its conversations with a person and its blocks on the server (reports it filed stay, without its token). Then `/welcome` (the language screen) |
| R5 delete account | `DELETE /api/me` (existing), `companion/events.py::on_account_deleted`; confirmation in `Me.tsx::DeleteAccount` | New: the person's own group messages are deleted with the account (before: kept without an author). Cascades remove help requests, memberships, mentor link, progress. The confirmation lists what goes and offers «أبقِه» |
| R6 a copy of my data | `GET /api/me/export` (`backend/app/platform/export.py`), one `export_user()` per domain (`learning/`, `motivation/`, `companion/`, `knowledge/export.py`); `lib/privacy.ts::myData`, `downloadMyData`; button in `Me.tsx` | One JSON file: the device's `rafeeq.*` data (the guest help token masked) plus, for an account, the server export. The export never contains another person's name or id (replies show the responder's role; blocks show dates only; groups led show no members or join code) and no secret (no password hash, session, code, push endpoint/keys, invite or join code). Rate limit 10/hour |

## 2. The policy text: what was corrected against the code

The text is research/09 §7, kept in its order, with these corrections so every line matches what the code does on 2026-10-06 (the facts were not changed):

| research/09 §7 said | The code does | Policy now says |
| --- | --- | --- |
| Device: progress, prayer city, notebook | Also private habits, saved items, settings; optional geolocation only picks the nearest city | Lists them all; location «used to pick the nearest city then forgotten» |
| Account: «gender and languages only if you choose a mentor or group» | `users.languages` is set to the interface language at sign-up; `users.locale` is stored; `last_login_at` is stored; disabling 2FA erases the email | «your language, your last sign-in date»; email «erased if you turn it off»; gender when matching |
| Contact: messages, group messages, reports | Also blocks; each help request stores the requester's gender (CMP-01 R3); guests use a random device token | Adds blocks, gender per request, the guest code |
| (nothing on notifications) | `push_subscriptions` keeps endpoint, keys, a random install id, language, time zone, reminder time, last learned / reminded dates | New section «إن فعّلت الإشعارات» |
| AI: «we don't use a provider that keeps or trains on questions» | OpenRouter is asked `provider.data_collection = deny`; no question text is stored, except a saved answer whose question the person chose to keep (KNW-09) | States the request to OpenRouter and the KNW-09 exception |
| «We don't keep the IP address in the app's logs» | True inside the app; the host router keeps an access log with addresses for 14 days (accepted by the product owner, decisions-for-review «Security review» item 1) | Says both |
| Rights: download, delete, erase | Display name can also be corrected (PDPL art. 4) | Adds correcting the display name |
| «Kept until you delete your account or erase your device» | After deletion, reports the person filed and a mentor's replies in others' conversations stay without any link to them; anonymous events stay | Says what stays, without a name |

**Status: final.** The product owner (ناصر بن عبدالعزيز العويمر) approved the text on 2026-10-06. The page's date line (`policy.updated`, `POLICY_UPDATED` in `Privacy.tsx`) now reads «آخر تحديث، واعتمده مالك المنتج: 2026-10-06» (en/tl alike); the page carried no draft marker to remove. This is the owner's approval only: no legal review is claimed.

Still missing (not covered by the approval, not invented): the data controller's name and contact. Rights are exercised in the app («حسابي»), as the policy's rights section says. Conversations are kept until account deletion or device erase.

## 3. Tests

Backend `tests/test_plt05_privacy.py`: `test_plt05_r4_erasing_a_guest_device_removes_its_conversations_from_the_server`, `…_without_a_device_token_deletes_nothing`, `…_drops_its_push_subscription`, `test_plt05_r5_deleting_the_account_leaves_no_name_in_the_group_and_no_mentee`, `test_plt05_r6_account_downloads_its_own_data_and_nothing_about_others`, `…_download_needs_an_account`, `…_blocks_are_listed_without_who_was_blocked`.

Frontend `src/app/platform.gaps.rules.test.tsx` (branch `plt-audit-gaps`): quick exit button and Shift ×3 on `/privacy` and `/welcome` (`plt05_r2_*`), the static title and boot script (`plt05_r3_*`), the installed name has no religious word, the policy link on Ask and mentor matching (`plt05_r1_*`); `src/sw.test.ts`: the neutral notification icon.

Frontend `src/app/platform.rules.test.tsx` (`describe("plt-05-r1 …")` … `plt-05-r6`): policy readable by a guest in Arabic and complete in ar/en/tl; linked from Me, «أريد إنسانًا» (before the message box) and the language screen; quick exit button, Shift ×3, other key resets, 5-second window, history note; title «Notes»; discreet prayer reminder; erase device (server call with the guest token, `rafeeq.*` only, push subscription dropped); delete account can be taken back; data copy for an account and for a guest.
