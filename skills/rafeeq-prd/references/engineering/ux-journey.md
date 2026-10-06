# UX journey

How each persona (`docs/personas.md`) moves through Rafeeq as built, screen by screen, with the rule behind each moment. The design language is the existing system (`frontend/DESIGN.md`): «زهرة تكتمل», night for welcomes and celebrations, day for work, tactile only on what can be pressed, amber only for celebration and the source strip.

## Principles the journey follows

1. **No gate before learning.** No account, email or phone before the first lesson (PLT-02 R1). The first screen asks only for a language.
2. **One clear next step** on every screen (LRN-02 R3). Home shows one lesson tile; the path scrolls to it.
3. **Mistakes are safe** (LRN-03 R3): amber, never red screens; the right answer and the card's own words; the exercise returns; no hearts, no lives.
4. **Privacy is the default** (rules.md §4): location stays on the device; reminders are neutral; quick exit and discreet mode one tap away in Me.
5. **A human is always one tap away** («أريد إنسانًا» on lessons, review and Ask).
6. **Worship is private and never rewarded**; only learning earns badges and the streak, and the streak pauses, never resets.
7. **Arabic first, three languages equal**: every screen in ar/en/tl, RTL and LTR, Latin digits.

## Joseph — Tagalog, shift worker, two weeks Muslim

| Moment | Screen | What happens | Rule |
| --- | --- | --- | --- |
| Opens a link from the da'wa office | Welcome (night sky, flower) | Taps "Tagalog". Three short promises: short lessons, answers from approved sources or a human, no account needed | PLT-01, PLT-02 R1 |
| "Do you know some basics?" | Placement offer | Taps "Start from the beginning" (or takes the test) | LRN-05 R1 |
| Home | Night sky: "Day 1", flower with no coloured petals, streak "start today". One white tile: lesson 1, "Start the lesson" | LRN-02 R3, MOT-02 |
| First lesson | Full screen. Cards one at a time in Tagalog; each Quran verse appears in Arabic with the Rowwad Tagalog meaning, from QuranEnc | LRN-03 R1, rules.md §1.3 |
| Exercise | Choose / order / match by tapping. Wrong: amber sheet with the right answer and the card text; "Why?" gives a short labelled AI rewording, or the card text if offline | LRN-03 R3, R6 |
| Shift starts mid-lesson | Leaves; three hours later resumes at the same exercise. Two days later: "Continue or start again?" | LRN-03 R5 |
| Finishes | Night screen: the unit's flower gains a petal; "Continue to …" | LRN-03 R4 |
| Evening | Turns on "remind me" at 21:00 in Me. The lock screen later shows only «May maikling aralin na handa kapag gusto mo» | MOT-05 |
| Completes unit 1 | Celebration on ink: badge «Natapos ang Gabay sa Unang Araw» | MOT-03 |
| Offered to save progress | A quiet section on Home after the first lesson: three generated fields, credentials shown once to copy | PLT-02 R2–R4 |

## Daniel — English, learned online, alone

| Moment | Screen | What happens |
| --- | --- | --- |
| First run | English; takes the placement: "more than a month" → starts at unit 2; passes → units 1–2 open (not completed, no badge) | LRN-05 R2–R4 |
| Questions | Ask: answers end with an amber source strip; no source → "I couldn't find a sourced answer, ask a person"; danger phrases → straight to a human | KNW-01, rules.md §2 |
| Wants a person | «I want a human» → his message reaches the team; reply arrives with a neutral notification | CMP-01 |
| Mentor and group | Creates an account, chooses a mentor in English, joins a group by code; display name only | CMP-03, CMP-05, PLT-02 R5 |
| Review | Home shows "Short review: 3 objectives to strengthen"; five objectives at most | LRN-04 |

## Layla — Arabic, hiding her Islam

| Moment | What she uses | Rule |
| --- | --- | --- |
| Fear of being seen | Me → Privacy: quick-exit button (top of every screen → weather page), discreet mode (page title "Notes"), reminders without the app's name or religious words | PLT-05, MOT-05 R3 |
| No traceable data | Account with a generated name; no email unless she chooses two-step sign-in; anonymous statistics can be turned off (one bare "opted out" event, then nothing) | PLT-02, MOT-07 R4 |
| Danger | Any danger phrase in Ask shows the danger panel only: a human now, local emergency services, no AI text | rules.md §2 |
| Leaving | Erase this device's data, or delete the account and all its data | rules.md §4 |

## Abu Abdullah — volunteer mentor

Gets an invite code from the team → signs up with the code and his gender and languages → Mentor inbox: urgent requests first, then help requests in his languages; mentees and, only where the learner allowed it, their engagement status (never mistakes or questions); his groups; a weekly group challenge with collective progress ("6 of 8 completed"), never who didn't. Replies notify the learner neutrally. (CMP-01/02/05, MOT-06, MOT-07 R6.)

## مهند — Sharia reviewer

Gets the reviewer invite → Me → Review desk. Filters by language and status; opens a lesson and reads exactly what learners will read in that language: cards, each verse beside the stored QuranEnc text, objectives, every exercise with its answer. Approves (bound to the exact version he read) or returns with a written reason. After an edit, the desk shows "what learners see now" until he approves the new text. Full history of who decided what and when. (KNW-05.)

## Team member

Me → Team: aggregate status counts, the four rates for 7/30 days, lessons per day with release markers, completions per lesson (where learners stop), understanding in lesson vs review, the "Why?" experiment, placement baseline. Anything under 10 people reads "not enough data yet". Admin: invite codes and roles. (MOT-08, MOT-09.)

## Empty and error states

| Situation | What the person sees |
| --- | --- |
| No approved lessons in this language yet | "Our Sharia reviewer is checking the lessons in your language. They appear here once approved." |
| Offline | Lessons already opened keep working; verse text shows the reference and "appears when you're back online"; events queue and send later |
| Notifications blocked | "Notifications are off in your browser. You can turn them on in its settings." |
| Two-step codes unavailable | "Sending codes by email is not available right now." |
| All lessons done | "You completed all available lessons. More units are coming." |
