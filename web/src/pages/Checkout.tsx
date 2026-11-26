import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { fmtDateTime, formatMoney } from '../lib/money'
import { mmss, useCountdown } from '../lib/useCountdown'
import { retryPolicy } from '../lib/queries'
import { Button, DemoBadge, ErrorBox, Eyebrow, Skeleton } from '../components/ui'

export type OrderView = {
  id: string
  hold_id: string
  show_id: string
  status: string
  subtotal_minor: number
  fees_minor: number
  total_minor: number
  currency: string
  expires_at: string
  item_title: string
  starts_at: string
  venue_name: string
  space_name: string
  items: Array<{ seat_inventory_id: string; section_name: string; row_label: string; seat_label: string; tier_name: string; price_minor: number }>
}

export const useOrder = (id?: string) =>
  useQuery({ queryKey: ['order', id], queryFn: () => api<OrderView>(`/api/orders/${id}`), enabled: !!id, retry: retryPolicy })

export function OrderSummary({ order }: { order: OrderView }) {
  const c = order.currency
  return (
    <div className="panel p-5">
      <h2 className="label text-ink">Order summary</h2>
      <p className="display mt-3 text-3xl">{order.item_title}</p>
      <p className="label mt-2">{fmtDateTime(order.starts_at)} - {order.venue_name}, {order.space_name}</p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {order.items.map((i) => (
          <li key={i.seat_inventory_id} className="flex justify-between py-2.5 text-sm">
            <span>{i.section_name} - Row {i.row_label}, Seat {i.seat_label} <span className="label ml-1">{i.tier_name}</span></span>
            <span>{formatMoney(i.price_minor, c)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatMoney(order.subtotal_minor, c)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Convenience fee</dt><dd>{formatMoney(order.fees_minor, c)}</dd></div>
        <div className="flex justify-between border-t border-line pt-3 text-base"><dt>Total</dt><dd data-testid="order-total" className="display text-3xl">{formatMoney(order.total_minor, c)}</dd></div>
      </dl>
    </div>
  )
}

export default function Checkout() {
  const { orderId } = useParams()
  const nav = useNavigate()
  const q = useOrder(orderId)
  const left = useCountdown(q.data?.expires_at)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const o = q.data

  if (o?.status === 'confirmed_demo') return <Navigate to="/bookings" replace />

  const expired = o && (o.status === 'expired' || o.status === 'cancelled' || left === 0)

  async function pay() {
    setBusy(true)
    setError(null)
    try {
      const att = await api<{ attempt_id: string; challenge: string; challenge_expires_at: string }>('/api/demo-payments', {
        method: 'POST',
        body: { order_id: orderId },
      })
      // The plaintext code only ever travels in this response and in-memory router state.
      nav(`/pay/${att.attempt_id}`, { state: { challenge: att.challenge, challengeExpiresAt: att.challenge_expires_at } })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!o) return
    setBusy(true)
    try {
      await api(`/api/holds/${o.hold_id}`, { method: 'DELETE' })
    } finally {
      nav(`/shows/${o.show_id}`)
    }
  }

  if (q.isError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20">
        <ErrorBox title="Order not found" onRetry={() => q.refetch()} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Eyebrow>Checkout</Eyebrow>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl sm:text-6xl">Review &amp; <em>pay</em></h1>
        <DemoBadge>Demo checkout</DemoBadge>
      </div>

      {!o ? (
        <Skeleton className="mt-10 h-72" />
      ) : expired ? (
        <div className="panel mt-10 p-8">
          <h2 className="display text-4xl">Your hold has expired.</h2>
          <p className="mt-3 text-muted">The seats were released so other people can book them. Pick seats again to continue.</p>
          <Link to={`/shows/${o.show_id}`} className="label mt-5 inline-block text-accent underline underline-offset-4">Back to seat selection</Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_20rem]">
          <OrderSummary order={o} />
          <aside className="space-y-4 lg:self-start">
            <div className="panel p-5">
              <p className="label">Seats held for</p>
              <p className="display mt-2 text-6xl tabular-nums" data-testid="hold-timer">{left === null ? '-:--' : mmss(left)}</p>
              <p className="sr-only" role="status" aria-live="polite">
                {left !== null && (left === 60 || left === 10) ? `${left} seconds left to complete your booking` : ''}
              </p>
              <p className="label mt-2 normal-case !tracking-normal">Pay before the timer ends or the seats are released.</p>
            </div>
            {error && <p role="alert" className="border border-bad/50 px-3 py-2 text-sm text-bad">{error}</p>}
            <Button className="w-full" onClick={pay} disabled={busy}>{busy ? 'Please wait...' : 'Pay (demo)'}</Button>
            <Button variant="ghost" className="w-full" onClick={cancel} disabled={busy}>Cancel and release seats</Button>
            <p className="label normal-case !tracking-normal">No real money is taken. The next screen is a simulated gateway.</p>
          </aside>
        </div>
      )}
    </div>
  )
}
