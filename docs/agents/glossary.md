# Glossary (ubiquitous language)

Use these exact terms in docs, code identifiers and UI copy. Arabic is the team's term; English is the code term.

## Shared

| Arabic | English (code) | Meaning |
| --- | --- | --- |
| المسلم الجديد / المستفيد | `learner` | The new Muslim using Rafeeq |
| الزائر | `guest` | A learner without an account; progress stored on the device |
| المرشد | `mentor` | Approved volunteer who follows a few learners |
| المراجع الشرعي | `sharia_reviewer` | Approves all Sharia content before it is shown |
| مالك المجال | `domain_owner` | Team member responsible for a domain |
| تفاعل تعلّم ذو معنى | `learning_interaction` | Completing a lesson, exercise set or review. Not app opens, not worship |

## Learning (`LRN`)

| Arabic | English | Meaning |
| --- | --- | --- |
| المسار | `path` | Ordered units from day one |
| الوحدة | `unit` | Lessons around one practical goal |
| الدرس | `lesson` | A few minutes of explanation and exercises |
| التمرين | `exercise` | Interactive question: choose, order steps, or match (no listening exercises; see LRN-03) |
| المراجعة | `review` | Repeating mistakes and due items |
| دليل اليوم الأول | `day_one_unit` | First unit: shahada meaning, wudu, first prayer |
| بطاقة الشرح | `explanation_card` | One short piece of approved source text inside a lesson, shown with its source |
| المقطع الداعم | `support_video` | Optional approved video inside a lesson; never completes the lesson by itself |
| هدف التعلّم | `learning_objective` | One observable behaviour per objective, 2–4 per lesson, written from the lesson's cards (LRN-10) |
| الموجّه التعليمي | `learning_guide` | Short AI messages after lessons (LRN-07); never «المرشد», which is the human mentor |
| ملخص التعلّم | `learning_summary` | Objective levels, next step, review objectives and language, without identity, sent to the assistant for the guide (LRN-07) |
| الإتقان | `mastery` | Probability 0–1 that the learner has mastered an objective (Bayesian Knowledge Tracing); levels `not_started`, `exposed`, `practising`, `mastered` |
| اختبار تحديد المستوى | `placement_test` | Short test letting knowledgeable users skip ahead |

## Motivation (`MOT`)

| Arabic | English | Meaning |
| --- | --- | --- |
| السلسلة | `streak` | Consecutive learning days; pauses, never resets |
| سلسلة متوقفة | `streak.paused` | State after a missed day; count kept |
| الوسام | `badge` | Milestone for a completed unit or a graduated non-worship habit |
| التحدي الجماعي | `group_challenge` | Weekly shared goal of a group, shown as a count (MOT-06). There are no points (`xp`) and no leaderboard in Rafeeq |
| التذكير | `nudge` | Gentle reminder at a user-chosen time |
| حالة التفاعل | `engagement_status` | `new`, `active`, `at_risk`, `dropped_off`, `returning` (MOT-07) |
| الحدث المجهول | `anonymous_event` | Random install ID + event type + lesson ID + date, to Rafeeq's server only; opt-out in settings. Answer events add objective ID, first-answer correctness, context (`lesson`, `review`, `placement`, `quick_check`) and what was shown after a mistake (`ai_explanation`, `card_only`) |
| مشاركة تقدّمي مع مرشدي | `share_progress_with_mentor` | Learner's permission, off by default; lets the mentor see badges and engagement status |

## Knowledge & Ask (`KNW`)

| Arabic | English | Meaning |
| --- | --- | --- |
| المصدر المعتمد | `approved_source` | Source on the approved list (`sources.md`) |
| المحتوى المعتمد | `approved_content` | Content approved by the Sharia reviewer |
| مقطع مسترجَع | `passage` | Text retrieved from the index for an answer |
| بطاقة المصدر | `source_card` | Source name, reference and link shown under an answer |
| مستوى المحتوى | `content_level` | A, B, C or D (`rules.md` §1.1) |
| المسار (في المساعد) | `route` | general, disputed, personal, sensitive, danger, manipulation, out_of_scope |
| الإحالة | `escalation` | Handing the asker to a human |
| المعجم الموحّد | `glossary_term` | One approved translation per term per language |

## Companion & Community (`CMP`)

| Arabic | English | Meaning |
| --- | --- | --- |
| طلب المساعدة | `help_request` | Message to a human via "I want a human" |
| الطلب العاجل | `urgent_request` | Help request from a danger case |
| صندوق المرشد | `mentor_inbox` | Where mentors see and answer requests |
| المجموعة | `group` | Small, same-gender, same-language group with a mentor |
| البلاغ | `report` | Flagging an abusive or suspicious message |
| أرقام المساعدة | `helpline` | Official, verified numbers per country, shown in a danger case and working offline (`research/08`) |
| الإحالة إلى أهل العلم | `scholar_referral` | A mentor hands a personal Sharia question to the Sharia reviewer instead of answering it |
| دفتر الأسئلة الخاصة | `private_notebook` | Questions kept on the device only; one leaves only when its owner sends it |

## Daily Practice (`PRC`)

| Arabic | English | Meaning |
| --- | --- | --- |
| طريقة الحساب | `calculation_method` | Prayer-time method by country (Umm al-Qura in KSA) |
| العادة | `habit` | Behaviour the user is building |
| العادة التعبدية | `habit.worship` | Worship habit: private, never rewarded |
| تخرّج العادة | `habit.graduated` | User-confirmed: daily tracking stops, record kept |

## Platform (`PLT`)

| Arabic | English | Meaning |
| --- | --- | --- |
| الاسم المعروض | `display_name` | The only public identifier |
| اسم المستخدم | `username` | Sign-in only, never shown |
| التحقق بخطوتين | `two_factor` | Email code, only if the user enables it |
| الوضع الخفي | `discreet_mode` | Neutral name, icon and notifications |
| الخروج السريع | `quick_exit` | Instantly leave to a neutral page |

## Domain events

| Event | From → To |
| --- | --- |
| `ContentApproved` | KNW → LRN |
| `LessonCompleted` (with `is_repeat`), `UnitCompleted`, `ReviewCompleted` | LRN → MOT |
| `ExerciseMissed` | Inside LRN: updates mastery (LRN-10), which feeds adaptive review (LRN-04) |
| `LearningSummaryProvided`, `ExplanationRequested` (card text, exercise, answer, language; no identity) | LRN → KNW assistant (LRN-07, LRN-03) |
| `ObjectiveAsked` (objective ID only, with the learner's consent; never question text) | KNW → LRN (LRN-10) |
| `BadgeEarned`, `EngagementStatusChanged` (carries whether the learner shares progress with the mentor) | MOT → CMP |
| `GroupJoined`, `GroupLeft` (proposed; to agree with the CMP owner) | CMP → MOT |
| `HabitKept` (non-worship only), `HabitGraduated` (non-worship only) | PRC → MOT |
| `EscalationRequested`, `DangerDetected` | KNW → CMP |
| `AccountCreated`, `AccountDeleted` | PLT → LRN, MOT, PRC |
