import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { fmtDateTime } from '../../lib/money'
import { ErrorBox, Eyebrow, Skeleton } from '../../components/ui'

type Summary = {
  events_24h: Array<{ event_type: string; n: number }>
  open_cases: number
  restricted_users: number
  ai: { model: string; configured: boolean }
}
type Ev = { id: string; user_id: string | null; event_type: string; severity: string; created_at: string; metadata: Record<string, unknown> }
type CaseRow = { id: string; user_id: string; status: string; max_score: number; summary: string; updated_at: string }

const short = (id: string | null) => (id ? id.slice(0, 8) : 'anonymous')

export default function SecurityDashboard() {
  const [type, setType] = useState('')
  const summary = useQuery({ queryKey: ['sec-summary'], queryFn: () => api<Summary>('/api/security/summary'), refetchInterval: 15000 })
  const events = useQuery({
    queryKey: ['sec-events', type],
    queryFn: () => api<{ items: Ev[] }>(`/api/security/events?limit=40${type ? `&type=${type}` : ''}`),
    refetchInterval: 15000,
  })
  const cases = useQuery({ queryKey: ['sec-cases'], queryFn: () => api<{ items: CaseRow[] }>('/api/security/cases'), refetchInterval: 15000 })

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <Eyebrow>Admin / security</Eyebrow>
      <h1 className="display mt-5 text-5xl sm:text-6xl">Anti-scalping <em>monitor</em></h1>
      <p className="mt-4 max-w-xl text-muted">Rules and policy decide. AI only explains. Every case shows the signals behind it.</p>

      <section aria-label="Summary" className="mt-10 grid gap-px border border-line bg-line sm:grid-cols-3">
        {[
          ['Open cases', summary.data?.open_cases],
          ['Restricted users', summary.data?.restricted_users],
          ['Events (24h)', summary.data?.events_24h.reduce((a, b) => a + b.n, 0)],
        ].map(([k, v]) => (
          <div key={k as string} className="bg-bg p-6">
            <p className="label">{k}</p>
            <p className="display mt-3 text-6xl tabular-nums">{summary.isLoading ? '-' : (v as number) ?? 0}</p>
          </div>
        ))}
      </section>
      {summary.data && (
        <p className="label mt-3">
          AI model: <span className="text-ink">{summary.data.ai.model}</span> - {summary.data.ai.configured ? 'configured' : 'no key (deterministic summaries only)'}
        </p>
      )}

      <section aria-labelledby="cases-h" className="mt-14">
        <h2 id="cases-h" className="label mb-4 text-ink">Cases</h2>
        {cases.isLoading ? <Skeleton className="h-24" /> : cases.isError ? <ErrorBox title="Could not load cases" onRetry={() => cases.refetch()} /> : cases.data!.items.length === 0 ? (
          <p className="panel p-6 text-muted">No cases. Run <code className="font-mono text-xs">python scripts/simulate_scalper.py</code> to generate one.</p>
        ) : (
          <ul className="border-t border-line">
            {cases.data!.items.map((c) => (
              <li key={c.id} className="border-b border-line">
                <Link to={`/admin/security/cases/${c.id}`} className="grid items-center gap-2 py-4 sm:grid-cols-[6rem_6rem_1fr_9rem]">
                  <span className="display text-4xl tabular-nums">{c.max_score}</span>
                  <span className={`label ${c.status === 'closed' ? '' : '!text-accent'}`}>{c.status.replace('_', ' ')}</span>
                  <span className="text-sm text-muted">{c.summary || 'No summary'} <span className="label ml-2">user {short(c.user_id)}</span></span>
                  <span className="label sm:text-right">{fmtDateTime(c.updated_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ev-h" className="mt-14">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="ev-h" className="label text-ink">Recent events</h2>
          <label className="label flex items-center gap-2">
            Filter
            <select value={type} onChange={(e) => setType(e.target.value)} className="border border-line bg-bg px-2 py-1.5 font-mono text-xs normal-case text-ink">
              <option value="">All</option>
              {['hold_created', 'hold_conflict', 'hold_expired', 'hold_released', 'order_created', 'payment_challenge_failed', 'payment_succeeded', 'rate_limited', 'seatmap_requested'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead><tr className="label border-y border-line"><th className="py-2 font-normal">Time</th><th className="font-normal">Event</th><th className="font-normal">Severity</th><th className="font-normal">User</th></tr></thead>
            <tbody>
              {(events.data?.items ?? []).map((e) => (
                <tr key={e.id} className="border-b border-line">
                  <td className="py-2 pr-3 text-muted">{fmtDateTime(e.created_at)}</td>
                  <td className="pr-3 font-mono text-xs">{e.event_type}</td>
                  <td className={`pr-3 font-mono text-xs uppercase ${e.severity === 'medium' || e.severity === 'high' ? 'text-accent' : 'text-muted'}`}>{e.severity}</td>
                  <td className="font-mono text-xs text-muted">{short(e.user_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.isLoading && <Skeleton className="mt-2 h-16" />}
        </div>
      </section>
    </div>
  )
}
