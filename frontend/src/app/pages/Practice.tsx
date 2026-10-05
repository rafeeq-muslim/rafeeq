/**
 * Daily Practice (PRC): prayer times and qibla (PRC-01), Hijri date and
 * Ramadan (PRC-04), in-app prayer reminders (PRC-05), adhkar (PRC-07) and
 * private habits (PRC-02). Computed and stored on the device; the city
 * never leaves it.
 */
import { Route, Routes } from "react-router"

import PracticeHome from "@/app/practice/PracticeHome"
import CityPicker from "@/app/practice/CityPicker"
import QiblaScreen from "@/app/practice/QiblaScreen"
import HabitsScreen from "@/app/practice/HabitsScreen"
import RemindersScreen from "@/app/practice/RemindersScreen"
import { AdhkarChapterScreen, AdhkarIndexScreen } from "@/app/practice/AdhkarScreens"

export default function Practice() {
  return (
    <Routes>
      <Route index element={<PracticeHome />} />
      <Route path="city" element={<CityPicker />} />
      <Route path="qibla" element={<QiblaScreen />} />
      <Route path="adhkar" element={<AdhkarIndexScreen />} />
      <Route path="adhkar/:chapterId" element={<AdhkarChapterScreen />} />
      <Route path="habits" element={<HabitsScreen />} />
      <Route path="reminders" element={<RemindersScreen />} />
    </Routes>
  )
}
