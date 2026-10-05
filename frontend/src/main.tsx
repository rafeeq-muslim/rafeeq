import { StrictMode, lazy } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import "./index.css"
import AppLayout from "@/app/AppLayout"
import { refreshSession } from "@/app/lib/api"
import { registerServiceWorker } from "@/app/lib/pwa"

const Welcome = lazy(() => import("@/app/pages/Welcome"))
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
const Inbox = lazy(() => import("@/app/pages/roles/Inbox"))
const ReviewDesk = lazy(() => import("@/app/pages/roles/ReviewDesk"))
const Team = lazy(() => import("@/app/pages/roles/Team"))
const Admin = lazy(() => import("@/app/pages/roles/Admin"))
const Gallery = lazy(() => import("./App"))

const router = createBrowserRouter([
  { path: "/welcome", element: <Welcome /> },
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
      { path: "inbox/*", element: <Inbox /> },
      { path: "review-desk/*", element: <ReviewDesk /> },
      { path: "team", element: <Team /> },
      { path: "admin", element: <Admin /> },
    ],
  },
])

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
