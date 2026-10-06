/** Number-aware forms (issue #9: «سلسلتك 1 أيام» → «سلسلتك يوم واحد»).
 * Keys mirror the dictionary keys; categories are CLDR plural categories
 * from Intl.PluralRules. A missing category falls back to the plain string
 * in the dictionary. Tagalog uses the same word for one and many. */
import type { Locale } from "./index"

type Forms = Partial<Record<Intl.LDMLPluralRule, string>>

export const PLURALS: Partial<Record<Locale, Record<string, Forms>>> = {
  ar: {
    "streak.days": { one: "سلسلتك يوم واحد", two: "سلسلتك يومان", few: "سلسلتك {n} أيام", many: "سلسلتك {n} يومًا", other: "سلسلتك {n} يوم" },
    "streak.paused": {
      one: "سلسلتك يوم واحد · متوقفة مؤقتًا",
      two: "سلسلتك يومان · متوقفة مؤقتًا",
      few: "سلسلتك {n} أيام · متوقفة مؤقتًا",
      many: "سلسلتك {n} يومًا · متوقفة مؤقتًا",
      other: "سلسلتك {n} يوم · متوقفة مؤقتًا",
    },
    "home.reviewBody": {
      one: "هدف واحد يحتاج تثبيتًا",
      two: "هدفان يحتاجان تثبيتًا",
      few: "{n} أهداف تحتاج تثبيتًا",
      many: "{n} هدفًا يحتاج تثبيتًا",
      other: "{n} هدف يحتاج تثبيتًا",
    },
    "lesson.streakBadge": { one: "يوم واحد من التعلّم", two: "يومان من التعلّم", few: "{n} أيام من التعلّم", many: "{n} يومًا من التعلّم", other: "{n} يوم من التعلّم" },
    "lesson.streakTitle": { one: "تعلّمت يومًا واحدًا", two: "تعلّمت يومين", few: "تعلّمت {n} أيام", many: "تعلّمت {n} يومًا", other: "تعلّمت {n} يوم" },
    "path.lessonsCount": { one: "درس واحد", two: "درسان", few: "{n} دروس", many: "{n} درسًا", other: "{n} درس" },
    "placement.more.body": {
      one: "سؤال واحد آخر على الأكثر، بالطريقة نفسها. أو ابدأ الآن من «{unit}».",
      two: "سؤالان آخران على الأكثر، بالطريقة نفسها. أو ابدأ الآن من «{unit}».",
      few: "{n} أسئلة أخرى على الأكثر، بالطريقة نفسها. أو ابدأ الآن من «{unit}».",
      many: "{n} سؤالًا آخر على الأكثر، بالطريقة نفسها. أو ابدأ الآن من «{unit}».",
      other: "{n} سؤال آخر على الأكثر، بالطريقة نفسها. أو ابدأ الآن من «{unit}».",
    },
    "ask.guide.masteredCount": { one: "أتقنتَ فكرة واحدة.", two: "أتقنتَ فكرتين.", few: "أتقنتَ {n} أفكار.", many: "أتقنتَ {n} فكرة.", other: "أتقنتَ {n} فكرة." },
    "ask.guide.reviewCount": {
      one: "فكرة واحدة تحتاج مراجعة قصيرة.",
      two: "فكرتان تحتاجان مراجعة قصيرة.",
      few: "{n} أفكار تحتاج مراجعة قصيرة.",
      many: "{n} فكرة تحتاج مراجعة قصيرة.",
      other: "{n} فكرة تحتاج مراجعة قصيرة.",
    },
    // PLT-09 R2: the coming prayer in its last hour («العصر بعد 40 دقيقة»).
    "home.org.soon": { one: "{name} بعد دقيقة", two: "{name} بعد دقيقتين", few: "{name} بعد {n} دقائق", many: "{name} بعد {n} دقيقة", other: "{name} بعد {n} دقيقة" },
  },
  en: {
    "home.reviewBody": { one: "1 objective to strengthen" },
    "lesson.streakBadge": { one: "1 day of learning" },
    "lesson.streakTitle": { one: "You learned on 1 day" },
    "path.lessonsCount": { one: "1 lesson" },
    "placement.more.body": { one: "Up to 1 more question, the same way. Or start now with “{unit}”." },
    "ask.guide.masteredCount": { one: "You mastered 1 idea." },
    "ask.guide.reviewCount": { one: "1 idea needs a short review." },
    "home.org.soon": { one: "{name} in 1 minute" }, // PLT-09 R2
  },
}

const rules = new Map<Locale, Intl.PluralRules>()

export function pluralForm(locale: Locale, key: string, n: number): string | undefined {
  const forms = PLURALS[locale]?.[key]
  if (!forms) return undefined
  if (!rules.has(locale)) rules.set(locale, new Intl.PluralRules(locale === "tl" ? "fil" : locale))
  return forms[rules.get(locale)!.select(n)]
}
