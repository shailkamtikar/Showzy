import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { fmtDateTime } from '../../lib/money'
import { Button, ErrorBox, Eyebrow, Skeleton } from '../../components/ui'

type Reason = { code: string; weight: number; count: number; window_min: number; detail: string }
type Run = {
  id: string
  status: string
  model: string
  started_at: string
  result: null | {
    summary: string
    caveats: string[]
    hypotheses: Array<{ text: string; evidence_refs: string[]; confidence: number }>
    recommended_steps: string[]
    case_notes: string
    ai_used: boolean
    model: string
    disclaimer: string
  }
  error: string | null
}
type Detail = {
  case: { id: string; user_id: string; status: string; max_score: number; summary: string; reasons: Reason[] }
  timeline: Array<{ event_type: string; severity: string; created_at: string }>
  runs: Run[]
  restrictions: Array<{ max_active_holds: number; reason: string; expires_at: string | null }>
}

export default function CaseDetail() {
  const { caseId } = useParams()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => api<Detail>(`/api/security/cases/${caseId}`),
    refetchInterval: (query) => (query.state.data?.runs.some((r) => r.status === 'pending' || r.status === 'running') ? 1500 : false),
  })
  const investigate = useMutation({
    mutationFn: () => api(`/api/security/cases/${caseId}/investigate`, { method: 'POST' }),
    onSuccess: () => { setMsg(null); qc.invalidateQueries({ queryKey: ['case', caseId] }) },
    onError: (e) => setMsg(e instanceof ApiError ? e.message : 'Could not start the investigation.'),
  })
  const review = useMutation({
    mutationFn: (decision: string) => api(`/api/security/cases/${caseId}/review`, { method: 'POST', body: { decision, note } }),
    onSuccess: () => { setMsg('Decision recorded and audited.'); qc.invalidateQueries({ queryKey: ['case', caseId] }); qc.invalidateQueries({ queryKey: ['sec-cases'] }) },
    onError: (e) => setMsg(e instanceof ApiError ? e.message : 'Could not record the decision.'),
  })

  if (q.isError) return <div className="mx-auto max-w-3xl px-6 py-20"><ErrorBox title="Case not found" /></div>
  const d = q.data
  const run = d?.runs[0]
  const closed = d?.case.status === 'closed'

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Link to="/admin/security" className="label hover:text-ink">&larr; Security</Link>
      {!d ? <Skeleton className="mt-8 h-64" /> : (
        <>
          <Eyebrow className="mt-8">Case / user {d.case.user_id.slice(0, 8)}</Eyebrow>
          <div className="mt-5 flex flex-wrap items-end gap-6">
            <h1 className="display text-7xl tabular-nums">{d.case.max_score}</h1>
            <p className="label pb-3">risk score / 100 - {d.case.status.replace('_', ' ')}</p>
          </div>

          <section aria-labelledby="sig-h" className="mt-10">
            <h2 id="sig-h" className="label mb-3 text-ink">Signals behind the score</h2>
            <ul className="border-t border-line">
              {d.case.reasons.map((r) => (
                <li key={r.code} className="grid gap-1 border-b border-line py-3 sm:grid-cols-[14rem_1fr_5rem]">
                  <span className="font-mono text-xs">{r.code}</span>
                  <span className="text-sm text-muted">{r.detail}</span>
                  <span className="label sm:text-right">+{r.weight}</span>
                </li>
              ))}
            </ul>
            {d.restrictions.length > 0 && (
              <p className="label mt-3 !text-accent">
                Active restriction: max {d.restrictions[0].max_active_holds} concurrent hold - {d.restrictions[0].reason}
              </p>
            )}
          </section>

          <section aria-labelledby="ai-h" className="mt-12">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 id="ai-h" className="label text-ink">AI-assisted analysis</h2>
              <Button variant="outline" onClick={() => investigate.mutate()} disabled={investigate.isPending || run?.status === 'pending' || run?.status === 'running'}>
                {run?.status === 'pending' || run?.status === 'running' ? 'Investigating...' : 'Investigate'}
              </Button>
            </div>
            {!run ? <p className="panel p-6 text-sm text-muted">No investigation yet.</p> : run.result ? (
              <div className="panel space-y-5 p-6">
                <p className="label !text-accent">{run.result.disclaimer} Model: {run.result.model}{run.result.ai_used ? '' : ' (unavailable, showing rule-based summary)'}</p>
                <p>{run.result.summary}</p>
                {run.result.hypotheses.length > 0 && (
                  <div>
                    <p className="label mb-2">Hypotheses</p>
                    <ul className="space-y-2">
                      {run.result.hypotheses.map((h, i) => (
                        <li key={i} className="border-l-2 border-accent pl-3 text-sm">
                          {h.text} <span className="label ml-2">{Math.round(h.confidence * 100)}% - {h.evidence_refs.join(', ')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="label mb-2">Suggested next steps</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{run.result.recommended_steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
                {run.result.caveats.length > 0 && <p className="label normal-case !tracking-normal">Caveats: {run.result.caveats.join(' ')}</p>}
              </div>
            ) : (
              <p className="panel p-6 text-sm text-muted">{run.status === 'failed' ? `Run failed (${run.error ?? 'error'}).` : 'Working on it...'}</p>
            )}
          </section>

          <section aria-labelledby="rev-h" className="mt-12">
            <h2 id="rev-h" className="label mb-3 text-ink">Human review</h2>
            <label htmlFor="note" className="label">Note (kept in the audit log)</label>
            <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2}
              className="mt-2 w-full border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
            <div className="mt-3 flex flex-wrap gap-3">
              <Button onClick={() => review.mutate('dismiss')} disabled={closed || review.isPending}>Dismiss (false positive)</Button>
              <Button variant="outline" onClick={() => review.mutate('restrict')} disabled={closed || review.isPending}>Restrict 24h</Button>
              <Button variant="outline" onClick={() => review.mutate('escalate')} disabled={closed || review.isPending}>Escalate</Button>
            </div>
            {msg && <p role="status" className="label mt-3 !text-ink">{msg}</p>}
            <p className="label mt-3 normal-case !tracking-normal">Nothing here bans an account automatically. Permanent actions are always a human decision.</p>
          </section>

          <section aria-labelledby="tl-h" className="mt-12">
            <h2 id="tl-h" className="label mb-3 text-ink">Timeline</h2>
            <ul className="max-h-72 overflow-auto border-t border-line text-sm">
              {d.timeline.map((e, i) => (
                <li key={i} className="flex justify-between border-b border-line py-2"><span className="font-mono text-xs">{e.event_type}</span><span className="text-muted">{fmtDateTime(e.created_at)}</span></li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
