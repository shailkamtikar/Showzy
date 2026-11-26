import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

type Role = 'customer' | 'admin'
type AuthState = {
  session: Session | null
  email: string | null
  role: Role | null
  loading: boolean
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!session) {
      setRole(null)
      return
    }
    // Role comes from the API (database), never from a client-writable claim. UI hint only; the API enforces.
    api<{ role: Role }>('/api/me')
      .then((me) => !cancelled && setRole(me.role))
      .catch(() => !cancelled && setRole('customer'))
    return () => {
      cancelled = true
    }
  }, [session?.user.id])

  const value = useMemo<AuthState>(
    () => ({
      session,
      email: session?.user.email ?? null,
      role,
      loading,
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, role, loading],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
