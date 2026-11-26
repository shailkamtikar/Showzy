import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useReducedMotion } from 'motion/react'
import { useCatalog } from '../lib/queries'
import { fmtDate, priceRange } from '../lib/money'
import type { CatalogItem, ItemType } from '../lib/types'
import { Poster } from '../components/Poster'
import { ErrorBox, Eyebrow, Marquee, Reveal, SectionHead, Skeleton, SplitHeading } from '../components/ui'

const HeroScene = lazy(() => import('../viewer/HeroScene'))

const TABS: Array<{ key: ItemType | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'movie', label: 'Movies' },
  { key: 'sports', label: 'Sports' },
  { key: 'concert', label: 'Concerts' },
]

function ItemCard({ item }: { item: CatalogItem }) {
  return (
    <Link to={`/catalog/${item.id}`} className="group block" aria-label={`${item.title}, ${item.subtitle}`}>
      <div className="relative overflow-hidden">
        <div className="transition-transform duration-700 ease-out group-hover:scale-[1.04]">
          <Poster title={item.title} accent={item.accent} type={item.item_type} />
        </div>
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="display text-3xl">{item.title}</h3>
          <p className="label mt-2">{item.subtitle}</p>
        </div>
        <span aria-hidden className="mt-1 text-xl text-muted transition-transform group-hover:translate-x-1 group-hover:text-accent">
          &rarr;
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
        <div>
          <dt className="label">Next</dt>
          <dd className="mt-1 text-sm">{item.next_show_at ? fmtDate(item.next_show_at) : 'TBA'}</dd>
        </div>
        <div className="col-span-1">
          <dt className="label">Price</dt>
          <dd className="mt-1 text-sm">{priceRange(item.min_price_minor, item.max_price_minor, item.currency)}</dd>
        </div>
        <div>
          <dt className="label">Seats</dt>
          <dd className="mt-1 text-sm">{item.sold_out ? 'Sold out' : item.available < 60 ? 'Limited' : 'Available'}</dd>
        </div>
      </dl>
    </Link>
  )
}

function CatalogGrid() {
  const [tab, setTab] = useState<ItemType | 'all'>('all')
  const q = useCatalog(tab === 'all' ? undefined : tab)
  return (
    <>
      <div role="tablist" aria-label="Category" className="mb-8 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`label border px-4 py-2 transition-colors ${
              tab === t.key ? 'border-accent bg-accent !text-accent-ink' : 'border-line hover:border-ink hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="aspect-[4/5]" />
              <Skeleton className="mt-4 h-8 w-2/3" />
            </div>
          ))}
        </div>
      ) : q.isError ? (
        <ErrorBox title="Could not load the catalog" message="The server did not respond. It may be waking up." onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <p className="panel p-8 text-muted">Nothing here yet. Try another category.</p>
      ) : (
        <div className="grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {q.data!.items.map((it, i) => (
            <Reveal key={it.id} delay={(i % 3) * 0.07}>
              <ItemCard item={it} />
            </Reveal>
          ))}
        </div>
      )}
    </>
  )
}

export default function Home() {
  const reduce = useReducedMotion()
  const loc = useLocation()
  const all = useCatalog()

  useEffect(() => {
    if (loc.hash) document.querySelector(loc.hash)?.scrollIntoView()
  }, [loc.hash])

  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-14 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div className="flex flex-col justify-center">
          <Eyebrow>Seat selection / in 3D</Eyebrow>
          <SplitHeading
            className="mt-6 text-6xl sm:text-7xl lg:text-[5.6rem]"
            lines={[['See', 'the', 'view'], ['before', 'you', { em: 'book.' }]]}
          />
          <Reveal delay={0.5}>
            <p className="mt-7 max-w-md text-lg text-muted">
              Pick a movie, a match or a concert, walk into the exact hall or stand in 3D, choose your seats and look at
              the stage from where you will sit.
            </p>
          </Reveal>
          <Reveal delay={0.65}>
            <a
              href="#on-now"
              className="brackets mt-9 block max-w-sm bg-ink p-5 text-bg transition-transform duration-300 hover:-translate-y-0.5"
            >
              <span className="label !text-bg/60">Next</span>
              <span className="mt-2 flex items-center justify-between">
                <span className="display text-3xl">Browse what&apos;s on</span>
                <span aria-hidden className="text-2xl text-accent">&rarr;</span>
              </span>
              <span className="label !text-bg/60 mt-2 block normal-case !tracking-normal">Demo data. Pay with a simulated code.</span>
              <span className="bk" />
            </a>
          </Reveal>
        </div>
        <figure>
          <div className="panel relative aspect-[4/3] overflow-hidden">
            <Suspense fallback={<Skeleton className="h-full w-full" />}>
              <HeroScene still={!!reduce} />
            </Suspense>
          </div>
          <figcaption className="label mt-3">
            <span className="text-ink">Fig. 1</span> A stadium bowl, generated live from seat data. Drag to turn it.
          </figcaption>
        </figure>
      </section>

      {all.data && all.data.items.length > 0 && <Marquee items={all.data.items.map((i) => i.title)} />}

      <section id="on-now" className="mx-auto max-w-6xl px-6 py-24">
        <SectionHead
          n="01"
          label="On now"
          title={<>Six listings, <em>every</em> price tier</>}
          lede="Each show opens its own venue: different halls, different stands, different prices."
        />
        <CatalogGrid />
      </section>

      <section id="how" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <SectionHead n="02" label="How it works" title={<>Four steps, <em>no surprises</em></>} />
          <ol className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Choose', 'Pick a show. The price range is on the card before you open it.'],
              ['Walk in', 'Switch between a 2D map and a 3D hall. Both pick the same seats.'],
              ['Look', 'Preview the view from any seat, drag to look around.'],
              ['Hold & pay', 'Seats are held for five minutes. Payment is a simulated, clearly labelled demo.'],
            ].map(([t, d], i) => (
              <li key={t} className="bg-bg">
                <Reveal delay={i * 0.06} className="p-6">
                  <p className="label">0{i + 1}</p>
                  <h3 className="display mt-6 text-3xl">{t}</h3>
                  <p className="mt-3 text-sm text-muted">{d}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="demo" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <SectionHead n="03" label="Honest by design" title={<>What is real, and what is <em>simulated</em></>} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left">
              <caption className="label mb-3 text-left">
                <span className="text-ink">Table 1</span> Scope of this demo
              </caption>
              <thead>
                <tr className="label border-y border-line">
                  <th className="py-3 pr-4 font-normal">Part</th>
                  <th className="py-3 pr-4 font-normal">Status</th>
                  <th className="py-3 font-normal">Notes</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {[
                  ['Seat holds & inventory', 'Real', 'Atomic server-side holds; no double booking.'],
                  ['Prices & totals', 'Real', 'Always calculated by the server, never the browser.'],
                  ['Payment', 'Simulated', 'You re-enter a generated code. No money moves.'],
                  ['Tickets', 'Simulated', 'Marked "Not valid for entry".'],
                  ['Venues & titles', 'Fictional', 'Original sample data, not real listings.'],
                ].map(([a, b, c]) => (
                  <tr key={a} className="border-b border-line">
                    <td className="py-3 pr-4">{a}</td>
                    <td className="py-3 pr-4 font-mono text-xs uppercase tracking-widest text-accent">{b}</td>
                    <td className="py-3 text-muted">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}
