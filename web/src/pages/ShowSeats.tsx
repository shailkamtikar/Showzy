import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { api, ApiError } from '../lib/api'
import { fmtDateTime, formatMoney } from '../lib/money'
import { useConfig, useSeats, useSections, useShow } from '../lib/queries'
import type { Seat } from '../lib/types'
import { webglAvailable } from '../viewer/webgl'
import { deviceTier } from '../viewer/perf'
import SeatMap2D from '../components/SeatMap2D'
import { Button, DemoBadge, ErrorBox, Skeleton } from '../components/ui'

const Viewer3D = lazy(() => import('../viewer/Viewer3D'))

type Mode = '3d' | '2d'

export default function ShowSeats() {
  const { showId } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { session } = useAuth()
  const show = useShow(showId)
  const seatsQ = useSeats(showId)
  const sectionsQ = useSections(showId)
  const config = useConfig()
  const max = config.data?.max_seats_per_order ?? 6

  // Very low-end devices open on the 2D map (3D stays one tap away) so the page costs what a 2D booking page costs.
  const [mode, setMode] = useState<Mode>(() => (webglAvailable() && deviceTier() !== 'low' ? '3d' : '2d'))
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<Map<string, Seat>>(new Map())
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [preview, setPreview] = useState<Seat | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelected(new Map())
    setPreview(null)
    setActiveSection(null)
  }, [showId])

  const seats = seatsQ.data?.items ?? []
  const sections = sectionsQ.data?.items ?? []
  const selectedIds = useMemo(() => new Set(selected.keys()), [selected])

  const toggle = useCallback(
    (s: Seat) => {
      setError(null)
      setSelected((prev) => {
        const next = new Map(prev)
        if (next.has(s.id)) {
          next.delete(s.id)
        } else if (next.size >= max) {
          setNotice(`Maximum ${max} seats per booking.`)
          return prev
        } else {
          next.set(s.id, s)
          setNotice(null)
        }
        return next
      })
    },
    [max],
  )

  const subtotal = [...selected.values()].reduce((a, s) => a + s.price_minor, 0)
  const list = [...selected.values()]

  const [holdLimit, setHoldLimit] = useState(false)

  async function releaseMyHoldsAndRetry() {
    setBusy(true)
    try {
      await api('/api/me/holds', { method: 'DELETE' })
      setHoldLimit(false)
      setError(null)
      qc.invalidateQueries({ queryKey: ['seats', showId] })
    } finally {
      setBusy(false)
    }
    await proceed()
  }

  async function proceed() {
    if (!session) {
      nav(`/login?next=${encodeURIComponent(`/shows/${showId}`)}`)
      return
    }
    setBusy(true)
    setError(null)
    setHoldLimit(false)
    try {
      const hold = await api<{ id: string }>('/api/holds', {
        method: 'POST',
        body: { show_id: showId, inventory_ids: [...selected.keys()] },
      })
      const order = await api<{ id: string }>('/api/orders', {
        method: 'POST',
        body: { hold_id: hold.id },
        idempotencyKey: crypto.randomUUID(),
      })
      nav(`/checkout/${order.id}`)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'conflict') {
        const gone = new Set((e.extra.unavailable as string[] | undefined) ?? [])
        setSelected((prev) => new Map([...prev].filter(([id]) => !gone.has(id))))
        setError('Some seats were just taken. We removed them from your selection; pick another or continue.')
        qc.invalidateQueries({ queryKey: ['seats', showId] })
        qc.invalidateQueries({ queryKey: ['sections', showId] })
      } else if (e instanceof ApiError && e.code === 'hold_limit') {
        setHoldLimit(true)
        setError('You still have seats on hold from an earlier checkout.')
      } else if (e instanceof ApiError) {
        setError(e.message)
      } else {
        setError('Could not reach the server. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (show.isError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20">
        <ErrorBox title="Show not found" onRetry={() => show.refetch()} />
      </div>
    )
  }

  const d = show.data
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {d ? (
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link to={`/catalog/${d.catalog_item_id}`} className="label hover:text-ink">&larr; {d.item_title}</Link>
            <h1 className="display mt-3 text-4xl sm:text-6xl">{d.item_title}</h1>
            <p className="label mt-3">
              {fmtDateTime(d.starts_at)} - {d.venue_name}, {d.space_name} - {d.venue_city}
            </p>
          </div>
          <DemoBadge>Demo booking</DemoBadge>
        </header>
      ) : (
        <Skeleton className="mb-6 h-24" />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_21rem]">
        <section aria-label="Seat selection" className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div role="tablist" aria-label="View mode" className="flex border border-line">
              {(['3d', '2d'] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => { setMode(m); if (m === '2d') setPreview(null) }}
                  disabled={m === '3d' && !webglAvailable()}
                  className={`label px-4 py-2 ${mode === m ? 'bg-ink !text-bg' : 'hover:text-ink'} disabled:opacity-40`}
                >
                  {m === '3d' ? '3D view' : '2D map'}
                </button>
              ))}
            </div>
            <p className="label hidden sm:block">Select up to {max} seats</p>
          </div>
          {notice && <p role="status" className="mb-3 border border-accent/50 px-3 py-2 text-sm text-accent">{notice}</p>}

          <div className={mode === '3d' ? 'panel h-[72vh] max-h-[38rem] min-h-[24rem] overflow-hidden' : 'panel p-5 sm:p-8'}>
            {seatsQ.isLoading || sectionsQ.isLoading || !d ? (
              <Skeleton className="h-full min-h-[20rem] w-full" />
            ) : seatsQ.isError ? (
              <div className="p-6"><ErrorBox title="Could not load seats" onRetry={() => seatsQ.refetch()} /></div>
            ) : mode === '3d' ? (
              <Suspense fallback={<Skeleton className="h-full w-full" />}>
                <Viewer3D
                  show={d}
                  seats={seats}
                  sections={sections}
                  selectedIds={selectedIds}
                  onToggle={toggle}
                  activeSection={activeSection}
                  onSection={setActiveSection}
                  previewSeat={preview}
                  onPreview={(s) => setPreview(s)}
                  onExitPreview={() => setPreview(null)}
                  onFail={() => { setMode('2d'); setNotice('3D is not available on this device, so we switched to the 2D map.') }}
                />
              </Suspense>
            ) : (
              <SeatMap2D
                show={d}
                seats={seats}
                sections={sections}
                selectedIds={selectedIds}
                onToggle={toggle}
                activeSection={activeSection}
                onSection={setActiveSection}
              />
            )}
          </div>
          <p className="label mt-3">
            {mode === '3d'
              ? 'Drag to orbit, scroll or pinch to zoom. Click a seat to select it and fly to it.'
              : 'Use Tab and Enter or Space to choose seats.'}
          </p>
        </section>

        <aside aria-label="Your selection" className="lg:sticky lg:top-20 lg:self-start">
          <div className="panel p-5">
            <h2 className="label flex items-center justify-between">
              <span className="text-ink">Your seats</span>
              <span>{list.length}/{max}</span>
            </h2>
            {list.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Nothing selected yet. Choose a seat on the map.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {list.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-3">
                    <div>
                      <p className="text-sm">Row {s.row}, Seat {s.label}</p>
                      <p className="label mt-1">{s.tier}</p>
                      <button
                        className="label mt-1 text-accent underline underline-offset-4 hover:brightness-125 disabled:opacity-40 disabled:no-underline"
                        disabled={!webglAvailable()}
                        onClick={() => { setMode('3d'); setPreview(s) }}
                      >
                        Preview view
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">{formatMoney(s.price_minor)}</p>
                      <button className="label mt-1 hover:text-bad" onClick={() => toggle(s)} aria-label={`Remove row ${s.row} seat ${s.label}`}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Estimated subtotal</span>
                <span data-testid="subtotal">{formatMoney(subtotal)}</span>
              </div>
              <p className="label mt-2 normal-case !tracking-normal">
                Estimate only. Fees and the final total are calculated by the server at checkout.
              </p>
            </div>
            {error && <p role="alert" className="mt-4 border border-bad/50 px-3 py-2 text-sm text-bad">{error}</p>}
            {holdLimit && (
              <Button variant="outline" className="mt-3 w-full" onClick={releaseMyHoldsAndRetry} disabled={busy}>
                Release my other holds and retry
              </Button>
            )}
            <Button className="mt-4 w-full" disabled={list.length === 0 || busy} onClick={proceed}>
              {busy ? 'Holding seats...' : session ? 'Continue to checkout' : 'Sign in to continue'}
            </Button>
            <p className="label mt-3 text-center">Seats are held for {Math.round((config.data?.hold_duration_seconds ?? 300) / 60)} minutes</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
