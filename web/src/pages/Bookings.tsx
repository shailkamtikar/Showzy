import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { fmtDateTime, formatMoney } from '../lib/money'
import { retryPolicy } from '../lib/queries'
import { DemoBadge, ErrorBox, Eyebrow, Reveal, Skeleton } from '../components/ui'

type Booking = {
  id: string
  status: string
  total_minor: number
  currency: string
  item_title: string
  starts_at: string
  venue_name: string
  space_name: string
  tickets: Array<{ id: string; ticket_code: string; section_name: string; row_label: string; seat_label: string; tier_name: string }>
}

export default function Bookings() {
  const q = useQuery({ queryKey: ['bookings'], queryFn: () => api<{ items: Booking[] }>('/api/me/bookings'), retry: retryPolicy })
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Eyebrow>My bookings</Eyebrow>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl sm:text-6xl">Your <em>demo</em> tickets</h1>
        <DemoBadge>Not valid for entry</DemoBadge>
      </div>
      <div className="mt-10 space-y-6">
        {q.isLoading ? (
          <Skeleton className="h-40" />
        ) : q.isError ? (
          <ErrorBox title="Could not load bookings" onRetry={() => q.refetch()} />
        ) : q.data!.items.length === 0 ? (
          <div className="panel p-8">
            <p className="display text-3xl">No bookings yet.</p>
            <Link to="/#on-now" className="label mt-4 inline-block text-accent underline underline-offset-4">Browse what&apos;s on</Link>
          </div>
        ) : (
          q.data!.items.map((b) => (
            <Reveal key={b.id}>
              <article className="panel p-5 sm:p-6" aria-label={`${b.item_title} booking`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="display text-3xl">{b.item_title}</h2>
                    <p className="label mt-2">{fmtDateTime(b.starts_at)} - {b.venue_name}, {b.space_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="display text-3xl">{formatMoney(b.total_minor, b.currency)}</p>
                    <p className={`label mt-1 ${b.status === 'confirmed_demo' ? '!text-good' : '!text-accent'}`}>
                      {b.status === 'confirmed_demo' ? 'Confirmed (simulated)' : 'Awaiting payment'}
                    </p>
                  </div>
                </div>
                {b.status === 'pending_payment' ? (
                  <Link to={`/checkout/${b.id}`} className="label mt-4 inline-block text-accent underline underline-offset-4">Continue to payment</Link>
                ) : (
                  <ul className="mt-4 divide-y divide-line border-t border-line">
                    {b.tickets.map((t) => (
                      <li key={t.id} className="flex items-center justify-between py-3 text-sm">
                        <span>{t.section_name} - Row {t.row_label}, Seat {t.seat_label} <span className="label ml-1">{t.tier_name}</span></span>
                        <Link className="label text-accent underline underline-offset-4" to={`/tickets/${t.id}`}>View ticket</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </Reveal>
          ))
        )}
      </div>
    </div>
  )
}
