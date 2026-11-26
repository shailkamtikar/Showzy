import { useQuery } from '@tanstack/react-query'

type Props = {
  supabaseHost: string
  apiBaseUrl: string
}

async function fetchJson(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function Row({ label, state, detail }: { label: string; state: 'ok' | 'fail' | 'wait'; detail?: string }) {
  const color =
    state === 'ok' ? 'bg-emerald-500' : state === 'fail' ? 'bg-rose-500' : 'bg-amber-400'
  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-700 px-4 py-3">
      <span className={`h-3 w-3 rounded-full ${color}`} aria-hidden="true" />
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-sm text-slate-400">
        {state === 'ok' ? 'OK' : state === 'fail' ? 'Unreachable' : 'Checking...'}
        {detail ? ` (${detail})` : ''}
      </span>
    </li>
  )
}

export default function Status({ supabaseHost, apiBaseUrl }: Props) {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => fetchJson(`${apiBaseUrl}/health`),
    retry: 1,
  })
  const db = useQuery({
    queryKey: ['health-db'],
    queryFn: () => fetchJson(`${apiBaseUrl}/health/db`),
    retry: 1,
  })

  const s = (q: { isSuccess: boolean; isError: boolean }) =>
    q.isSuccess ? 'ok' : q.isError ? 'fail' : 'wait'

  return (
    <section className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Showzy setup status</h1>
      <p className="text-slate-400">
        Supabase host: <code data-testid="supabase-host">{supabaseHost}</code>
        <br />
        API: <code data-testid="api-url">{apiBaseUrl}</code>
      </p>
      <ul className="space-y-2">
        <Row label="API /health" state={s(health)} />
        <Row label="API /health/db (Postgres)" state={s(db)} />
      </ul>
    </section>
  )
}
