/**
 * Discover (KNW-06 library, KNW-07 daily card, KNW-08 Quran listening,
 * KNW-09 saved items). Everything here is approved content only, the same
 * for every learner; nothing about what the learner reads leaves the device.
 */
import { Route, Routes } from "react-router"

import Hub from "@/app/discover/Hub"
import CardView from "@/app/discover/CardView"
import { LibraryItemPage, LibraryList } from "@/app/discover/Library"
import { SuraList, SuraPage } from "@/app/discover/Quran"
import Saved from "@/app/discover/Saved"

export default function Discover() {
  return (
    <Routes>
      <Route index element={<Hub />} />
      <Route path="card" element={<CardView />} />
      <Route path="library" element={<LibraryList />} />
      <Route path="library/:itemId" element={<LibraryItemPage />} />
      <Route path="quran" element={<SuraList />} />
      <Route path="quran/:sura" element={<SuraPage />} />
      <Route path="saved" element={<Saved />} />
      <Route path="*" element={<Hub />} />
    </Routes>
  )
}
