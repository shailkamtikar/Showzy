import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { mmss, useCountdown } from '../lib/useCountdown'
import { formatMoney } from '../lib/money'
import { OrderSummary, useOrder } from './Checkout'
import { Button, DemoBadge, ErrorBox, Skeleton } from '../components/ui'

type Attempt = {
  attempt_id: string
  order_id: string
  status: string
  amount_minor: number
  currency: string
  challenge_expires_at: string | null
  attempts_left: number
  simulated_reference: string | null
}
type Result = {
  status: string
  order_id: string
  reference: string
  tickets: Array<{ id: string; ticket_code: string; section_name: string; row_label: string; seat_label: string }>
}

export default function Gateway() {
  const { attemptId } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const state = (loc.state ?? {}) as { challenge?: string; challengeExpiresAt?: string }
  const [challenge, setChallenge] = useState<string | undefined>(state.challenge)
  const [expiresAt, setExpiresAt] = useState<string | null | undefined>(state.challengeExpiresAt)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const reissued = useRef(false)

  const attempt = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: () => api<Attempt>(`/api/demo-payments/${attemptId}`),
    enabled: !!attemptId,
  })
  const order = useOrder(attempt.data?.order_id)
  const left = useCountdown(expiresAt ?? attempt.data?.challenge_expires_at)

  async function newCode() {
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ challenge: string; challenge_expires_at: string }>(`/api/demo-payments/${attemptId}/reissue`, { method: 'POST' })
      setChallenge(r.challenge)
      setExpiresAt(r.challenge_expires_at)
      setCode('')
      attempt.refetch()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not get a new code.')
    } finally {
      setBusy(false)
    }
  }

  // After a refresh the plaintext code is gone (only its hash is stored), so we issue a fresh one.
  useEffect(() => {
    if (attempt.data && !challenge && attempt.data.status === 'challenge_issued' && !reissued.current) {
      reissued.current = true
      newCode()
    }
  }, [attempt.data, challenge])

  async function confirm(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await api<Result>(`/api/demo-payments/${attemptId}/confirm`, { method: 'POST', body: { code } })
      setResult(r)
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) setLocked(true)
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Please try again.')
      attempt.refetch()
    } finally {
      setBusy(false)
    }
  }

  if (attempt.data?.status === 'succeeded_simulated' && !result) return <Navigate to="/bookings" replace />

  if (attempt.isError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20">
        <ErrorBox title="Payment attempt not found" onRetry={() => attempt.refetch()} />
      </div>
    )
  }

  if (result) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-14">
        <DemoBanner />
        <p className="label mt-10">Simulated transaction</p>
        <h1 className="display mt-3 text-6xl">Booking <em>confirmed.</em></h1>
        <p className="mt-4 text-muted">This is a simulated confirmation. No money moved and the tickets are not valid for entry.</p>
        <p className="label mt-6">Reference <span className="text-ink" data-testid="reference">{result.reference}</span></p>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {result.tickets.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-4">
              <span>{t.section_name} - Row {t.row_label}, Seat {t.seat_label}</span>
              <Link className="label text-accent underline underline-offset-4" to={`/tickets/${t.id}`}>View demo ticket</Link>
            </li>
          ))}
        </ul>
        <Button className="mt-8" onClick={() => nav('/bookings')}>Go to my bookings</Button>
      </div>
    )
  }

  const expiredCode = left === 0
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <DemoBanner />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section aria-label="Demo payment" className="panel p-6 sm:p-8">
          <p className="label">Simulated gateway</p>
          <h1 className="display mt-3 text-5xl">Confirm your <em>demo</em> payment</h1>
          <p className="mt-4 text-muted">
            To simulate approval, type the code shown below. This is a confirmation step for the demo. It is not
            authentication and no card, UPI or bank details are asked for.
          </p>

          <div className="brackets mt-6 border border-line bg-bg p-6 text-center">
            <p className="label">Your one-time code</p>
            {challenge ? (
              <p className="mt-3 select-all font-mono text-3xl font-semibold tracking-[0.2em] text-accent sm:text-4xl" data-testid="challenge">
                {challenge}
              </p>
            ) : (
              <Skeleton className="mx-auto mt-3 h-10 w-64" />
            )}
            <p className="label mt-3">
              {left === null ? '' : expiredCode ? 'Code expired' : `Expires in ${mmss(left)}`}
              {attempt.data ? ` - ${attempt.data.attempts_left} tries left` : ''}
            </p>
            <span className="bk" />
          </div>

          <form onSubmit={confirm} className="mt-6">
            <label htmlFor="code" className="label">Re-enter the code</label>
            <input
              id="code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false}
              placeholder="DEMO-XXXX-XXXX" disabled={locked || busy}
              className="mt-2 w-full border border-line bg-bg px-4 py-3 font-mono tracking-widest outline-none focus:border-accent"
            />
            {error && <p role="alert" className="mt-3 border border-bad/50 px-3 py-2 text-sm text-bad">{error}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="submit" disabled={busy || locked || code.trim().length < 4}>{busy ? 'Confirming...' : 'Confirm demo payment'}</Button>
              {(expiredCode || (error && !locked)) && (
                <Button type="button" variant="outline" onClick={newCode} disabled={busy}>Get a new code</Button>
              )}
            </div>
            {locked && (
              <p className="mt-4 text-sm text-muted">
                This attempt is locked after too many wrong codes. <Link className="text-accent underline underline-offset-4" to="/">Start again</Link>.
              </p>
            )}
          </form>
          <p className="label mt-6 normal-case !tracking-normal">Amount shown for the demo: {attempt.data ? formatMoney(attempt.data.amount_minor, attempt.data.currency) : '-'}. Nothing is charged.</p>
        </section>
        <aside>{order.data ? <OrderSummary order={order.data} /> : <Skeleton className="h-72" />}</aside>
      </div>
    </div>
  )
}

function DemoBanner() {
  return (
    <div role="note" className="flex flex-wrap items-center justify-between gap-3 border border-accent/60 bg-accent/10 px-4 py-3">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        Demo payment gateway - no real money will be charged
      </p>
      <DemoBadge>Simulated</DemoBadge>
    </div>
  )
}
