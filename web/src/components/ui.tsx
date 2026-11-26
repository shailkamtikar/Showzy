import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'

type Variant = 'primary' | 'outline' | 'ghost'
const base =
  'inline-flex items-center justify-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.12em] ' +
  'px-5 py-3 transition-colors duration-200 disabled:opacity-40 disabled:pointer-events-none select-none'
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110',
  outline: 'border border-line text-ink hover:border-ink',
  ghost: 'text-muted hover:text-ink',
}
const cls = (v: Variant, extra = '') => `${base} ${variants[v]} ${extra}`

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(function Button({ variant = 'primary', className, ...p }, ref) {
  return <button ref={ref} className={cls(variant, className)} {...p} />
})

export function LinkButton({ variant = 'primary', className, ...p }: LinkProps & { variant?: Variant }) {
  return <Link className={cls(variant, className)} {...p} />
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`label flex items-center gap-3 ${className}`}>
      <span aria-hidden className="h-px w-8 bg-line" />
      {children}
    </p>
  )
}

export function SectionHead({ n, label, title, lede }: { n: string; label: string; title: ReactNode; lede?: string }) {
  return (
    <div className="mb-10 grid gap-4 md:grid-cols-[8rem_1fr]">
      <p className="label pt-3">
        {n} <span className="text-ink">{label}</span>
      </p>
      <div>
        <h2 className="display text-4xl sm:text-6xl">{title}</h2>
        {lede && <p className="mt-4 max-w-xl text-muted">{lede}</p>}
      </div>
    </div>
  )
}

/** Scroll-in reveal. Honors reduced motion. */
export function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Headline whose words rise into place. `em` words render in the accent italic via <em>. */
export function SplitHeading({
  lines,
  className = '',
}: {
  lines: Array<Array<string | { em: string }>>
  className?: string
}) {
  const reduce = useReducedMotion()
  let i = 0
  return (
    <h1 className={`display ${className}`} aria-label={lines.flat().map((w) => (typeof w === 'string' ? w : w.em)).join(' ')}>
      {lines.map((line, li) => (
        <span key={li} className="block overflow-hidden pb-[0.08em]" aria-hidden>
          {line.map((w, wi) => {
            const text = typeof w === 'string' ? w : w.em
            const idx = i++
            return (
              <motion.span
                key={wi}
                className="mr-[0.22em] inline-block"
                initial={reduce ? false : { y: '110%' }}
                animate={{ y: 0 }}
                transition={{ duration: 0.8, delay: 0.08 * idx, ease: [0.22, 1, 0.36, 1] }}
              >
                {typeof w === 'string' ? text : <em>{text}</em>}
              </motion.span>
            )
          })}
        </span>
      ))}
    </h1>
  )
}

export function Marquee({ items }: { items: string[] }) {
  const row = (
    <>
      {items.map((t, i) => (
        <span key={i} className="flex shrink-0 items-center gap-8 px-4">
          <span className="display text-3xl sm:text-4xl">{t}</span>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      ))}
    </>
  )
  return (
    <div className="overflow-hidden border-y border-line py-5" aria-hidden>
      <div className="flex w-max" style={{ animation: 'marquee 38s linear infinite' }}>
        {row}
        {row}
      </div>
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse bg-surface2 ${className}`} />
}

export function ErrorBox({ title = 'Something went wrong', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="panel p-6">
      <p className="label text-bad">Error</p>
      <h3 className="display mt-2 text-3xl">{title}</h3>
      {message && <p className="mt-2 text-muted">{message}</p>}
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function DemoBadge({ children = 'Demo' }: { children?: ReactNode }) {
  return (
    <span className="label inline-flex items-center gap-2 border border-accent/60 px-2 py-1 text-accent">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </span>
  )
}
