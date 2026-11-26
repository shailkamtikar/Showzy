import { describe, expect, it } from 'vitest'
import { formatMoney, priceRange } from './money'

describe('money', () => {
  it('formats paise as rupees', () => {
    expect(formatMoney(50000)).toContain('500')
    expect(formatMoney(500000)).toContain('5,000')
    expect(formatMoney(154550)).toContain('1,545.50')
  })
  it('handles missing and sold out', () => {
    expect(formatMoney(null)).toBe('-')
    expect(priceRange(null, null)).toBe('Sold out')
  })
  it('formats ranges and singletons', () => {
    expect(priceRange(25000, 90000)).toMatch(/250.*-.*900/)
    expect(priceRange(25000, 25000)).not.toContain('-')
  })
})
