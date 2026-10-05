import {
  IconBook2,
  IconCompass,
  IconHeadset,
  IconHome,
  IconMessageCircle,
  IconMoonStars,
  IconSchool,
  IconShieldLock,
  IconSparkles,
  IconUser,
  IconUserHeart,
  IconUsers,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Halo, RafeeqLogo, RafeeqSymbol } from "@/components/rafeeq"
import { Demo, Section } from "./showcase"

type Swatch = { name: string; token: string; hex: string; use: string; dark?: boolean }

const PRIMARY: Swatch[] = [
  { name: "بنفسجي رفيق", token: "primary · violet-500", hex: "#5A48D6", use: "الأزرار والروابط وكل فعل", dark: true },
  { name: "كهرماني", token: "celebrate · amber-500", hex: "#F5A23A", use: "الاحتفال والأوسمة، بقلّة" },
  { name: "حبري", token: "foreground · ink", hex: "#1D1645", use: "النصوص والأسطح الداكنة", dark: true },
  { name: "ضباب", token: "background · mist", hex: "#F7F6FB", use: "خلفية التطبيق" },
]

const SECONDARY: Swatch[] = [
  { name: "بنفسجي عميق", token: "deep · violet-700", hex: "#3B2D99", use: "بداية تدرّج الرفقة", dark: true },
  { name: "لافندر", token: "lavender", hex: "#7A5CE0", use: "تدرّج", dark: true },
  { name: "أوركيد", token: "orchid", hex: "#C47AD0", use: "تدرّج — لا نص أبيض فوقه" },
  { name: "مشمشي", token: "apricot · amber-300", hex: "#FFC77D", use: "تدرّج الكهرماني" },
  { name: "شفق", token: "dawn", hex: "#F08A4B", use: "نهاية تدرّج الرفقة" },
  { name: "وهج", token: "glow", hex: "#FFD38F", use: "وهج النواة" },
]

const FUNCTIONAL: { name: string; fg: string; bg: string; token: string }[] = [
  { name: "نجاح", fg: "text-success", bg: "bg-success-surface", token: "success" },
  { name: "تنبيه", fg: "text-warning", bg: "bg-warning-surface", token: "warning" },
  { name: "خطأ", fg: "text-destructive", bg: "bg-danger-surface", token: "destructive" },
  { name: "معلومة", fg: "text-info", bg: "bg-info-surface", token: "info" },
]

const VIOLET = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"] as const
const VIOLET_BG: Record<(typeof VIOLET)[number], string> = {
  "50": "bg-violet-50", "100": "bg-violet-100", "200": "bg-violet-200", "300": "bg-violet-300",
  "400": "bg-violet-400", "500": "bg-violet-500", "600": "bg-violet-600", "700": "bg-violet-700",
  "800": "bg-violet-800", "900": "bg-violet-900",
}

function SwatchCard({ s }: { s: Swatch }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-card border bg-card">
      <div
        className={cn("flex h-20 items-end p-3 text-caption font-medium", s.dark ? "text-white" : "text-ink")}
        style={{ backgroundColor: s.hex }}
      >
        <span dir="ltr">{s.hex}</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label font-bold">{s.name}</span>
        <code dir="ltr" className="text-start text-caption text-muted-foreground">{s.token}</code>
        <span className="text-caption text-muted-foreground">{s.use}</span>
      </div>
    </li>
  )
}

const TYPE = [
  { cls: "font-heading text-display font-bold", name: "display", spec: "56/72 · ثمانية سيرف ديسبلاي", sample: "لست وحدك" },
  { cls: "font-heading text-h1 font-bold", name: "h1", spec: "40/52", sample: "رحلتك مع رفيق" },
  { cls: "font-heading text-h2 font-bold", name: "h2", spec: "28/40", sample: "الشهر الثاني" },
  { cls: "text-h3 font-bold", name: "h3", spec: "22/34 · ثمانية سانس", sample: "أكمل التعلّم" },
  { cls: "font-reading text-reading", name: "reading", spec: "19/34 · ثمانية سيرف تكست", sample: "الوضوء أن تغسل وجهك ويديك إلى المرفقين، وتمسح رأسك، وتغسل رجليك إلى الكعبين." },
  { cls: "text-body", name: "body", spec: "17/30", sample: "اسأل رفيق بلغتك، وستصلك الإجابة بمصدرها." },
  { cls: "text-label font-medium", name: "label", spec: "15/20", sample: "تابع إلى درس الصلاة" },
  { cls: "text-caption text-muted-foreground", name: "caption", spec: "13/20", sample: "الدرس 3 من 5 · 4 دقائق" },
]

const ICONS = [
  { i: IconHome, n: "الرئيسية" }, { i: IconSchool, n: "تعلّم" }, { i: IconMessageCircle, n: "اسأل" },
  { i: IconUserHeart, n: "مرشدي" }, { i: IconUser, n: "حسابي" }, { i: IconBook2, n: "المصدر" },
  { i: IconHeadset, n: "إنسان" }, { i: IconCompass, n: "القبلة" }, { i: IconMoonStars, n: "العشاء" },
  { i: IconShieldLock, n: "الخصوصية" }, { i: IconUsers, n: "المجموعات" }, { i: IconSparkles, n: "ذكاء اصطناعي" },
]

function Foundations() {
  return (
    <div className="flex flex-col gap-14">
      <Section
        id="colors"
        title="الألوان"
        description="البنفسجي للأفعال، والكهرماني للاحتفال فقط، والحبري للنص، والضباب للخلفية. المكوّنات لا تستعمل القيم مباشرة، بل الرموز الدلالية (primary، celebrate، foreground…)."
      >
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">{PRIMARY.map((s) => <SwatchCard key={s.hex} s={s} />)}</ul>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-6">{SECONDARY.map((s) => <SwatchCard key={s.hex} s={s} />)}</ul>
        <div className="flex flex-col gap-2">
          <h3 className="text-label font-bold">درجات البنفسجي (500 هو لون الهوية)</h3>
          <ol className="grid grid-cols-10 overflow-hidden rounded-md border" dir="ltr">
            {VIOLET.map((v) => (
              <li key={v} className={cn("flex h-14 items-end p-1.5 text-caption", VIOLET_BG[v], Number(v) >= 400 ? "text-white" : "text-ink")}>
                {v}
              </li>
            ))}
          </ol>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex h-24 items-end rounded-card bg-grad-main p-4 text-label font-bold text-white">تدرّج الرفقة · bg-grad-main</div>
          <div className="flex h-24 items-end rounded-card bg-grad-amber p-4 text-label font-bold text-ink">تدرّج الكهرماني · bg-grad-amber (نص حبري)</div>
        </div>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {FUNCTIONAL.map((f) => (
            <li key={f.token} className={cn("flex flex-col gap-0.5 rounded-card p-4", f.bg)}>
              <span className={cn("text-body font-bold", f.fg)}>{f.name}</span>
              <code dir="ltr" className={cn("text-start text-caption", f.fg)}>{f.token}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="type"
        title="الخطوط"
        description="ثمانية هو الخط المعتمد: سانس للواجهة، وسيرف ديسبلاي للعناوين، وسيرف تكست للقراءة الطويلة. ترخيصه يمنع استضافة ملفاته، فيُستعمل إن كان مثبتًا على الجهاز، والبديل المستضاف ذاتيًا IBM Plex Sans Arabic وNoto Naskh Arabic. الأرقام لاتينية دائمًا، ولا تباعد حروف في العربية."
      >
        <ol className="flex flex-col divide-y rounded-card border bg-card">
          {TYPE.map((t) => (
            <li key={t.name} className="flex flex-col gap-1 p-4 md:flex-row md:items-baseline md:gap-6">
              <div className="flex w-44 shrink-0 flex-col">
                <code dir="ltr" className="text-start text-label font-bold text-primary">text-{t.name}</code>
                <span className="text-caption text-muted-foreground">{t.spec}</span>
              </div>
              <p className={cn("min-w-0", t.cls)}>{t.sample}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="shape" title="الزوايا والمسافات والظلال" description="زوايا البطاقة 20، والأزرار حبّة دواء كاملة، والحقول 12، واللوحات 28. المسافات على شبكة 4.">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { c: "rounded-md", n: "rounded-md · 12", d: "الحقول والعناصر الصغيرة" },
            { c: "rounded-card", n: "rounded-card · 20", d: "البطاقات" },
            { c: "rounded-panel", n: "rounded-panel · 28", d: "اللوحات والصفحات السفلية" },
            { c: "rounded-full", n: "rounded-full · 999", d: "الأزرار والشارات" },
          ].map((r) => (
            <div key={r.n} className="flex flex-col gap-2">
              <div className={cn("h-20 border-2 border-primary bg-secondary", r.c)} />
              <code dir="ltr" className="text-start text-label font-bold">{r.n}</code>
              <span className="text-caption text-muted-foreground">{r.d}</span>
            </div>
          ))}
        </div>
        <ol className="flex flex-wrap items-end gap-4" dir="ltr">
          {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
            <li key={n} className="flex flex-col items-center gap-1">
              <div className="bg-primary" style={{ width: n * 4, height: n * 4 }} />
              <span className="text-caption text-muted-foreground">{n * 4}</span>
            </li>
          ))}
        </ol>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-card bg-card p-5 shadow-card"><code dir="ltr">shadow-card</code></div>
          <div className="rounded-card bg-card p-5 shadow-raised"><code dir="ltr">shadow-raised</code></div>
          <div className="rounded-card bg-card p-5 shadow-glow"><code dir="ltr">shadow-glow</code> · للاحتفال فقط</div>
        </div>
      </Section>

      <Section id="icons" title="الأيقونات" description="Tabler Icons، خط 1.75 على شبكة 24. الأيقونة غير النشطة حبرية، والنشطة بنفسجية مع نقطة كهرمانية. الأيقونات الاتجاهية (الأسهم) تنعكس في العربية.">
        <ul className="grid grid-cols-4 gap-3 md:grid-cols-12">
          {ICONS.map(({ i: I, n }) => (
            <li key={n} className="flex flex-col items-center gap-1.5 rounded-md bg-card p-3">
              <I className="size-6" stroke={1.75} aria-hidden="true" />
              <span className="text-caption text-muted-foreground">{n}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="logo" title="الشعار والعناصر البصرية" description="«زهرة الرفاق»: 12 بتلة بعدد أشهر السنة الأولى. تحت 64px يُستعمل الخط السميك تلقائيًا.">
        <Demo
          name="RafeeqSymbol · RafeeqLogo · Halo"
          domain="PLT-04"
          description="الرمز مرسوم بالكود من هندسة حزمة الشعار نفسها، فيبقى حادًّا في كل حجم. الصيغ الكاملة تُؤخذ من ملفات الحزمة."
          rules={["لا تمدّد الشعار ولا تغيّر ألوانه", "المساحة الآمنة ضعف قطر النواة", "الحد الأدنى: أفقي 120px، رمز 24px"]}
          code={`import { RafeeqSymbol, RafeeqLogo, Halo } from "@/components/rafeeq"

<RafeeqSymbol size={48} />            // color
<RafeeqSymbol size={24} tone="ink" /> // small stroke below 64px
<RafeeqLogo variant="horizontal" />
<Halo className="size-48 text-primary/20" />`}
        >
          <RafeeqSymbol size={96} />
          <RafeeqSymbol size={48} />
          <RafeeqSymbol size={24} />
          <RafeeqSymbol size={48} tone="ink" />
          <div className="rounded-md bg-primary p-2"><RafeeqSymbol size={40} tone="white" /></div>
          <RafeeqLogo variant="horizontal" className="w-40" />
          <RafeeqLogo variant="international" className="w-40" />
          <Halo className="size-24 text-primary/40" />
        </Demo>
      </Section>
    </div>
  )
}

export { Foundations }
