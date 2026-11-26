import { Link, useParams } from 'react-router-dom'
import { useItem, useItemShows } from '../lib/queries'
import { fmtDate, fmtTime, priceRange } from '../lib/money'
import type { ShowRow } from '../lib/types'
import { Poster } from '../components/Poster'
import { ErrorBox, Eyebrow, Reveal, Skeleton, SplitHeading } from '../components/ui'

function groupByDate(shows: ShowRow[]) {
  const map = new Map<string, ShowRow[]>()
  for (const s of shows) {
    const k = fmtDate(s.starts_at)
    map.set(k, [...(map.get(k) ?? []), s])
  }
  return [...map.entries()]
}

export default function CatalogItem() {
  const { id } = useParams()
  const item = useItem(id)
  const shows = useItemShows(id)

  if (item.isError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20">
        <ErrorBox title="Listing not found" message="It may have been removed." onRetry={() => item.refetch()} />
        <Link to="/" className="label mt-6 inline-block hover:text-ink">&larr; Back to catalog</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <Link to="/#on-now" className="label hover:text-ink">&larr; All listings</Link>
      <div className="mt-8 grid gap-10 lg:grid-cols-[18rem_1fr]">
        <div>
          {item.data ? (
            <Poster title={item.data.title} accent={item.data.accent} type={item.data.item_type} />
          ) : (
            <Skeleton className="aspect-[4/5]" />
          )}
        </div>
        <div>
          <Eyebrow>{item.data?.subtitle ?? 'Loading'}</Eyebrow>
          {item.data ? (
            <SplitHeading className="mt-5 text-5xl sm:text-7xl" lines={[item.data.title.split(' ')]} />
          ) : (
            <Skeleton className="mt-5 h-16 w-3/4" />
          )}
          <p className="mt-6 max-w-xl text-muted">{item.data?.description}</p>
        </div>
      </div>

      <section aria-labelledby="shows-h" className="mt-20">
        <h2 id="shows-h" className="label mb-6 flex items-center gap-3">
          <span className="text-ink">01</span> Choose a show
        </h2>
        {shows.isLoading ? (
          <Skeleton className="h-40" />
        ) : shows.isError ? (
          <ErrorBox title="Could not load shows" onRetry={() => shows.refetch()} />
        ) : shows.data!.items.length === 0 ? (
          <p className="panel p-8 text-muted">No upcoming shows for this listing.</p>
        ) : (
          <div className="space-y-10">
            {groupByDate(shows.data!.items).map(([date, rows]) => (
              <Reveal key={date}>
                <h3 className="display mb-3 text-3xl">{date}</h3>
                <ul className="border-t border-line">
                  {rows.map((s) => (
                    <li key={s.id} className="border-b border-line">
                      <Link
                        to={`/shows/${s.id}`}
                        className="group grid items-center gap-3 py-5 sm:grid-cols-[7rem_1fr_11rem_8rem_2rem]"
                      >
                        <span className="display text-3xl">{fmtTime(s.starts_at)}</span>
                        <span>
                          <span className="block">{s.venue_name}</span>
                          <span className="label">{s.space_name} - {s.venue_city}</span>
                        </span>
                        <span className="text-sm">{priceRange(s.min_price_minor, s.max_price_minor, s.currency)}</span>
                        <span className="label">
                          {s.available === 0 ? 'Sold out' : s.available < 60 ? `${s.available} left` : 'Available'}
                        </span>
                        <span aria-hidden className="justify-self-end text-muted transition-transform group-hover:translate-x-1 group-hover:text-accent">&rarr;</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
