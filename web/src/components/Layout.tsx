import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { useIsFetching } from '@tanstack/react-query'
import Lenis from 'lenis'
import { useAuth } from '../auth/AuthProvider'
import { useTheme } from '../lib/theme'
import { Button } from './ui'

function useSmoothScroll() {
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) return
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true })
    let raf = 0
    const loop = (t: number) => {
      lenis.raf(t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [reduce])
}

function WakingBanner() {
  const fetching = useIsFetching()
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!fetching) {
      setSlow(false)
      return
    }
    const t = setTimeout(() => setSlow(true), 3500)
    return () => clearTimeout(t)
  }, [fetching])
  if (!slow) return null
  return (
    <div role="status" className="border-b border-line bg-surface2 px-6 py-2 text-center">
      <span className="label !text-ink">Server is waking up</span>
      <span className="label ml-3">free hosting sleeps when idle; the first load can take up to a minute</span>
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className="label flex items-center gap-2 rounded-full border border-line px-3 py-1.5 hover:border-ink hover:text-ink"
    >
      <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-current" style={{ background: theme === 'dark' ? 'transparent' : 'currentColor' }} />
      <span className="hidden sm:inline">{theme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  )
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `label transition-colors hover:text-ink ${isActive ? '!text-ink' : ''}`

export default function Layout() {
  useSmoothScroll()
  const { session, email, role, signOut } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const reduce = useReducedMotion()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [loc.pathname])

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
        Skip to content
      </a>
      <WakingBanner />
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3.5 sm:gap-6 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="Showzy home">
            <span aria-hidden className="h-2.5 w-2.5 bg-accent" />
            <span className="font-mono text-[0.78rem] font-semibold uppercase tracking-[0.18em]">Showzy</span>
          </Link>
          <span className="label hidden md:block">See the view before you book</span>
          <nav aria-label="Primary" className="ml-auto flex min-w-0 items-center gap-3 sm:gap-5">
            <NavLink to="/#on-now" className={(a) => `${navCls(a)} hidden sm:block`}>Catalog</NavLink>
            <NavLink to="/bookings" className={navCls}><span className="hidden sm:inline">My </span>bookings</NavLink>
            {role === 'admin' && <NavLink to="/admin/security" className={(a) => `${navCls(a)} hidden sm:block`}>Security</NavLink>}
            {role === 'admin' && <NavLink to="/admin/catalog" className={(a) => `${navCls(a)} hidden md:block`}>Admin</NavLink>}
            <ThemeToggle />
            {session ? (
              <div className="flex items-center gap-3">
                <span className="label hidden max-w-[10rem] truncate lg:block" title={email ?? ''}>{email}</span>
                <Button variant="outline" className="!px-3 sm:!px-5" onClick={async () => { await signOut(); nav('/') }}>Sign out</Button>
              </div>
            ) : (
              <Button className="!px-3 sm:!px-5" onClick={() => nav('/login')}>Sign in</Button>
            )}
          </nav>
        </div>
      </header>

      {/* Enter-only transition: an exit animation keeps the old <Outlet> mounted against the new route
          and crashes React Router's child swap, so we only animate in. */}
      <motion.main
        id="main"
        key={loc.pathname}
        className="flex-1"
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Suspense fallback={<p className="label mx-auto max-w-6xl px-6 py-24">Loading...</p>}>
          <Outlet />
        </Suspense>
      </motion.main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="label">Showzy - a demo project. No real tickets, no real payments.</p>
          <p className="label">Venues and listings are fictional.</p>
        </div>
      </footer>
    </div>
  )
}
