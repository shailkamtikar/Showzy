import { useEffect, useState } from 'react'
import { serverNow } from './api'

/** Seconds remaining until `iso`, measured against the SERVER clock (a wrong local clock cannot extend a hold). */
export function useCountdown(iso?: string | null) {
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    if (!iso) {
      setLeft(null)
      return
    }
    const target = new Date(iso).getTime()
    const tick = () => setLeft(Math.max(0, Math.round((target - serverNow()) / 1000)))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [iso])
  return left
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
