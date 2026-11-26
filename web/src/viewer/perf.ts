/**
 * Device tiering for the 3D viewer. The goal is 2D-like cost on cheap phones:
 * - low:  2 GB RAM or 2 cores. 3D is opt-in (the page opens on the 2D map), no AA, DPR 1, no crowd.
 * - mid:  phones and 4 GB machines. No AA, DPR capped at 1.25.
 * - high: desktops. AA on, DPR up to 1.75.
 * The renderer also drops DPR to 1 at runtime if animated frames run slow (see Director).
 */
export type Tier = 'low' | 'mid' | 'high'

export function deviceTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const mem = nav.deviceMemory ?? 8
  const cores = nav.hardwareConcurrency ?? 8
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  if (mem <= 2 || cores <= 2) return 'low'
  if (coarse || mem <= 4 || cores <= 4) return 'mid'
  return 'high'
}

export const TIER = {
  low: { dpr: 1, aa: false, people: false, maxDpr: 1 },
  mid: { dpr: 1.25, aa: false, people: true, maxDpr: 1.25 },
  high: { dpr: 1.75, aa: true, people: true, maxDpr: 1.75 },
} as const

export const isTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
