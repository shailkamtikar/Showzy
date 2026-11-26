import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { useCatalog } from '../../lib/queries'
import { Button, Eyebrow } from '../../components/ui'

type Space = { id: string; space_name: string; venue_name: string; city: string; venue_type: string; tiers: string }

const field = 'mt-2 w-full border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent'

export default function AdminCatalog() {
  const qc = useQueryClient()
  const spaces = useQuery({ queryKey: ['spaces'], queryFn: () => api<{ items: Space[] }>('/api/admin/venue-spaces') })
  const catalog = useCatalog()
  const [msg, setMsg] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [itemType, setItemType] = useState('movie')
  const createItem = useMutation({
    mutationFn: () => api('/api/admin/catalog', { method: 'POST', body: { title, item_type: itemType } }),
    onSuccess: () => { setMsg('Listing created.'); setTitle(''); qc.invalidateQueries({ queryKey: ['catalog'] }) },
    onError: (e) => setMsg(e instanceof ApiError ? e.message : 'Failed'),
  })

  const [itemId, setItemId] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [when, setWhen] = useState('')
  const [prices, setPrices] = useState<Record<string, string>>({})
  const space = spaces.data?.items.find((s) => s.id === spaceId)
  const tiers = space?.tiers?.split(',') ?? []

  const createShow = useMutation({
    mutationFn: () =>
      api<{ seats: number }>('/api/admin/shows', {
        method: 'POST',
        body: {
          catalog_item_id: itemId,
          venue_space_id: spaceId,
          starts_at: new Date(when).toISOString(),
          prices: Object.fromEntries(tiers.map((t) => [t, Math.round(Number(prices[t] ?? 0))])),
        },
      }),
    onSuccess: (r) => { setMsg(`Show created with ${r.seats} seats.`); qc.invalidateQueries({ queryKey: ['catalog'] }) },
    onError: (e) => setMsg(e instanceof ApiError ? e.message : 'Failed'),
  })

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Eyebrow>Admin / catalog</Eyebrow>
      <h1 className="display mt-5 text-5xl sm:text-6xl">Listings &amp; <em>shows</em></h1>
      {msg && <p role="status" className="mt-6 border border-accent/50 px-3 py-2 text-sm text-accent">{msg}</p>}

      <form className="panel mt-10 p-6" onSubmit={(e: FormEvent) => { e.preventDefault(); createItem.mutate() }}>
        <h2 className="label text-ink">New listing</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <label className="label">Title<input required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} className={field} /></label>
          <label className="label">Type
            <select value={itemType} onChange={(e) => setItemType(e.target.value)} className={field}>
              {['movie', 'sports', 'concert', 'event'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <Button type="submit" disabled={createItem.isPending}>Create</Button>
        </div>
      </form>

      <form className="panel mt-6 p-6" onSubmit={(e: FormEvent) => { e.preventDefault(); createShow.mutate() }}>
        <h2 className="label text-ink">Schedule a show (generates inventory)</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="label">Listing
            <select required value={itemId} onChange={(e) => setItemId(e.target.value)} className={field}>
              <option value="">Select...</option>
              {catalog.data?.items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
            </select>
          </label>
          <label className="label">Venue space
            <select required value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className={field}>
              <option value="">Select...</option>
              {spaces.data?.items.map((s) => <option key={s.id} value={s.id}>{s.venue_name} - {s.space_name}</option>)}
            </select>
          </label>
          <label className="label">Starts at<input required type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} /></label>
        </div>
        {tiers.length > 0 && (
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            {tiers.map((t) => (
              <label key={t} className="label">{t} price (rupees)
                <input required type="number" min={1} value={prices[t] ?? ''} onChange={(e) => setPrices({ ...prices, [t]: e.target.value })} className={field} />
              </label>
            ))}
          </div>
        )}
        <Button type="submit" className="mt-5" disabled={createShow.isPending || !spaceId}>Create show</Button>
      </form>
    </div>
  )
}
