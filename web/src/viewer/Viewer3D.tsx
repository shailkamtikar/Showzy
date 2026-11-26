import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Canvas } from '@react-three/fiber'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import * as THREE from 'three'
import type { Seat, Section, ShowDetail } from '../lib/types'
import { formatMoney } from '../lib/money'
import Director, { type Plan, type Shot } from './Director'
import Seats, { type HoverInfo } from './Seats'
import Venue from './Venue'
import { TIER, deviceTier, isTouch } from './perf'
import {
  aboveFraming, closeUpFraming, easeOutCubic, focalPoint, isBowl, overviewFraming, povFraming, seatScale, seatStats,
  sectionFraming, type Framing,
} from './math'

type Props = {
  show: ShowDetail
  seats: Seat[]
  sections: Section[]
  selectedIds: Set<string>
  onToggle: (s: Seat) => void
  activeSection: string | null
  onSection: (id: string | null) => void
  previewSeat: Seat | null
  onPreview: (s: Seat) => void
  onExitPreview: () => void
  onFail: () => void
}

/* Tiny external store for the hover tooltip, so pointer moves never re-render the 3D tree. */
function createHoverStore() {
  let cur: HoverInfo = null
  const subs = new Set<() => void>()
  return {
    get: () => cur,
    set: (h: HoverInfo) => {
      if (cur?.seat.id === h?.seat.id && cur?.x === h?.x && cur?.y === h?.y) return
      cur = h
      subs.forEach((f) => f())
    },
    sub: (f: () => void) => {
      subs.add(f)
      return () => subs.delete(f)
    },
  }
}

const ORBIT_FOV = 42
const POV_FOV = 60

export default function Viewer3D(props: Props) {
  const { show, seats, sections, selectedIds, activeSection, previewSeat } = props
  const meta = show.layout_metadata
  const bowl = isBowl(meta)
  const reduce = !!useReducedMotion()
  const tier = useMemo(() => TIER[deviceTier()], [])
  const touch = useMemo(() => isTouch(), [])
  const hover = useMemo(createHoverStore, [])
  const wrap = useRef<HTMLDivElement>(null)

  const [focusSeat, setFocusSeat] = useState<Seat | null>(null)
  const [settled, setSettled] = useState<'orbit' | 'pov' | null>(null)
  const [lost, setLost] = useState(false)
  const [canvasKey, setCanvasKey] = useState(0)
  const [ready, setReady] = useState(false)

  const focal = useMemo(() => focalPoint(meta), [meta])
  const radius = useMemo(() => seats.reduce((r, s) => Math.max(r, Math.hypot(s.x, s.z)), 10), [seats])
  const overview = useMemo(() => overviewFraming(meta, seats), [meta, seats])
  const bySection = useMemo(() => {
    const m = new Map<string, Seat[]>()
    for (const s of seats) {
      const a = m.get(s.section_id)
      if (a) a.push(s)
      else m.set(s.section_id, [s])
    }
    return m
  }, [seats])

  const dur = (ms: number) => (reduce ? 0 : ms)
  const shot = (f: Framing, ms: number, fov = ORBIT_FOV, extra: Partial<Shot> = {}): Shot => ({ ...f, duration: dur(ms), fov, ...extra })

  /* ---------------- camera plans ---------------- */
  const planId = useRef(0)
  const entrance = (): Plan => {
    const start: Framing = {
      pos: overview.pos.clone().multiplyScalar(1.45).add(new THREE.Vector3(bowl ? 25 : 6, bowl ? 30 : 8, 0)),
      target: overview.target.clone(),
    }
    const shots = [shot(start, 0)]
    if (bowl && activeSection && bySection.get(activeSection)) shots.push(shot(sectionFraming(bySection.get(activeSection)!, meta), 1500))
    else shots.push(shot(overview, 1500))
    return { id: ++planId.current, shots, end: 'orbit' }
  }
  const [plan, setPlan] = useState<Plan>(entrance)
  const go = useCallback((shots: Shot[], end: 'orbit' | 'pov') => {
    setSettled(null)
    setPlan({ id: ++planId.current, shots, end })
  }, [])

  const homeFraming = (): Framing =>
    bowl && activeSection && bySection.get(activeSection) ? sectionFraming(bySection.get(activeSection)!, meta) : overview

  // Section focus (stadium/arena), shared with the 2D map.
  const lastSection = useRef(activeSection)
  useEffect(() => {
    if (lastSection.current === activeSection) return
    lastSection.current = activeSection
    if (previewSeat) return
    setFocusSeat(null)
    go([shot(homeFraming(), 1100, ORBIT_FOV, { arc: bowl ? 6 : 0 })], 'orbit')
  }, [activeSection])

  // Seat view (POV): dive in from wherever we are; switch between seats; exit back to the seat close-up.
  const lastPreview = useRef<Seat | null>(null)
  useEffect(() => {
    const prev = lastPreview.current
    lastPreview.current = previewSeat
    if (previewSeat && !prev) {
      setFocusSeat(previewSeat)
      go([
        shot(aboveFraming(previewSeat, meta), 900, 50, { arc: bowl ? 4 : 1.5 }),
        shot(povFraming(previewSeat, meta), 1150, POV_FOV, { ease: easeOutCubic }),
      ], 'pov')
    } else if (previewSeat && prev && previewSeat.id !== prev.id) {
      setFocusSeat(previewSeat)
      go([shot(povFraming(previewSeat, meta), 950, POV_FOV, { arc: bowl ? 3 : 1 })], 'pov')
    } else if (!previewSeat && prev) {
      go([shot(closeUpFraming(prev, meta), 1000, ORBIT_FOV, { arc: 1 })], 'orbit')
    }
  }, [previewSeat?.id])

  // A seat removed elsewhere (sidebar) closes its card.
  useEffect(() => {
    if (focusSeat && !selectedIds.has(focusSeat.id) && !previewSeat) {
      setFocusSeat(null)
      go([shot(homeFraming(), 1000)], 'orbit')
    }
  }, [selectedIds])

  const pick = useCallback(
    (s: Seat) => {
      hover.set(null)
      if (bowl && s.section_id !== activeSection) {
        props.onSection(s.section_id) // first tap on a stand focuses it; the next tap picks a seat
        return
      }
      const wasSelected = selectedIds.has(s.id)
      if (s.status !== 'available' && !wasSelected) return
      props.onToggle(s)
      if (!wasSelected) {
        setFocusSeat(s)
        go([shot(closeUpFraming(s, meta), 1050, ORBIT_FOV, { arc: bowl ? 3 : 1.2 })], 'orbit')
      } else if (focusSeat?.id === s.id) {
        setFocusSeat(null)
        go([shot(homeFraming(), 1000)], 'orbit')
      }
    },
    [bowl, activeSection, selectedIds, focusSeat, meta, props.onToggle, props.onSection],
  )

  const backToHall = () => {
    setFocusSeat(null)
    go([shot(homeFraming(), 1050, ORBIT_FOV, { arc: bowl ? 5 : 1 })], 'orbit')
  }

  // Keyboard: Esc steps back out (seat view -> seat -> hall).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (previewSeat) props.onExitPreview()
      else if (focusSeat) backToHall()
      else if (activeSection) props.onSection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const limits = useMemo(
    () => ({ minDistance: bowl ? 6 : 2.5, maxDistance: bowl ? radius * 3 : 48, maxPolarAngle: Math.PI / 2.08 }),
    [bowl, radius],
  )

  const selectedSeats = useMemo(() => seats.filter((s) => selectedIds.has(s.id)), [seats, selectedIds])
  const inPov = !!previewSeat
  const stats = focusSeat ? seatStats(focusSeat, meta) : []

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden bg-[#0e0c09]" data-testid="viewer-3d">
      {!lost && (
        <Canvas
          key={canvasKey}
          frameloop="demand"
          dpr={[1, tier.dpr]}
          gl={{ antialias: tier.aa, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
          camera={{ fov: ORBIT_FOV, near: 0.1, far: 600, position: [0, 40, 60] }}
          style={{ touchAction: 'none', opacity: ready ? 1 : 0, transition: 'opacity 400ms ease' }}
          onCreated={(state) => {
            const { gl } = state
            if (import.meta.env.DEV) Object.assign(window, { __showzyGL: gl, __showzyState: state }) // perf/debug checks in tests
            gl.domElement.setAttribute('aria-label', '3D seat map. Use the 2D map for keyboard access.')
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault()
              setLost(true)
            })
            requestAnimationFrame(() => setReady(true))
          }}
          onPointerMissed={() => hover.set(null)}
        >
          <color attach="background" args={['#0e0c09']} />
          <fog attach="fog" args={['#0e0c09', bowl ? radius * 2.2 : 60, bowl ? radius * 4.5 : 120]} />
          <hemisphereLight args={['#fff1da', '#2a231a', 1.55]} />
          <directionalLight position={[20, 40, 30]} intensity={1.1} color="#ffe9c4" />
          <Venue meta={meta} radius={radius} title={show.item_title} accent={show.accent} />
          <Seats
            seats={seats}
            scale={seatScale(meta)}
            focal={focal}
            rowDepth={bowl ? 0.97 : 1.0}
            plinthColor={bowl ? '#4d473c' : '#2c251d'}
            selectedIds={selectedIds}
            dimSection={bowl ? activeSection : null}
            interactive={!inPov && settled !== null}
            people={tier.people}
            stretch={bowl}
            onPick={pick}
            onHover={(h) => hover.set(h)}
          />
          <Director plan={plan} limits={limits} maxDpr={tier.maxDpr} onSettled={setSettled} />
        </Canvas>
      )}

      {lost && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-[#efe8d8]">3D paused to free graphics memory</p>
            <button
              onClick={() => { setLost(false); setReady(false); setCanvasKey((k) => k + 1) }}
              className="mt-3 border border-[#e3a845] px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-[#e3a845]"
            >
              Reload 3D
            </button>
          </div>
        </div>
      )}

      {!touch && !inPov && <Tooltip store={hover} wrap={wrap} />}

      {/* ---------- top bar ---------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          {inPov ? (
            <>
              <span className="border border-white/20 bg-black/65 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[#efe8d8] backdrop-blur">
                <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#e3a845] align-middle" />
                View from Row {previewSeat!.row}, Seat {previewSeat!.label}
              </span>
              {selectedSeats.length > 1 &&
                selectedSeats.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => props.onPreview(s)}
                    className={`border px-2.5 py-2 font-mono text-[10px] uppercase tracking-widest backdrop-blur ${
                      s.id === previewSeat!.id ? 'border-[#e3a845] bg-[#e3a845] text-[#1b1306]' : 'border-white/25 bg-black/55 text-[#efe8d8] hover:border-[#e3a845]'
                    }`}
                  >
                    {s.row}{s.label}
                  </button>
                ))}
            </>
          ) : (focusSeat || (bowl && activeSection)) ? (
            <button
              onClick={() => (focusSeat ? backToHall() : props.onSection(null))}
              className="border border-white/30 bg-black/60 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[#efe8d8] backdrop-blur hover:border-[#e3a845] hover:text-[#e3a845]"
            >
              &larr; {focusSeat && bowl && activeSection ? 'Back to stand' : focusSeat || !activeSection ? 'Back to hall' : 'Whole venue'}
            </button>
          ) : null}
        </div>
        {inPov && (
          <button
            onClick={props.onExitPreview}
            className="pointer-events-auto border border-white/40 bg-black/60 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[#efe8d8] backdrop-blur hover:border-[#e3a845] hover:text-[#e3a845]"
          >
            Exit view
          </button>
        )}
      </div>

      {/* ---------- POV hint + disclosure ---------- */}
      <AnimatePresence>
        {inPov && settled === 'pov' && (
          <motion.div
            key="pov-hint"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex gap-5">
                {seatStats(previewSeat!, meta).map((st) => (
                  <div key={st.label}>
                    <p className="display text-2xl text-[#efe8d8]">{st.value}</p>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-[#b8ae95]">{st.label}</p>
                  </div>
                ))}
              </div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#b8ae95]">
                {touch ? 'Drag to look around' : 'Drag to look around, scroll to zoom, Esc to exit'}
              </p>
            </div>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-[#8f8672]">
              Illustrative view generated from venue geometry. Real sightlines may differ.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- seat card (after "zooming onto the seat") ---------- */}
      <AnimatePresence>
        {focusSeat && !inPov && selectedIds.has(focusSeat.id) && (
          <motion.div
            key={focusSeat.id}
            initial={reduce ? false : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="absolute inset-x-3 bottom-3 border border-white/15 bg-[#14110d]/92 p-4 text-[#efe8d8] backdrop-blur sm:inset-x-auto sm:right-3 sm:w-80"
            role="dialog"
            aria-label={`Row ${focusSeat.row}, seat ${focusSeat.label}`}
          >
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#b8ae95]">
              {sections.find((x) => x.id === focusSeat.section_id)?.name ?? ''} - {focusSeat.tier}
            </p>
            <div className="mt-1 flex items-baseline justify-between">
              <h3 className="display text-3xl">Row {focusSeat.row} - Seat {focusSeat.label}</h3>
              <span className="display text-2xl text-[#e3a845]">{formatMoney(focusSeat.price_minor)}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
              {stats.map((st) => (
                <div key={st.label}>
                  <p className="display text-xl">{st.value}</p>
                  <p className="font-mono text-[8.5px] uppercase leading-tight tracking-widest text-[#b8ae95]">{st.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => props.onPreview(focusSeat)}
                className="flex-1 bg-[#e3a845] px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-[#1b1306] hover:brightness-110"
              >
                View from this seat
              </button>
              <button
                onClick={() => props.onToggle(focusSeat)}
                className="border border-white/25 px-3 py-2.5 font-mono text-[10px] uppercase tracking-widest hover:border-[#d07a63] hover:text-[#d07a63]"
              >
                Remove
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- stand chips (stadium/arena) ---------- */}
      {bowl && !inPov && !focusSeat && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[#b8ae95]">
            {activeSection ? 'Tap a seat to pick it, or switch stand' : 'Tap a stand to go there'}
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Stands">
            {sections.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={s.id === activeSection}
                aria-label={`Focus ${s.name}`}
                onClick={() => props.onSection(s.id === activeSection ? null : s.id)}
                className={`shrink-0 border px-2.5 py-1.5 text-left font-mono text-[9.5px] uppercase tracking-widest backdrop-blur transition-colors ${
                  s.id === activeSection ? 'border-[#e3a845] bg-[#e3a845] text-[#1b1306]' : 'border-white/20 bg-black/50 text-[#efe8d8] hover:border-[#e3a845]'
                }`}
              >
                {s.name}
                <span className={`ml-2 ${s.id === activeSection ? '' : 'text-[#b8ae95]'}`}>{formatMoney(s.min_price_minor)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Tooltip({ store, wrap }: { store: ReturnType<typeof createHoverStore>; wrap: React.RefObject<HTMLDivElement | null> }) {
  const h = useSyncExternalStore(store.sub, store.get)
  if (!h || !wrap.current) return null
  const r = wrap.current.getBoundingClientRect()
  const x = Math.min(h.x - r.left + 14, r.width - 180)
  const y = Math.min(h.y - r.top + 14, r.height - 70)
  const ok = h.seat.status === 'available'
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 border border-white/20 bg-black/85 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[#efe8d8]"
      style={{ left: x, top: y }}
    >
      <div>Row {h.seat.row} - Seat {h.seat.label}</div>
      <div className="mt-1 text-[#b8ae95]">{h.seat.tier} - {formatMoney(h.seat.price_minor)}</div>
      <div className={ok ? 'text-[#e3a845]' : 'text-[#9a8f78]'}>{ok ? 'Click to select' : h.seat.status}</div>
    </div>
  )
}
