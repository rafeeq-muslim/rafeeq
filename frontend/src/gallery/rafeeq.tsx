import * as React from "react"
import {
  IconBook,
  IconCompass,
  IconDroplet,
  IconPray,
  IconRefresh,
  IconStar,
} from "@tabler/icons-react"

import { RadioGroup } from "@/components/ui/radio-group"
import {
  Backdrop,
  CoreGlow,
  IconTile,
  JourneySky,
  LessonMedallion,
  PetalConfetti,
  PetalPattern,
  PetalRow,
  SpotIllustration,
  YearFlower,
  AiDisclosure,
  AskComposer,
  AssistantMessage,
  BottomNav,
  DailyCard,
  DangerHelpPanel,
  ExerciseFeedback,
  ExerciseOption,
  FirstYearCounter,
  HabitItem,
  HelpRequestItem,
  HijriDate,
  HumanHelpButton,
  JourneyCard,
  LanguageSwitcher,
  LeaderboardRow,
  LearningPath,
  LessonCard,
  MentorCard,
  MilestoneBadge,
  PathNode,
  PathUnitHeader,
  PrayerTimesCard,
  PrivacyNote,
  QuickExitButton,
  ReferralCard,
  StreakChip,
  ThemeSwitcher,
  UserMessage,
  XpChip,
  type LocaleCode,
  type NavKey,
  type ThemeCode,
} from "@/components/rafeeq"
import { Demo, Section } from "./showcase"

function RafeeqComponents() {
  const [nav, setNav] = React.useState<NavKey>("home")
  const [lang, setLang] = React.useState<LocaleCode>("ar")
  const [theme, setTheme] = React.useState<ThemeCode>("light")
  const [habits, setHabits] = React.useState({ fajr: true, walk: false })
  return (
    <div className="flex flex-col gap-14">
      <Section
        id="graphics"
        title="رسوم الهوية"
        description="كل الرسوم مولّدة بالكود من بتلة الشعار نفسها، فلا ملفات صور ولا شخصيات ولا وجوه. هذه هي «رسومنا»: ما يميّز رفيق عن أي تطبيق آخر."
      >
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Demo
            name="YearFlower"
            domain="MOT · LRN-02"
            description="عدّاد السنة الأولى رسمًا رئيسيًا: تتلوّن بتلة مع كل شهر تعلّم، من الأعلى مع عقارب الساعة، وتتفتح البتلات على التوالي عند أول ظهور. تتوهّج النواة حين تكتمل السنة."
            rules={["يقيس التعلّم فقط، لا العبادات", "الحركة مرة واحدة في الشاشة الرئيسية، وتُلغى مع تقليل الحركة"]}
            code={`<YearFlower month={2} />
<YearFlower month={12} />                    // complete: core glows
<YearFlower month={5} tone="night" />        // on ink/violet surfaces`}
          >
            <YearFlower month={1} size={96} />
            <YearFlower month={3} size={96} />
            <YearFlower month={6} size={96} />
            <YearFlower month={9} size={96} />
            <YearFlower month={12} size={96} />
          </Demo>

          <Demo
            name="PetalPattern · CoreGlow · PetalConfetti"
            domain="PLT-04"
            description="النقشة قوام على الأسطح الملوّنة وتتجاوز الحواف، والوهج ضوء خلف رقم أو وسام، والقصاصات بتلات للاحتفال وحده."
            rules={["النقشة بنسبة 4 إلى 10% فقط", "الوهج والقصاصات للاحتفال، لا للزخرفة اليومية"]}
            code={`<div className="relative isolate overflow-hidden bg-primary">
  <PetalPattern className="-z-10 text-white/10" />
</div>
<CoreGlow className="size-64" />
<PetalConfetti />`}
            stack
          >
            <div className="grid grid-cols-3 gap-3">
              <div className="relative isolate h-32 overflow-hidden rounded-card bg-primary">
                <PetalPattern className="-z-10 text-white/12" />
              </div>
              <div className="relative isolate grid h-32 place-items-center overflow-hidden rounded-card bg-ink">
                <CoreGlow className="size-40" />
                <span className="relative font-heading text-h1 font-bold text-white tabular-nums">30</span>
              </div>
              <div className="relative isolate h-32 overflow-hidden rounded-card bg-ink">
                <PetalConfetti />
              </div>
            </div>
          </Demo>

          <Demo
            name="Backdrop · IconTile"
            domain="PLT-04"
            description="خلفية التطبيق: تدرّج الرفقة غسلاتٍ خفيفة مع النقشة في أعلاها، في الوضعين. وبلاطة الأيقونة: أيقونة بيضاء على تدرّج بنفسجي لكل صف أو أداة تُفتح."
            rules={[
              "الخلفية في AppShell وحده، ولا يقل عليها تباين نص عن 4.5:1",
              "البلاطة بنفسجية فقط: تدل على ما يُفتح، لا على احتفال",
            ]}
            code={`<div className="relative isolate bg-background">
  <Backdrop />
</div>
<IconTile icon={IconCompass} />           // sm | md | lg`}
            stack
          >
            <div className="relative isolate grid h-40 place-items-center overflow-hidden rounded-card border bg-background">
              <Backdrop />
              <p className="text-label text-muted-foreground">نص ثانوي على الخلفية</p>
            </div>
            <div className="flex items-center gap-3">
              <IconTile icon={IconCompass} size="sm" />
              <IconTile icon={IconBook} />
              <IconTile icon={IconRefresh} size="lg" />
            </div>
          </Demo>

          <Demo
            name="SpotIllustration · PetalRow · LessonMedallion"
            domain="PLT-04"
            description="رسوم صغيرة للحالات الفارغة والبداية، مبنية من مفردات الشعار فقط: بتلة ونواة ومستطيل مستدير وظل مسطّح. ملوّنة للإنجاز، وهادئة للفراغ."
            code={`<SpotIllustration kind="saved" />      // saved | companion | offline | start
<PetalRow count={12} filled={2} />
<LessonMedallion icon={IconDroplet} />`}
          >
            <SpotIllustration kind="start" size={96} />
            <SpotIllustration kind="saved" size={96} />
            <SpotIllustration kind="companion" size={96} />
            <SpotIllustration kind="offline" size={96} />
            <div className="flex flex-col items-center gap-3">
              <LessonMedallion icon={IconDroplet} size={64} />
              <PetalRow count={12} filled={2} />
            </div>
          </Demo>

          <Demo
            name="JourneySky"
            domain="LRN-02 · MOT"
            description="رأس الشاشة الرئيسية: سماء ليلية من الحبري إلى البنفسجي العميق، عليها النقشة والهالة تحيط بزهرة السنة، والتحية وعدد أيام الرحلة. تعلوها ورقة المحتوى (JourneySheet) بزاوية 28."
            code={`<AppShell active="home">
  <JourneySky name="يوسف" day={42} month={2} monthLabel="الشهر الثاني" streakDays={7} />
  <JourneySheet>…</JourneySheet>
</AppShell>`}
            previewClassName="block p-0"
          >
            <div className="@container/shell overflow-hidden">
              <JourneySky name="يوسف" day={42} month={2} monthLabel="الشهر الثاني" streakDays={7} className="pt-6 pb-8" />
            </div>
          </Demo>
        </div>
      </Section>

      <Section
        id="learning"
        title="التعلّم · LRN"
        description="المسار بأسلوب «دولينجو»: وحدات ودروس قصيرة وتمارين. الخطأ في التمرين لطيف: لا قلوب تُفقد ولا شاشة حمراء."
      >
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Demo
            name="JourneyCard · LessonCard · DailyCard"
            domain="LRN-02 · KNW-07"
            description="بطاقات الرئيسية. البطاقة المتدرّجة تبيّن موضع المستخدم من سنته الأولى، والبطاقة الكهرمانية فكرة اليوم بمصدرها."
            rules={["النص الأبيض على طرف البنفسجي العميق فقط", "بطاقة اليوم نصّها حبري، لا أبيض"]}
            code={`<JourneyCard monthLabel="الشهر الثاني" streakDays={7} />
<LessonCard icon={IconDroplet} title="الوضوء — الدرس 3 من 5" meta="4 دقائق" progress={60} />
<DailyCard title="معنى الشهادتين" />`}
            stack
          >
            <JourneyCard monthLabel="الشهر الثاني" streakDays={7} />
            <LessonCard icon={IconDroplet} title="الوضوء — الدرس 3 من 5" meta="4 دقائق" progress={60} />
            <DailyCard title="معنى الشهادتين" />
          </Demo>

          <Demo
            name="LearningPath · PathUnitHeader · PathNode"
            domain="LRN-02"
            description="خريطة المسار. العقد تتمايل بإزاحات منطقية (ms/me) فتنعكس تلقائيًا في العربية. الدرس الحالي بنفسجي بنقطة كهرمانية."
            rules={["مكتمل · حالي · مقفل، ولا حالة رابعة", "المقفل لا يُضغط، ويُقرأ «مقفل» لقارئ الشاشة"]}
            code={`<LearningPath>
  <PathUnitHeader unit="الوحدة 1" title="يومك الأول" />
  <PathNode state="done" label="الشهادتان" />
  <PathNode state="current" label="الوضوء" offset={1} icon={IconDroplet} />
  <PathNode state="locked" label="الصلاة" offset={2} />
</LearningPath>`}
          >
            <LearningPath className="w-full">
              <PathUnitHeader unit="الوحدة 1" title="يومك الأول" description="الشهادتان، والطهارة، وأول صلاة" />
              <PathNode state="done" label="الشهادتان" />
              <PathNode state="done" label="الطهارة" offset={1} />
              <PathNode state="current" label="الوضوء" offset={2} icon={IconDroplet} />
              <PathNode state="locked" label="الصلاة" offset={1} />
              <PathNode state="locked" label="الفاتحة" offset={0} />
            </LearningPath>
          </Demo>

          <Demo
            name="ExerciseOption · ExerciseFeedback"
            domain="LRN-03"
            description="اختيار من متعدد بزر راديو حقيقي (لوحة المفاتيح وقارئ الشاشة). بعد «تحقّق» تظهر الإجابة الصحيحة وسببها."
            code={`<RadioGroup value={answer} onValueChange={setAnswer}>
  <ExerciseOption value="a" title="غسل الوجه" state="correct" />
  <ExerciseOption value="b" title="غسل الشعر كله" state="incorrect" />
</RadioGroup>
<ExerciseFeedback result="incorrect" explanation="…" />`}
            stack
          >
            <p className="text-body font-bold">أيّ هذه من فرائض الوضوء؟</p>
            <RadioGroup defaultValue="b" className="gap-2.5">
              <ExerciseOption value="a" title="غسل الوجه" state="correct" />
              <ExerciseOption value="b" title="غسل الشعر كله" state="incorrect" />
              <ExerciseOption value="c" title="غسل الظهر" />
            </RadioGroup>
            <ExerciseFeedback result="incorrect" explanation="آية الوضوء ذكرت مسح الرأس، لا غسل الشعر كله. المصدر: سورة المائدة، الآية 6." />
          </Demo>
        </div>
      </Section>

      <Section
        id="motivation"
        title="التحفيز · MOT"
        description="كل ما هنا يحسب التعلّم وحده. العبادة لا تُحصى ولا تُكافأ. السلسلة تتوقف مؤقتًا ولا تعود إلى الصفر."
      >
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Demo
            name="FirstYearCounter · MilestoneBadge"
            domain="MOT-03"
            description="عدّاد السنة الأولى: تتلوّن بتلة مع كل شهر تعلّم. وسام المرحلة: حلقة البتلات حول أيقونة الوحدة."
            code={`<FirstYearCounter month={2} />
<MilestoneBadge icon={IconDroplet} label="وسام الوضوء" earned />
<MilestoneBadge icon={IconPray} label="وسام الصلاة" />`}
          >
            <FirstYearCounter month={2} />
            <FirstYearCounter month={7} size={96} />
            <MilestoneBadge icon={IconStar} label="وسام الشهادتين" earned />
            <MilestoneBadge icon={IconDroplet} label="وسام الوضوء" earned />
            <MilestoneBadge icon={IconPray} label="وسام الصلاة" />
          </Demo>

          <Demo
            name="StreakChip · XpChip · LeaderboardRow"
            domain="MOT-01 · MOT-02 · MOT-04"
            description="لوحة الترتيب اختيارية يفعّلها المستخدم، وتعرض الاسم المعروض ونقاط التعلّم فقط."
            rules={["«متوقفة مؤقتًا» لا «خسرت سلسلتك»", "لا نقاط على صلاة أو صيام أو أي عبادة"]}
            code={`<StreakChip days={7} />
<StreakChip days={7} paused />
<XpChip points={1240} />
<LeaderboardRow rank={4} displayName="نجمة الصباح" points={980} isYou />`}
            stack
          >
            <div className="flex flex-wrap gap-2">
              <StreakChip days={7} />
              <StreakChip days={7} paused />
              <XpChip points={1240} />
            </div>
            <ol className="flex flex-col gap-1.5">
              <LeaderboardRow rank={1} displayName="سالك" points={1520} />
              <LeaderboardRow rank={2} displayName="Hope_21" points={1310} />
              <LeaderboardRow rank={4} displayName="نجمة الصباح" points={980} isYou />
            </ol>
          </Demo>
        </div>
      </Section>

      <Section
        id="knowledge"
        title="المعرفة والأسئلة · KNW"
        description="كل إجابة شرعية تنتهي بشريط المصدر الكهرماني. النصوص الشرعية من قاعدة البيانات لا من النموذج. لا فتوى؛ والمسائل الشخصية إلى المرشد."
      >
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Demo
            name="UserMessage · AssistantMessage · SourceStrip · AiDisclosure"
            domain="KNW-01"
            description="مبنية على مكوّنات المحادثة في shadcn (Message وBubble وMarker). AssistantMessage لا تقبل إجابة بلا مصدر."
            code={`<AiDisclosure />
<UserMessage>كيف أتوضأ؟</UserMessage>
<AssistantMessage sources={["سورة المائدة، الآية 6"]}>
  <ol>…</ol>
</AssistantMessage>`}
            stack
          >
            <AiDisclosure />
            <UserMessage time="9:41">كيف أتوضأ؟</UserMessage>
            <AssistantMessage sources={["سورة المائدة، الآية 6"]}>
              <p>ذكرت آية الوضوء أربعة أعضاء:</p>
              <ol className="list-decimal ps-5">
                <li>غسل الوجه.</li>
                <li>غسل اليدين إلى المرفقين.</li>
                <li>مسح الرأس.</li>
                <li>غسل الرجلين إلى الكعبين.</li>
              </ol>
            </AssistantMessage>
          </Demo>

          <Demo
            name="ReferralCard · AskComposer"
            domain="KNW-01 → CMP-01"
            description="حين يكون السؤال شخصيًا أو بلا مصدر معتمد، لا يجيب المساعد، بل يعرض الإحالة إلى المرشد."
            code={`<ReferralCard onRefer={sendToMentor} />
<AskComposer value={q} onChange={setQ} onSend={ask} />`}
            stack
          >
            <ReferralCard />
            <AskComposer />
          </Demo>
        </div>
      </Section>

      <Section
        id="companion"
        title="المرافقة والمجتمع · CMP"
        description="الإنسان على بعد ضغطة دائمًا. حالات الخطر تذهب إلى إنسان فورًا، ولا نخترع أرقام طوارئ."
      >
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Demo
            name="HumanHelpButton · DangerHelpPanel"
            domain="CMP-01"
            description="زر «أريد إنسانًا» ثابت في شاشات السؤال والدروس. لوحة الخطر تظهر وحدها دون إجابة آلية."
            code={`<HumanHelpButton onClick={openHumanRequest} />
<DangerHelpPanel onPrimary={connectNow} onSecondary={showLocalEmergency} />`}
            stack
          >
            <HumanHelpButton className="w-fit" />
            <DangerHelpPanel />
          </Demo>

          <Demo
            name="HelpRequestItem · MentorCard"
            domain="CMP-02 · CMP-03"
            description="صندوق المرشد يعرض ما أذن به المستخدم فقط. المرشدون يُقترحون حسب اللغة والجنس."
            code={`<HelpRequestItem displayName="Joseph" language="Tagalog" preview="…" waited="منذ 20 دقيقة" status="urgent" />
<MentorCard name="أبو عبدالله" languages={["English", "العربية"]} />`}
            stack
          >
            <HelpRequestItem displayName="Joseph" language="Tagalog" preview="Paano ako magdarasal sa trabaho kung walang lugar?" waited="منذ 20 دقيقة" status="urgent" />
            <HelpRequestItem displayName="Daniel" language="English" preview="Is it okay if I still can't pray all five?" waited="منذ ساعتين" status="waiting" />
            <MentorCard name="أبو عبدالله" languages={["English", "العربية"]} note="متاح مساءً، يرد خلال يوم" />
          </Demo>
        </div>
      </Section>

      <Section
        id="practice"
        title="الممارسة اليومية · PRC"
        description="المواقيت تُحسب على الجهاز ولا يغادره الموقع. العادات التعبدية خاصة: بلا نقاط ولا سلسلة ولا وسام."
      >
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Demo
            name="PrayerTimesCard · HijriDate"
            domain="PRC-01 · PRC-04"
            description="الصلاة القادمة بارزة، والأوقات بأرقام لاتينية."
            code={`<PrayerTimesCard next="asr" remaining="بعد ساعة و12 دقيقة"
  times={{ fajr: "4:41", dhuhr: "11:52", asr: "3:17", maghrib: "5:46", isha: "7:16" }} />`}
            stack
          >
            <HijriDate hijri="12 ربيع الآخر 1448" gregorian="5 أكتوبر 2026" />
            <PrayerTimesCard
              next="asr"
              remaining="بعد ساعة و12 دقيقة"
              place="الرياض"
              times={{ fajr: "4:41", dhuhr: "11:52", asr: "3:17", maghrib: "5:46", isha: "7:16" }}
            />
          </Demo>

          <Demo
            name="HabitItem"
            domain="PRC-02"
            description="العادة التعبدية تحمل «خاص بك» ولا تُرسل حدثًا إلى التحفيز. العادة غير التعبدية قد تعرض أيام الالتزام."
            code={`<HabitItem title="صلاة الفجر في وقتها" worship checked={x} onCheckedChange={setX} />
<HabitItem title="المشي 20 دقيقة" checked={y} daysCommitted={12} />`}
            stack
          >
            <HabitItem title="صلاة الفجر في وقتها" worship checked={habits.fajr} onCheckedChange={(v) => setHabits((h) => ({ ...h, fajr: v }))} />
            <HabitItem title="المشي 20 دقيقة" checked={habits.walk} daysCommitted={12} onCheckedChange={(v) => setHabits((h) => ({ ...h, walk: v }))} />
          </Demo>
        </div>
      </Section>

      <Section
        id="platform"
        title="المنصة · PLT"
        description="التنقل واللغة والخصوصية. كل شاشة بثلاث لغات وباتجاهي الكتابة."
      >
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Demo
            name="BottomNav"
            domain="PLT-04"
            description="خمس علامات. أيقونة النشطة في حبة بتدرّج بنفسجي بنقطة كهرمانية، واسمها بنفسجي عريض. وتبويب «مرشدي» حاضر دائمًا."
            code={`<BottomNav active={tab} onNavigate={setTab} />`}
            previewClassName="block p-0"
          >
            <BottomNav active={nav} onNavigate={setNav} />
          </Demo>

          <Demo
            name="LanguageSwitcher · ThemeSwitcher · QuickExitButton · PrivacyNote"
            domain="PLT-01 · PLT-04 · PLT-02 · PLT-05"
            description="كل لغة مكتوبة بلغتها. المظهر فاتح افتراضيًا، والداكن باختيار المستخدم. الخروج السريع يستبدل الصفحة بصفحة محايدة ويمحو الرجوع."
            code={`<LanguageSwitcher value={lang} onValueChange={(code, dir) => setLocale(code, dir)} />
<ThemeSwitcher value={theme} onValueChange={setTheme} />
<QuickExitButton href={NEUTRAL_PAGE} />
<PrivacyNote />`}
            stack
          >
            <LanguageSwitcher value={lang} onValueChange={(c) => setLang(c)} />
            <ThemeSwitcher value={theme} onValueChange={setTheme} />
            <QuickExitButton href="about:blank" className="w-fit" />
            <PrivacyNote />
          </Demo>
        </div>
      </Section>

      <p className="text-caption text-muted-foreground">
        الأسماء والنصوص الشرعية في الأمثلة نموذجية لعرض المكوّنات، ويراجعها المختص الشرعي قبل أي استخدام في المنتج.
      </p>
    </div>
  )
}

export { RafeeqComponents }
