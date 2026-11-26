const KIND: Record<string, string> = { movie: 'Film', sports: 'Match', concert: 'Live', event: 'Event' }

/** Generated poster: a warm gradient from the item's accent, grain, and a big serif initial. No stock images. */
export function Poster({
  title,
  accent,
  type,
  className = '',
}: {
  title: string
  accent: string
  type: string
  className?: string
}) {
  // Pull every listing's accent toward a warm neutral so the set reads as one muted family (no neon).
  const tone = `color-mix(in srgb, ${accent} 46%, #7a6f58)`
  return (
    <div
      className={`grain relative isolate flex aspect-[4/5] flex-col justify-between overflow-hidden p-4 ${className}`}
      style={{
        background: `radial-gradient(120% 80% at 70% 15%, color-mix(in srgb, ${tone} 80%, transparent) 0%, color-mix(in srgb, ${tone} 33%, transparent) 40%, transparent 72%), linear-gradient(160deg, #1c1810 0%, #0e0c09 100%)`,
      }}
      role="img"
      aria-label={`${title} poster`}
    >
      <span className="label !text-[#efe8d8]/80">{KIND[type] ?? 'Event'}</span>
      <span className="display text-[#efe8d8]" style={{ fontSize: 'clamp(3.5rem, 9vw, 6rem)', lineHeight: 0.85 }}>
        {title.slice(0, 1)}
      </span>
    </div>
  )
}
