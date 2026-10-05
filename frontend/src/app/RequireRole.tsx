/** Team areas: shown only to accounts with the role (the API enforces it too). */
import { Navigate } from "react-router"
import { useAuth } from "@/app/stores/auth"

export function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const ready = useAuth((s) => s.ready)
  const allowed = useAuth((s) => roles.some((r) => s.has(r)))
  if (!ready) return null
  return allowed ? children : <Navigate to="/me" replace />
}
