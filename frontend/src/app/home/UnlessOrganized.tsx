/**
 * PLT-09 (concepts table): with the organized home, the «كل ما في رفيق» and
 * Discover pages are removed because every feature has a place; their
 * routes lead Home. With the setting off (the default) they render as before.
 */
import type * as React from "react"
import { Navigate } from "react-router"

import { useOrganizedHome } from "./setting"

export function UnlessOrganized({ children }: { children: React.ReactNode }) {
  return useOrganizedHome() ? <Navigate to="/" replace /> : children
}
