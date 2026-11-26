import * as THREE from 'three'
import type { LayoutMeta, Seat } from '../lib/types'

export const isBowl = (m: LayoutMeta) => m.kind !== 'cinema'
export const seatScale = (m: LayoutMeta) => (isBowl(m) ? 1.3 : 1)

/** What a seat looks at: screen centre, pitch centre, or the stage. */
export function focalPoint(m: LayoutMeta): THREE.Vector3 {
  if (m.kind === 'cinema') return new THREE.Vector3(0, m.screen!.y, 0)
  if (m.kind === 'arena') return new THREE.Vector3(0, 2.2, -m.field!.b * 0.45)
  return new THREE.Vector3(0, 0.6, 0)
}

export const eyePosition = (s: Seat, m: LayoutMeta) =>
  new THREE.Vector3(s.x, s.y + 1.12 * seatScale(m), s.z)

const flat = (v: THREE.Vector3) => new THREE.Vector3(v.x, 0, v.z)

/** Outward unit vector (from the focal point toward the seat, horizontal). */
function outward(s: Seat, f: THREE.Vector3) {
  const d = flat(new THREE.Vector3(s.x, 0, s.z).sub(f))
  if (d.lengthSq() < 1e-6) d.set(0, 0, 1)
  return d.normalize()
}

export type Framing = { pos: THREE.Vector3; target: THREE.Vector3 }

export function overviewFraming(m: LayoutMeta, seats: Seat[]): Framing {
  if (m.kind === 'cinema') {
    const h = m.hall!
    return { pos: new THREE.Vector3(0, 8.5 + h.rows * 0.45, h.depth + 7.5), target: new THREE.Vector3(0, 1.2, h.depth * 0.42) }
  }
  let R = 30
  for (const s of seats) R = Math.max(R, Math.hypot(s.x, s.z))
  return { pos: new THREE.Vector3(0, R * 0.92, R * 1.22), target: new THREE.Vector3(0, 0, 0) }
}

/** Camera over the field looking back at a stand, so the seats face you. */
export function sectionFraming(sectionSeats: Seat[], m: LayoutMeta): Framing {
  const c = new THREE.Vector3()
  sectionSeats.forEach((s) => c.add(new THREE.Vector3(s.x, s.y, s.z)))
  c.divideScalar(Math.max(1, sectionSeats.length))
  const f = focalPoint(m)
  const out = flat(c.clone().sub(f)).normalize()
  return { pos: c.clone().addScaledVector(out, -30).add(new THREE.Vector3(0, 16, 0)), target: c }
}

/** "Zoom onto the seat": camera just behind and above the seat, looking past it at the screen/stage. */
export function closeUpFraming(s: Seat, m: LayoutMeta): Framing {
  const f = focalPoint(m)
  const seat = new THREE.Vector3(s.x, s.y + 0.6, s.z)
  const out = outward(s, f)
  const bowl = isBowl(m)
  const pos = seat.clone().addScaledVector(out, bowl ? 8 : 4.2).add(new THREE.Vector3(0, bowl ? 5.5 : 2.6, 0))
  const target = seat.clone().lerp(f, bowl ? 0.16 : 0.22)
  return { pos, target }
}

/** First half of the "dive": hover above the seat looking down at it. */
export function aboveFraming(s: Seat, m: LayoutMeta): Framing {
  const f = focalPoint(m)
  const seat = new THREE.Vector3(s.x, s.y + 0.6, s.z)
  const out = outward(s, f)
  return { pos: seat.clone().addScaledVector(out, 1.6).add(new THREE.Vector3(0, isBowl(m) ? 9 : 5, 0)), target: seat }
}

export function povFraming(s: Seat, m: LayoutMeta): Framing {
  const eye = eyePosition(s, m)
  const f = focalPoint(m)
  return { pos: eye, target: eye.clone().add(f.clone().sub(eye).normalize().multiplyScalar(10)) }
}

export type SeatStat = { value: string; label: string }

/** Honest, geometry-derived numbers shown on the seat card. */
export function seatStats(s: Seat, m: LayoutMeta): SeatStat[] {
  const eye = eyePosition(s, m)
  const f = focalPoint(m)
  const dist = eye.distanceTo(f)
  if (m.kind === 'cinema') {
    const fill = (2 * Math.atan(m.screen!.width / 2 / dist) * 180) / Math.PI
    const off = (Math.atan2(Math.abs(s.x), Math.max(0.1, s.z)) * 180) / Math.PI
    return [
      { value: `${dist.toFixed(1)} m`, label: 'to the screen' },
      { value: `${Math.round(fill)}°`, label: 'of your view is screen' },
      { value: `${Math.round(off)}°`, label: 'off the centre line' },
    ]
  }
  const ground = Math.hypot(s.x - f.x, s.z - f.z)
  const tier = s.row.startsWith('U') ? 'Upper' : 'Lower'
  return [
    { value: `${Math.round(ground)} m`, label: m.kind === 'arena' ? 'to the stage' : 'to the centre' },
    { value: `${Math.round(s.y)} m`, label: 'above the floor' },
    { value: tier, label: 'tier' },
  ]
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const finite = (v: THREE.Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
