import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import "./index.css"
import AppLayout, { PublicFrame } from "@/app/AppLayout"
import { refreshSession } from "@/app/lib/api"
import { registerServiceWorker } from "@/app/lib/pwa"
import "@/app/practice/start-reminders"
import "@/app/companion/learningLog" // MOT-06: group members' learning log
import { RequireRole } from "@/app/RequireRole"
import { lazy } from "@/app/offline/lazyRoute" // PLT-15 R1: a screen not yet on the device says it needs a connection
import { APP_BASE } from "@/app/lib/base"

const Welcome = lazy(() => import("@/app/pages/Welcome"))
const Privacy = lazy(() => import("@/app/pages/Privacy"))
const Home = lazy(() => import("@/app/pages/Home"))
const Learn = lazy(() => import("@/app/pages/Learn"))
const Lesson = lazy(() => import("@/app/pages/Lesson"))
const Review = lazy(() => import("@/app/pages/Review"))
const Next = lazy(() => import("@/app/pages/Next"))
const Placement = lazy(() => import("@/app/pages/Placement"))
const Ask = lazy(() => import("@/app/pages/Ask"))
const Mentor = lazy(() => import("@/app/pages/Mentor"))
const Me = lazy(() => import("@/app/pages/Me"))
const Account = lazy(() => import("@/app/pages/Account"))
const Practice = lazy(() => import("@/app/pages/Practice"))
const Discover = lazy(() => import("@/app/pages/Discover"))
const Guide = lazy(() => import("@/app/guide/GuideScreen"))
const Inbox = lazy(() => import("@/app/pages/roles/Inbox"))
const ReviewDesk = lazy(() => import("@/app/pages/roles/ReviewDesk"))
const Team = lazy(() => import("@/app/pages/roles/Team"))
const Admin = lazy(() => import("@/app/pages/roles/Admin"))
const Referrals = lazy(() => import("@/app/companion/mentor/Referrals"))
const Org = lazy(() => import("@/app/pages/roles/Org")) // ORG-01..03 coordinator
const Gallery = lazy(() => import("./App"))

const router = createBrowserRouter([
  {
    element: <PublicFrame />, // PLT-05 R2: quick exit outside AppLayout too
    children: [
      { path: "/welcome", element: <Welcome /> },
      { path: "/privacy", element: <Privacy /> }, // PLT-05 R1: readable before onboarding and without an account
    ],
  },
  { path: "/design", element: <Gallery /> },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "learn", element: <Learn /> },
      { path: "learn/lesson/:lessonId", element: <Lesson /> },
      { path: "learn/review", element: <Review /> },
      { path: "learn/placement", element: <Placement /> },
      { path: "next", element: <Next /> },
      { path: "ask", element: <Ask /> },
      { path: "mentor/*", element: <Mentor /> },
      { path: "me", element: <Me /> },
      { path: "me/account", element: <Account /> },
      { path: "practice/*", element: <Practice /> },
      { path: "discover/*", element: <Discover /> },
      { path: "guide", element: <Guide /> }, // PLT-08 «كل ما في رفيق»
      { path: "inbox/*", element: <RequireRole roles={["mentor", "team"]}><Inbox /></RequireRole> }, // team: urgent requests (CMP-01 R6) + report queue (CMP-04 R3)
      { path: "review-desk/*", element: <RequireRole roles={["sharia_reviewer", "team"]}><ReviewDesk /></RequireRole> },
      { path: "referrals", element: <RequireRole roles={["sharia_reviewer"]}><Referrals /></RequireRole> }, // CMP-02 R5
      { path: "team", element: <RequireRole roles={["team"]}><Team /></RequireRole> },
      { path: "admin", element: <RequireRole roles={["admin"]}><Admin /></RequireRole> },
      { path: "org", element: <RequireRole roles={["org_coordinator"]}><Org /></RequireRole> }, // ORG-02, ORG-03 (the API checks the organisation too)
    ],
  },
], { basename: APP_BASE }) // PLT-10 R2: the whole app lives under /app; the landing page is at /

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false, networkMode: "offlineFirst" } },
})

void refreshSession()
registerServiceWorker()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
