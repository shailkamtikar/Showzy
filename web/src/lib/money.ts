/** Prices are integer minor units (paise). Only used for display; the server owns all amounts. */
export function formatMoney(minor: number | null | undefined, currency = 'INR'): string {
  if (minor == null) return '-'
  const major = minor / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency.trim(),
    maximumFractionDigits: Number.isInteger(major) ? 0 : 2,
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
  }).format(major)
}

export function priceRange(min: number | null, max: number | null, currency = 'INR'): string {
  if (min == null || max == null) return 'Sold out'
  return min === max ? formatMoney(min, currency) : `${formatMoney(min, currency)} - ${formatMoney(max, currency)}`
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
export const fmtDate = (iso: string) => dateFmt.format(new Date(iso))
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso)).toUpperCase()
export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`
