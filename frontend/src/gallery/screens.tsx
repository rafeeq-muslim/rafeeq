import * as React from "react"
import {
  IconArrowRight,
  IconBook2,
  IconDroplet,
  IconPray,
  IconStar,
  IconX,
} from "@tabler/icons-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Progress } from "@/components/ui/progress"
import { RadioGroup } from "@/components/ui/radio-group"
import {
  AiDisclosure,
  AppShell,
  AskComposer,
  AssistantMessage,
  CelebrationScreen,
  DailyCard,
  ExerciseFeedback,
  ExerciseOption,
  HumanHelpButton,
  JourneySheet,
  JourneySky,
  LearningPath,
  LessonCard,
  MentorCard,
  MilestoneBadge,
  PetalRow,
  PathNode,
  PathUnitHeader,
  ReferralCard,
  StreakChip,
  TopBar,
  UserMessage,
  type NavKey,
} from "@/components/rafeeq"
import { NoteButton } from "./notes"
import { Section } from "./showcase"

/* ---------- Device frames (gallery chrome, not part of the system) ---------- */

function StatusBar({ dark = false }: { dark?: boolean }) {
  return (
    <div
      dir="ltr"
      className={
        "pointer-events-none absolute inset-x-0 top-0 z-30 flex h-11 items-center justify-between px-7 text-[13px] font-semibold " +
        (dark ? "text-white" : "text-ink")
      }
    >
      <span>9:41</span>
      <span className="h-6 w-24 rounded-full bg-ink" />
      <span className="h-2.5 w-5 rounded-sm border border-current" />
    </div>
  )
}

/** Phone frame: simulates the 44px top inset that env() gives on devices. */
function Phone({
  label,
  dark,
  children,
}: {
  label: string
  dark?: boolean
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  return (
    <figure className="flex w-[390px] max-w-full shrink-0 flex-col gap-3">
      <div
        ref={ref}
        data-comment-target
        className="relative h-[800px] overflow-hidden rounded-[44px] border-[10px] border-ink bg-background shadow-raised dark:border-white/15"
      >
        <StatusBar dark={dark} />
        <div className="h-full pt-11 has-[[data-slot=journey-sky]]:pt-0 has-[[data-slot=celebration-screen]]:pt-0 [&_[data-slot=celebration-screen]]:pt-16 [&_[data-slot=journey-sky]]:pt-16">
          {children}
        </div>
      </div>
      <figcaption className="text-center text-label font-medium text-muted-foreground">{label}</figcaption>
      <NoteButton target={`شاشة ${label}`} targetRef={ref} className="items-center" />
    </figure>
  )
}

/** Desktop frame: renders at 1280×800 and scales down, so container queries see desktop width. */
function Desktop({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(0.8)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1280))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <figure className="flex w-full flex-col gap-3">
      <div className="w-full overflow-hidden rounded-card border-4 border-ink bg-ink shadow-raised dark:border-white/15">
        <div dir="ltr" className="flex h-8 items-center gap-1.5 px-4">
          <span className="size-2.5 rounded-full bg-white/30" />
          <span className="size-2.5 rounded-full bg-white/30" />
          <span className="size-2.5 rounded-full bg-white/30" />
        </div>
        <div
          ref={ref}
          data-comment-target
          className="relative w-full overflow-hidden bg-background"
          style={{ height: 800 * scale }}
        >
          <div
            className="absolute top-0 start-0 h-[800px] w-[1280px] origin-top-left rtl:origin-top-right"
            style={{ transform: `scale(${scale})` }}
          >
            {children}
          </div>
        </div>
      </div>
      <figcaption className="text-center text-label font-medium text-muted-foreground">{label}</figcaption>
      <NoteButton target="الرئيسية على الحاسب" targetRef={ref} className="items-center" />
    </figure>
  )
}

/* ---------- Screens ---------- */

function HomeContent() {
  return (
    <>
      <JourneySky
        name="يوسف"
        day={42}
        month={2}
        monthLabel="الشهر الثاني"
        streakDays={7}
        actions={
          <Avatar size="lg" className="ring-2 ring-white/20">
            <AvatarFallback className="bg-white/15 text-white">ي</AvatarFallback>
          </Avatar>
        }
      />
      <JourneySheet>
        <LessonCard icon={IconDroplet} title="الوضوء" meta="الدرس 3 من 5، 4 دقائق" progress={60} />
        <DailyCard title="معنى الشهادتين" meta="قراءة في دقيقتين" />
        <AskComposer />
      </JourneySheet>
    </>
  )
}

function HomeAside() {
  return (
    <>
      <section className="flex flex-col gap-4 rounded-card border-2 bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-heading text-h3 font-bold">أوسمتك</p>
        </div>
        <div className="flex justify-between">
          <MilestoneBadge icon={IconStar} label="الشهادتان" earned size={72} />
          <MilestoneBadge icon={IconDroplet} label="الوضوء" earned size={72} />
          <MilestoneBadge icon={IconPray} label="الصلاة" size={72} />
        </div>
        <PetalRow count={12} filled={2} className="justify-center" />
        <p className="text-center text-caption text-muted-foreground">بتلتان من 12 في سنتك الأولى</p>
      </section>
      <MentorCard name="أبو عبدالله" languages={["English", "العربية"]} note="يرد عادةً خلال يوم" />
    </>
  )
}

function HomeScreen() {
  const [tab, setTab] = React.useState<NavKey>("home")
  return (
    <Phone label="الرئيسية" dark>
      <AppShell active={tab} onNavigate={setTab} aside={<HomeAside />}>
        <HomeContent />
      </AppShell>
    </Phone>
  )
}

function LearnScreen() {
  const [tab, setTab] = React.useState<NavKey>("learn")
  return (
    <Phone label="تعلّم">
      <AppShell
        active={tab}
        onNavigate={setTab}
        top={
          <TopBar
            title={<span className="font-heading text-h3">مسارك</span>}
            end={
              <div className="flex gap-1.5">
                <StreakChip days={7} />
              </div>
            }
          />
        }
        contentClassName="px-4 pt-4"
      >
        <LearningPath>
          <PathUnitHeader unit="الشهر 1" title="يومك الأول" description="الشهادتان، والطهارة، وأول صلاة" />
          <PathNode state="done" label="الشهادتان" />
          <PathNode state="done" label="الطهارة" offset={1} />
          <PathNode state="current" label="الوضوء" offset={2} icon={IconDroplet} />
          <PathNode state="locked" label="أوقات الصلاة" offset={1} />
          <PathNode state="locked" label="الصلاة" offset={0} icon={IconPray} />
          <PathUnitHeader unit="الشهر 2" title="أسبوعك الأول مع الصلاة" locked />
        </LearningPath>
      </AppShell>
    </Phone>
  )
}

function ExerciseScreen() {
  return (
    <Phone label="تمرين">
      <div className="flex h-full flex-col bg-background">
        <header className="flex items-center gap-3 px-4 pt-3 pb-2">
          <Button variant="ghost" size="icon" aria-label="أغلق الدرس">
            <IconX />
          </Button>
          <Progress value={60} aria-label="تقدّم الدرس" className="h-4 flex-1" />
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 pt-4">
          <Badge variant="secondary" className="w-fit">
            <IconBook2 data-icon="inline-start" stroke={1.75} />
            اختر الإجابة
          </Badge>
          <h2 className="font-heading text-h1 font-bold text-balance">أيّ هذه ذكرته آية الوضوء؟</h2>
          <RadioGroup defaultValue="b" className="gap-3">
            <ExerciseOption value="a" title="غسل الوجه" state="correct" />
            <ExerciseOption value="b" title="غسل الشعر كله" state="incorrect" />
            <ExerciseOption value="c" title="غسل الظهر" />
          </RadioGroup>
        </div>
        <ExerciseFeedback
          result="incorrect"
          explanation="ذكرت الآية مسح الرأس، لا غسل الشعر كله. المصدر: سورة المائدة، الآية 6."
        />
      </div>
    </Phone>
  )
}

function AskScreen() {
  return (
    <Phone label="اسأل رفيق">
      <AppShell
        active="ask"
        bottomNav={false}
        top={
          <TopBar
            start={
              <Button variant="ghost" size="icon-sm" aria-label="رجوع">
                <IconArrowRight className="ltr:rotate-180" />
              </Button>
            }
            title="اسأل رفيق"
            end={
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary">العربية</Badge>
                <HumanHelpButton label="إنسان" />
              </div>
            }
          />
        }
        contentClassName="pb-0"
      >
        <MessageScrollerProvider>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="flex flex-col gap-4 px-4 py-4">
                <AiDisclosure />
                <MessageScrollerItem messageId="1">
                  <UserMessage time="9:41">كيف أتوضأ للصلاة؟</UserMessage>
                </MessageScrollerItem>
                <MessageScrollerItem messageId="2">
                  <AssistantMessage sources={["سورة المائدة، الآية 6"]}>
                    <p>ذكرت آية الوضوء أربعة أعضاء:</p>
                    <ol className="list-decimal ps-5">
                      <li>غسل الوجه.</li>
                      <li>غسل اليدين إلى المرفقين.</li>
                      <li>مسح الرأس.</li>
                      <li>غسل الرجلين إلى الكعبين.</li>
                    </ol>
                  </AssistantMessage>
                </MessageScrollerItem>
                <MessageScrollerItem messageId="3">
                  <UserMessage time="9:43">أهلي لا يعرفون أني أسلمت، هل أخبرهم الآن؟</UserMessage>
                </MessageScrollerItem>
                <MessageScrollerItem messageId="4">
                  <ReferralCard />
                </MessageScrollerItem>
              </MessageScrollerContent>
            </MessageScrollerViewport>
          </MessageScroller>
        </MessageScrollerProvider>
        <div className="sticky bottom-0 border-t bg-card px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <AskComposer />
        </div>
      </AppShell>
    </Phone>
  )
}

function CelebrationPhone() {
  return (
    <Phone label="الاحتفال بالوسام" dark>
      <CelebrationScreen
        icon={IconDroplet}
        badgeLabel="وسام الوضوء"
        title="أتممت مرحلة الوضوء"
        message="صرت تعرف كيف تتطهّر للصلاة. خطوتك التالية: الصلاة نفسها."
        stats={["5 دروس", "سلسلتك 7 أيام"]}
        primaryLabel="تابع إلى درس الصلاة"
        className="h-full"
      />
    </Phone>
  )
}

function DesktopHome() {
  const [tab, setTab] = React.useState<NavKey>("home")
  return (
    <Desktop label="الرئيسية على الحاسب: شريط تنقل جانبي، والعمود في الوسط، ولوحة داعمة">
      <AppShell active={tab} onNavigate={setTab} aside={<HomeAside />}>
        <HomeContent />
      </AppShell>
    </Desktop>
  )
}

function Screens() {
  return (
    <div className="flex flex-col gap-14">
      <Section
        id="screens"
        title="الشاشات على الجوال"
        description="مركّبة من مكوّنات النظام نفسها داخل إطار جوال بعرض 390px. الإطار يحاكي مساحة شريط الحالة التي يعطيها الجهاز الحقيقي."
      >
        <div className="flex flex-wrap justify-center gap-8">
          <HomeScreen />
          <LearnScreen />
          <ExerciseScreen />
          <AskScreen />
          <CelebrationPhone />
        </div>
      </Section>
      <Section
        id="desktop"
        title="على الحاسب"
        description="الهيكل نفسه يتكيّف بعرضه: تحت 840px تنقل سفلي وعمود واحد، ومن 840px شريط تنقل على الحافة الأولى ولوحة داعمة، ومن 1200px يكبر الشريط ويحمل الأسماء."
      >
        <DesktopHome />
      </Section>
    </div>
  )
}

export { Screens }
