import { useMemo } from 'react'
import type { Seat, Section, ShowDetail } from '../lib/types'
import { formatMoney } from '../lib/money'

type Props = {
  show: ShowDetail
  seats: Seat[]
  sections: Section[]
  selectedIds: Set<string>
  onToggle: (s: Seat) => void
  activeSection: string | null
  onSection: (id: string | null) => void
}

const label = (s: Seat) =>
  `Row ${s.row}, seat ${s.label}, ${s.tier}, ${formatMoney(s.price_minor)}, ${
    s.status === 'available' ? 'available' : s.status === 'held' ? 'held by another customer' : 'sold'
  }${s.accessible ? ', accessible seat' : ''}`

function SeatButton({ seat, selected, onToggle, gap }: { seat: Seat; selected: boolean; onToggle: (s: Seat) => void; gap: boolean }) {
  const unavailable = seat.status !== 'available'
  // State is conveyed by fill, border style AND an icon/pattern, never by colour alone.
  const cls = selected
    ? 'border-accent bg-accent text-accent-ink'
    : seat.status === 'sold' || seat.status === 'blocked' || seat.status === 'disabled'
      ? 'border-line text-muted/60 bg-[repeating-linear-gradient(135deg,transparent_0_4px,var(--line)_4px_5px)]'
      : seat.status === 'held'
        ? 'border-dashed border-muted text-muted'
        : 'border-line hover:border-accent hover:text-accent'
  return (
    <button
      type="button"
      aria-label={label(seat)}
      aria-pressed={selected}
      disabled={unavailable && !selected}
      onClick={() => onToggle(seat)}
      className={`relative grid h-8 w-8 shrink-0 place-items-center border font-mono text-[10px] transition-colors ${cls} ${gap ? 'ml-5' : ''} ${seat.accessible ? 'rounded-t-lg' : ''}`}
    >
      {selected ? '✓' : seat.status === 'available' ? seat.label : seat.status === 'held' ? '·' : '×'}
    </button>
  )
}

export default function SeatMap2D({ show, seats, sections, selectedIds, onToggle, activeSection, onSection }: Props) {
  const kind = show.layout_metadata.kind
  const manySections = sections.length > 4
  const active = manySections ? (activeSection ?? sections[0]?.id ?? null) : null
  const visible = manySections ? sections.filter((s) => s.id === active) : sections

  const bySection = useMemo(() => {
    const m = new Map<string, Map<string, Seat[]>>()
    for (const s of seats) {
      const rows = m.get(s.section_id) ?? new Map<string, Seat[]>()
      rows.set(s.row, [...(rows.get(s.row) ?? []), s])
      m.set(s.section_id, rows)
    }
    return m
  }, [seats])

  return (
    <div>
      {manySections && (
        <div role="tablist" aria-label="Sections" className="mb-5 flex gap-2 overflow-x-auto pb-2">
          {sections.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === active}
              onClick={() => onSection(s.id)}
              className={`shrink-0 border px-3 py-2 text-left transition-colors ${
                s.id === active ? 'border-accent bg-accent text-accent-ink' : 'border-line hover:border-ink'
              }`}
            >
              <span className="block font-mono text-[10px] uppercase tracking-widest">{s.name}</span>
              <span className={`block text-xs ${s.id === active ? '' : 'text-muted'}`}>
                {s.tier} - {formatMoney(s.min_price_minor)} - {s.available} left
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mb-6 text-center">
        <div className="mx-auto h-1.5 w-2/3 bg-ink/70" aria-hidden />
        <p className="label mt-2">
          {kind === 'cinema' ? 'Screen' : kind === 'arena' ? 'Stage' : 'Pitch'} this side
        </p>
      </div>

      <div className="space-y-8 overflow-x-auto pb-2">
        {visible.map((sec) => (
          <section key={sec.id} aria-label={sec.name}>
            {!manySections && (
              <h3 className="label mb-3 flex flex-wrap items-center gap-3">
                <span className="text-ink">{sec.name}</span>
                <span>{sec.tier}</span>
                <span>{formatMoney(sec.min_price_minor)}</span>
                <span>{sec.available} left</span>
              </h3>
            )}
            <div className="mx-auto w-max space-y-1.5">
              {[...(bySection.get(sec.id)?.entries() ?? [])].map(([row, rowSeats]) => (
                <div key={row} className="flex items-center gap-2" role="group" aria-label={`Row ${row}`}>
                  <span className="label w-6 text-right">{row}</span>
                  <div className="flex gap-1.5">
                    {rowSeats.map((s, i) => (
                      <SeatButton
                        key={s.id}
                        seat={s}
                        selected={selectedIds.has(s.id)}
                        onToggle={onToggle}
                        gap={i > 0 && s.x - rowSeats[i - 1].x > 1.0 && kind === 'cinema'}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <ul className="label mt-6 flex flex-wrap gap-x-6 gap-y-2" aria-label="Legend">
        <li className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center border border-line text-[9px]">1</span>Available</li>
        <li className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center border border-accent bg-accent text-accent-ink">{'✓'}</span>Selected</li>
        <li className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center border border-dashed border-muted">{'·'}</span>Held</li>
        <li className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center border border-line bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--line)_3px_4px)]">{'×'}</span>Sold</li>
      </ul>
    </div>
  )
}
