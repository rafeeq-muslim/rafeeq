# PLT-01 start and language: implementation

**Feature:** `docs/domains/platform/features/PLT-01-start-and-language.md` (PR #25) · **Rules touched:** `rules.md` §4 (minimum data) · **Written:** 2026-10-06 by Claude.

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 language only; device language suggested | `frontend/src/app/pages/Welcome.tsx`, `stores/device.ts::guessLocale` | Each language in its own script; the device's language carries «مقترحة / Suggested / Mungkahi» written in that language. New: the suggestion badge and a link to the privacy policy (PLT-05 R1) |
| R2 a link carries the language and nothing about the person | `Welcome.tsx::linkLocale`, `Welcome.tsx` (`org` step); `AppLayout.tsx` (first-run redirect keeps only `lang` and a well-formed `org`); `public/landing/landing.js` | `/app/welcome?lang=tl` (the app lives under `/app`, PLT-10) starts in Tagalog at the introduction; the query is dropped from the address. An organisation's link `/app/welcome?lang=tl&org=CODE` (ORG-01, approved by the product owner 2026-10-06) also carries the office's code: it identifies the office, not the person, stays in memory, and nothing is kept on the device or the server before the person answers «نعم» to the organisation question. Nothing else in the query is read or stored. A deeper link (`/learn?lang=tl&…`) reaches `/welcome?lang=tl`. The landing page passes the language only when the visitor chose one there |
| R3 three promises, one button | `Welcome.tsx` (existing) | `onb.intro.p1..p3`, «لنبدأ» |
| R4 nothing personal | `Welcome.tsx` (existing) | No field on any first-run step |
| R5 optional placement, once | `Welcome.tsx` (existing), `placementOffered` | «ابدأ من البداية» → home and the first lesson; «ابدأ الاختبار» → `/learn/placement` |
| R6 once per device | `AppLayout.tsx` (`onboarded`), `lib/privacy.ts::wipeDevice` | Erasing the device returns to `/welcome` |

The bare address `/` for a device that never started still shows the public landing page (whose button opens the language screen); see decisions.

## 2. Tests

Frontend `src/app/platform.rules.test.tsx` (`plt-01-r1` … `plt-01-r6`): Tagalog choice; English suggested on an English phone, another can be chosen; own scripts; Tagalog link skips the language screen; nothing but the language kept; deeper link passes only the language; three promises and one button; no field; placement skip and take; opens on home once started; erase returns to the language screen.
