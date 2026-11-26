import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { Button, Eyebrow, SplitHeading } from '../components/ui'

const friendly = (msg: string) => {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return 'That email and password do not match.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Try signing in.'
  if (m.includes('password should be')) return 'Password is too weak. Use at least 8 characters.'
  if (m.includes('confirm')) return 'Please confirm your email first, then sign in.'
  if (m.includes('rate limit')) return 'Too many attempts. Please wait a minute and try again.'
  return msg
}

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const { session, loading } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next') && params.get('next')!.startsWith('/') ? params.get('next')! : '/'
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const isLogin = mode === 'login'

  if (!loading && session) return <Navigate to={next} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        nav(next, { replace: true })
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.session) nav(next, { replace: true })
        else setInfo('Account created. Check your inbox to confirm your email, then sign in.')
      }
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : 'Something went wrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
      <div>
        <Eyebrow>{isLogin ? 'Sign in' : 'Create account'}</Eyebrow>
        <SplitHeading
          className="mt-6 text-6xl sm:text-7xl"
          lines={isLogin ? [['Welcome'], [{ em: 'back.' }]] : [['Your', 'seat'], ['is', { em: 'waiting.' }]]}
        />
        <p className="mt-6 max-w-sm text-muted">
          {isLogin ? 'Sign in to hold seats and see your bookings.' : 'An account lets you hold seats and keep your demo tickets.'}
        </p>
      </div>
      <form onSubmit={submit} className="panel space-y-5 p-6 sm:p-8" aria-label={isLogin ? 'Sign in form' : 'Sign up form'}>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input
            id="email" type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full border border-line bg-bg px-4 py-3 outline-none focus:border-accent"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input
            id="password" type="password" required minLength={8} autoComplete={isLogin ? 'current-password' : 'new-password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full border border-line bg-bg px-4 py-3 outline-none focus:border-accent"
          />
          {!isLogin && <p className="label mt-2">At least 8 characters</p>}
        </div>
        {error && <p role="alert" className="border border-bad/50 px-3 py-2 text-sm text-bad">{error}</p>}
        {info && <p role="status" className="border border-good/50 px-3 py-2 text-sm text-good">{info}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Please wait...' : isLogin ? 'Sign in' : 'Create account'}
        </Button>
        <p className="text-sm text-muted">
          {isLogin ? 'New here? ' : 'Already have an account? '}
          <Link className="text-ink underline underline-offset-4" to={`${isLogin ? '/signup' : '/login'}${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>
            {isLogin ? 'Create an account' : 'Sign in'}
          </Link>
        </p>
      </form>
    </div>
  )
}
