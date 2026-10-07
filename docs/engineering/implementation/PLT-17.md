# PLT-17 role dashboards fixes: implementation (R3)

**Feature:** `docs/domains/platform/features/PLT-17-role-dashboards-fixes.md` · **Rules touched:** none in `rules.md` (layout only: no data, no copy, no i18n) · **Written:** 2026-10-07 by Claude (branch `plt-17-r3-desktop-shell`). Rules 1, 2 and 4 to 15 were built in PRs #96 to #104 and #117 and have no note here.

## R3: on a computer the dashboards widen for their data

| What | Module | Behaviour |
| --- | --- | --- |
| One mechanism | `frontend/src/components/rafeeq/shell.tsx::AppShell` (`width="column" \| "wide"`), `frontend/src/app/AppLayout.tsx::WIDE, shellWidth` | The column keeps its 600px cap; a wide screen's column grows to 960px from a shell width of 840px (container query, so a phone never changes). The route decides, in one list |
| Which screens | `WIDE` | `/team` (لوحة الفريق), `/review-desk` (the queue of مكتب المراجعة), `/admin` (الإدارة), `/org` (the document's «لوحة الجهة», R15). Exact paths only |
| Which are not | the same list | Every learner screen; the mentor inbox and its conversations; `/referrals`; `/mentor-applications` (not in PLT-17); the review desk's single item, explanation samples and challenge texts (reading and decision screens, where a 960px line is harder to read) |
| Team dashboard | `pages/roles/Team.tsx` | Four rate cards in a row; the daily return chart beside the mentor-contact cards; «من أتمّ كل درس» beside «من أتمّ كل وحدة»; the three understanding cards in a row; the per-unit, lesson-vs-review and mastery rows in two columns; month-start announcements beside «من يرد بكل لغة». The pairs are wrapped in a `display: contents` box, so the phone layout is the same |
| Review desk | `pages/roles/ReviewDesk.tsx` | The queue's cards in two columns; the language toggle keeps a readable width |
| Admin | `pages/roles/Admin.tsx`, `org/AdminOrgs.tsx` | Invite codes are one-line rows (code, role, status, expiry, actions); organisation cards and account cards in two columns; the search box and the organisation form keep a readable width |
| Organisation | `pages/roles/Org.tsx` | The six status figures in one row; the cohort table takes the width; mentor cards in two columns; the tabs keep a readable width |

Page classes use the shell's container query (`@min-[52.5rem]/shell:`), never a viewport breakpoint, so they follow the shell wherever it is rendered.

### The conversation composer (left over from PLT-04, PR #108)

At 1280 the page header was a band from edge to edge, while the composer of «اسأل رفيق» and of the conversations (help thread, mentor inbox thread, group chat, a mentor's group) was a white 600px box on the backdrop; in a short conversation it floated 68px above the bottom of the window (the height assumed a bottom navigation); on Ask the input was inset 12px while the conversation is inset 16px.

`components/rafeeq/shell.tsx::ComposerBar` now carries all of them (`companion/Chat.tsx::Composer`, `pages/Ask.tsx`): on expanded widths its surface runs edge to edge and to the bottom edge, like the header, and the input stays in the page's column, in line with the messages (16px gutters). The four conversation screens take the window height without the bottom navigation on expanded widths. Learner content is not widened, and a phone is unchanged.

### Tests

| Example | Test |
| --- | --- |
| R3: a team member opens the dashboard on a 1280 computer: cards and tables use a wider width, learner screens stay | `frontend/src/app/plt17.r3.desktop-width.rules.test.tsx` (`shellWidth` per route; the rendered `AppLayout` column per route; `AppShell width`) |
| The composer bar follows its page's column | same file («the composer bar follows its page's column») |

jsdom does no layout, so widths were also measured in a headless browser at 390 and 1280, Arabic and English, light and dark (mocked API): see the PR.
