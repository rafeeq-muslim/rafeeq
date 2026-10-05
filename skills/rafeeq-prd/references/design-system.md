# نظام التصميم (PLT-04)

مرجع واحد لكل من يصمم شاشة في رفيق أو يبرمجها: الألوان والخطوط والمكوّنات، ومتى يُستعمل كل منها. الكود في `design-system/`، وهو مبني على shadcn/ui وTailwind v4، وعربي أولًا من اليمين إلى اليسار.

- **المالك:** ناصر بن خالد العويمر.
- **المصدر:** دليل الهوية v1.0 وحزمة الشعار (أكتوبر 2026).
- **العقد التقني:** [`design-system/DESIGN.md`](../design-system/DESIGN.md)، وفيه الرموز بصيغة يقرؤها الإنسان والوكيل، ويُفحص بأداة `@google/design.md lint`.

ملحقان: [دليل كتابة النصوص](design-system/copy.md)، و[مواصفات تسليم الشاشات](design-system/handoff.md).

---

## شاهِده

```bash
cd design-system
npm install
npm run dev
```

يفتح معرضًا من أربعة أقسام: **الأساسيات** (ألوان، خطوط، زوايا، ظلال، أيقونات، شعار)، و**المكوّنات** (مكوّنات shadcn بعد ضبطها)، و**مكوّنات رفيق** (حسب المجالات)، و**الشاشات** (الرئيسية، اسأل، تعلّم، تمرين، الاحتفال). لكل مكوّن معاينة حية، وقواعده، وزر «اعرض الكود» لنسخه. في أعلى الصفحة زرّان لتبديل الاتجاه (عربي/لاتيني) والمظهر (فاتح/داكن).

للانتقال المباشر: `?tab=screens` أو `?tab=rafeeq&dir=ltr&theme=dark`.

## استعمِله

```tsx
import { Button } from "@/components/ui/button"
import { LessonCard, SourceStrip, BottomNav } from "@/components/rafeeq"
import { IconDroplet } from "@tabler/icons-react"

<LessonCard icon={IconDroplet} title="الوضوء — الدرس 3 من 5" meta="4 دقائق" progress={60} />
<Button variant="celebrate">تابع إلى درس الصلاة</Button>
```

| المجلد | ما فيه |
| --- | --- |
| `src/styles/tokens.css` | ألوان الهوية وخطوطها ومسافاتها كما في دليل الهوية (الطبقة الأولى) |
| `src/index.css` | الرموز الدلالية (primary، celebrate، muted…) للوضعين الفاتح والداكن، وربطها بـ Tailwind |
| `src/components/ui/` | 38 مكوّنًا من shadcn/ui بعد ضبطها على الهوية |
| `src/components/rafeeq/` | مكوّنات رفيق، ملف لكل مجال: `learning`، `motivation`، `celebration`، `knowledge`، `companion`، `practice`، `platform`، و`brand` للشعار |
| `src/gallery/` | صفحات المعرض، وهي أيضًا أمثلة استعمال |
| `scripts/check-design.sh` | فحص آلي يمنع ما يكسر الاتجاه أو يتجاوز الرموز (`npm run check:design`) |

---

## القواعد التي لا تُكسر

1. **البنفسجي للفعل، والكهرماني للاحتفال.** الكهرماني للأوسمة، وزر الاحتفال، وشريط المصدر، ونقطة التبويب النشط فقط، ولا يُستعمل للزخرفة أو حالة المرور.
2. **لا نص أبيض على الكهرماني أو الأوركيد.** النص فوقهما حبري.
3. **كل إجابة شرعية تنتهي بشريط المصدر.** وما لا مصدر له لا يُعرض إجابةً، بل تُعرض الإحالة إلى المرشد.
4. **الإنسان على بعد ضغطة.** زر «أريد إنسانًا» ظاهر في شاشات السؤال والدروس، وتبويب «مرشدي» ثابت في التنقل.
5. **التحفيز للتعلّم وحده.** لا نقاط ولا سلسلة ولا وسام على عبادة. والسلسلة «متوقفة مؤقتًا» ولا تعود إلى الصفر.
6. **من اليمين إلى اليسار أولًا.** خصائص منطقية فقط (`ms` و`pe` و`start` و`text-start`)، والأسهم تنعكس، وكل شاشة تُختبر بالاتجاهين.
7. **لا تباعد بين حروف العربية، ولا مائل.** وارتفاع السطور كما في السلّم، فلا يُضغط.
8. **الأرقام لاتينية في كل مكان.**
9. **لا تغيّر ألوان المكوّن بـ `className`.** استعمل المتغيّرات الجاهزة (`variant`) والرموز الدلالية.
10. **الشعار من ملفاته الرسمية أو من `RafeeqSymbol`.** لا يُمدّد ولا يُعاد تلوينه.

## الرموز باختصار

| الرمز | القيمة | الاستعمال |
| --- | --- | --- |
| `primary` | بنفسجي رفيق #5A48D6 | الأزرار والروابط والتبويب النشط وفقاعة المستخدم |
| `celebrate` | كهرماني #F5A23A، ونصه حبري | الاحتفال وشريط المصدر |
| `foreground` / `background` | حبري #1D1645 / ضباب #F7F6FB | النص / خلفية التطبيق |
| `card` | أبيض | البطاقات والفقاعات |
| `success` `warning` `destructive` `info` | لكل منها لون نص وسطح | التنبيهات والشارات |
| `bg-grad-main` | تدرّج الرفقة، وينعكس في العربية | بطاقة الرحلة فقط |
| الخطوط | ثمانية (سانس، سيرف ديسبلاي، سيرف تكست)، والبديل IBM Plex Sans Arabic وNoto Naskh Arabic | `font-sans` و`font-heading` و`font-reading` |
| السلّم | 56، 40، 28، 22، 19، 17، 15، 13 | `text-display` إلى `text-caption` |
| الزوايا | 12 الحقول، 20 البطاقات، 28 اللوحات، وحبّة دواء للأزرار | `rounded-md` و`rounded-card` و`rounded-panel` و`rounded-full` |
| الظلال | `shadow-card` و`shadow-raised` و`shadow-glow` (للاحتفال فقط) | |

**عن خط ثمانية:** ترخيصه يمنع رفع ملفاته أو استضافتها، فلا نضعه في المستودع. يظهر عند من ثبّته على جهازه، ويظهر البديل عند غيره. استعماله خطًا للويب في المنتج يحتاج موافقة من ثمانية ⚠️.

---

## أيّ مكوّن أستعمل؟

| تريد أن… | استعمل | الميزة |
| --- | --- | --- |
| تعرض موضع المستخدم من سنته الأولى | `JourneyCard`، `FirstYearCounter` | LRN-02، MOT |
| تتيح متابعة الدرس الحالي | `LessonCard` | LRN-02 |
| تعرض خريطة المسار | `LearningPath` + `PathUnitHeader` + `PathNode` | LRN-02 |
| تبني تمرين اختيار | `RadioGroup` + `ExerciseOption`، ثم `ExerciseFeedback` | LRN-03 |
| تعرض بطاقة اليوم | `DailyCard` | KNW-07 |
| تعرض نقاط التعلّم أو السلسلة | `XpChip`، `StreakChip` | MOT-01، MOT-02 |
| تحتفل بإتمام وحدة | `CelebrationScreen`، `MilestoneBadge` | MOT-03 |
| تعرض لوحة الترتيب | `LeaderboardRow` | MOT-04 |
| تعرض محادثة السؤال | `MessageScroller` + `UserMessage` + `AssistantMessage` + `AiDisclosure` | KNW-01 |
| تذكر مصدر الإجابة | `SourceStrip` (داخل `AssistantMessage` تلقائيًا) | KNW-01 |
| تحيل السؤال إلى إنسان | `ReferralCard`، `HumanHelpButton` | KNW-01 ← CMP-01 |
| تتعامل مع حالة خطر | `DangerHelpPanel` | CMP-01 |
| تعرض طلبات المرشد | `HelpRequestItem` | CMP-02 |
| تقترح مرشدًا | `MentorCard` | CMP-03 |
| تعرض المواقيت | `PrayerTimesCard`، `HijriDate` | PRC-01، PRC-04 |
| تعرض عادة | `HabitItem` (وللعبادة `worship`) | PRC-02 |
| تبني التنقل أو الرأس | `BottomNav`، `AppHeader` | PLT-04 |
| تتيح اختيار اللغة | `LanguageSwitcher` | PLT-01 |
| تطمئن المستخدم على بياناته | `PrivacyNote` | PLT-02 |
| تتيح الخروج السريع | `QuickExitButton` | PLT-05 |
| زرًا أو حقلًا أو نافذة أو تنبيهًا | من shadcn: `Button`، `Field` + `Input`، `Drawer`، `AlertDialog`، `Alert`، `Empty`، `toast` | — |

## مكوّنات رفيق

| المكوّن | ما يفعله | أهم خصائصه |
| --- | --- | --- |
| `RafeeqSymbol` | زهرة الرفاق مرسومة بالكود، وتسمك خطوطها تلقائيًا تحت 64px | `size`، `tone`: color أو ink أو white |
| `RafeeqLogo` | الشعار من ملفات الحزمة | `variant`: horizontal، vertical، international |
| `Halo`، `PetalList` | الهالة خلفيةً، والبتلة علامةً للقوائم | — |
| `JourneyCard` | بطاقة الرحلة المتدرّجة | `monthLabel`، `streakDays`، `streakPaused` |
| `LessonCard` | «أكمل التعلّم» مع شريط التقدّم | `icon`، `title`، `meta`، `progress` |
| `DailyCard` | بطاقة اليوم الكهرمانية بنص حبري | `title`، `source` |
| `PathNode` | درس في الخريطة: مكتمل أو حالي أو مقفل | `state`، `label`، `icon`، `offset` (-2 إلى 2) |
| `ExerciseOption` | إجابة في تمرين، وهي زر راديو حقيقي | `value`، `title`، `state`: idle أو correct أو incorrect |
| `ExerciseFeedback` | نتيجة التحقق بلطف، مع السبب | `result`، `explanation` |
| `FirstYearCounter` | 12 بتلة، تتلوّن واحدة مع كل شهر تعلّم | `month` (1 إلى 12) |
| `MilestoneBadge` | وسام المرحلة: حلقة بتلات حول أيقونة | `icon`، `label`، `earned` |
| `StreakChip`، `XpChip` | السلسلة الرحيمة ونقاط التعلّم | `days`، `paused` / `points` |
| `LeaderboardRow` | صف في لوحة الترتيب بالاسم المعروض | `rank`، `displayName`، `points`، `isYou` |
| `CelebrationScreen` | شاشة الاحتفال على السطح الحبري | `icon`، `badgeLabel`، `title`، `stats`، `primaryLabel` |
| `UserMessage`، `AssistantMessage` | فقاعتا السؤال والإجابة، ولا تُقبل إجابة بلا مصدر | `sources` إلزامية |
| `SourceStrip`، `AiDisclosure` | شريط المصدر، والتنبيه الدائم إلى الذكاء الاصطناعي | `href` |
| `ReferralCard`، `AskComposer` | الإحالة إلى المرشد، وخانة السؤال بالنص أو الصوت | `onRefer` / `onSend`، `onVoice` |
| `HumanHelpButton`، `DangerHelpPanel` | «أريد إنسانًا»، ولوحة حالة الخطر | `onPrimary`، `onSecondary` |
| `HelpRequestItem`، `MentorCard` | طلب في صندوق المرشد، ومرشد مقترح | `status`: new أو waiting أو answered أو urgent |
| `PrayerTimesCard`، `HijriDate`، `HabitItem` | المواقيت، والتاريخ الهجري، والعادة | `next`، `times` / `worship` |
| `BottomNav`، `AppHeader` | التنقل بخمسة تبويبات، والتحية | `active`، `labels` / `name` |
| `LanguageSwitcher`، `QuickExitButton`، `PrivacyNote` | اللغة، والخروج السريع، ووعد الخصوصية | `value` / `href` |

كل النصوص الافتراضية عربية، وكلها قابلة للاستبدال بخصائص (`title`، `label`، `actionLabel`…) لتُترجم.

---

## مكوّن جديد

قبل أن تبني مكوّنًا، تأكد أنه غير موجود في الجدولين أعلاه ولا في shadcn (`npx shadcn@latest search`). ثم اكتب مواصفته هنا بهذا القالب، وضعه في ملف المجال الذي يملكه:

```markdown
### <اسم المكوّن> (<معرّف الميزة>)
- **المشكلة:** أي حاجة للمستخدم يسدّها؟
- **ما يشبهه ولماذا لا يكفي:** <مكوّن موجود> — <ما ينقصه>
- **الخصائص:** الاسم · النوع · الافتراضي · الوصف
- **المتغيّرات:** خمسة على الأكثر، ومتى يُستعمل كل منها
- **الحالات:** الافتراضية، المرور، التركيز، الضغط، التعطيل، التحميل، الخطأ، الفراغ
- **الرموز المستعملة:** الألوان، المسافات، الخطوط
- **إمكانية الوصول:** الدور، لوحة المفاتيح، ما يقرؤه قارئ الشاشة
- **أسئلة مفتوحة:**
```

## قبل الدمج

- [ ] يعمل بالاتجاهين وبالمظهرين في المعرض، وبعرض 375px.
- [ ] اختُبر بأطول نص متوقع (التاغالوغية أطول غالبًا من العربية والإنجليزية).
- [ ] `npm run check:design` و`npx tsc -b` و`npm run build` تنجح.
- [ ] مساحة اللمس 44px على الأقل، والتركيز ظاهر، وكل أيقونة بلا نص لها `aria-label`.
- [ ] كل الحالات مصمّمة: التحميل، والفراغ، والخطأ مع طريق للخروج.
- [ ] النصوص تتبع [دليل الكتابة](design-system/copy.md).
- [ ] لم تُكسر قاعدة من `agents/rules.md`، وأُضيف أي خط أو مكتبة جديدة إلى `agents/sources.md`.

---

## المهارات التي يعتمد عليها

بحثنا في مهارات أنظمة التصميم المتاحة وقارنّا ثماني منها (التقرير في `rafeeq-research/05-design-system-skills.md`)، واخترنا مزيجًا بدل مهارة واحدة، لأن أيًّا منها لا يغطي shadcn مع Tailwind v4 والعربية معًا. كلها في `.claude/skills/` فتعمل تلقائيًا مع Claude Code لكل الفريق:

| المهارة | المصدر | دورها |
| --- | --- | --- |
| `shadcn` | الرسمية من shadcn (MIT) | قواعد بناء المكوّنات وتركيبها، وأوامر الإضافة |
| `design-system`، `design-handoff`، `design-critique`، `ux-copy`، `accessibility-review` | إضافة Design من Anthropic (Apache-2.0) | توثيق المكوّنات، ومواصفات التسليم، والنقد، والنصوص، وفحص الوصول |
| `design-systems`، `design-elevation`، `interaction-design`، `ux-writing` | design-skills من دليل Anthropic (MIT) | بنية الرموز والتسمية، وصقل الشكل، والحالات والتفاعل، وأنماط النصوص |
| `token-audit`، `token-compliance`، `accessibility-per-component`، `usage-guidelines`، `agent-instructions` | design-system-ops (MIT) | تدقيق قبل العرض |
| صيغة `DESIGN.md` | Google Labs (Apache-2.0) | عقد الرموز وفحصه الآلي |
| `rafeeq-design-system` | كتبناها (`skills/`) | ما لا تغطيه المهارات العامة: العربية والاتجاه وقواعد رفيق. **قواعدها تتقدم على النصائح العامة** |

كيف طُبّقت: بُنيت المكوّنات بقواعد `shadcn` (مكوّنات المحادثة الرسمية، و`Field` للنماذج، و`data-icon`). ووُثّقت بقالب `design-system`. ثم صُوّرت الشاشات ونُقدت بـ `design-critique`، فكشف النقد ستة أخطاء أُصلحت:
- انضغاط البطاقات حتى تُقص أزرارها.
- عدّاد السنة غير مقروء.
- علامة الاستفهام في الجمل اللاتينية داخل العربية تظهر في غير موضعها.
- تاريخ ميلادي معكوس.
- علامات القوائم تشبه الصفر.
- تذييل البطاقة الرمادي الثقيل.

وكُتبت النصوص بـ `ux-copy` و`ux-writing`، والمواصفات بـ `design-handoff`.

## مسائل مفتوحة

- ⚠️ ترخيص خط ثمانية للويب: نراسل ثمانية، وإلى ذلك الحين يظهر البديل.
- ⚠️ أرقام الطوارئ في `DangerHelpPanel`: لا تُضاف إلا موثّقة لكل بلد، ومسجّلة في `agents/sources.md`.
- 💬 وجهة «الخروج السريع» (`QuickExitButton href`): صفحة محايدة تُحدد لكل سوق.
- ⚠️ النصوص الشرعية في أمثلة المعرض نموذجية لعرض المكوّنات، ويراجعها مهند بن صالح الفوزان قبل أي استعمال.
- 💬 اسم التبويب «مرشدي» حين لا يكون للمستخدم مرشد بعد.
