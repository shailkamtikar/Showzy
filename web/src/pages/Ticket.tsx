import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../lib/api'
import { fmtDateTime, formatMoney } from '../lib/money'
import { ErrorBox, Skeleton } from '../components/ui'

type TicketView = {
  id: string
  ticket_code: string
  section_name: string
  row_label: string
  seat_label: string
  tier_name: string
  price_minor: number
  currency: string
  item_title: string
  starts_at: string
  venue_name: string
  space_name: string
}

export default function Ticket() {
  const { ticketId } = useParams()
  const q = useQuery({ queryKey: ['ticket', ticketId], queryFn: () => api<TicketView>(`/api/tickets/${ticketId}`), retry: false })

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/bookings" className="label hover:text-ink">&larr; My bookings</Link>
      <div className="mt-8">
        {q.isLoading ? (
          <Skeleton className="h-80" />
        ) : q.isError ? (
          <ErrorBox title="Ticket not found" message="It may belong to a different account." />
        ) : (
          <article className="brackets grid overflow-hidden border border-line bg-surface sm:grid-cols-[1fr_12rem]" aria-label="Demo ticket">
            <div className="p-7">
              <p className="label !text-accent">Demo ticket - not valid for entry</p>
              <h1 className="display mt-4 text-5xl">{q.data!.item_title}</h1>
              <p className="label mt-3">{fmtDateTime(q.data!.starts_at)}</p>
              <p className="mt-1 text-muted">{q.data!.venue_name}, {q.data!.space_name}</p>
              <dl className="mt-8 grid grid-cols-3 gap-4">
                <div><dt className="label">Section</dt><dd className="mt-1">{q.data!.section_name}</dd></div>
                <div><dt className="label">Row</dt><dd className="display mt-1 text-3xl">{q.data!.row_label}</dd></div>
                <div><dt className="label">Seat</dt><dd className="display mt-1 text-3xl">{q.data!.seat_label}</dd></div>
              </dl>
              <p className="label mt-6">{q.data!.tier_name} - {formatMoney(q.data!.price_minor, q.data!.currency)}</p>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 border-t border-dashed border-line bg-ink p-6 sm:border-l sm:border-t-0">
              <QRCodeSVG value={q.data!.ticket_code} size={120} bgColor="transparent" fgColor="var(--bg)" aria-label="Decorative demo code" />
              <p className="font-mono text-[10px] tracking-widest text-bg">{q.data!.ticket_code}</p>
              <p className="label !text-bg/60 text-center">Decorative demo code</p>
            </div>
            <span className="bk" />
          </article>
        )}
      </div>
    </div>
  )
}
