import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { session, role, loading } = useAuth()
  const loc = useLocation()
  if (loading || (session && admin && role === null)) {
    return <p className="label mx-auto max-w-6xl px-6 py-24">Checking your session...</p>
  }
  if (!session) {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  }
  if (admin && role !== 'admin') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24">
        <p className="label">403</p>
        <h1 className="display mt-3 text-5xl">Administrators only.</h1>
        <p className="mt-4 text-muted">Your account does not have access to this page.</p>
      </div>
    )
  }
  return <>{children}</>
}
