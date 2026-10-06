/**
 * PLT-08 R4: every learner-facing feature, in five groups by the new
 * Muslim's needs. Titles reuse each feature's own label, so one thing has
 * one name everywhere (copy.md). Habits (PRC-02) stay out until the
 * question of tracking worship is settled; role tools stay in Me.
 */
import type { Icon as TablerIcon } from "@tabler/icons-react"
import {
  IconAlarm,
  IconBell,
  IconBookmark,
  IconBooks,
  IconCards,
  IconClock,
  IconCompass,
  IconDeviceFloppy,
  IconHeadphones,
  IconHeadset,
  IconMoon,
  IconRefresh,
  IconRoute,
  IconShieldLock,
  IconSparkles,
  IconSunMoon,
  IconUserHeart,
  IconUsersGroup,
} from "@tabler/icons-react"

import type { Key } from "@/app/i18n"

export type GroupId = "learn" | "ask" | "day" | "discover" | "privacy"

export type GuideItem = {
  id: string
  icon: TablerIcon
  route: string
  title: Key
  body: Key
  /** Shown with a short note for visitors; the screen itself invites them. */
  needsAccount?: boolean
}

export type GuideGroup = { id: GroupId; title: Key; lede: Key; items: GuideItem[] }

export const GROUPS: GuideGroup[] = [
  {
    id: "learn",
    title: "guide.group.learn",
    lede: "guide.group.learnLede",
    items: [
      { id: "path", icon: IconRoute, route: "/learn", title: "path.title", body: "guide.body.path" },
      { id: "review", icon: IconRefresh, route: "/learn/review", title: "home.review", body: "guide.body.review" },
      { id: "reminder", icon: IconBell, route: "/me", title: "me.reminder", body: "guide.body.reminder" },
    ],
  },
  {
    id: "ask",
    title: "guide.group.ask",
    lede: "guide.group.askLede",
    items: [
      { id: "ask", icon: IconSparkles, route: "/ask", title: "ask.title", body: "guide.body.ask" },
      { id: "human", icon: IconHeadset, route: "/mentor/help", title: "ask.human", body: "guide.body.human" },
      { id: "mentor", icon: IconUserHeart, route: "/mentor/choose", title: "mentor.choose", body: "guide.body.mentor", needsAccount: true },
      { id: "group", icon: IconUsersGroup, route: "/mentor/group", title: "mentor.groups", body: "guide.body.group", needsAccount: true },
    ],
  },
  {
    id: "day",
    title: "guide.group.day",
    lede: "guide.group.dayLede",
    items: [
      { id: "prayer", icon: IconClock, route: "/practice", title: "practice.prayer", body: "guide.body.prayer" },
      { id: "qibla", icon: IconCompass, route: "/practice/qibla", title: "practice.qibla", body: "guide.body.qibla" },
      { id: "adhkar", icon: IconSunMoon, route: "/practice/adhkar", title: "practice.adhkar", body: "guide.body.adhkar" },
      { id: "ramadan", icon: IconMoon, route: "/practice", title: "practice.ramadan.title", body: "guide.body.ramadan" },
      { id: "prayerReminder", icon: IconAlarm, route: "/practice/reminders", title: "practice.reminders", body: "guide.body.prayerReminder" },
    ],
  },
  {
    id: "discover",
    title: "guide.group.discover",
    lede: "guide.group.discoverLede",
    items: [
      { id: "daily", icon: IconCards, route: "/discover/card", title: "discover.daily", body: "guide.body.daily" },
      { id: "quran", icon: IconHeadphones, route: "/discover/quran", title: "discover.quran", body: "discover.quranBody" },
      { id: "library", icon: IconBooks, route: "/discover/library", title: "discover.library", body: "discover.libraryBody" },
      { id: "saved", icon: IconBookmark, route: "/discover/saved", title: "discover.saved", body: "discover.savedBody" },
    ],
  },
  {
    id: "privacy",
    title: "guide.group.privacy",
    lede: "guide.group.privacyLede",
    items: [
      { id: "account", icon: IconDeviceFloppy, route: "/me/account", title: "me.save", body: "guide.body.account" },
      { id: "privacy", icon: IconShieldLock, route: "/me", title: "me.privacy", body: "guide.body.privacy" },
    ],
  },
]
