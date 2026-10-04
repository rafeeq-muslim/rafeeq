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
| التمرين | `exercise` | Interactive question (choose, order steps, match, listen) |
| المراجعة | `review` | Repeating mistakes and due items |
| دليل اليوم الأول | `day_one_unit` | First unit: shahada meaning, wudu, first prayer |
| اختبار تحديد المستوى | `placement_test` | Short test letting knowledgeable users skip ahead |

## Motivation (`MOT`)

| Arabic | English | Meaning |
| --- | --- | --- |
| نقاط التعلّم | `xp` | Points from learning only |
| السلسلة | `streak` | Consecutive learning days; pauses, never resets |
| سلسلة متوقفة | `streak.paused` | State after a missed day; count kept |
| الوسام | `badge` | Milestone for a completed unit or a graduated non-worship habit |
| لوحة الترتيب | `leaderboard` | Opt-in ranking by learning XP |
| التذكير | `nudge` | Gentle reminder at a user-chosen time |

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
| `LessonCompleted`, `UnitCompleted`, `ExerciseMissed` | LRN → MOT (and LRN review) |
| `HabitKept` (non-worship only), `HabitGraduated` (non-worship only) | PRC → MOT |
| `EscalationRequested`, `DangerDetected` | KNW → CMP |
| `AccountCreated`, `AccountDeleted` | PLT → LRN, MOT, PRC |
