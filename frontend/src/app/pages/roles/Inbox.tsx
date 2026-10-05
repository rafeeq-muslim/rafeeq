/** Mentor inbox (CMP-02, CMP-04 queue for the team, CMP-05 groups, MOT-06
 * challenge setting). Screens live in app/companion/mentor; this page only
 * routes `inbox/*`. */
import { Route, Routes } from "react-router"

import InboxHome from "@/app/companion/mentor/InboxHome"
import InboxThread from "@/app/companion/mentor/InboxThread"
import MentorGroup from "@/app/companion/mentor/MentorGroup"
import MentorProfile from "@/app/companion/mentor/MentorProfile"

export default function Inbox() {
  return (
    <Routes>
      <Route index element={<InboxHome />} />
      <Route path="r/:id" element={<InboxThread />} />
      <Route path="g/:id" element={<MentorGroup />} />
      <Route path="profile" element={<MentorProfile />} />
      <Route path="*" element={<InboxHome />} />
    </Routes>
  )
}
