/** «مرشدي» tab (CMP-01, CMP-03, CMP-05, MOT-06). Screens live in
 * app/companion; this page only routes `mentor/*`. */
import { Route, Routes } from "react-router"

import ChooseMentor from "@/app/companion/ChooseMentor"
import GroupPage from "@/app/companion/GroupPage"
import HelpScreen from "@/app/companion/HelpScreen"
import HelpThread from "@/app/companion/HelpThread"
import MentorHub from "@/app/companion/MentorHub"

export default function Mentor() {
  return (
    <Routes>
      <Route index element={<MentorHub />} />
      <Route path="help" element={<HelpScreen />} />
      <Route path="help/:id" element={<HelpThread />} />
      <Route path="choose" element={<ChooseMentor />} />
      <Route path="group" element={<GroupPage />} />
      <Route path="*" element={<MentorHub />} />
    </Routes>
  )
}
