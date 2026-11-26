import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Seat } from '../lib/types'
import { personGeometry, plinthGeometry, seatGeometry } from './geometry'
import { isTouch } from './perf'

export type HoverInfo = { seat: Seat; x: number; y: number } | null

const TIER: Record<string, string> = { Standard: '#9c947f', Balcony: '#8e9083', Premium: '#b8a67c', VIP: '#cdb276' }
const C = {
  selected: new THREE.Color('#f2b445'),
  sold: new THREE.Color('#36312a'),
  held: new THREE.Color('#6b5a38'),
  hover: new THREE.Color('#fff0c8'),
  dim: new THREE.Color('#1d1a15'),
}
const SHIRTS = ['#2a2d35', '#3b3430', '#4a3a2e', '#2f3a33', '#51463a', '#26272b'].map((c) => new THREE.Color(c))
const unavailable = (s: Seat) => s.status !== 'available'

type Props = {
  seats: Seat[]
  scale: number
  focal: THREE.Vector3
  rowDepth: number
  plinthColor: string
  selectedIds: Set<string>
  dimSection: string | null
  interactive: boolean
  people: boolean
  /** Stadium rows are sparse: widen each seat to fill ~85% of the gap so stands read as solid rows. */
  stretch: boolean
  onPick: (s: Seat) => void
  onHover: (h: HoverInfo) => void
}

/**
 * All seats in ONE instanced draw call, the stand concrete in a second, sold-seat people in a third.
 * Selection/hover only rewrite the colours that changed; the GPU buffers are re-uploaded once per change,
 * never per frame. A short "pop" animates just the newly selected seat's matrix.
 */
export default function Seats(p: Props) {
  const { invalidate } = useThree()
  const seatRef = useRef<THREE.InstancedMesh>(null)
  const plinthRef = useRef<THREE.InstancedMesh>(null)
  const peopleRef = useRef<THREE.InstancedMesh>(null)
  const hoverIdx = useRef<number | null>(null)
  const pops = useRef<Array<{ i: number; t0: number }>>([])
  const prevSel = useRef<Set<string>>(new Set())

  const seatGeo = useMemo(() => seatGeometry(p.scale), [p.scale])
  const plinthGeo = useMemo(() => plinthGeometry(), [])
  const personGeo = useMemo(() => personGeometry(p.scale), [p.scale])
  useEffect(() => () => { seatGeo.dispose(); plinthGeo.dispose(); personGeo.dispose() }, [seatGeo, plinthGeo, personGeo])

  const index = useMemo(() => new Map(p.seats.map((s, i) => [s.id, i])), [p.seats])

  // Per-seat transforms, computed once per seat list.
  const xf = useMemo(() => {
    const n = p.seats.length
    const quats: THREE.Quaternion[] = new Array(n)
    const widths = new Float32Array(n)
    const o = new THREE.Object3D()
    p.seats.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z)
      o.lookAt(p.focal.x, s.y, p.focal.z)
      quats[i] = o.quaternion.clone()
    })
    // Plinth width = distance to the neighbouring seat in the same row, so stands read as continuous.
    const rows = new Map<string, number[]>()
    p.seats.forEach((s, i) => {
      const k = `${s.section_id}|${s.row}`
      const arr = rows.get(k)
      if (arr) arr.push(i)
      else rows.set(k, [i])
    })
    for (const ids of rows.values()) {
      ids.forEach((i, j) => {
        const a = p.seats[i]
        const b = p.seats[ids[j + 1] ?? ids[j - 1] ?? i]
        const d = Math.hypot(a.x - b.x, a.z - b.z)
        widths[i] = Math.min(Math.max(d > 0 ? d : 0.62 * p.scale, 0.55 * p.scale), 3.2) + 0.03
      })
    }
    const sx = new Float32Array(n)
    for (let i = 0; i < n; i++) sx[i] = p.stretch ? Math.min(Math.max((widths[i] * 0.86) / (0.54 * p.scale), 1), 4.5) : 1
    return { quats, widths, sx }
  }, [p.seats, p.focal, p.scale, p.stretch])

  const soldIdx = useMemo(() => p.seats.flatMap((s, i) => (s.status === 'sold' ? [i] : [])), [p.seats])

  const setSeatMatrix = (i: number, k = 1) => {
    const s = p.seats[i]
    const m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), xf.quats[i], new THREE.Vector3(xf.sx[i] * k, k, k))
    seatRef.current!.setMatrixAt(i, m)
  }

  useLayoutEffect(() => {
    const seat = seatRef.current
    const plinth = plinthRef.current
    if (!seat || !plinth) return
    const m = new THREE.Matrix4()
    p.seats.forEach((s, i) => {
      seat.setMatrixAt(i, m.compose(new THREE.Vector3(s.x, s.y, s.z), xf.quats[i], new THREE.Vector3(xf.sx[i], 1, 1)))
      plinth.setMatrixAt(i, m.compose(new THREE.Vector3(s.x, 0, s.z), xf.quats[i], new THREE.Vector3(xf.widths[i], Math.max(s.y, 0.02), p.rowDepth)))
    })
    seat.instanceMatrix.needsUpdate = true
    plinth.instanceMatrix.needsUpdate = true
    seat.computeBoundingSphere()
    plinth.computeBoundingSphere()
    const people = peopleRef.current
    if (people) {
      soldIdx.forEach((si, j) => {
        const s = p.seats[si]
        people.setMatrixAt(j, m.compose(new THREE.Vector3(s.x, s.y, s.z), xf.quats[si], new THREE.Vector3(1, 1, 1)))
        people.setColorAt(j, SHIRTS[si % SHIRTS.length])
      })
      people.instanceMatrix.needsUpdate = true
      if (people.instanceColor) people.instanceColor.needsUpdate = true
      people.computeBoundingSphere()
    }
    invalidate()
  }, [p.seats, xf, soldIdx, p.rowDepth, invalidate])

  const colorFor = (i: number, out: THREE.Color) => {
    const s = p.seats[i]
    if (p.selectedIds.has(s.id)) return out.copy(C.selected)
    if (s.status === 'held') out.copy(C.held)
    else if (unavailable(s)) out.copy(C.sold)
    else out.set(TIER[s.tier] ?? '#9c947f')
    if (p.dimSection && s.section_id !== p.dimSection) out.lerp(C.dim, 0.62)
    if (hoverIdx.current === i && !unavailable(s)) out.copy(C.hover)
    return out
  }

  // Full colour pass only on discrete changes (selection / section focus / data refresh).
  useLayoutEffect(() => {
    const seat = seatRef.current
    if (!seat) return
    const c = new THREE.Color()
    for (let i = 0; i < p.seats.length; i++) seat.setColorAt(i, colorFor(i, c))
    if (seat.instanceColor) seat.instanceColor.needsUpdate = true
    // Pop only seats that just became selected.
    for (const id of p.selectedIds) {
      if (!prevSel.current.has(id)) {
        const i = index.get(id)
        if (i !== undefined) pops.current.push({ i, t0: performance.now() })
      }
    }
    prevSel.current = new Set(p.selectedIds)
    invalidate()
  }, [p.seats, p.selectedIds, p.dimSection, index, invalidate])

  useFrame(() => {
    if (!pops.current.length || !seatRef.current) return
    const now = performance.now()
    pops.current = pops.current.filter(({ i, t0 }) => {
      const k = Math.min(1, (now - t0) / 380)
      setSeatMatrix(i, 1 + 0.38 * Math.sin(Math.PI * k) * (1 - k * 0.3))
      return k < 1
    })
    seatRef.current.instanceMatrix.needsUpdate = true
    invalidate()
  })

  const setHover = (i: number | null) => {
    const seat = seatRef.current
    if (!seat || hoverIdx.current === i) return
    const prev = hoverIdx.current
    hoverIdx.current = i
    const c = new THREE.Color()
    if (prev !== null) seat.setColorAt(prev, colorFor(prev, c))
    if (i !== null) seat.setColorAt(i, colorFor(i, c))
    if (seat.instanceColor) seat.instanceColor.needsUpdate = true
    invalidate()
  }

  // On touch screens there is no hover, so we register no move handlers at all: R3F then only hit-tests on taps,
  // which keeps orbit drags on cheap phones free of per-move raycasts.
  const touch = useMemo(() => isTouch(), [])
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!p.interactive || e.delta > 6 || e.instanceId == null) return
    e.stopPropagation()
    p.onPick(p.seats[e.instanceId])
  }
  const handlers = touch ? { onClick } : {
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      if (!p.interactive || e.pointerType === 'touch' || e.instanceId == null) return
      e.stopPropagation()
      const s = p.seats[e.instanceId]
      setHover(e.instanceId)
      p.onHover({ seat: s, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
      document.body.style.cursor = unavailable(s) && !p.selectedIds.has(s.id) ? 'not-allowed' : 'pointer'
    },
    onPointerOut: () => {
      setHover(null)
      p.onHover(null)
      document.body.style.cursor = ''
    },
    onClick,
  }

  return (
    <group>
      {/* Seat i and its concrete step i share one index, so clicking anywhere on a seat's footprint picks it
          (no dead gaps between rows). Handlers are shared; R3F delivers the nearest hit first. */}
      <instancedMesh key={`s${p.seats.length}`} ref={seatRef} args={[seatGeo, undefined, p.seats.length]} {...handlers}>
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh key={`p${p.seats.length}`} ref={plinthRef} args={[plinthGeo, undefined, p.seats.length]} {...handlers}>
        <meshLambertMaterial color={p.plinthColor} />
      </instancedMesh>
      {p.people && soldIdx.length > 0 && (
        <instancedMesh key={`h${soldIdx.length}`} ref={peopleRef} args={[personGeo, undefined, soldIdx.length]} raycast={() => null}>
          <meshLambertMaterial />
        </instancedMesh>
      )}
    </group>
  )
}
