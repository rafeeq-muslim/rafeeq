import * as React from "react"
import { IconArrowRight, IconDroplet, IconPray, IconStar } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Progress } from "@/components/ui/progress"
import { RadioGroup } from "@/components/ui/radio-group"
import {
  AiDisclosure,
  AppHeader,
  AskComposer,
  AssistantMessage,
  BottomNav,
  CelebrationScreen,
  DailyCard,
  ExerciseFeedback,
  ExerciseOption,
  HumanHelpButton,
  JourneyCard,
  LearningPath,
  LessonCard,
  PathNode,
  PathUnitHeader,
  ReferralCard,
  StreakChip,
  UserMessage,
  XpChip,
  type NavKey,
} from "@/components/rafeeq"
import { Phone, Section } from "./showcase"

function ScreenBody({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-5 pb-4 *:shrink-0">{children}</div>
}

function HomeScreen() {
  const [tab, setTab] = React.useState<NavKey>("home")
  return (
    <Phone label="الرئيسية">
      <ScreenBody>
        <AppHeader name="يوسف" />
        <JourneyCard monthLabel="الشهر الثاني" streakDays={7} />
        <LessonCard icon={IconDroplet} title="الوضوء — الدرس 3 من 5" meta="4 دقائق" progress={60} />
        <DailyCard title="معنى الشهادتين" />
        <AskComposer />
      </ScreenBody>
      <BottomNav active={tab} onNavigate={setTab} />
    </Phone>
  )
}

const THREAD = [
  { id: "1", role: "user" as const },
  { id: "2", role: "assistant" as const },
  { id: "3", role: "user" as const },
  { id: "4", role: "referral" as const },
]

function AskScreen() {
  return (
    <Phone label="اسأل">
      <header className="flex items-center gap-2 border-b bg-card px-4 py-3">
        <p className="flex-1 text-body font-bold">اسأل رفيق</p>
        <HumanHelpButton />
      </header>
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="flex flex-col gap-4 px-4 py-4">
              <AiDisclosure />
              {THREAD.map((m) => (
                <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={m.role === "user"}>
                  {m.id === "1" && <UserMessage time="9:41">كيف أتوضأ؟</UserMessage>}
                  {m.id === "2" && (
                    <AssistantMessage sources={["سورة المائدة، الآية 6"]}>
                      <p>ذكرت آية الوضوء أربعة أعضاء:</p>
                      <ol className="list-decimal ps-5">
                        <li>غسل الوجه.</li>
                        <li>غسل اليدين إلى المرفقين.</li>
                        <li>مسح الرأس.</li>
                        <li>غسل الرجلين إلى الكعبين.</li>
                      </ol>
                    </AssistantMessage>
                  )}
                  {m.id === "3" && <UserMessage time="9:43">أهلي لا يعرفون أني أسلمت، هل أخبرهم الآن؟</UserMessage>}
                  {m.id === "4" && <ReferralCard />}
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="border-t bg-card p-3">
        <AskComposer />
      </div>
    </Phone>
  )
}

function PathScreen() {
  const [tab, setTab] = React.useState<NavKey>("learn")
  return (
    <Phone label="تعلّم">
      <header className="flex items-center gap-2 border-b bg-card px-4 py-3">
        <StreakChip days={7} />
        <XpChip points={1240} className="ms-auto" />
      </header>
      <ScreenBody>
        <LearningPath>
          <PathUnitHeader unit="الوحدة 1" title="يومك الأول" description="الشهادتان، والطهارة، وأول صلاة" />
          <PathNode state="done" label="الشهادتان" icon={IconStar} />
          <PathNode state="done" label="الطهارة" offset={1} />
          <PathNode state="current" label="الوضوء" offset={2} icon={IconDroplet} />
          <PathNode state="locked" label="أوقات الصلاة" offset={1} />
          <PathNode state="locked" label="الصلاة" offset={0} icon={IconPray} />
          <PathUnitHeader unit="الوحدة 2" title="أسبوعك الأول" className="opacity-60" />
        </LearningPath>
      </ScreenBody>
      <BottomNav active={tab} onNavigate={setTab} />
    </Phone>
  )
}

function ExerciseScreen() {
  return (
    <Phone label="تمرين">
      <header className="flex items-center gap-3 px-4 pt-5">
        <Button variant="ghost" size="icon" aria-label="رجوع">
          <IconArrowRight className="ltr:rotate-180" />
        </Button>
        <Progress value={60} aria-label="تقدّم الدرس" className="flex-1" />
      </header>
      <ScreenBody>
        <p className="text-caption text-muted-foreground">الوضوء — الدرس 3 من 5</p>
        <h2 className="font-heading text-h2 font-bold">أيّ هذه ذكرته آية الوضوء؟</h2>
        <RadioGroup defaultValue="b" className="gap-2.5">
          <ExerciseOption value="a" title="غسل الوجه" state="correct" />
          <ExerciseOption value="b" title="غسل الشعر كله" state="incorrect" />
          <ExerciseOption value="c" title="غسل الظهر" />
        </RadioGroup>
        <div className="mt-auto">
          <ExerciseFeedback result="incorrect" explanation="ذكرت الآية مسح الرأس، لا غسل الشعر كله. المصدر: سورة المائدة، الآية 6." />
        </div>
      </ScreenBody>
    </Phone>
  )
}

function CelebrationPhone() {
  return (
    <Phone label="الاحتفال بالوسام" className="border-ink">
      <CelebrationScreen
        icon={IconDroplet}
        badgeLabel="وسام الوضوء"
        title="أتممت مرحلة الوضوء"
        stats={["5 دروس", "120 نقطة تعلّم", "سلسلتك 7 أيام"]}
        primaryLabel="تابع إلى درس الصلاة"
        className="flex-1 justify-center"
      />
    </Phone>
  )
}

function Screens() {
  return (
    <Section
      id="screens"
      title="الشاشات"
      description="شاشات مركّبة من المكوّنات نفسها، بعرض 390px. هي مرجع التصميم لصفحات دليل الهوية (ص 31)، وأمثلة لما يبنيه كل فريق."
    >
      <div className="flex flex-wrap justify-center gap-8">
        <HomeScreen />
        <AskScreen />
        <PathScreen />
        <ExerciseScreen />
        <CelebrationPhone />
      </div>
    </Section>
  )
}

export { Screens }
